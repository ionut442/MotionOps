import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement
} from "react";
import {
  createDefaultScopeDefinition,
  isValidScopeDepth,
  parseScopeDefinition,
  type ScopeDefinition,
  type ScopeMode
} from "../domain/scope";
import {
  applyScopeFilters,
  createDefaultScopeFilters,
  hasActiveScopeFilters,
  type ScopeFilterDefinition
} from "../domain/scopeFilters";
import {
  AUTOMATIC_SCOPE_ORDER_MODES,
  createDefaultScopeOrder,
  normalizeCustomOrder,
  orderScopeResult,
  type ScopeOrderDefinition,
  type ScopeOrderMode
} from "../domain/scopeOrdering";
import type { ScopeScanNode, ScopeScanResult } from "../domain/scopeScan";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";

export interface ScopeWorkspaceProps {
  readonly lastMessage: PluginToUiMessage | null;
  readonly sendToPlugin: (message: UiToPluginMessage) => void;
  readonly createRequestId: () => string;
  readonly onConfirmedScopeChange?: (result: ScopeScanResult | null) => void;
}

interface ScopeProgress {
  readonly visited: number;
  readonly indeterminate: boolean;
}

type ScopeViewState =
  | { readonly status: "idle" }
  | {
      readonly status: "scanning";
      readonly requestId: string;
      readonly progress: ScopeProgress | null;
      readonly previousResult: ScopeScanResult | null;
    }
  | { readonly status: "ready"; readonly result: ScopeScanResult }
  | { readonly status: "stale"; readonly result: ScopeScanResult; readonly reason: string }
  | { readonly status: "cancelled"; readonly result: ScopeScanResult | null }
  | { readonly status: "error"; readonly message: string; readonly previousResult: ScopeScanResult | null };

const SCOPE_MODE_OPTIONS: readonly { readonly mode: ScopeMode; readonly label: string }[] = [
  { mode: "current-selection", label: "Selected object" },
  { mode: "direct-children", label: "Direct children" },
  { mode: "all-descendants", label: "All descendants" },
  { mode: "depth-limited", label: "Depth" },
  { mode: "manual", label: "Manual" }
];

const ORDER_LABELS: Record<ScopeOrderMode, string> = {
  "layer-panel": "Layer panel",
  "reverse-layer-panel": "Reverse layer panel",
  "top-to-bottom": "Top to bottom",
  "bottom-to-top": "Bottom to top",
  "left-to-right": "Left to right",
  "right-to-left": "Right to left",
  "center-outward": "Center outward",
  "edges-inward": "Edges inward",
  custom: "Custom"
};

const nodeTypeLabel = (type: string): string => type.toLowerCase().replaceAll("_", " ");

const manualIdsFromInput = (value: string): readonly string[] =>
  value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const childLookup = (nodes: readonly ScopeScanNode[]): Map<string | null, ScopeScanNode[]> => {
  const lookup = new Map<string | null, ScopeScanNode[]>();
  for (const node of nodes) {
    const siblings = lookup.get(node.parentId) ?? [];
    siblings.push(node);
    lookup.set(node.parentId, siblings);
  }
  return lookup;
};

const visibleRoots = (result: ScopeScanResult, childrenByParent: Map<string | null, ScopeScanNode[]>) =>
  result.nodes
    .filter((node) => node.parentId === null || !result.nodes.some((candidate) => candidate.id === node.parentId))
    .filter((node, index, all) => all.findIndex((candidate) => candidate.id === node.id) === index)
    .map((root) => ({
      ...root,
      childCount: childrenByParent.get(root.id)?.length ?? 0
    }));

const resultForState = (state: ScopeViewState): ScopeScanResult | null => {
  if (state.status === "ready" || state.status === "stale") {
    return state.result;
  }
  if (state.status === "scanning" || state.status === "error" || state.status === "cancelled") {
    return state.status === "cancelled" ? state.result : state.previousResult;
  }
  return null;
};

