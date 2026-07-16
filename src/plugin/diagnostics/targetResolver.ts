import type {
  DiagnosticTargetSpec,
  ResolvedDiagnosticTargetFailure,
  ResolvedDiagnosticTargetSummary
} from "../../shared/diagnostics";

export interface ResolvedDiagnosticTargets extends ResolvedDiagnosticTargetSummary {
  resolvedNodes: SceneNode[];
}

const uniquePreserveOrder = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
};

const isSceneNode = (node: BaseNode): node is SceneNode => "visible" in node && "type" in node;

export const pageIdForNode = (node: BaseNode): string | null => {
  let current: BaseNode | null = node;
  while (current !== null) {
    if (current.type === "PAGE") {
      return current.id;
    }
    current = current.parent;
  }
  return null;
};

const canvasSelectionNodeIds = (): string[] => figma.currentPage.selection.map((node) => node.id);

export const summarizeResolvedTargets = (
  targets: ResolvedDiagnosticTargets
): ResolvedDiagnosticTargetSummary => ({
  mode: targets.mode,
  requestedNodeIds: targets.requestedNodeIds,
  resolvedNodeIds: targets.resolvedNodeIds,
  failed: targets.failed,
  canvasSelectionNodeIds: targets.canvasSelectionNodeIds
});

export const resolveDiagnosticTargets = async (
  target: DiagnosticTargetSpec
): Promise<ResolvedDiagnosticTargets> => {
  if (target.mode === "EMPTY") {
    return {
      mode: "EMPTY",
      requestedNodeIds: [],
      resolvedNodes: [],
      resolvedNodeIds: [],
      failed: [],
      canvasSelectionNodeIds: canvasSelectionNodeIds()
    };
  }

  if (target.mode === "CURRENT_SELECTION") {
    const nodes = [...figma.currentPage.selection];
    return {
      mode: "CURRENT_SELECTION",
      requestedNodeIds: nodes.map((node) => node.id),
      resolvedNodes: nodes,
      resolvedNodeIds: nodes.map((node) => node.id),
      failed: [],
      canvasSelectionNodeIds: canvasSelectionNodeIds()
    };
  }

  const requestedNodeIds = uniquePreserveOrder(target.nodeIds);
  const resolvedNodes: SceneNode[] = [];
  const failed: ResolvedDiagnosticTargetFailure[] = [];

  for (const nodeId of requestedNodeIds) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node === null) {
      failed.push({
        nodeId,
        reason: "NOT_FOUND",
        message: "Target node was not found by getNodeByIdAsync."
      });
      continue;
    }

    if (node.removed) {
      failed.push({
        nodeId,
        reason: "REMOVED",
        message: "Target node was removed."
      });
      continue;
    }

    if (!isSceneNode(node)) {
      failed.push({
        nodeId,
        reason: "NOT_SCENE_NODE",
        message: `Target node type ${node.type} is not a SceneNode.`
      });
      continue;
    }

    const pageId = pageIdForNode(node);
    if (pageId !== figma.currentPage.id) {
      failed.push({
        nodeId,
        reason: "WRONG_PAGE",
        message: `Target node is on page ${pageId ?? "UNKNOWN"}, not current page ${figma.currentPage.id}.`
      });
      continue;
    }

    resolvedNodes.push(node);
  }

  return {
    mode: "EXPLICIT_NODE_IDS",
    requestedNodeIds,
    resolvedNodes,
    resolvedNodeIds: resolvedNodes.map((node) => node.id),
    failed,
    canvasSelectionNodeIds: canvasSelectionNodeIds()
  };
};

export interface RevealResult {
  selectedNodeIds: string[];
  warnings: string[];
}

const isDescendantOf = (node: SceneNode, maybeAncestor: SceneNode): boolean => {
  let current: BaseNode | null = node.parent;
  while (current !== null) {
    if (current.id === maybeAncestor.id) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

export const revealDiagnosticTargets = async (nodeIds: readonly string[]): Promise<RevealResult> => {
  const warnings: string[] = [];
  const nodes: SceneNode[] = [];
  for (const nodeId of uniquePreserveOrder(nodeIds)) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node !== null && !node.removed && isSceneNode(node) && pageIdForNode(node) === figma.currentPage.id) {
      nodes.push(node);
    }
  }

  if (nodes.length === 0) {
    figma.currentPage.selection = [];
    return { selectedNodeIds: [], warnings };
  }

  const selectable = nodes.filter(
    (node) => !nodes.some((other) => node.id !== other.id && isDescendantOf(node, other))
  );
  if (selectable.length !== nodes.length) {
    warnings.push("Parent/descendant targets cannot all be represented in canvas selection.");
  }

  figma.currentPage.selection = selectable;
  figma.viewport.scrollAndZoomIntoView(selectable);
  return { selectedNodeIds: selectable.map((node) => node.id), warnings };
};
