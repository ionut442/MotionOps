import type { NormalizedEasing } from "./motion";
import type { StaggerOperation } from "./stagger";
import type { TimeMs } from "./time";

export const STANDARDS_SCHEMA_VERSION = 1;

export type StandardsSource = "personal" | "file" | "imported";
export type StandardsSeverity = "error" | "warning" | "suggestion" | "information";
export type StandardsTokenKind = "duration" | "easing" | "delay" | "stagger" | "spring" | "interaction-category";
export type StandardsExceptionScope = "rule" | "node" | "property" | "interaction";

export interface StandardsMetadata {
  readonly version: string;
  readonly createdAtMs?: number;
  readonly updatedAtMs?: number;
  readonly description?: string;
  readonly ownerLabel?: string;
}

interface TokenBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface DurationToken extends TokenBase {
  readonly kind: "duration";
  readonly durationMs: TimeMs;
}

export interface DelayToken extends TokenBase {
  readonly kind: "delay";
  readonly delayMs: TimeMs;
}

export interface EasingToken extends TokenBase {
  readonly kind: "easing";
  readonly easing: NormalizedEasing;
}

export interface StaggerToken extends TokenBase {
  readonly kind: "stagger";
  readonly stagger: StaggerOperation;
}

export interface SpringToken extends TokenBase {
  readonly kind: "spring";
  readonly easing: Extract<NormalizedEasing, { kind: "spring" }>;
  readonly ranges?: {
    readonly mass?: readonly [number, number];
    readonly stiffness?: readonly [number, number];
    readonly damping?: readonly [number, number];
  };
}

export interface InteractionCategoryToken extends TokenBase {
  readonly kind: "interaction-category";
  readonly maxDurationMs?: TimeMs;
  readonly allowedDurationTokenIds?: readonly string[];
  readonly allowedEasingTokenIds?: readonly string[];
  readonly allowedStaggerTokenIds?: readonly string[];
  readonly requiresReducedMotionNote?: boolean;
  readonly requiresHandoffMetadata?: boolean;
}

export type MotionStandardToken =
  | DurationToken
  | DelayToken
  | EasingToken
  | StaggerToken
  | SpringToken
  | InteractionCategoryToken;

export interface StandardsThresholds {
  readonly extremelyShortDurationMs: TimeMs;
  readonly extremelyLongDurationMs: TimeMs;
  readonly excessiveDelayMs: TimeMs;
  readonly emptyTimelineSpaceMs: TimeMs;
  readonly durationOutlierRatio: number;
  readonly easingTolerance: number;
  readonly translationLimitPx: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly rotationLimitDeg: number;
  readonly opacityMin: number;
  readonly opacityMax: number;
}

export interface StandardsException {
  readonly id: string;
  readonly scope: StandardsExceptionScope;
  readonly ruleId?: string;
  readonly nodeId?: string;
  readonly property?: string;
  readonly interactionCategoryId?: string;
  readonly reason?: string;
  readonly createdAtMs?: number;
}

export interface MotionStandards {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly metadata: StandardsMetadata;
  readonly tokens: readonly MotionStandardToken[];
  readonly approvedTokenIds: readonly string[];
  readonly disallowedTokenIds: readonly string[];
  readonly thresholds: StandardsThresholds;
  readonly interactionCategories: readonly InteractionCategoryToken[];
  readonly reducedMotionNotes: readonly string[];
  readonly exceptions: readonly StandardsException[];
}

export interface StandardsValidationError {
  readonly code:
    | "NOT_OBJECT"
    | "UNSUPPORTED_VERSION"
    | "MISSING_FIELD"
    | "INVALID_FIELD"
    | "DUPLICATE_ID"
    | "UNKNOWN_TOKEN";
  readonly path: string;
  readonly message: string;
}

export interface StandardsImportResult {
  readonly ok: boolean;
  readonly standards?: MotionStandards;
  readonly errors: readonly StandardsValidationError[];
  readonly warnings: readonly string[];
  readonly migrated: boolean;
}

export type StandardsResult<T> = { ok: true; value: T } | { ok: false; errors: readonly StandardsValidationError[] };

