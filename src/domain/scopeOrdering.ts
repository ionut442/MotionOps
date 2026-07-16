import type { ScopeScanGeometry, ScopeScanNode, ScopeScanResult } from "./scopeScan";

export type ScopeOrderMode =
  | "layer-panel"
  | "reverse-layer-panel"
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left"
  | "center-outward"
  | "edges-inward"
  | "custom";

export interface ScopeOrderDefinition {
  readonly mode: ScopeOrderMode;
  readonly customNodeIds?: readonly string[];
}

export const AUTOMATIC_SCOPE_ORDER_MODES: readonly ScopeOrderMode[] = Object.freeze([
  "layer-panel",
  "reverse-layer-panel",
  "top-to-bottom",
  "bottom-to-top",
  "left-to-right",
  "right-to-left",
  "center-outward",
  "edges-inward"
]);

export const createDefaultScopeOrder = (): ScopeOrderDefinition =>
  Object.freeze({ mode: "layer-panel" });

const layerCompare = (left: ScopeScanNode, right: ScopeScanNode): number =>
  left.traversalIndex - right.traversalIndex;

type ScopeScanNodeWithGeometry = ScopeScanNode & { readonly geometry: ScopeScanGeometry };

const hasGeometry = (node: ScopeScanNode): node is ScopeScanNodeWithGeometry =>
  node.geometry !== undefined;

const geometryCompare = (
  left: ScopeScanNode,
  right: ScopeScanNode,
  primary: "x" | "y",
  direction: "ascending" | "descending"
): number => {
  if (!hasGeometry(left) || !hasGeometry(right)) {
    return layerCompare(left, right);
  }

  const secondary = primary === "x" ? "y" : "x";
  const leftPrimary = primary === "x" ? left.geometry.centerX : left.geometry.centerY;
  const rightPrimary = primary === "x" ? right.geometry.centerX : right.geometry.centerY;
  const leftSecondary = secondary === "x" ? left.geometry.centerX : left.geometry.centerY;
  const rightSecondary = secondary === "x" ? right.geometry.centerX : right.geometry.centerY;
  const multiplier = direction === "ascending" ? 1 : -1;
  const primaryDelta = (leftPrimary - rightPrimary) * multiplier;
  if (primaryDelta !== 0) {
    return primaryDelta;
  }
  const secondaryDelta = (leftSecondary - rightSecondary) * multiplier;
  if (secondaryDelta !== 0) {
    return secondaryDelta;
  }
  return layerCompare(left, right);
};

const aggregateCenter = (nodes: readonly ScopeScanNode[]): { readonly x: number; readonly y: number } | null => {
  const geometryNodes = nodes.filter(hasGeometry);
  if (geometryNodes.length === 0) {
    return null;
  }

  const bounds = geometryNodes.reduce(
    (current, node) => ({
      minX: Math.min(current.minX, node.geometry.x),
      minY: Math.min(current.minY, node.geometry.y),
      maxX: Math.max(current.maxX, node.geometry.x + node.geometry.width),
      maxY: Math.max(current.maxY, node.geometry.y + node.geometry.height)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  return { x: bounds.minX + (bounds.maxX - bounds.minX) / 2, y: bounds.minY + (bounds.maxY - bounds.minY) / 2 };
};

const distanceFrom = (node: ScopeScanNode, center: { readonly x: number; readonly y: number }): number => {
  if (node.geometry === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const deltaX = node.geometry.centerX - center.x;
  const deltaY = node.geometry.centerY - center.y;
  return deltaX * deltaX + deltaY * deltaY;
};

export const normalizeCustomOrder = (
  customNodeIds: readonly string[],
  availableNodeIds: readonly string[]
): readonly string[] => {
  const available = new Set(availableNodeIds);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const nodeId of customNodeIds) {
    if (available.has(nodeId) && !seen.has(nodeId)) {
      normalized.push(nodeId);
      seen.add(nodeId);
    }
  }

  for (const nodeId of availableNodeIds) {
    if (!seen.has(nodeId)) {
      normalized.push(nodeId);
      seen.add(nodeId);
    }
  }

  return Object.freeze(normalized);
};

export const orderScopeNodes = (
  nodes: readonly ScopeScanNode[],
  order: ScopeOrderDefinition
): readonly ScopeScanNode[] => {
  const copy = [...nodes];

  switch (order.mode) {
    case "layer-panel":
      return Object.freeze(copy.sort(layerCompare));
    case "reverse-layer-panel":
      return Object.freeze(copy.sort((left, right) => layerCompare(right, left)));
    case "top-to-bottom":
      return Object.freeze(copy.sort((left, right) => geometryCompare(left, right, "y", "ascending")));
    case "bottom-to-top":
      return Object.freeze(copy.sort((left, right) => geometryCompare(left, right, "y", "descending")));
    case "left-to-right":
      return Object.freeze(copy.sort((left, right) => geometryCompare(left, right, "x", "ascending")));
    case "right-to-left":
      return Object.freeze(copy.sort((left, right) => geometryCompare(left, right, "x", "descending")));
    case "center-outward": {
      const center = aggregateCenter(copy);
      if (center === null) {
        return Object.freeze(copy.sort(layerCompare));
      }
      return Object.freeze(copy.sort((left, right) => {
        if (!hasGeometry(left) || !hasGeometry(right)) {
          return layerCompare(left, right);
        }
        return distanceFrom(left, center) - distanceFrom(right, center) || layerCompare(left, right);
      }));
    }
    case "edges-inward": {
      const center = aggregateCenter(copy);
      if (center === null) {
        return Object.freeze(copy.sort(layerCompare));
      }
      return Object.freeze(copy.sort((left, right) => {
        if (!hasGeometry(left) || !hasGeometry(right)) {
          return layerCompare(left, right);
        }
        return distanceFrom(right, center) - distanceFrom(left, center) || layerCompare(left, right);
      }));
    }
    case "custom": {
      const orderedIds = normalizeCustomOrder(order.customNodeIds ?? [], copy.map((node) => node.id));
      const positions = new Map(orderedIds.map((nodeId, index) => [nodeId, index]));
      return Object.freeze(copy.sort((left, right) => (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0) || layerCompare(left, right)));
    }
  }
};

export const orderScopeResult = (
  result: ScopeScanResult,
  order: ScopeOrderDefinition
): ScopeScanResult => {
  const nodes = orderScopeNodes(result.nodes, order);
  const ids = new Set(nodes.map((node) => node.id));
  return Object.freeze({
    roots: Object.freeze(result.roots.filter((rootId) => ids.has(rootId))),
    nodes,
    issues: Object.freeze([...result.issues])
  });
};
