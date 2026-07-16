import { asRecord, getNumber, getString, stableClone } from "./object";
import type { EasingSemanticPolicy, MotionAdapterWarning, NormalizedEasing } from "./types";

const defaultPolicy: EasingSemanticPolicy = { cubicBezierPrecision: 6 };

const cubicFromRecord = (record: Record<string, unknown>): NormalizedEasing | null => {
  const x1 = getNumber(record, "x1");
  const y1 = getNumber(record, "y1");
  const x2 = getNumber(record, "x2");
  const y2 = getNumber(record, "y2");
  return x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined
    ? null
    : { kind: "cubic-bezier", x1, y1, x2, y2 };
};

export const normalizeEasing = (value: unknown): NormalizedEasing => {
  const record = asRecord(value);
  if (!record) {
    return { kind: "unknown", raw: stableClone(value) };
  }

  const type = getString(record, "type");
  if (type === "LINEAR" || type === "linear") {
    return { kind: "linear" };
  }

  const nestedCubicRecord = asRecord(record.easingFunctionCubicBezier);
  const cubic = cubicFromRecord(record) ?? (nestedCubicRecord ? cubicFromRecord(nestedCubicRecord) : null);
  if (cubic && type !== "SPRING") {
    return cubic;
  }

  if (type === "SPRING" || "spring" in record) {
    return {
      kind: "spring",
      mass: getNumber(record, "mass"),
      stiffness: getNumber(record, "stiffness"),
      damping: getNumber(record, "damping"),
      raw: stableClone(value)
    };
  }

  return type ? { kind: "preset", name: type } : { kind: "unknown", raw: stableClone(value) };
};

export const normalizeEasingWithWarnings = (
  value: unknown,
  warnings: MotionAdapterWarning[],
  path: string
): NormalizedEasing => {
  const easing = normalizeEasing(value);
  if (easing.kind === "unknown") {
    warnings.push({
      code: value === undefined ? "KEYFRAME_EASING_MALFORMED" : "UNKNOWN_EASING",
      message: value === undefined ? "Keyframe easing is missing or malformed." : "Unknown easing shape preserved as unsupported raw data.",
      path
    });
  }
  return easing;
};

export const denormalizeEasing = (value: NormalizedEasing | undefined): unknown => {
  if (!value || value.kind === "linear") {
    return { type: "LINEAR" };
  }
  if (value.kind === "preset") {
    return { type: value.name };
  }
  if (value.kind === "cubic-bezier") {
    return {
      type: "CUSTOM_CUBIC_BEZIER",
      easingFunctionCubicBezier: { x1: value.x1, y1: value.y1, x2: value.x2, y2: value.y2 }
    };
  }
  return value.raw;
};

export const easingSemanticKey = (value: NormalizedEasing, policy: EasingSemanticPolicy = defaultPolicy): string => {
  switch (value.kind) {
    case "linear":
      return "linear";
    case "preset":
      return `preset:${value.name}`;
    case "cubic-bezier":
      return `cubic:${round(value.x1, policy)},${round(value.y1, policy)},${round(value.x2, policy)},${round(value.y2, policy)}`;
    case "spring":
      return `spring:${JSON.stringify(stableClone(value.raw))}`;
    case "unknown":
      return `unknown:${JSON.stringify(stableClone(value.raw))}`;
    default:
      return assertNever(value);
  }
};

export const easingSemanticallyEqual = (
  left: NormalizedEasing,
  right: NormalizedEasing,
  policy: EasingSemanticPolicy = defaultPolicy
): boolean => easingSemanticKey(left, policy) === easingSemanticKey(right, policy);

const round = (value: number, policy: EasingSemanticPolicy): string => value.toFixed(policy.cubicBezierPrecision);

const assertNever = (value: never): never => {
  throw new Error(`Unhandled easing variant: ${JSON.stringify(value)}`);
};