export const defaultStandardsThresholds = (): StandardsThresholds => freeze({
  extremelyShortDurationMs: 80 as TimeMs,
  extremelyLongDurationMs: 1200 as TimeMs,
  excessiveDelayMs: 600 as TimeMs,
  emptyTimelineSpaceMs: 800 as TimeMs,
  durationOutlierRatio: 2.5,
  easingTolerance: 0.001,
  translationLimitPx: 1200,
  scaleMin: 0.01,
  scaleMax: 4,
  rotationLimitDeg: 720,
  opacityMin: 0,
  opacityMax: 1
});

export const createDefaultStandards = (nowMs = 0): MotionStandards => normalizeStandards({
  schemaVersion: STANDARDS_SCHEMA_VERSION,
  id: "motionops-default",
  name: "MotionOps Default",
  metadata: {
    version: "1.0.0",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    description: "Conservative default Motion QA standards."
  },
  tokens: [
    { kind: "duration", id: "duration-150", name: "Fast", durationMs: 150 as TimeMs },
    { kind: "duration", id: "duration-250", name: "Base", durationMs: 250 as TimeMs },
    { kind: "duration", id: "duration-400", name: "Emphasis", durationMs: 400 as TimeMs },
    { kind: "delay", id: "delay-0", name: "No delay", delayMs: 0 as TimeMs },
    { kind: "delay", id: "delay-100", name: "Short delay", delayMs: 100 as TimeMs },
    { kind: "easing", id: "ease-linear", name: "Linear", easing: { kind: "linear" } },
    { kind: "easing", id: "ease-standard", name: "Standard", easing: { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.2, y2: 1 } },
    { kind: "stagger", id: "stagger-80", name: "Standard stagger", stagger: { kind: "stagger", timingMode: "fixed-interval", durationPolicy: "preserve", anchor: "preserve-first-start", intervalMs: 80 as TimeMs } },
    { kind: "interaction-category", id: "micro", name: "Micro interaction", maxDurationMs: 250 as TimeMs, allowedDurationTokenIds: ["duration-150", "duration-250"], allowedEasingTokenIds: ["ease-standard"] },
    { kind: "interaction-category", id: "transition", name: "Transition", maxDurationMs: 600 as TimeMs, allowedDurationTokenIds: ["duration-250", "duration-400"], allowedEasingTokenIds: ["ease-standard"] }
  ],
  approvedTokenIds: ["duration-150", "duration-250", "duration-400", "delay-0", "delay-100", "ease-standard", "stagger-80"],
  disallowedTokenIds: [],
  thresholds: defaultStandardsThresholds(),
  interactionCategories: [],
  reducedMotionNotes: ["Respect OS reduced-motion preferences."],
  exceptions: []
});

export const parseStandardsJson = (input: string): StandardsImportResult => {
  try {
    return parseStandardsValue(JSON.parse(input) as unknown);
  } catch {
    return {
      ok: false,
      errors: [{ code: "INVALID_FIELD", path: "$", message: "Standards JSON could not be parsed." }],
      warnings: [],
      migrated: false
    };
  }
};

export const parseStandardsValue = (input: unknown): StandardsImportResult => {
  const migrated = migrateStandardsValue(input);
  if (!migrated.ok) {
    return { ok: false, errors: migrated.errors, warnings: [], migrated: false };
  }
  const validation = validateStandards(migrated.value);
  return validation.ok
    ? { ok: true, standards: validation.value, errors: [], warnings: migrated.warnings, migrated: migrated.migrated }
    : { ok: false, errors: validation.errors, warnings: migrated.warnings, migrated: migrated.migrated };
};

export const exportStandardsJson = (standards: MotionStandards): string =>
  `${JSON.stringify(normalizeStandards(standards), stableReplacer, 2)}\n`;

