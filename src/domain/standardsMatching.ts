import type { MotionSnapshot, NormalizedEasing } from "./motion";
import type { MotionStandards, MotionStandardToken } from "./standards";
import type { TimeMs } from "./time";

export interface TokenMatch {
  readonly valueKind: "duration" | "delay" | "easing" | "stagger" | "spring" | "interaction-category";
  readonly exact: boolean;
  readonly tokenId?: string;
  readonly tokenName?: string;
  readonly distance: number;
  readonly compliant: boolean;
}

export const matchDurationToken = (durationMs: TimeMs, standards: MotionStandards): TokenMatch => {
  const tokens = tokensOf(standards, "duration");
  if (tokens.length === 0) return unmatched("duration");
  const exact = tokens.find((token) => token.durationMs === durationMs);
  const nearest = exact ?? [...tokens].sort((left, right) => Math.abs(left.durationMs - durationMs) - Math.abs(right.durationMs - durationMs))[0];
  return match("duration", nearest, exact !== undefined, Math.abs(nearest.durationMs - durationMs), standards);
};

export const matchDelayToken = (delayMs: TimeMs, standards: MotionStandards): TokenMatch => {
  const tokens = tokensOf(standards, "delay");
  if (tokens.length === 0) return unmatched("delay");
  const exact = tokens.find((token) => token.delayMs === delayMs);
  const nearest = exact ?? [...tokens].sort((left, right) => Math.abs(left.delayMs - delayMs) - Math.abs(right.delayMs - delayMs))[0];
  return match("delay", nearest, exact !== undefined, Math.abs(nearest.delayMs - delayMs), standards);
};

export const matchEasingToken = (easing: NormalizedEasing, standards: MotionStandards): TokenMatch => {
  if (easing.kind === "unknown") {
    return unmatched("easing");
  }
  const tokens = tokensOf(standards, "easing");
  if (tokens.length === 0) return unmatched("easing");
  const scored = tokens.map((token) => ({ token, distance: easingDistance(easing, token.easing) })).sort((left, right) => left.distance - right.distance);
  const best = scored[0];
  if (!Number.isFinite(best.distance)) {
    return unmatched("easing");
  }
  return match("easing", best.token, best.distance <= standards.thresholds.easingTolerance, best.distance, standards);
};

export const assignInteractionCategory = (snapshot: MotionSnapshot, standards: MotionStandards): TokenMatch => {
  const duration = Math.max(0, ...snapshot.manualTracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.timeMs))) as TimeMs;
  const category = standards.interactionCategories.find((item) => item.maxDurationMs === undefined || duration <= item.maxDurationMs);
  return match("interaction-category", category, category !== undefined, category?.maxDurationMs === undefined ? 0 : Math.max(0, duration - category.maxDurationMs), standards);
};

const match = (
  valueKind: TokenMatch["valueKind"],
  token: MotionStandardToken | undefined,
  exact: boolean,
  distance: number,
  standards: MotionStandards
): TokenMatch => ({
  valueKind,
  exact,
  tokenId: token?.id,
  tokenName: token?.name,
  distance,
  compliant: exact && token !== undefined && standards.approvedTokenIds.includes(token.id) && !standards.disallowedTokenIds.includes(token.id)
});

const unmatched = (valueKind: TokenMatch["valueKind"]): TokenMatch => ({
  valueKind,
  exact: false,
  distance: Number.POSITIVE_INFINITY,
  compliant: false
});

const tokensOf = <K extends MotionStandardToken["kind"]>(standards: MotionStandards, kind: K) =>
  standards.tokens.filter((token): token is Extract<MotionStandardToken, { kind: K }> => token.kind === kind);

const easingDistance = (left: NormalizedEasing, right: NormalizedEasing): number => {
  if (left.kind !== right.kind) {
    return Number.POSITIVE_INFINITY;
  }
  switch (left.kind) {
    case "linear":
      return 0;
    case "preset":
      if (right.kind !== "preset") return Number.POSITIVE_INFINITY;
      return left.name === right.name ? 0 : Number.POSITIVE_INFINITY;
    case "cubic-bezier":
      if (right.kind !== "cubic-bezier") return Number.POSITIVE_INFINITY;
      return Math.abs(left.x1 - right.x1) + Math.abs(left.y1 - right.y1) + Math.abs(left.x2 - right.x2) + Math.abs(left.y2 - right.y2);
    case "spring":
      if (right.kind !== "spring") return Number.POSITIVE_INFINITY;
      return Math.abs((left.mass ?? 0) - (right.mass ?? 0)) +
        Math.abs((left.stiffness ?? 0) - (right.stiffness ?? 0)) +
        Math.abs((left.damping ?? 0) - (right.damping ?? 0));
    case "unknown":
      return Number.POSITIVE_INFINITY;
  }
};
