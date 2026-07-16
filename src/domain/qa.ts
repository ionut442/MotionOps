import type { MotionSnapshot, NormalizedEasing, NormalizedManualTrack, Result } from "./motion";
import type { ScopeScanNode, ScopeScanResult } from "./scopeScan";
import { matchDelayToken, matchDurationToken, matchEasingToken } from "./standardsMatching";
import type { MotionStandards, StandardsException, StandardsSeverity } from "./standards";
import type { TimeMs } from "./time";

export type QaCategory = "timing" | "easing" | "layer-state" | "keyframe-track" | "property-value" | "standards" | "capability";
export type QaIssueStatus = "open" | "ignored-once" | "excepted" | "reviewed" | "resolved";
export type QaSafeFixKind = "set-duration" | "replace-easing" | "set-delay" | "extend-timeline" | "normalize-stagger";

export interface QaSafeFix {
  readonly kind: QaSafeFixKind;
  readonly label: string;
  readonly nodeId: string;
  readonly targetIds: readonly string[];
  readonly operation:
    | { readonly kind: "set-duration"; readonly durationMs: TimeMs; readonly anchor: "preserve-start" | "preserve-end" }
    | { readonly kind: "replace-easing"; readonly easing: NormalizedEasing }
    | { readonly kind: "set-delay"; readonly mode: "replace" | "remove"; readonly delayMs?: TimeMs };
}

export interface QaIssue {
  readonly id: string;
  readonly ruleId: string;
  readonly category: QaCategory;
  readonly severity: StandardsSeverity;
  readonly status: QaIssueStatus;
  readonly nodeId?: string;
  readonly nodeName?: string;
  readonly trackId?: string;
  readonly property?: string;
  readonly keyframeId?: string;
  readonly interactionCategoryId?: string;
  readonly message: string;
  readonly detail?: string;
  readonly standardId?: string;
  readonly standardVersion?: string;
  readonly safeFix?: QaSafeFix;
}

export interface QaRuleContext {
  readonly snapshots: readonly MotionSnapshot[];
  readonly scope: ScopeScanResult;
  readonly standards: MotionStandards | null;
  readonly exceptions: readonly StandardsException[];
  readonly ignoredIssueIds: readonly string[];
  readonly reviewedIssueIds: readonly string[];
}

export interface QaRule {
  readonly id: string;
  readonly category: QaCategory;
  readonly defaultSeverity: StandardsSeverity;
  readonly requiredInput: readonly string[];
  readonly standardsDependency?: string;
  readonly explanation: string;
  readonly evaluate: (context: QaRuleContext) => readonly QaIssue[];
}

export interface QaSummary {
  readonly total: number;
  readonly bySeverity: Record<StandardsSeverity, number>;
  readonly byCategory: Record<QaCategory, number>;
  readonly byStatus: Record<QaIssueStatus, number>;
  readonly notEvaluated: readonly string[];
}

export interface QaResult {
  readonly issues: readonly QaIssue[];
  readonly summary: QaSummary;
  readonly groups: readonly QaIssueGroup[];
}

export interface QaIssueGroup {
  readonly key: string;
  readonly label: string;
  readonly issueIds: readonly string[];
  readonly count: number;
}

export const runMotionQa = (context: QaRuleContext, rules: readonly QaRule[] = qaRules): QaResult => {
  const issues = rules.flatMap((rule) => rule.evaluate(context)).map((issue) => applyStatus(issue, context));
  return {
    issues: Object.freeze(issues),
    summary: summarizeIssues(issues, context.standards === null ? ["standards-compliance:no-standard"] : []),
    groups: groupIssues(issues)
  };
};

export const reconcileReviewedIssues = (
  nextIssues: readonly QaIssue[],
  reviewedIssueIds: readonly string[]
): readonly QaIssue[] => {
  const reviewed = new Set(reviewedIssueIds);
  return Object.freeze(nextIssues.map((issue) => reviewed.has(issue.id) ? { ...issue, status: "reviewed" as const } : issue));
};

const timingRule: QaRule = {
  id: "timing-consistency",
  category: "timing",
  defaultSeverity: "warning",
  requiredInput: ["manualTracks", "timelines"],
  explanation: "Checks duration, delay, timeline, and sequence timing boundaries.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => snapshot.manualTracks.flatMap((track) => timingIssues(snapshot, track, context)))
};

const easingRule: QaRule = {
  id: "easing-quality",
  category: "easing",
  defaultSeverity: "warning",
  requiredInput: ["manualTracks"],
  standardsDependency: "easing tokens",
  explanation: "Checks mixed, missing, unknown, and unapproved easing.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => snapshot.manualTracks.flatMap((track) => easingIssues(snapshot, track, context)))
};