export const validateStandards = (input: unknown): StandardsResult<MotionStandards> => {
  if (!isRecord(input)) {
    return { ok: false, errors: [error("NOT_OBJECT", "$", "Standards payload must be an object.")] };
  }
  const errors: StandardsValidationError[] = [];
  requireString(input.id, "id", errors);
  requireString(input.name, "name", errors);
  if (input.schemaVersion !== STANDARDS_SCHEMA_VERSION) {
    errors.push(error("UNSUPPORTED_VERSION", "schemaVersion", "Only standards schema version 1 is supported."));
  }
  if (!isRecord(input.metadata) || typeof input.metadata.version !== "string") {
    errors.push(error("MISSING_FIELD", "metadata.version", "Standards version metadata is required."));
  }
  if (!Array.isArray(input.tokens)) {
    errors.push(error("MISSING_FIELD", "tokens", "Token list is required."));
  }
  const tokens = Array.isArray(input.tokens) ? input.tokens : [];
  const tokenIds = new Set<string>();
  for (const [index, token] of tokens.entries()) {
    const path = `tokens.${String(index)}`;
    const parsed = validateToken(token, path);
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    if (tokenIds.has(parsed.value.id)) {
      errors.push(error("DUPLICATE_ID", `${path}.id`, "Token IDs must be unique."));
    }
    tokenIds.add(parsed.value.id);
  }
  for (const field of ["approvedTokenIds", "disallowedTokenIds"] as const) {
    const value = input[field];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      errors.push(error("INVALID_FIELD", field, `${field} must be a string array.`));
      continue;
    }
    for (const tokenId of value) {
      if (!tokenIds.has(tokenId)) {
        errors.push(error("UNKNOWN_TOKEN", field, `Unknown token ID: ${tokenId}`));
      }
    }
  }
  const thresholds = parseThresholds(input.thresholds, errors);
  const exceptions = parseExceptions(input.exceptions, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: normalizeStandards({ ...(input as unknown as MotionStandards), thresholds, exceptions }) };
};

export const normalizeStandards = (standards: MotionStandards): MotionStandards => {
  const tokens = standards.tokens.map((token) => freezeToken(token));
  const interactionTokens = tokens.filter((token): token is InteractionCategoryToken => token.kind === "interaction-category");
  return freeze({
    schemaVersion: STANDARDS_SCHEMA_VERSION,
    id: standards.id,
    name: standards.name,
    metadata: freeze({ ...standards.metadata }),
    tokens: freeze(tokens),
    approvedTokenIds: freeze([...standards.approvedTokenIds]),
    disallowedTokenIds: freeze([...standards.disallowedTokenIds]),
    thresholds: freeze({ ...standards.thresholds }),
    interactionCategories: freeze(
      (standards.interactionCategories.length > 0 ? standards.interactionCategories : interactionTokens).map((category) => freezeToken(category) as InteractionCategoryToken)
    ),
    reducedMotionNotes: freeze([...standards.reducedMotionNotes]),
    exceptions: freeze(standards.exceptions.map((item) => freeze({ ...item })))
  });
};

const migrateStandardsValue = (input: unknown): StandardsResult<MotionStandards> & { readonly warnings: readonly string[]; readonly migrated: boolean } => {
  if (!isRecord(input)) {
    return { ok: false, errors: [error("NOT_OBJECT", "$", "Standards payload must be an object.")], warnings: [], migrated: false };
  }
  if (input.schemaVersion === STANDARDS_SCHEMA_VERSION) {
    return { ok: true, value: input as unknown as MotionStandards, warnings: [], migrated: false };
  }
  if (input.schemaVersion === 0 || input.schemaVersion === undefined) {
    return {
      ok: true,
      value: {
        schemaVersion: STANDARDS_SCHEMA_VERSION,
        id: typeof input.id === "string" ? input.id : "imported-standard",
        name: typeof input.name === "string" ? input.name : "Imported standard",
        metadata: { version: typeof input.version === "string" ? input.version : "1.0.0" },
        tokens: Array.isArray(input.tokens) ? input.tokens as MotionStandardToken[] : [],
        approvedTokenIds: Array.isArray(input.approvedTokenIds) ? input.approvedTokenIds as string[] : [],
        disallowedTokenIds: Array.isArray(input.disallowedTokenIds) ? input.disallowedTokenIds as string[] : [],
        thresholds: defaultStandardsThresholds(),
        interactionCategories: [],
        reducedMotionNotes: [],
        exceptions: []
      },
      warnings: ["Migrated schema v0/imported payload to schema v1; unknown fields were not preserved."],
      migrated: true
    };
  }
  return { ok: false, errors: [error("UNSUPPORTED_VERSION", "schemaVersion", "Unsupported future standards schema version.")], warnings: [], migrated: false };
};

