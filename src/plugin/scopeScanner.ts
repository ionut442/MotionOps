import { parseScopeDefinition, type ScopeDefinition } from "../domain/scope";
import type { ScopeScanGeometry, ScopeScanIssue, ScopeScanNode, ScopeScanResult } from "../domain/scopeScan";

export interface ScopeScannerNode {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly parent?: { readonly id?: string } | null;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly children?: readonly ScopeScannerNode[];
  readonly loadAsync?: () => Promise<void>;
}

export interface ScopeScannerFigmaAdapter {
  readonly currentPage: {
    readonly selection: readonly ScopeScannerNode[];
    readonly loadAsync?: () => Promise<void>;
  };
  readonly getNodeByIdAsync?: (nodeId: string) => Promise<ScopeScannerNode | null>;
}

export interface ScopeScanProgress {
  readonly requestId: string;
  readonly visited: number;
  readonly queued?: number;
  readonly total?: number;
  readonly indeterminate: boolean;
}

export interface ScopeScannerOptions {
  readonly requestId?: string;
  readonly isCancelled?: () => boolean;
  readonly onProgress?: (progress: ScopeScanProgress) => void;
  readonly progressInterval?: number;
}

interface TraversalContext {
  readonly maxDepth: number;
  readonly includeRoots: boolean;
}

const hasUsableNodeShape = (node: ScopeScannerNode): boolean =>
  typeof node.id === "string" &&
  node.id.length > 0 &&
  typeof node.name === "string" &&
  typeof node.type === "string";

const getChildren = async (node: ScopeScannerNode): Promise<readonly ScopeScannerNode[]> => {
  await node.loadAsync?.();
  return node.children ?? [];
};

const projectGeometry = (node: ScopeScannerNode): ScopeScanGeometry | null => {
  if (
    typeof node.x !== "number" ||
    !Number.isFinite(node.x) ||
    typeof node.y !== "number" ||
    !Number.isFinite(node.y) ||
    typeof node.width !== "number" ||
    !Number.isFinite(node.width) ||
    typeof node.height !== "number" ||
    !Number.isFinite(node.height)
  ) {
    return null;
  }

  return Object.freeze({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    centerX: node.x + node.width / 2,
    centerY: node.y + node.height / 2
  });
};

const rootMembership = (
  existing: readonly string[] | undefined,
  rootId: string
): readonly string[] => {
  if (existing?.includes(rootId)) {
    return existing;
  }
  return Object.freeze([...(existing ?? []), rootId]);
};

const summarizeNode = async (
  node: ScopeScannerNode,
  depth: number,
  traversalIndex: number,
  rootId: string,
  includeChildren: boolean
): Promise<ScopeScanNode | ScopeScanIssue> => {
  if (!hasUsableNodeShape(node)) {
    return {
      code: "unsupported_node",
      message: "A Scope node could not be summarized safely.",
      nodeId: typeof node.id === "string" ? node.id : undefined
    };
  }

  const nodeName = node.name;
  const nodeType = node.type;
  if (nodeName === undefined || nodeType === undefined) {
    return {
      code: "unsupported_node",
      message: "A Scope node could not be summarized safely.",
      nodeId: node.id
    };
  }

  const children = await getChildren(node);
  const geometry = projectGeometry(node);
  return Object.freeze({
    id: node.id,
    parentId: typeof node.parent?.id === "string" ? node.parent.id : null,
    name: nodeName,
    type: nodeType,
    depth,
    childIds: Object.freeze(children.map((child) => child.id).filter((id) => id.length > 0)),
    visible: node.visible !== false,
    locked: node.locked === true,
    hasChildren: children.length > 0,
    childrenIncluded: includeChildren && children.length > 0,
    rootIds: Object.freeze([rootId]),
    traversalIndex,
    ...(geometry === null ? {} : { geometry })
  });
};