const layerStateRule: QaRule = {
  id: "layer-state",
  category: "layer-state",
  defaultSeverity: "warning",
  requiredInput: ["scope metadata"],
  explanation: "Checks animated hidden, locked, zero-size, and unsupported layer states.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => layerIssues(snapshot, context.scope.nodes.find((node) => node.id === snapshot.nodeId)))
};

const keyframeTrackRule: QaRule = {
  id: "keyframe-track",
  category: "keyframe-track",
  defaultSeverity: "warning",
  requiredInput: ["manualTracks"],
  explanation: "Checks duplicate, unordered, empty, redundant, and conflicting manual tracks.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => snapshot.manualTracks.flatMap((track) => keyframeIssues(snapshot, track)))
};

const propertyValueRule: QaRule = {
  id: "property-values",
  category: "property-value",
  defaultSeverity: "suggestion",
  requiredInput: ["manualTracks", "standards thresholds"],
  explanation: "Checks conservative property value thresholds only when values are normalized enough to compare.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => snapshot.manualTracks.flatMap((track) => propertyIssues(snapshot, track, context)))
};

const standardsRule: QaRule = {
  id: "standards-compliance",
  category: "standards",
  defaultSeverity: "warning",
  requiredInput: ["active standards"],
  standardsDependency: "duration, delay, easing, stagger, category tokens",
  explanation: "Checks active standard token approval and missing category state.",
  evaluate: (context) => {
    if (context.standards === null) {
      return [issue({ ruleId: "standards-compliance", category: "standards", severity: "information", message: "No active standards set is selected; compliance was not evaluated." })];
    }
    const standards = context.standards;
    return context.snapshots.flatMap((snapshot) => snapshot.manualTracks.flatMap((track) => standardsIssues(snapshot, track, standards)));
  }
};

const capabilityRule: QaRule = {
  id: "capability-boundaries",
  category: "capability",
  defaultSeverity: "information",
  requiredInput: ["capability state"],
  explanation: "Keeps read-only, unsupported, and unknown Motion capability states visible.",
  evaluate: (context) => context.snapshots.flatMap((snapshot) => [
    ...snapshot.manualTracks.flatMap((track) => track.write.status === "supported" || track.write.status === "supported-with-warning" ? [] : [issue({
      ruleId: "capability-boundaries",
      category: "capability",
      severity: track.write.status === "unknown" ? "information" : "warning",
      nodeId: snapshot.nodeId,
      property: track.property,
      trackId: track.trackId,
      message: `Manual track writer is ${track.write.status}.`,
      detail: track.write.reason
    })]),
    ...snapshot.styleInstances.map((style) => issue({
      ruleId: "capability-boundaries",
      category: "capability",
      severity: "information",
      nodeId: snapshot.nodeId,
      property: style.name ?? "style",
      message: "Style-generated Motion remains read-only unless a verified writer is available."
    }))
  ])
};

export const qaRules: readonly QaRule[] = Object.freeze([
  timingRule,
  easingRule,
  layerStateRule,
  keyframeTrackRule,
  propertyValueRule,
  standardsRule,
  capabilityRule
]);

const timingIssues = (snapshot: MotionSnapshot, track: NormalizedManualTrack, context: QaRuleContext): readonly QaIssue[] => {
  const issues: QaIssue[] = [];
  const range = trackRange(track);
  const thresholds = context.standards?.thresholds;
  if (track.keyframes.some((keyframe) => !Number.isFinite(keyframe.timeMs) || keyframe.timeMs < 0)) {
    issues.push(base(snapshot, track, "timing", "error", "Invalid or negative timing detected."));
  }
  if (range.duration > 0 && thresholds !== undefined && range.duration < thresholds.extremelyShortDurationMs) {
    issues.push(base(snapshot, track, "timing", "suggestion", "Duration is extremely short.", `Duration ${String(range.duration)} ms.`));
  }
  if (thresholds !== undefined && range.duration > thresholds.extremelyLongDurationMs) {
    issues.push(base(snapshot, track, "timing", "warning", "Duration is extremely long.", `Duration ${String(range.duration)} ms.`, durationFix(snapshot, track, context)));
  }
  if (thresholds !== undefined && range.start > thresholds.excessiveDelayMs) {
    issues.push(base(snapshot, track, "timing", "warning", "Delay is excessive.", `Delay ${String(range.start)} ms.`, delayFix(snapshot, track)));
  }
  const { timelines } = snapshot;
  const timeline = timelines.find((item) => item.tracks.includes(track.property));
  if (timeline !== undefined && range.end > timeline.durationMs) {
    issues.push(base(snapshot, track, "timing", "warning", "Keyframe extends beyond the timeline.", `${String(range.end)} ms > ${String(timeline.durationMs)} ms.`));
  }
  if (timeline !== undefined && thresholds !== undefined && timeline.durationMs - range.end > thresholds.emptyTimelineSpaceMs) {
    issues.push(base(snapshot, track, "timing", "information", "Timeline has large empty space after the final keyframe."));
  }
  return issues;
};

