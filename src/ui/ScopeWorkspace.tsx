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
import { Select } from "./components/ui";
import { Icon } from "./components/Icon";
import { FigmaNodeIcon } from "./components/FigmaNodeIcon";

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
  { mode: "current-selection", label: "Current selection" },
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

const nodeTypeLabel = (type: string): string =>
  type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const childLookup = (nodes: readonly ScopeScanNode[]): Map<string | null, ScopeScanNode[]> => {
  const lookup = new Map<string | null, ScopeScanNode[]>();
  for (const node of nodes) {
    const siblings = lookup.get(node.parentId) ?? [];
    siblings.push(node);
    lookup.set(node.parentId, siblings);
  }
  return lookup;
};

const resultForState = (state: ScopeViewState): ScopeScanResult | null => {
  if (state.status === "ready" || state.status === "stale") {
    return state.result;
  }
  if (state.status === "scanning" || state.status === "error") {
    return state.previousResult;
  }
  if (state.status === "cancelled") {
    return state.result;
  }
  return null;
};

const visibleRoots = (result: ScopeScanResult): readonly ScopeScanNode[] =>
  result.nodes.filter(
    (node, index, nodes) =>
      (node.parentId === null || !nodes.some((candidate) => candidate.id === node.parentId)) &&
      nodes.findIndex((candidate) => candidate.id === node.id) === index
  );

const idsSignature = (ids: ReadonlySet<string>): string => [...ids].sort((left, right) => left.localeCompare(right)).join("|");

const scopeSignature = (result: ScopeScanResult | null): string =>
  result === null ? "" : idsSignature(new Set(result.nodes.map((node) => node.id)));

const descendantIds = (
  nodeId: string,
  childrenByParent: Map<string | null, ScopeScanNode[]>
): readonly string[] => {
  const ids: string[] = [];
  const visit = (id: string) => {
    ids.push(id);
    for (const child of childrenByParent.get(id) ?? []) {
      visit(child.id);
    }
  };
  visit(nodeId);
  return ids;
};

const scanScopeForDefinition = (scope: ScopeDefinition): ScopeDefinition =>
  scope.mode === "manual" ? { mode: "all-descendants" } : scope;