export const ScopeWorkspace = ({
  lastMessage,
  sendToPlugin,
  createRequestId,
  onConfirmedScopeChange
}: ScopeWorkspaceProps) => {
  const [viewState, setViewState] = useState<ScopeViewState>({ status: "idle" });
  const [scopeDefinition, setScopeDefinition] = useState<ScopeDefinition>(createDefaultScopeDefinition);
  const [depthInput, setDepthInput] = useState("2");
  const [manualInput, setManualInput] = useState("");
  const [modeError, setModeError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScopeFilterDefinition>(createDefaultScopeFilters);
  const [order, setOrder] = useState<ScopeOrderDefinition>(createDefaultScopeOrder);
  const [automaticOrderMode, setAutomaticOrderMode] = useState<ScopeOrderMode>("layer-panel");
  const [customNodeIds, setCustomNodeIds] = useState<readonly string[]>([]);
  const [selectionSyncEnabled, setSelectionSyncEnabled] = useState(false);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeRequestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const scopeDefinitionRef = useRef(scopeDefinition);
  const selectionSyncEnabledRef = useRef(selectionSyncEnabled);
  useEffect(() => {
    scopeDefinitionRef.current = scopeDefinition;
  }, [scopeDefinition]);

  useEffect(() => {
    selectionSyncEnabledRef.current = selectionSyncEnabled;
  }, [selectionSyncEnabled]);

  const requestScan = useCallback((scope: ScopeDefinition) => {
    if (activeRequestIdRef.current !== null) {
      sendToPlugin({ type: "SCOPE_SCAN_CANCEL", requestId: activeRequestIdRef.current });
    }
    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    setViewState((current) => ({
      status: "scanning",
      requestId,
      progress: null,
      previousResult: resultForState(current)
    }));
    sendToPlugin({
      type: "SCOPE_SCAN_REQUEST",
      requestId,
      scope
    });
  }, [createRequestId, sendToPlugin]);

  const cancelScan = () => {
    if (activeRequestIdRef.current === null) {
      return;
    }
    const requestId = activeRequestIdRef.current;
    sendToPlugin({ type: "SCOPE_SCAN_CANCEL", requestId });
    activeRequestIdRef.current = null;
    setViewState((current) => ({ status: "cancelled", result: resultForState(current) }));
  };

  const commitScopeDefinition = (scope: ScopeDefinition) => {
    const parsed = parseScopeDefinition(scope);
    if (!parsed.ok) {
      setModeError(parsed.issues[0]?.message ?? "Scope mode is invalid.");
      return;
    }

    setModeError(null);
    setScopeDefinition(parsed.value);
    requestScan(parsed.value);
  };

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    requestScan(scopeDefinition);
  });

  useEffect(() => {
    if (lastMessage === null) {
      return;
    }

    if (
      lastMessage.type === "SCOPE_SCAN_RESULT" &&
      lastMessage.requestId === activeRequestIdRef.current
    ) {
      activeRequestIdRef.current = null;
      const cancelled = lastMessage.result.issues.some((issue) => issue.code === "cancelled");
      setViewState((current) =>
        cancelled
          ? { status: "cancelled", result: resultForState(current) }
          : { status: "ready", result: lastMessage.result }
      );
      setExpandedIds(new Set(lastMessage.result.roots));
      setCheckedIds(new Set(lastMessage.result.nodes.map((node) => node.id)));
      setCustomNodeIds((current) =>
        normalizeCustomOrder(current, lastMessage.result.nodes.map((node) => node.id))
      );
    }

    if (
      lastMessage.type === "SCOPE_SCAN_PROGRESS" &&
      lastMessage.requestId === activeRequestIdRef.current
    ) {
      setViewState((current) =>
        current.status === "scanning"
          ? {
              ...current,
              progress: {
                visited: lastMessage.progress.visited,
                indeterminate: lastMessage.progress.indeterminate
              }
            }
          : current
      );
    }

    if (
      lastMessage.type === "PLUGIN_ERROR" &&
      lastMessage.requestId !== undefined &&
      lastMessage.requestId === activeRequestIdRef.current
    ) {
      activeRequestIdRef.current = null;
      setViewState((current) => ({
        status: "error",
        message: lastMessage.message,
        previousResult: resultForState(current)
      }));
    }

    if (lastMessage.type === "SCOPE_SELECTION_CHANGED") {
      if (selectionSyncEnabledRef.current) {
        requestScan(scopeDefinitionRef.current);
      } else {
        setViewState((current) => {
          const result = resultForState(current);
          return result === null
            ? current
            : {
                status: "stale",
                result,
                reason: "Figma selection changed while selection sync is off."
              };
        });
      }
    }

    if (lastMessage.type === "SCOPE_REVEAL_NODE_RESULT") {
      setRevealMessage(lastMessage.result.message);
    }
  }, [lastMessage, requestScan]);

  const result = resultForState(viewState);
  const effectiveOrder = useMemo<ScopeOrderDefinition>(
    () => (order.mode === "custom" ? { mode: "custom", customNodeIds } : order),
    [customNodeIds, order]
  );
  const orderedResult = useMemo(
    () => (result === null ? null : orderScopeResult(result, effectiveOrder)),
    [effectiveOrder, result]
  );
  const filteredResult = useMemo(
    () => (orderedResult === null ? null : applyScopeFilters(orderedResult, filters)),
    [filters, orderedResult]
  );
  const nodeTypes = useMemo(
    () =>
      Array.from(new Set(result?.nodes.map((node) => node.type) ?? [])).sort((left, right) =>
        left.localeCompare(right)
      ),
    [result]
  );
  const childrenByParent = useMemo(
    () => childLookup(filteredResult?.nodes ?? []),
    [filteredResult]
  );
  const roots = useMemo(
    () => (filteredResult === null ? [] : visibleRoots(filteredResult, childrenByParent)),
    [childrenByParent, filteredResult]
  );
  const activeScopeResult = useMemo<ScopeScanResult | null>(() => {
    if (filteredResult === null) {
      return null;
    }
    const activeNodes = filteredResult.nodes.filter((node) => checkedIds.has(node.id));
    const activeIds = new Set(activeNodes.map((node) => node.id));
    return {
      roots: filteredResult.roots.filter((rootId) => activeIds.has(rootId)),
      nodes: activeNodes,
      issues: filteredResult.issues
    };
  }, [checkedIds, filteredResult]);

  useEffect(() => {
    onConfirmedScopeChange?.(activeScopeResult);
  }, [activeScopeResult, onConfirmedScopeChange]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleChecked = (nodeId: string) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const changeOrderMode = (mode: ScopeOrderMode) => {
    if (mode === "custom") {
      setOrder({ mode: "custom", customNodeIds });
      return;
    }
    setAutomaticOrderMode(mode);
    setOrder({ mode });
  };

  const resetCustomOrder = () => {
    setOrder({ mode: automaticOrderMode });
  };

  const moveCustomNode = (nodeId: string, direction: -1 | 1) => {
    if (result === null) {
      return;
    }
    setOrder({ mode: "custom", customNodeIds });
    setCustomNodeIds((current) => {
      const normalized = [...normalizeCustomOrder(current, result.nodes.map((node) => node.id))];
      const index = normalized.indexOf(nodeId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= normalized.length) {
        return Object.freeze(normalized);
      }
      const [item] = normalized.splice(index, 1);
      normalized.splice(targetIndex, 0, item);
      return Object.freeze(normalized);
    });
  };

  const revealNode = (nodeId: string) => {
    sendToPlugin({
      type: "SCOPE_REVEAL_NODE_REQUEST",
      requestId: createRequestId(),
      nodeId
    });
  };

  const changeMode = (mode: ScopeMode) => {
    if (mode === "depth-limited") {
      const depth = Number(depthInput);
      if (!isValidScopeDepth(depth)) {
        setModeError("Depth must be an integer of at least 1.");
        setScopeDefinition({ mode: "depth-limited", maxDepth: 1 });
        return;
      }
      commitScopeDefinition({ mode: "depth-limited", maxDepth: depth });
      return;
    }

    if (mode === "manual") {
      commitScopeDefinition({ mode: "manual", nodeIds: manualIdsFromInput(manualInput) });
      return;
    }

    commitScopeDefinition({ mode });
  };

  const changeDepth = (value: string) => {
    setDepthInput(value);
    if (scopeDefinition.mode !== "depth-limited") {
      return;
    }

    const depth = Number(value);
    if (!isValidScopeDepth(depth)) {
      setModeError("Depth must be an integer of at least 1.");
      return;
    }

    commitScopeDefinition({ mode: "depth-limited", maxDepth: depth });
  };

  const changeManualInput = (value: string) => {
    setManualInput(value);
    if (scopeDefinition.mode === "manual") {
      commitScopeDefinition({ mode: "manual", nodeIds: manualIdsFromInput(value) });
    }
  };

  const updateFilters = (next: Partial<ScopeFilterDefinition>) => {
    setFilters((current) => ({ ...current, ...next }));
  };

  const toggleNodeTypeFilter = (type: string) => {
    setFilters((current) => {
      const selected = new Set(current.nodeTypes);
      if (selected.has(type)) {
        selected.delete(type);
      } else {
        selected.add(type);
      }
      return { ...current, nodeTypes: [...selected].sort((left, right) => left.localeCompare(right)) };
    });
  };

  const renderRows = (nodes: readonly ScopeScanNode[]): ReactElement[] =>
    nodes.flatMap((node) => {
      const children = childrenByParent.get(node.id) ?? [];
      const isExpanded = expandedIds.has(node.id);
      const hasRenderedChildren = children.length > 0;
      const row = (
        <div
          aria-label={`${node.name} ${node.type}`}
          className="scope-tree-row"
          data-depth={node.depth}
          key={node.id}
          role="treeitem"
          tabIndex={0}
          aria-expanded={hasRenderedChildren ? isExpanded : undefined}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "ArrowRight" && hasRenderedChildren && !isExpanded) {
              event.preventDefault();
              toggleExpanded(node.id);
            }
            if (event.key === "ArrowLeft" && hasRenderedChildren && isExpanded) {
              event.preventDefault();
              toggleExpanded(node.id);
            }
            if (event.key === " ") {
              event.preventDefault();
              toggleChecked(node.id);
            }
          }}
          style={{ "--scope-depth": node.depth } as CSSProperties}
        >
          <button
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="scope-expand"
            disabled={!hasRenderedChildren}
            onClick={() => {
              toggleExpanded(node.id);
            }}
            type="button"
          >
            {hasRenderedChildren ? (isExpanded ? "v" : ">") : ""}
          </button>
          <input
            aria-label={`Include ${node.name}`}
            checked={checkedIds.has(node.id)}
            onChange={() => {
              toggleChecked(node.id);
            }}
            type="checkbox"
          />
          <span aria-hidden="true" className="scope-node-icon">
            {node.type.slice(0, 1)}
          </span>
          <span className="scope-node-name">{node.name}</span>
          <span className="scope-node-type">{nodeTypeLabel(node.type)}</span>
          {node.visible ? null : <span className="scope-node-indicator">Hidden</span>}
          {node.locked ? <span className="scope-node-indicator">Locked</span> : null}
          <button
            aria-label={`Reveal ${node.name} in Figma`}
            className="scope-row-action"
            onClick={() => {
              revealNode(node.id);
            }}
            type="button"
          >
            Reveal
          </button>
          <button
            aria-label={`Move ${node.name} up`}
            className="scope-row-action"
            onClick={() => {
              moveCustomNode(node.id, -1);
            }}
            type="button"
          >
            Up
          </button>
          <button
            aria-label={`Move ${node.name} down`}
            className="scope-row-action"
            onClick={() => {
              moveCustomNode(node.id, 1);
            }}
            type="button"
          >
            Down
          </button>
        </div>
      );

      return isExpanded && hasRenderedChildren
        ? [row, ...renderRows(children)]
        : [row];
    });

  return (
    <section className="scope-workspace" aria-label="Scope discovery">
      <div className="scope-workspace-header">
        <h2>Scope</h2>
        <div className="scope-header-actions">
          <label className="scope-check-option">
            <input
              checked={selectionSyncEnabled}
              onChange={(event) => {
                setSelectionSyncEnabled(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <span>Selection sync</span>
          </label>
          <button
            onClick={() => {
              requestScan(scopeDefinition);
            }}
            type="button"
          >
            Rescan
          </button>
        </div>
      </div>

      <fieldset className="scope-mode-controls">
        <legend>Scope mode</legend>
        <div className="scope-mode-options">
          {SCOPE_MODE_OPTIONS.map((option) => (
            <label className="scope-mode-option" key={option.mode}>
              <input
                checked={scopeDefinition.mode === option.mode}
                name="scope-mode"
                onChange={() => {
                  changeMode(option.mode);
                }}
                type="radio"
                value={option.mode}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <label className="scope-field">
          <span>Depth</span>
          <input
            aria-invalid={modeError !== null && scopeDefinition.mode === "depth-limited"}
            disabled={scopeDefinition.mode !== "depth-limited"}
            min={1}
            onChange={(event) => {
              changeDepth(event.currentTarget.value);
            }}
            step={1}
            type="number"
            value={depthInput}
          />
        </label>
        <label className="scope-field scope-field-wide">
          <span>Manual node IDs</span>
          <input
            disabled={scopeDefinition.mode !== "manual"}
            onChange={(event) => {
              changeManualInput(event.currentTarget.value);
            }}
            placeholder="12:34, 56:78"
            type="text"
            value={manualInput}
          />
        </label>
        {modeError === null ? null : <p className="scope-mode-error">{modeError}</p>}
      </fieldset>

      <fieldset className="scope-order-controls">
        <legend>Target order</legend>
        <label className="scope-field">
          <span>Order</span>
          <select
            aria-label="Target order"
            onChange={(event) => {
              changeOrderMode(event.currentTarget.value as ScopeOrderMode);
            }}
            value={order.mode}
          >
            {AUTOMATIC_SCOPE_ORDER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {ORDER_LABELS[mode]}
              </option>
            ))}
            <option value="custom">{ORDER_LABELS.custom}</option>
          </select>
        </label>
        <span className="scope-order-current">Current order: {ORDER_LABELS[order.mode]}</span>
        <button disabled={order.mode !== "custom"} onClick={resetCustomOrder} type="button">
          Reset custom order
        </button>
      </fieldset>

      {viewState.status === "idle" || viewState.status === "scanning" ? (
        <div aria-live="polite" className="scope-state" data-testid="scope-loading">
          <span>
            {viewState.status === "scanning"
              ? `Scanning Scope${viewState.progress === null ? "" : ` - ${String(viewState.progress.visited)} nodes visited`}`
              : "Awaiting first Scope scan"}
          </span>
          {viewState.status === "scanning" ? (
            <button onClick={cancelScan} type="button">
              Cancel scan
            </button>
          ) : null}
        </div>
      ) : null}

      {viewState.status === "stale" ? (
        <div className="scope-state scope-state-stale" data-testid="scope-stale">
          <span>{viewState.reason}</span>
          <button
            onClick={() => {
              requestScan(scopeDefinition);
            }}
            type="button"
          >
            Rescan
          </button>
        </div>
      ) : null}

      {viewState.status === "cancelled" ? (
        <div className="scope-state" data-testid="scope-cancelled">
          Scope scan cancelled. Previous valid results remain available when present.
        </div>
      ) : null}

      {viewState.status === "error" ? (
        <div className="scope-state scope-state-error" role="alert">
          <span>{viewState.message}</span>
          <button
            onClick={() => {
              requestScan(scopeDefinition);
            }}
            type="button"
          >
            Retry scan
          </button>
        </div>
      ) : null}

      {revealMessage === null ? null : <div className="scope-state">{revealMessage}</div>}

      {result !== null ? (
        <fieldset className="scope-filter-controls">
          <legend>Filters</legend>
          <label className="scope-field scope-field-wide">
            <span>Search layer name</span>
            <input
              onChange={(event) => {
                updateFilters({ search: event.currentTarget.value });
              }}
              placeholder="Case-insensitive"
              type="search"
              value={filters.search}
            />
          </label>
          <label className="scope-check-option">
            <input
              checked={filters.visibleOnly}
              onChange={(event) => {
                updateFilters({ visibleOnly: event.currentTarget.checked });
              }}
              type="checkbox"
            />
            <span>Visible only</span>
          </label>
          <label className="scope-check-option">
            <input
              checked={filters.unlockedOnly}
              onChange={(event) => {
                updateFilters({ unlockedOnly: event.currentTarget.checked });
              }}
              type="checkbox"
            />
            <span>Unlocked only</span>
          </label>
          <label className="scope-check-option">
            <input
              checked={filters.excludeHidden}
              onChange={(event) => {
                updateFilters({ excludeHidden: event.currentTarget.checked });
              }}
              type="checkbox"
            />
            <span>Exclude hidden</span>
          </label>
          <label className="scope-check-option">
            <input
              checked={filters.excludeLocked}
              onChange={(event) => {
                updateFilters({ excludeLocked: event.currentTarget.checked });
              }}
              type="checkbox"
            />
            <span>Exclude locked</span>
          </label>
          <div className="scope-type-filters" aria-label="Node type filters">
            {nodeTypes.map((type) => (
              <label className="scope-check-option" key={type}>
                <input
                  checked={filters.nodeTypes.includes(type)}
                  onChange={() => {
                    toggleNodeTypeFilter(type);
                  }}
                  type="checkbox"
                />
                <span>{nodeTypeLabel(type)}</span>
              </label>
            ))}
          </div>
          <button
            disabled={!hasActiveScopeFilters(filters)}
            onClick={() => {
              setFilters(createDefaultScopeFilters());
            }}
            type="button"
          >
            Clear filters
          </button>
        </fieldset>
      ) : null}

      {filteredResult !== null && filteredResult.nodes.length === 0 ? (
        <div className="scope-state" data-testid="scope-empty">
          {filteredResult.issues.some((issue) => issue.code === "empty_selection") &&
          (result?.nodes.length ?? 0) === 0
            ? "Select one or more supported layers in Figma to scan Scope targets."
            : filteredResult.issues.length > 0 && (result?.nodes.length ?? 0) === 0
              ? filteredResult.issues[0].message
              : "No eligible Scope targets match the current selection and filters."}
        </div>
      ) : null}

      {filteredResult !== null && filteredResult.nodes.length > 0 ? (
        <div aria-label="Scope hierarchy" className="scope-tree" role="tree">
          {renderRows(roots)}
        </div>
      ) : null}
    </section>
  );
};