const easingIssues = (snapshot: MotionSnapshot, track: NormalizedManualTrack, context: QaRuleContext): readonly QaIssue[] => {
  const easings = track.keyframes.map((keyframe) => keyframe.easing);
  const keys = new Set(easings.map(easingKey));
  const issues: QaIssue[] = [];
  if (easings.length === 0) {
    issues.push(base(snapshot, track, "easing", "information", "Track has no easing data."));
  }
  if (keys.size > 1) {
    issues.push(base(snapshot, track, "easing", "warning", "Mixed easing appears within one interaction."));
  }
  if (easings.some((easing) => easing.kind === "unknown")) {
    issues.push(base(snapshot, track, "easing", "warning", "Unknown easing is not approved."));
  }
  if (context.standards !== null) {
    for (const easing of easings) {
      const match = matchEasingToken(easing, context.standards);
      if (!match.compliant && match.tokenId !== undefined) {
        issues.push(base(snapshot, track, "easing", "suggestion", "Easing is not an approved exact token.", `Nearest token: ${match.tokenName ?? match.tokenId}.`, easingFix(snapshot, track, context.standards)));
        break;
      }
    }
  }
  return issues;
};

const layerIssues = (snapshot: MotionSnapshot, node: ScopeScanNode | undefined): readonly QaIssue[] => {
  if (node === undefined) {
    return [issue({ ruleId: "layer-state", category: "layer-state", severity: "information", nodeId: snapshot.nodeId, message: "Animated node is outside the current Scope metadata." })];
  }
  const issues: QaIssue[] = [];
  if (!node.visible) issues.push(issue({ ruleId: "layer-state", category: "layer-state", severity: "warning", nodeId: node.id, nodeName: node.name, message: "Animated hidden layer." }));
  if (node.locked) issues.push(issue({ ruleId: "layer-state", category: "layer-state", severity: "information", nodeId: node.id, nodeName: node.name, message: "Animated locked layer." }));
  if (node.geometry !== undefined && (node.geometry.width === 0 || node.geometry.height === 0)) issues.push(issue({ ruleId: "layer-state", category: "layer-state", severity: "warning", nodeId: node.id, nodeName: node.name, message: "Animated zero-size layer." }));
  return issues;
};

const keyframeIssues = (snapshot: MotionSnapshot, track: NormalizedManualTrack): readonly QaIssue[] => {
  const issues: QaIssue[] = [];
  if (track.keyframes.length === 0) issues.push(base(snapshot, track, "keyframe-track", "warning", "Empty manual track."));
  if (track.keyframes.length === 1) issues.push(base(snapshot, track, "keyframe-track", "suggestion", "Single-keyframe track where a start/end pair may be required."));
  const seenTimes = new Set<number>();
  for (let index = 0; index < track.keyframes.length; index += 1) {
    const keyframe = track.keyframes[index];
    if (seenTimes.has(keyframe.timeMs)) issues.push(base(snapshot, track, "keyframe-track", "warning", "Duplicate keyframe time.", `${String(keyframe.timeMs)} ms.`));
    seenTimes.add(keyframe.timeMs);
    if (index > 0 && keyframe.timeMs < track.keyframes[index - 1].timeMs) issues.push(base(snapshot, track, "keyframe-track", "error", "Unordered keyframes."));
    if (index > 0 && JSON.stringify(keyframe.value) === JSON.stringify(track.keyframes[index - 1].value)) issues.push(base(snapshot, track, "keyframe-track", "information", "Redundant consecutive values."));
  }
  const samePropertyTracks = snapshot.manualTracks.filter((item) => item.property === track.property);
  if (samePropertyTracks.length > 1) issues.push(base(snapshot, track, "keyframe-track", "warning", "Multiple tracks animate the same property."));
  const styleNames = new Set(snapshot.styleInstances.flatMap((style) => style.name ? [style.name.toUpperCase()] : []));
  if (styleNames.has(track.property.toUpperCase())) issues.push(base(snapshot, track, "keyframe-track", "warning", "Manual/style conflict on the same property."));
  return issues;
};