const buildScopeResult = (
  source: ScopeScanResult,
  checkedIds: ReadonlySet<string>
): ScopeScanResult => {
  const activeNodes = source.nodes.filter((node) => checkedIds.has(node.id));
  const activeIds = new Set(activeNodes.map((node) => node.id));
  return {
    roots: source.roots.filter((rootId) => activeIds.has(rootId)),
    nodes: activeNodes,
    issues: source.issues
  };
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
  const [modeError, setModeError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScopeFilterDefinition>(createDefaultScopeFilters);
  const [order, setOrder] = useState<ScopeOrderDefinition>(createDefaultScopeOrder);
  const [automaticOrderMode, setAutomaticOrderMode] = useState<ScopeOrderMode>("layer-panel");
  const [customNodeIds, setCustomNodeIds] = useState<readonly string[]>([]);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmedScope, setConfirmedScope] = useState<ScopeScanResult | null>(null);
  const [lastConfirmedSignature, setLastConfirmedSignature] = useState("");
  const activeRequestIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const scopeDefinitionRef = useRef(scopeDefinition);
  const selectionDebounceRef = useRef<number | null>(null);
  const dragNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    scopeDefinitionRef.current = scopeDefinition;
  }, [scopeDefinition]);

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
      scope: scanScopeForDefinition(scope)
    });
  }, [createRequestId, sendToPlugin]);

  const scheduleSelectionScan = useCallback(() => {
    if (selectionDebounceRef.current !== null) {
      window.clearTimeout(selectionDebounceRef.current);
    }
    selectionDebounceRef.current = window.setTimeout(() => {
      selectionDebounceRef.current = null;
      requestScan(scopeDefinitionRef.current);
    }, 80);
  }, [requestScan]);

  useEffect(() => () => {
    if (selectionDebounceRef.current !== null) {
      window.clearTimeout(selectionDebounceRef.current);
    }
  }, []);

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
      scheduleSelectionScan();
      setViewState((current) => {
        const result = resultForState(current);
        return result === null
          ? current
          : {
              status: "stale",
              result,
              reason: "Figma selection changed. A new Scope draft is being prepared."
            };
      });
    }

    if (lastMessage.type === "SCOPE_REVEAL_NODE_RESULT") {
      setRevealMessage(lastMessage.result.message);
    }
  }, [lastMessage, scheduleSelectionScan]);

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
  const childrenByParent = useMemo(
    () => childLookup(filteredResult?.nodes ?? []),
    [filteredResult]
  );
  const roots = useMemo(
    () => (filteredResult === null ? [] : visibleRoots(filteredResult)),
    [filteredResult]
  );
  const nodeTypes = useMemo(
    () =>
      Array.from(new Set(result?.nodes.map((node) => node.type) ?? [])).sort((left, right) =>
        left.localeCompare(right)
      ),
    [result]
  );
  const draftScopeResult = useMemo<ScopeScanResult | null>(
    () => (filteredResult === null ? null : buildScopeResult(filteredResult, checkedIds)),
    [checkedIds, filteredResult]
  );
  const draftSignature = scopeSignature(draftScopeResult);
  const hasPendingChanges = draftSignature !== lastConfirmedSignature;

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

  const setBranchChecked = (nodeId: string, checked: boolean) => {
    const branchIds = descendantIds(nodeId, childrenByParent);
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const id of branchIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const checkboxState = (node: ScopeScanNode): "checked" | "unchecked" | "mixed" => {
    const ids = descendantIds(node.id, childrenByParent);
    const selectedCount = ids.filter((id) => checkedIds.has(id)).length;
    if (selectedCount === 0) {
      return "unchecked";
    }
    if (selectedCount === ids.length) {
      return "checked";
    }
    return "mixed";
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

  const dropCustomNode = (targetNodeId: string) => {
    const sourceNodeId = dragNodeIdRef.current;
    dragNodeIdRef.current = null;
    if (sourceNodeId === null || sourceNodeId === targetNodeId || result === null) {
      return;
    }
    setOrder({ mode: "custom", customNodeIds });
    setCustomNodeIds((current) => {
      const normalized = [...normalizeCustomOrder(current, result.nodes.map((node) => node.id))];
      const from = normalized.indexOf(sourceNodeId);
      const to = normalized.indexOf(targetNodeId);
      if (from < 0 || to < 0) {
        return Object.freeze(normalized);
      }
      const [item] = normalized.splice(from, 1);
      normalized.splice(to, 0, item);
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
      commitScopeDefinition({ mode: "manual", nodeIds: [] });
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

  const confirmScope = () => {
    setConfirmedScope(draftScopeResult);
    setLastConfirmedSignature(scopeSignature(draftScopeResult));
    onConfirmedScopeChange?.(draftScopeResult);
  };

  const resetDraft = () => {
    if (confirmedScope === null) {
      setCheckedIds(new Set());
      return;
    }
    setCheckedIds(new Set(confirmedScope.nodes.map((node) => node.id)));
  };

  const renderRows = (nodes: readonly ScopeScanNode[]): ReactElement[] =>
    nodes.flatMap((node) => {
      const children = childrenByParent.get(node.id) ?? [];
      const isExpanded = expandedIds.has(node.id);
      const hasRenderedChildren = children.length > 0;
      const state = checkboxState(node);
      const isChecked = state === "checked";
      const row = (
        <div
          aria-label={`${node.name} ${node.type}`}
          className="scope-tree-row"
          data-depth={node.depth}
          draggable={order.mode === "custom"}
          key={node.id}
          role="treeitem"
          tabIndex={0}
          aria-expanded={hasRenderedChildren ? isExpanded : undefined}
          onDragOver={(event) => {
            if (order.mode === "custom") {
              event.preventDefault();
            }
          }}
          onDrop={() => {
            dropCustomNode(node.id);
          }}
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
              setBranchChecked(node.id, state !== "checked");
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
            {hasRenderedChildren ? <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={12} /> : null}
          </button>
          <input
            aria-label={`Include in scope: ${node.name}`}
            checked={isChecked}
            data-state={state}
            ref={(input) => {
              if (input !== null) {
                input.indeterminate = state === "mixed";
              }
            }}
            onChange={() => {
              setBranchChecked(node.id, !isChecked);
            }}
            title="Include in scope"
            type="checkbox"
          />
          {order.mode === "custom" ? (
            <button
              aria-label={`Drag ${node.name} to reorder MotionOps target order`}
              className="scope-drag-handle"
              onDragStart={() => {
                dragNodeIdRef.current = node.id;
              }}
              draggable
              type="button"
            ><Icon name="sequence" size={12} /></button>
          ) : null}
          <span className="scope-node-name">{node.name}</span>
          <FigmaNodeIcon nodeType={node.type} />
          {node.visible ? null : (
            <span className="scope-state-icon" title="Hidden layer">
              <Icon name="hidden" size={13} />
              <span className="visually-hidden">Hidden layer</span>
            </span>
          )}
          {node.locked ? (
            <span className="scope-state-icon" title="Locked layer">
              <Icon name="locked" size={13} />
              <span className="visually-hidden">Locked layer</span>
            </span>
          ) : null}
          <button
            aria-label={`Reveal ${node.name} in Figma`}
            className="scope-row-action"
            onClick={() => {
              revealNode(node.id);
            }}
            type="button"
          ><Icon name="eye" size={13} /><span>Reveal</span></button>
          {order.mode === "custom" ? (
            <>
              <button
                aria-label={`Move ${node.name} up in MotionOps target order`}
                className="scope-icon-action"
                onClick={() => {
                  moveCustomNode(node.id, -1);
                }}
                title="Move up in MotionOps target order"
                type="button"
              ><Icon name="chevron-left" size={12} /></button>
              <button
                aria-label={`Move ${node.name} down in MotionOps target order`}
                className="scope-icon-action"
                onClick={() => {
                  moveCustomNode(node.id, 1);
                }}
                title="Move down in MotionOps target order"
                type="button"
              ><Icon name="chevron-right" size={12} /></button>
            </>
          ) : null}
        </div>
      );

      return isExpanded && hasRenderedChildren
        ? [row, ...renderRows(children)]
        : [row];
    });

  return (
    <section className="scope-workspace" aria-label="Scope discovery">
      <div className="scope-workspace-header">
        <div>
          <h2>Scope</h2>
          <p>Define the target set MotionOps should use in the other workspaces.</p>
        </div>
        <div className="scope-summary" aria-label="Scope target summary">
          <span>{String(draftScopeResult?.nodes.length ?? 0)} included</span>
          <span>{ORDER_LABELS[order.mode]}</span>
          <span>{SCOPE_MODE_OPTIONS.find((option) => option.mode === scopeDefinition.mode)?.label}</span>
        </div>
      </div>

      <div className="scope-mode-controls" aria-label="Scope mode">
        <div className="scope-mode-options" role="radiogroup" aria-label="Scope mode">
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
        {scopeDefinition.mode === "depth-limited" ? (
          <label className="scope-field">
            <span>Depth</span>
            <input
              aria-invalid={modeError !== null}
              min={1}
              onChange={(event) => {
                changeDepth(event.currentTarget.value);
              }}
              step={1}
              type="number"
              value={depthInput}
            />
          </label>
        ) : null}
        {scopeDefinition.mode === "manual" ? (
          <p className="scope-field-note">Manual mode uses the hierarchy checkboxes below. Raw Figma node IDs are hidden from the normal workflow.</p>
        ) : null}
        {modeError === null ? null : <p className="scope-mode-error">{modeError}</p>}
      </div>

      <div className="scope-toolbar">
        <label className="scope-field scope-field-wide">
          <span>Search</span>
          <input
            onChange={(event) => {
              updateFilters({ search: event.currentTarget.value });
            }}
            placeholder="Layer name"
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
        <label className="scope-field">
          <span>Order</span>
          <Select
            label="Target order"
            onChange={(value) => {
              changeOrderMode(value);
            }}
            options={[
              ...AUTOMATIC_SCOPE_ORDER_MODES.map((mode) => ({ value: mode, label: ORDER_LABELS[mode] })),
              { value: "custom" as const, label: ORDER_LABELS.custom }
            ]}
            value={order.mode}
          />
        </label>
        <button
          className="secondary-action"
          disabled={!hasActiveScopeFilters(filters)}
          onClick={() => {
            setFilters(createDefaultScopeFilters());
          }}
          type="button"
        ><Icon name="filter" size={13} /><span>Clear filters</span></button>
        <button
          className="secondary-action"
          onClick={() => {
            requestScan(scopeDefinition);
          }}
          type="button"
        ><Icon name="refresh" size={13} /><span>Refresh</span></button>
      </div>

      {nodeTypes.length > 0 ? (
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
              <FigmaNodeIcon nodeType={type} size={12} />
              <span>{nodeTypeLabel(type)}</span>
            </label>
          ))}
        </div>
      ) : null}

      {order.mode === "custom" ? (
        <div className="scope-order-note">
          <span>Custom order changes MotionOps processing order only, not Figma layer order.</span>
          <button onClick={resetCustomOrder} type="button"><Icon name="undo" size={13} /><span>Reset custom order</span></button>
        </div>
      ) : null}

      {viewState.status === "idle" || viewState.status === "scanning" ? (
        <div aria-live="polite" className="scope-state" data-testid="scope-loading">
          <span>
            {viewState.status === "scanning"
              ? `Scanning Scope${viewState.progress === null ? "" : ` - ${String(viewState.progress.visited)} nodes visited`}`
              : "Awaiting first Scope scan"}
          </span>
          {viewState.status === "scanning" ? (
            <button onClick={cancelScan} type="button"><Icon name="close" size={13} /><span>Cancel scan</span></button>
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
          ><Icon name="refresh" size={13} /><span>Refresh</span></button>
        </div>
      ) : null}

      {viewState.status === "cancelled" ? (
        <div className="scope-state" data-testid="scope-cancelled">
          Scope scan cancelled. Previous valid results remain available when present.
        </div>
      ) : null}

      {viewState.status === "error" ? (
        <div className="scope-state scope-state-error" role="alert">
          <span>{lastMessage?.type === "PLUGIN_ERROR" ? lastMessage.message : "Scope scan failed."}</span>
          <button
            onClick={() => {
              requestScan(scopeDefinition);
            }}
            type="button"
          ><Icon name="refresh" size={13} /><span>Retry</span></button>
        </div>
      ) : null}

      {revealMessage === null ? null : <div className="scope-state">{revealMessage}</div>}

      {filteredResult !== null && filteredResult.nodes.length === 0 ? (
        <div className="scope-state" data-testid="scope-empty">
          {filteredResult.issues.some((issue) => issue.code === "empty_selection") &&
          (result?.nodes.length ?? 0) === 0
            ? "Select one or more supported layers in Figma to scan Scope targets."
            : filteredResult.issues.length > 0 && (result?.nodes.length ?? 0) === 0
              ? filteredResult.issues[0].message
              : "No eligible Scope targets match the current selection and filters. Adjust filters or refresh Scope."}
        </div>
      ) : null}

      {filteredResult !== null && filteredResult.nodes.length > 0 ? (
        <>
          <div className="scope-selection-tools">
            <span>{String(draftScopeResult?.nodes.length ?? 0)} of {String(filteredResult.nodes.length)} targets included</span>
            <button
              onClick={() => {
                setCheckedIds(new Set(filteredResult.nodes.map((node) => node.id)));
              }}
              type="button"
            ><Icon name="check" size={13} /><span>Select all</span></button>
            <button
              onClick={() => {
                setCheckedIds(new Set());
              }}
              type="button"
            ><Icon name="minus" size={13} /><span>Deselect all</span></button>
          </div>
          <div aria-label="Scope hierarchy" className="scope-tree" role="tree">
            {renderRows(roots)}
          </div>
        </>
      ) : null}

      <div className="scope-action-bar">
        <span>
          {hasPendingChanges
            ? "Scope draft has pending changes."
            : confirmedScope === null
              ? "Confirm a Scope to share it with the other workspaces."
              : "Confirmed Scope is up to date."}
        </span>
        <button className="secondary-action" disabled={!hasPendingChanges} onClick={resetDraft} type="button"><Icon name="undo" size={13} /><span>Reset</span></button>
        <button className="primary-action" disabled={draftScopeResult === null} onClick={confirmScope} type="button"><Icon name="check" size={13} /><span>Confirm scope</span></button>
      </div>
    </section>
  );
};
