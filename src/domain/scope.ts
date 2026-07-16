export type ScopeMode =
  | "current-selection"
  | "direct-children"
  | "all-descendants"
  | "depth-limited"
  | "manual";

export interface CurrentSelectionScope {
  readonly mode: "current-selection";
}

export interface DirectChildrenScope {
  readonly mode: "direct-children";
}

export interface AllDescendantsScope {
  readonly mode: "all-descendants";
}

export interface DepthLimitedScope {
  readonly mode: "depth-limited";
  readonly maxDepth: number;
}

export interface ManualScope {
  readonly mode: "manual";
  readonly nodeIds: readonly string[];
}

export type ScopeDefinition =
  | CurrentSelectionScope
  | DirectChildrenScope
  | AllDescendantsScope
  | DepthLimitedScope
  | ManualScope;

export interface ScopeValidationIssue {
  readonly code: "invalid_shape" | "invalid_mode" | "invalid_depth" | "invalid_node_id";
  readonly path: string;
  readonly message: string;
}

export type ScopeParseResult =
  | { readonly ok: true; readonly value: ScopeDefinition }
  | { readonly ok: false; readonly issues: readonly ScopeValidationIssue[] };

const SCOPE_MODES = new Set<ScopeMode>([
  "current-selection",
  "direct-children",
  "all-descendants",
  "depth-limited",
  "manual"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const freezeScope = (scope: ScopeDefinition): ScopeDefinition => {
  if (scope.mode === "manual") {
    return Object.freeze({ ...scope, nodeIds: Object.freeze([...scope.nodeIds]) });
  }
  return Object.freeze({ ...scope });
};

export const createDefaultScopeDefinition = (): ScopeDefinition =>
  freezeScope({ mode: "current-selection" });

export const normalizeManualNodeIds = (nodeIds: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      continue;
    }
    seen.add(nodeId);
    normalized.push(nodeId);
  }

  return Object.freeze(normalized);
};

export const isValidScopeDepth = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1;

const parseManualNodeIds = (value: unknown): ScopeParseResult => {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_shape",
          path: "nodeIds",
          message: "Manual Scope node IDs must be an array."
        }
      ]
    };
  }

  const issues: ScopeValidationIssue[] = [];
  const nodeIds: string[] = [];

  value.forEach((nodeId, index) => {
    if (typeof nodeId !== "string") {
      issues.push({
        code: "invalid_node_id",
        path: `nodeIds.${String(index)}`,
        message: "Manual Scope node IDs must be opaque strings."
      });
      return;
    }
    nodeIds.push(nodeId);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: freezeScope({ mode: "manual", nodeIds: normalizeManualNodeIds(nodeIds) }) };
};

export const parseScopeDefinition = (value: unknown): ScopeParseResult => {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_shape",
          path: "",
          message: "Scope definition must be a serializable object."
        }
      ]
    };
  }

  if (typeof value.mode !== "string" || !SCOPE_MODES.has(value.mode as ScopeMode)) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_mode",
          path: "mode",
          message: "Scope definition mode is not supported."
        }
      ]
    };
  }

  switch (value.mode) {
    case "current-selection":
      return { ok: true, value: freezeScope({ mode: "current-selection" }) };
    case "direct-children":
      return { ok: true, value: freezeScope({ mode: "direct-children" }) };
    case "all-descendants":
      return { ok: true, value: freezeScope({ mode: "all-descendants" }) };
    case "depth-limited":
      if (!isValidScopeDepth(value.maxDepth)) {
        return {
          ok: false,
          issues: [
            {
              code: "invalid_depth",
              path: "maxDepth",
              message: "Depth-limited Scope requires an integer depth of at least 1."
            }
          ]
        };
      }
      return { ok: true, value: freezeScope({ mode: "depth-limited", maxDepth: value.maxDepth }) };
    case "manual":
      return parseManualNodeIds(value.nodeIds);
    default:
      return {
        ok: false,
        issues: [
          {
            code: "invalid_mode",
            path: "mode",
            message: "Scope definition mode is not supported."
          }
        ]
      };
  }
};

export const serializeScopeDefinition = (scope: ScopeDefinition): ScopeDefinition =>
  freezeScope(
    scope.mode === "manual"
      ? { mode: "manual", nodeIds: normalizeManualNodeIds(scope.nodeIds) }
      : scope.mode === "depth-limited"
        ? { mode: "depth-limited", maxDepth: scope.maxDepth }
        : { mode: scope.mode }
  );