const propertyIssues = (snapshot: MotionSnapshot, track: NormalizedManualTrack, context: QaRuleContext): readonly QaIssue[] => {
  const thresholds = context.standards?.thresholds;
  if (thresholds === undefined) return [];
  const issues: QaIssue[] = [];
  for (const keyframe of track.keyframes) {
    const numberValue = numericValue(keyframe.value);
    if (numberValue.ok && track.property.toUpperCase().includes("OPACITY") && (numberValue.value < thresholds.opacityMin || numberValue.value > thresholds.opacityMax)) {
      issues.push(base(snapshot, track, "property-value", "warning", "Opacity is outside the allowed range."));
    }
    if (numberValue.ok && track.property.toUpperCase().includes("SCALE") && (numberValue.value <= 0 || numberValue.value < thresholds.scaleMin || numberValue.value > thresholds.scaleMax)) {
      issues.push(base(snapshot, track, "property-value", "warning", "Scale is outside configured range."));
    }
    if (numberValue.ok && track.property.toUpperCase().includes("ROTATION") && Math.abs(numberValue.value) > thresholds.rotationLimitDeg) {
      issues.push(base(snapshot, track, "property-value", "suggestion", "Rotation exceeds configured threshold."));
    }
    if (numberValue.ok && (track.property.toUpperCase().includes("X") || track.property.toUpperCase().includes("Y")) && Math.abs(numberValue.value) > thresholds.translationLimitPx) {
      issues.push(base(snapshot, track, "property-value", "suggestion", "Translation exceeds configured threshold."));
    }
    if (!numberValue.ok && typeof keyframe.value === "object") {
      issues.push(base(snapshot, track, "property-value", "information", "Value shape could not be compared deterministically."));
    }
  }
  return issues;
};

const standardsIssues = (snapshot: MotionSnapshot, track: NormalizedManualTrack, standards: MotionStandards): readonly QaIssue[] => {
  const range = trackRange(track);
  const issues: QaIssue[] = [];
  const durationMatch = matchDurationToken(range.duration as TimeMs, standards);
  if (!durationMatch.compliant) issues.push(base(snapshot, track, "standards", "warning", "Duration is not an approved exact token.", durationMatch.tokenName ? `Nearest token: ${durationMatch.tokenName}.` : undefined, durationTokenFix(snapshot, track, standards), standards));
  const delayMatch = matchDelayToken(range.start as TimeMs, standards);
  if (!delayMatch.compliant) issues.push(base(snapshot, track, "standards", "suggestion", "Delay is not an approved exact token.", delayMatch.tokenName ? `Nearest token: ${delayMatch.tokenName}.` : undefined, undefined, standards));
  return issues;
};

const base = (
  snapshot: MotionSnapshot,
  track: NormalizedManualTrack,
  category: QaCategory,
  severity: StandardsSeverity,
  message: string,
  detail?: string,
  safeFix?: QaSafeFix,
  standards?: MotionStandards
): QaIssue => issue({ ruleId: `${category}:${message}`, category, severity, nodeId: snapshot.nodeId, trackId: track.trackId, property: track.property, message, detail, safeFix, standardId: standards?.id, standardVersion: standards?.metadata.version });

const issue = (input: Omit<QaIssue, "id" | "status"> & { readonly status?: QaIssueStatus }): QaIssue => {
  const identity = [input.ruleId, input.nodeId ?? "global", input.trackId ?? input.property ?? "target", input.keyframeId ?? "", input.message].join("|");
  return Object.freeze({ ...input, id: stableIssueId(identity), status: input.status ?? "open" });
};

const stableIssueId = (input: string): string => {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `qa-${(hash >>> 0).toString(16)}`;
};

const applyStatus = (issueValue: QaIssue, context: QaRuleContext): QaIssue => {
  if (context.ignoredIssueIds.includes(issueValue.id)) return { ...issueValue, status: "ignored-once" };
  if (context.reviewedIssueIds.includes(issueValue.id)) return { ...issueValue, status: "reviewed" };
  if (context.exceptions.some((exception) => matchesException(issueValue, exception))) return { ...issueValue, status: "excepted" };
  return issueValue;
};

const matchesException = (issueValue: QaIssue, exception: StandardsException): boolean =>
  (exception.ruleId === undefined || exception.ruleId === issueValue.ruleId) &&
  (exception.nodeId === undefined || exception.nodeId === issueValue.nodeId) &&
  (exception.property === undefined || exception.property === issueValue.property) &&
  (exception.interactionCategoryId === undefined || exception.interactionCategoryId === issueValue.interactionCategoryId);