const validateToken = (input: unknown, path: string): StandardsResult<MotionStandardToken> => {
  if (!isRecord(input)) {
    return { ok: false, errors: [error("NOT_OBJECT", path, "Token must be an object.")] };
  }
  const errors: StandardsValidationError[] = [];
  requireString(input.id, `${path}.id`, errors);
  requireString(input.name, `${path}.name`, errors);
  if (typeof input.kind !== "string") {
    errors.push(error("MISSING_FIELD", `${path}.kind`, "Token kind is required."));
  }
  switch (input.kind) {
    case "duration":
      requireIntegerMs(input.durationMs, `${path}.durationMs`, errors);
      break;
    case "delay":
      requireIntegerMs(input.delayMs, `${path}.delayMs`, errors);
      break;
    case "easing":
      if (!isEasing(input.easing)) errors.push(error("INVALID_FIELD", `${path}.easing`, "Easing token requires a normalized easing."));
      break;
    case "stagger":
      if (!isRecord(input.stagger) || input.stagger.kind !== "stagger") errors.push(error("INVALID_FIELD", `${path}.stagger`, "Stagger token requires a stagger operation."));
      break;
    case "spring":
      if (!isRecord(input.easing) || input.easing.kind !== "spring") errors.push(error("INVALID_FIELD", `${path}.easing`, "Spring token requires a normalized spring easing."));
      break;
    case "interaction-category":
      if (input.maxDurationMs !== undefined) requireIntegerMs(input.maxDurationMs, `${path}.maxDurationMs`, errors);
      break;
    default:
      errors.push(error("INVALID_FIELD", `${path}.kind`, "Unsupported token kind."));
  }
  return errors.length === 0 ? { ok: true, value: freezeToken(input as unknown as MotionStandardToken) } : { ok: false, errors };
};

const parseThresholds = (input: unknown, errors: StandardsValidationError[]): StandardsThresholds => {
  if (!isRecord(input)) {
    errors.push(error("INVALID_FIELD", "thresholds", "Thresholds must be an object."));
    return defaultStandardsThresholds();
  }
  const defaults = defaultStandardsThresholds();
  const output = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof StandardsThresholds)[]) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(error("INVALID_FIELD", `thresholds.${key}`, "Threshold must be a finite non-negative number."));
      continue;
    }
    Object.assign(output, { [key]: Number.isInteger(defaults[key]) ? Math.round(value) : value });
  }
  return freeze(output);
};

const parseExceptions = (input: unknown, errors: StandardsValidationError[]): readonly StandardsException[] => {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    errors.push(error("INVALID_FIELD", "exceptions", "Exceptions must be an array."));
    return [];
  }
  return freeze(input.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.scope !== "string") {
      errors.push(error("INVALID_FIELD", `exceptions.${String(index)}`, "Exception requires id and scope."));
      return [];
    }
    const exception: StandardsException = {
      id: item.id,
      scope: item.scope as StandardsExceptionScope,
      ruleId: typeof item.ruleId === "string" ? item.ruleId : undefined,
      nodeId: typeof item.nodeId === "string" ? item.nodeId : undefined,
      property: typeof item.property === "string" ? item.property : undefined,
      interactionCategoryId: typeof item.interactionCategoryId === "string" ? item.interactionCategoryId : undefined,
      reason: typeof item.reason === "string" ? item.reason : undefined,
      createdAtMs: Number.isFinite(item.createdAtMs) ? item.createdAtMs as number : undefined
    };
    return [freeze(exception)];
  }));
};

const stableReplacer = (_key: string, value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
};

const freezeToken = (token: MotionStandardToken): MotionStandardToken => freeze({ ...token });
const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const requireString = (value: unknown, path: string, errors: StandardsValidationError[]) => {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(error("MISSING_FIELD", path, "Non-empty string is required."));
};
const requireIntegerMs = (value: unknown, path: string, errors: StandardsValidationError[]) => {
  if (!Number.isInteger(value) || (value as number) < 0) errors.push(error("INVALID_FIELD", path, "Integer milliseconds are required."));
};
const isEasing = (value: unknown): value is NormalizedEasing => isRecord(value) && typeof value.kind === "string";
const error = (code: StandardsValidationError["code"], path: string, message: string): StandardsValidationError => ({ code, path, message });