export const scanScope = async (
  figmaAdapter: ScopeScannerFigmaAdapter,
  untrustedScope: unknown,
  options: ScopeScannerOptions = {}
): Promise<ScopeScanResult> => {
  const parsed = parseScopeDefinition(untrustedScope);
  if (!parsed.ok) {
    return {
      roots: Object.freeze([]),
      nodes: Object.freeze([]),
      issues: Object.freeze(
        parsed.issues.map((issue) => ({
          code: "invalid_scope" as const,
          message: issue.message
        }))
      )
    };
  }

  await figmaAdapter.currentPage.loadAsync?.();
  const scope = parsed.value;
  const issues: ScopeScanIssue[] = [];
  const nodesById = new Map<string, ScopeScanNode>();
  const roots: string[] = [];
  let traversalIndex = 0;
  let visited = 0;
  let lastProgress = 0;
  const progressInterval = options.progressInterval ?? 25;

  const isCancelled = (): boolean => options.isCancelled?.() === true;

  const emitProgress = (force = false) => {
    if (options.requestId === undefined || options.onProgress === undefined) {
      return;
    }
    if (!force && visited - lastProgress < progressInterval) {
      return;
    }
    lastProgress = visited;
    options.onProgress({
      requestId: options.requestId,
      visited,
      indeterminate: true
    });
  };

  const cancelledResult = (): ScopeScanResult =>
    Object.freeze({
      roots: Object.freeze([...roots]),
      nodes: Object.freeze([...nodesById.values()].sort((left, right) => left.traversalIndex - right.traversalIndex)),
      issues: Object.freeze([
        ...issues,
        {
          code: "cancelled" as const,
          message: "Scope scan was cancelled."
        }
      ])
    });

  const addNode = async (
    node: ScopeScannerNode,
    depth: number,
    rootId: string,
    includeChildren: boolean
  ): Promise<boolean> => {
    const existing = nodesById.get(node.id);
    if (existing !== undefined) {
      nodesById.set(
        node.id,
        Object.freeze({ ...existing, rootIds: rootMembership(existing.rootIds, rootId) })
      );
      return false;
    }

    const summary = await summarizeNode(node, depth, traversalIndex, rootId, includeChildren);
    if ("code" in summary) {
      issues.push(summary);
      return false;
    }

    traversalIndex += 1;
    nodesById.set(node.id, summary);
    return true;
  };

  const traverse = async (
    node: ScopeScannerNode,
    depth: number,
    rootId: string,
    context: TraversalContext
  ): Promise<void> => {
    if (isCancelled()) {
      return;
    }
    visited += 1;
    emitProgress();
    const shouldInclude = context.includeRoots || depth > 0;
    const canIncludeChildren = depth < context.maxDepth;
    if (shouldInclude) {
      await addNode(node, depth, rootId, canIncludeChildren);
    }

    if (!canIncludeChildren) {
      return;
    }

    for (const child of await getChildren(node)) {
      if (isCancelled()) {
        return;
      }
      await traverse(child, depth + 1, rootId, context);
    }
  };

  const selectedRoots = [...figmaAdapter.currentPage.selection];
  if (scope.mode !== "manual" && selectedRoots.length === 0) {
    issues.push({
      code: "empty_selection",
      message: "Scope scan needs a current Figma selection."
    });
    return {
      roots: Object.freeze([]),
      nodes: Object.freeze([]),
      issues: Object.freeze(issues)
    };
  }

  const addRoot = (nodeId: string) => {
    if (!roots.includes(nodeId)) {
      roots.push(nodeId);
    }
  };

  const scanSelectionRoots = async (rootScope: ScopeDefinition) => {
    for (const root of selectedRoots) {
      if (isCancelled()) {
        return;
      }
      addRoot(root.id);
      switch (rootScope.mode) {
        case "current-selection":
          await traverse(root, 0, root.id, { maxDepth: 0, includeRoots: true });
          break;
        case "direct-children":
          await traverse(root, 0, root.id, { maxDepth: 1, includeRoots: false });
          break;
        case "all-descendants":
          await traverse(root, 0, root.id, {
            maxDepth: Number.MAX_SAFE_INTEGER,
            includeRoots: true
          });
          break;
        case "depth-limited":
          await traverse(root, 0, root.id, { maxDepth: rootScope.maxDepth, includeRoots: true });
          break;
        case "manual":
          break;
      }
    }
  };

  if (scope.mode === "manual") {
    for (const nodeId of scope.nodeIds) {
      if (isCancelled()) {
        return cancelledResult();
      }
      const node = await figmaAdapter.getNodeByIdAsync?.(nodeId);
      if (node === undefined || node === null) {
        issues.push({
          code: "missing_node",
          nodeId,
          message: "Manual Scope node ID was not found."
        });
        continue;
      }
      addRoot(node.id);
      await traverse(node, 0, node.id, { maxDepth: 0, includeRoots: true });
    }
  } else {
    await scanSelectionRoots(scope);
  }

  if (isCancelled()) {
    emitProgress(true);
    return cancelledResult();
  }
  emitProgress(true);

  return Object.freeze({
    roots: Object.freeze([...roots]),
    nodes: Object.freeze([...nodesById.values()].sort((left, right) => left.traversalIndex - right.traversalIndex)),
    issues: Object.freeze([...issues])
  });
};