const summarizeIssues = (issues: readonly QaIssue[], notEvaluated: readonly string[]): QaSummary => ({
  total: issues.length,
  bySeverity: countBy(issues, ["error", "warning", "suggestion", "information"], (item) => item.severity),
  byCategory: countBy(issues, ["timing", "easing", "layer-state", "keyframe-track", "property-value", "standards", "capability"], (item) => item.category),
  byStatus: countBy(issues, ["open", "ignored-once", "excepted", "reviewed", "resolved"], (item) => item.status),
  notEvaluated
});

const groupIssues = (issues: readonly QaIssue[]): readonly QaIssueGroup[] =>
  Object.freeze(["severity", "rule", "category", "node"].flatMap((kind) => {
    const groups = new Map<string, string[]>();
    for (const item of issues) {
      const key = kind === "severity" ? item.severity : kind === "rule" ? item.ruleId : kind === "category" ? item.category : item.nodeId ?? "global";
      groups.set(key, [...(groups.get(key) ?? []), item.id]);
    }
    return [...groups.entries()].map(([key, issueIds]) => ({ key: `${kind}:${key}`, label: key, issueIds: Object.freeze(issueIds), count: issueIds.length }));
  }));

const countBy = <T, K extends string>(items: readonly T[], keys: readonly K[], select: (item: T) => K): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, items.filter((item) => select(item) === key).length])) as Record<K, number>;

const trackRange = (track: NormalizedManualTrack) => {
  const times = track.keyframes.map((keyframe) => keyframe.timeMs);
  const start = times.length === 0 ? 0 : Math.min(...times);
  const end = times.length === 0 ? 0 : Math.max(...times);
  return { start, end, duration: end - start };
};

const durationFix = (snapshot: MotionSnapshot, track: NormalizedManualTrack, context: QaRuleContext): QaSafeFix | undefined => {
  const token = context.standards?.tokens.find((item) => item.kind === "duration" && context.standards?.approvedTokenIds.includes(item.id));
  return token?.kind === "duration" && (track.write.status === "supported" || track.write.status === "supported-with-warning")
    ? { kind: "set-duration", label: `Set duration to ${token.name}`, nodeId: snapshot.nodeId, targetIds: [track.trackId ?? track.property], operation: { kind: "set-duration", durationMs: token.durationMs, anchor: "preserve-start" } }
    : undefined;
};

const durationTokenFix = (snapshot: MotionSnapshot, track: NormalizedManualTrack, standards: MotionStandards): QaSafeFix | undefined => {
  const token = standards.tokens.find((item) => item.kind === "duration" && standards.approvedTokenIds.includes(item.id));
  return token?.kind === "duration" && (track.write.status === "supported" || track.write.status === "supported-with-warning")
    ? { kind: "set-duration", label: `Set duration to ${token.name}`, nodeId: snapshot.nodeId, targetIds: [track.trackId ?? track.property], operation: { kind: "set-duration", durationMs: token.durationMs, anchor: "preserve-start" } }
    : undefined;
};

const easingFix = (snapshot: MotionSnapshot, track: NormalizedManualTrack, standards: MotionStandards): QaSafeFix | undefined => {
  const token = standards.tokens.find((item) => item.kind === "easing" && standards.approvedTokenIds.includes(item.id));
  return token?.kind === "easing" && (track.write.status === "supported" || track.write.status === "supported-with-warning")
    ? { kind: "replace-easing", label: `Replace easing with ${token.name}`, nodeId: snapshot.nodeId, targetIds: [track.trackId ?? track.property], operation: { kind: "replace-easing", easing: token.easing } }
    : undefined;
};

const delayFix = (snapshot: MotionSnapshot, track: NormalizedManualTrack): QaSafeFix | undefined =>
  track.write.status === "supported" || track.write.status === "supported-with-warning"
    ? { kind: "set-delay", label: "Remove delay", nodeId: snapshot.nodeId, targetIds: [track.trackId ?? track.property], operation: { kind: "set-delay", mode: "remove" } }
    : undefined;

const easingKey = (easing: NormalizedEasing): string => JSON.stringify(easing);
const numericValue = (value: unknown): Result<number, "unavailable"> => {
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
  if (typeof value === "object" && value !== null && "value" in value && typeof (value as { value?: unknown }).value === "number") {
    return { ok: true, value: (value as { value: number }).value };
  }
  return { ok: false, error: "unavailable" };
};
