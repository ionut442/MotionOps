export type ScopeNodeType = string;

export interface ScopeScanNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: ScopeNodeType;
  readonly depth: number;
  readonly childIds: readonly string[];
  readonly visible: boolean;
  readonly locked: boolean;
  readonly hasChildren: boolean;
  readonly childrenIncluded: boolean;
  readonly rootIds: readonly string[];
  readonly traversalIndex: number;
  readonly geometry?: ScopeScanGeometry;
}

export interface ScopeScanGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface ScopeScanIssue {
  readonly code:
    | "empty_selection"
    | "missing_node"
    | "unsupported_node"
    | "invalid_scope"
    | "missing_geometry"
    | "cancelled";
  readonly message: string;
  readonly nodeId?: string;
}

export interface ScopeScanResult {
  readonly roots: readonly string[];
  readonly nodes: readonly ScopeScanNode[];
  readonly issues: readonly ScopeScanIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isScopeScanIssue = (value: unknown): value is ScopeScanIssue =>
  isRecord(value) &&
  (value.code === "empty_selection" ||
    value.code === "missing_node" ||
    value.code === "unsupported_node" ||
    value.code === "invalid_scope" ||
    value.code === "missing_geometry" ||
    value.code === "cancelled") &&
  typeof value.message === "string" &&
  (value.nodeId === undefined || typeof value.nodeId === "string");

const isScopeScanNode = (value: unknown): value is ScopeScanNode =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.parentId === null || typeof value.parentId === "string") &&
  typeof value.name === "string" &&
  typeof value.type === "string" &&
  typeof value.depth === "number" &&
  Number.isInteger(value.depth) &&
  value.depth >= 0 &&
  isStringArray(value.childIds) &&
  typeof value.visible === "boolean" &&
  typeof value.locked === "boolean" &&
  typeof value.hasChildren === "boolean" &&
  typeof value.childrenIncluded === "boolean" &&
  isStringArray(value.rootIds) &&
  typeof value.traversalIndex === "number" &&
  Number.isInteger(value.traversalIndex) &&
  value.traversalIndex >= 0 &&
  (value.geometry === undefined ||
    (isRecord(value.geometry) &&
      typeof value.geometry.x === "number" &&
      Number.isFinite(value.geometry.x) &&
      typeof value.geometry.y === "number" &&
      Number.isFinite(value.geometry.y) &&
      typeof value.geometry.width === "number" &&
      Number.isFinite(value.geometry.width) &&
      typeof value.geometry.height === "number" &&
      Number.isFinite(value.geometry.height) &&
      typeof value.geometry.centerX === "number" &&
      Number.isFinite(value.geometry.centerX) &&
      typeof value.geometry.centerY === "number" &&
      Number.isFinite(value.geometry.centerY)));

export const isScopeScanResult = (value: unknown): value is ScopeScanResult =>
  isRecord(value) &&
  isStringArray(value.roots) &&
  Array.isArray(value.nodes) &&
  value.nodes.every(isScopeScanNode) &&
  Array.isArray(value.issues) &&
  value.issues.every(isScopeScanIssue);

export const createEmptyScopeScanResult = (
  issues: readonly ScopeScanIssue[] = []
): ScopeScanResult =>
  Object.freeze({
    roots: Object.freeze([]),
    nodes: Object.freeze([]),
    issues: Object.freeze([...issues])
  });
