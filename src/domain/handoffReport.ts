import type {
  MotionAdapterWarning,
  MotionCapability,
  MotionSnapshot,
  NormalizedEasing,
  NormalizedKeyframe,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline
} from "./motion";
import type { QaIssue, QaResult } from "./qa";
import type { ScopeScanNode, ScopeScanResult } from "./scopeScan";
import { matchDelayToken, matchDurationToken, matchEasingToken, type TokenMatch } from "./standardsMatching";
import type { MotionStandards, StandardsException, StandardsSeverity } from "./standards";
import type { TimeMs } from "./time";

export const HANDOFF_REPORT_SCHEMA_VERSION = 1;

export interface HandoffReportMetadata {
  readonly schemaVersion: 1;
  readonly pluginVersion: string;
  readonly standardsVersion: string | null;
  readonly generatedAtMs: number | null;
}

export interface HandoffReport {
  readonly metadata: HandoffReportMetadata;
  readonly scope: HandoffScopeSummary;
  readonly interaction: HandoffInteractionSummary;
  readonly targets: readonly HandoffTargetSummary[];
  readonly tokens: readonly HandoffTokenSummary[];
  readonly deviations: readonly HandoffDeviationSummary[];
  readonly qa: HandoffQaSummary;
  readonly exceptions: readonly HandoffExceptionSummary[];
  readonly limitations: readonly HandoffLimitationSummary[];
}

export interface BuildHandoffReportInput {
  readonly pluginVersion: string;
  readonly scope: ScopeScanResult | null;
  readonly snapshots: readonly MotionSnapshot[];
  readonly standards: MotionStandards | null;
  readonly qaResult: QaResult | null;
  readonly exceptions: readonly StandardsException[];
  readonly generatedAtMs?: number | null;
}

export interface HandoffScopeSummary {
  readonly rootIds: readonly string[];
  readonly targetCount: number;
  readonly confirmedOrder: readonly string[];
  readonly issues: readonly { readonly code: string; readonly message: string; readonly nodeId: string | null }[];
  readonly staleState: "current" | "missing-scope" | "missing-motion" | "partial-motion";
}

export interface HandoffInteractionSummary {
  readonly standardsName: string | null;
  readonly standardsVersion: string | null;
  readonly activeCategoryIds: readonly string[];
  readonly reducedMotionNotes: readonly string[];
  readonly notEvaluated: readonly string[];
}

export interface HandoffTargetSummary {
  readonly nodeId: string;
  readonly name: string;
  readonly nodeType: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly visible: boolean | null;
  readonly locked: boolean | null;
  readonly sourceKind: string;
  readonly manualTracks: readonly HandoffManualTrackSummary[];
  readonly styleInstances: readonly HandoffStyleInstanceSummary[];
  readonly timelines: readonly HandoffTimelineSummary[];
  readonly derivedAnimations: readonly HandoffDerivedAnimationSummary[];
  readonly capabilities: readonly HandoffCapabilitySummary[];
  readonly warnings: readonly HandoffWarningSummary[];
}

export interface HandoffManualTrackSummary {
  readonly property: string;
  readonly propertyClassification: string;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly durationMs: number | null;
  readonly delayMs: number | null;
  readonly easing: string;
  readonly keyframes: readonly HandoffKeyframeSummary[];
  readonly writeStatus: string;
  readonly warnings: readonly HandoffWarningSummary[];
  readonly technical: { readonly trackId: string | null };
}

export interface HandoffKeyframeSummary {
  readonly ordinal: number;
  readonly timeMs: number;
  readonly value: unknown;
  readonly easing: string;
  readonly technical: { readonly keyframeId: string | null };
}

export interface HandoffStyleInstanceSummary {
  readonly name: string | null;
  readonly writable: false;
  readonly warnings: readonly HandoffWarningSummary[];
  readonly technical: {
    readonly availableAnimationStyleId: string | null;
    readonly appliedStyleInstanceId: string | null;
  };
}

export interface HandoffTimelineSummary {
  readonly timelineId: string;
  readonly durationMs: number;
  readonly tracks: readonly string[];
}

export interface HandoffDerivedAnimationSummary {
  readonly property: string;
  readonly valueClassification: string;
  readonly timelineDurationMs: number | null;
}

export interface HandoffCapabilitySummary {
  readonly capability: string;
  readonly status: string;
  readonly reason: string;
}

export interface HandoffWarningSummary {
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
  readonly detail: string | null;
}

export interface HandoffTokenSummary {
  readonly nodeId: string;
  readonly property: string;
  readonly valueKind: TokenMatch["valueKind"];
  readonly valueMs: number | null;
  readonly exactTokenId: string | null;
  readonly exactTokenName: string | null;
  readonly nearestTokenId: string | null;
  readonly nearestTokenName: string | null;
  readonly distance: number | null;
  readonly compliant: boolean;
  readonly status: "exact" | "nearest" | "unmatched" | "not-evaluated";
}

export interface HandoffDeviationSummary {
  readonly id: string;
  readonly severity: StandardsSeverity;
  readonly category: string;
  readonly status: string;
  readonly nodeId: string | null;
  readonly property: string | null;
  readonly message: string;
  readonly detail: string | null;
  readonly safeFixAvailable: boolean;
}

export interface HandoffQaSummary {
  readonly available: boolean;
  readonly totals: {
    readonly total: number;
    readonly error: number;
    readonly warning: number;
    readonly suggestion: number;
    readonly information: number;
    readonly open: number;
    readonly ignoredOnce: number;
    readonly excepted: number;
    readonly reviewed: number;
    readonly resolved: number;
  };
  readonly issues: readonly HandoffDeviationSummary[];
  readonly groups: readonly { readonly key: string; readonly label: string; readonly issueIds: readonly string[]; readonly count: number }[];
  readonly passedChecks: readonly string[];
  readonly notEvaluated: readonly string[];
}

export interface HandoffExceptionSummary {
  readonly id: string;
  readonly scope: string;
  readonly ruleId: string | null;
  readonly nodeId: string | null;
  readonly property: string | null;
  readonly interactionCategoryId: string | null;
  readonly reason: string | null;
}

export interface HandoffLimitationSummary {
  readonly kind: "unsupported" | "read-only" | "unknown" | "not-evaluated" | "warning";
  readonly targetId: string | null;
  readonly property: string | null;
  readonly message: string;
}

export const buildHandoffReport = (input: BuildHandoffReportInput): HandoffReport => {
  const scope = input.scope ?? { roots: [], nodes: [], issues: [] };
  const scopeOrder = orderTargets(scope, input.snapshots);
  const orderedSnapshots = scopeOrder.flatMap((nodeId) => input.snapshots.find((snapshot) => snapshot.nodeId === nodeId) ?? []);
  const qaIssues = input.qaResult?.issues ?? [];
  const tokenSummaries = input.standards === null
    ? []
    : summarizeAllTokens(orderedSnapshots, input.standards);
  const report: HandoffReport = {
    metadata: {
      schemaVersion: HANDOFF_REPORT_SCHEMA_VERSION,
      pluginVersion: input.pluginVersion,
      standardsVersion: input.standards?.metadata.version ?? null,
      generatedAtMs: input.generatedAtMs ?? null
    },
    scope: {
      rootIds: [...scope.roots],
      targetCount: scope.nodes.length,
      confirmedOrder: scopeOrder,
      issues: scope.issues.map((issue) => ({ code: issue.code, message: issue.message, nodeId: issue.nodeId ?? null })),
      staleState: classifyStaleState(input.scope, input.snapshots)
    },
    interaction: {
      standardsName: input.standards?.name ?? null,
      standardsVersion: input.standards?.metadata.version ?? null,
      activeCategoryIds: input.standards?.interactionCategories.map((category) => category.id) ?? [],
      reducedMotionNotes: input.standards?.reducedMotionNotes ?? [],
      notEvaluated: input.qaResult?.summary.notEvaluated ?? (input.standards === null ? ["standards:not-selected"] : [])
    },
    targets: orderedSnapshots.map((snapshot) => summarizeTarget(snapshot, scope.nodes.find((node) => node.id === snapshot.nodeId))),
    tokens: tokenSummaries,
    deviations: qaIssues.map(summarizeIssue).sort(compareDeviation),
    qa: summarizeQa(input.qaResult),
    exceptions: [...input.exceptions, ...(input.standards?.exceptions ?? [])].map(summarizeException).sort((left, right) => left.id.localeCompare(right.id)),
    limitations: summarizeLimitations(orderedSnapshots, input.qaResult, input.standards)
  };
  return deepFreeze(stableSanitize(report)) as HandoffReport;
};

export const renderHandoffJson = (report: HandoffReport): string =>
  `${JSON.stringify(stableSanitize(report), null, 2)}\n`;

export const renderHandoffMarkdown = (report: HandoffReport): string => {
  const lines = [
    "# MotionOps Handoff Report",
    "",
    "## Metadata",
    table(["Field", "Value"], [
      ["Report schema", String(report.metadata.schemaVersion)],
      ["Plugin version", report.metadata.pluginVersion],
      ["Standards version", report.metadata.standardsVersion ?? "Not selected"],
      ["Generated", report.metadata.generatedAtMs === null ? "Not embedded" : `${String(report.metadata.generatedAtMs)} ms`]
    ]),
    "",
    "## Scope And Interaction",
    table(["Field", "Value"], [
      ["Root IDs", report.scope.rootIds.join(", ") || "None"],
      ["Targets", String(report.scope.targetCount)],
      ["Confirmed order", report.scope.confirmedOrder.join(", ") || "None"],
      ["Data state", report.scope.staleState],
      ["Standards", report.interaction.standardsName ?? "Not selected"],
      ["Reduced motion", report.interaction.reducedMotionNotes.join("; ") || "None recorded"],
      ["Not evaluated", report.interaction.notEvaluated.join("; ") || "None"]
    ]),
    "",
    "## Motion Overview",
    table(["Metric", "Value"], [
      ["Animated targets", String(report.targets.length)],
      ["Manual tracks", String(report.targets.reduce((count, target) => count + target.manualTracks.length, 0))],
      ["Style instances", String(report.targets.reduce((count, target) => count + target.styleInstances.length, 0))],
      ["Timelines", String(report.targets.reduce((count, target) => count + countTargetTimelines(target), 0))]
    ]),
    "",
    ...report.targets.flatMap(renderTarget),
    "## Tokens And Standards",
    report.tokens.length === 0 ? "No token evaluation is available." : table(["Target", "Property", "Kind", "Status", "Exact", "Nearest", "Distance"], report.tokens.map((token) => [
      token.nodeId,
      token.property,
      token.valueKind,
      token.status,
      token.exactTokenName ?? token.exactTokenId ?? "-",
      token.nearestTokenName ?? token.nearestTokenId ?? "-",
      token.distance === null ? "-" : String(token.distance)
    ])),
    "",
    "## Deviations",
    report.deviations.length === 0 ? "No standards deviations are present." : table(["Severity", "Status", "Target", "Property", "Message", "Safe fix"], report.deviations.map((deviation) => [
      deviation.severity,
      deviation.status,
      deviation.nodeId ?? "Global",
      deviation.property ?? "-",
      deviation.message,
      deviation.safeFixAvailable ? "metadata only" : "-"
    ])),
    "",
    "## QA Summary",
    table(["Field", "Value"], [
      ["Available", report.qa.available ? "Yes" : "No"],
      ["Total", String(report.qa.totals.total)],
      ["Error", String(report.qa.totals.error)],
      ["Warning", String(report.qa.totals.warning)],
      ["Suggestion", String(report.qa.totals.suggestion)],
      ["Information", String(report.qa.totals.information)],
      ["Open", String(report.qa.totals.open)],
      ["Reviewed", String(report.qa.totals.reviewed)],
      ["Ignored once", String(report.qa.totals.ignoredOnce)],
      ["Excepted", String(report.qa.totals.excepted)]
    ]),
    "",
    "## QA Issues",
    report.qa.issues.length === 0 ? "No QA issues are present." : table(["ID", "Rule", "Target", "Message"], report.qa.issues.map((issue) => [issue.id, issue.category, issue.nodeId ?? "Global", issue.message])),
    "",
    "## Exceptions",
    report.exceptions.length === 0 ? "No exceptions are recorded." : table(["ID", "Scope", "Rule", "Target", "Property", "Reason"], report.exceptions.map((exception) => [
      exception.id,
      exception.scope,
      exception.ruleId ?? "-",
      exception.nodeId ?? "-",
      exception.property ?? "-",
      exception.reason ?? "-"
    ])),
    "",
    "## Known Limitations And Not-Evaluated Items",
    report.limitations.length === 0 ? "No limitations are recorded." : table(["Kind", "Target", "Property", "Message"], report.limitations.map((item) => [item.kind, item.targetId ?? "-", item.property ?? "-", item.message])),
    "",
    "## Technical Appendix",
    "Track and keyframe IDs are included only in the JSON export. Report JSON is a handoff format, not a restoration or editable Motion backup.",
    ""
  ];
  return lines.join("\n");
};

const renderTarget = (target: HandoffTargetSummary): readonly string[] => [
  `## Target: ${escapeMarkdown(target.name)}`,
  "",
  table(["Field", "Value"], [
    ["Node ID", target.nodeId],
    ["Type", target.nodeType],
    ["Source", target.sourceKind],
    ["Visible", target.visible === null ? "Unknown" : String(target.visible)],
    ["Locked", target.locked === null ? "Unknown" : String(target.locked)]
  ]),
  "",
  "### Manual Tracks",
  target.manualTracks.length === 0 ? "No manual tracks." : table(["Property", "Start", "End", "Duration", "Delay", "Easing", "Write"], target.manualTracks.map((track) => [
    track.property,
    nullableMs(track.startMs),
    nullableMs(track.endMs),
    nullableMs(track.durationMs),
    nullableMs(track.delayMs),
    track.easing,
    track.writeStatus
  ])),
  "",
  "### Keyframes",
  target.manualTracks.every((track) => track.keyframes.length === 0) ? "No keyframes." : table(["Property", "Ordinal", "Time", "Value", "Easing"], target.manualTracks.flatMap((track) => track.keyframes.map((keyframe) => [
    track.property,
    String(keyframe.ordinal),
    nullableMs(keyframe.timeMs),
    formatValue(keyframe.value),
    keyframe.easing
  ]))),
  "",
  "### Style Instances",
  target.styleInstances.length === 0 ? "No native style instances." : table(["Name", "Writable", "Warnings"], target.styleInstances.map((style) => [
    style.name ?? "Unnamed style",
    "No",
    style.warnings.map((warning) => warning.code).join(", ") || "-"
  ])),
  "",
  "### Timelines",
  renderTargetTimelines(target),
  ""
];

const renderTargetTimelines = ({ timelines }: HandoffTargetSummary): string =>
  timelines.length === 0 ? "No timelines." : table(["Timeline", "Duration", "Tracks"], timelines.map((timeline) => [
    timeline.timelineId,
    nullableMs(timeline.durationMs),
    timeline.tracks.join(", ") || "-"
  ]));

const summarizeTarget = (snapshot: MotionSnapshot, scopeNode: ScopeScanNode | undefined): HandoffTargetSummary => ({
  nodeId: snapshot.nodeId,
  name: scopeNode?.name ?? snapshot.nodeId,
  nodeType: scopeNode?.type ?? snapshot.nodeType,
  parentId: scopeNode?.parentId ?? null,
  depth: scopeNode?.depth ?? 0,
  visible: scopeNode?.visible ?? null,
  locked: scopeNode?.locked ?? null,
  sourceKind: snapshot.sources.kind,
  manualTracks: snapshot.manualTracks.map(summarizeTrack).sort((left, right) => left.property.localeCompare(right.property)),
  styleInstances: snapshot.styleInstances.map(summarizeStyle).sort((left, right) => (left.name ?? "").localeCompare(right.name ?? "")),
  timelines: summarizeSnapshotTimelines(snapshot),
  derivedAnimations: snapshot.derivedAnimations.map((item) => ({ property: item.property, valueClassification: item.valueClassification, timelineDurationMs: finiteMs(item.timelineDurationMs) })).sort((left, right) => left.property.localeCompare(right.property)),
  capabilities: capabilityEntries(snapshot.capabilities).map(([capability, value]) => summarizeCapability(capability, value)).sort((left, right) => left.capability.localeCompare(right.capability)),
  warnings: snapshot.warnings.map(summarizeWarning).sort(compareWarning)
});

const summarizeTrack = (track: NormalizedManualTrack): HandoffManualTrackSummary => {
  const orderedKeyframes = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.ordinal - right.ordinal);
  const start = orderedKeyframes.length === 0 ? null : finiteMs(orderedKeyframes[0].timeMs);
  const end = orderedKeyframes.length === 0 ? null : finiteMs(orderedKeyframes[orderedKeyframes.length - 1].timeMs);
  const duration = start === null || end === null ? null : finiteMs(end - start);
  return {
    property: track.property,
    propertyClassification: track.propertyClassification,
    startMs: start,
    endMs: end,
    durationMs: duration,
    delayMs: start,
    easing: summarizeTrackEasing(orderedKeyframes),
    keyframes: orderedKeyframes.map(summarizeKeyframe),
    writeStatus: track.write.status,
    warnings: track.warnings.map(summarizeWarning).sort(compareWarning),
    technical: { trackId: track.trackId ?? null }
  };
};

const summarizeKeyframe = (keyframe: NormalizedKeyframe): HandoffKeyframeSummary => ({
  ordinal: keyframe.ordinal,
  timeMs: finiteMs(keyframe.timeMs) ?? 0,
    value: stableSanitize(keyframe.value),
  easing: formatEasing(keyframe.easing),
  technical: { keyframeId: keyframe.keyframeId ?? null }
});

const summarizeStyle = (style: NormalizedStyleInstance): HandoffStyleInstanceSummary => ({
  name: style.name ?? null,
  writable: false,
  warnings: style.warnings.map(summarizeWarning).sort(compareWarning),
  technical: {
    availableAnimationStyleId: style.availableAnimationStyleId ?? null,
    appliedStyleInstanceId: style.appliedStyleInstanceId ?? null
  }
});

const summarizeTimeline = (timeline: NormalizedTimeline): HandoffTimelineSummary => ({
  timelineId: timeline.timelineId,
  durationMs: finiteMs(timeline.durationMs) ?? 0,
  tracks: [...timeline.tracks].sort()
});

const summarizeSnapshotTimelines = ({ timelines }: MotionSnapshot): readonly HandoffTimelineSummary[] =>
  timelines.map(summarizeTimeline).sort((left, right) => left.timelineId.localeCompare(right.timelineId));

const countTargetTimelines = ({ timelines }: HandoffTargetSummary): number =>
  timelines.length;

const summarizeCapability = (capability: string, value: MotionCapability): HandoffCapabilitySummary => ({
  capability,
  status: value.status,
  reason: value.reason
});

const summarizeWarning = (warning: MotionAdapterWarning): HandoffWarningSummary => ({
  code: warning.code,
  message: warning.message,
  path: warning.path ?? null,
  detail: warning.detail ?? null
});

const summarizeTokens = (snapshot: MotionSnapshot, standards: MotionStandards): readonly HandoffTokenSummary[] =>
  snapshot.manualTracks.flatMap((track) => {
    const range = trackRange(track);
    return [
      tokenSummary(snapshot.nodeId, track.property, range.duration, matchDurationToken(range.duration as TimeMs, standards)),
      tokenSummary(snapshot.nodeId, track.property, range.start, matchDelayToken(range.start as TimeMs, standards)),
      ...track.keyframes.map((keyframe) => tokenSummary(snapshot.nodeId, track.property, null, matchEasingToken(keyframe.easing, standards)))
    ];
  });

const summarizeAllTokens = (snapshots: readonly MotionSnapshot[], standards: MotionStandards): readonly HandoffTokenSummary[] =>
  snapshots.flatMap((snapshot) => summarizeTokens(snapshot, standards));

const tokenSummary = (nodeId: string, property: string, valueMs: number | null, token: TokenMatch): HandoffTokenSummary => ({
  nodeId,
  property,
  valueKind: token.valueKind,
  valueMs,
  exactTokenId: token.exact ? token.tokenId ?? null : null,
  exactTokenName: token.exact ? token.tokenName ?? null : null,
  nearestTokenId: token.exact ? null : token.tokenId ?? null,
  nearestTokenName: token.exact ? null : token.tokenName ?? null,
  distance: Number.isFinite(token.distance) ? token.distance : null,
  compliant: token.compliant,
  status: token.exact ? "exact" : token.tokenId === undefined ? "unmatched" : "nearest"
});

const summarizeIssue = (issue: QaIssue): HandoffDeviationSummary => ({
  id: issue.id,
  severity: issue.severity,
  category: issue.ruleId,
  status: issue.status,
  nodeId: issue.nodeId ?? null,
  property: issue.property ?? null,
  message: issue.message,
  detail: issue.detail ?? null,
  safeFixAvailable: issue.safeFix !== undefined
});

const summarizeQa = (qaResult: QaResult | null): HandoffQaSummary => ({
  available: qaResult !== null,
  totals: {
    total: qaResult?.summary.total ?? 0,
    error: qaResult?.summary.bySeverity.error ?? 0,
    warning: qaResult?.summary.bySeverity.warning ?? 0,
    suggestion: qaResult?.summary.bySeverity.suggestion ?? 0,
    information: qaResult?.summary.bySeverity.information ?? 0,
    open: qaResult?.summary.byStatus.open ?? 0,
    ignoredOnce: qaResult?.summary.byStatus["ignored-once"] ?? 0,
    excepted: qaResult?.summary.byStatus.excepted ?? 0,
    reviewed: qaResult?.summary.byStatus.reviewed ?? 0,
    resolved: qaResult?.summary.byStatus.resolved ?? 0
  },
  issues: (qaResult?.issues ?? []).map(summarizeIssue).sort(compareDeviation),
  groups: qaResult?.groups.map((group) => ({ key: group.key, label: group.label, issueIds: [...group.issueIds].sort(), count: group.count })).sort((left, right) => left.key.localeCompare(right.key)) ?? [],
  passedChecks: [],
  notEvaluated: qaResult?.summary.notEvaluated ?? []
});

const summarizeException = (exception: StandardsException): HandoffExceptionSummary => ({
  id: exception.id,
  scope: exception.scope,
  ruleId: exception.ruleId ?? null,
  nodeId: exception.nodeId ?? null,
  property: exception.property ?? null,
  interactionCategoryId: exception.interactionCategoryId ?? null,
  reason: exception.reason ?? null
});

const summarizeLimitations = (
  snapshots: readonly MotionSnapshot[],
  qaResult: QaResult | null,
  standards: MotionStandards | null
): readonly HandoffLimitationSummary[] => {
  const capabilityLimitations = snapshots.flatMap((snapshot) => capabilityEntries(snapshot.capabilities).flatMap(([capability, value]) =>
    value.status === "supported" || value.status === "supported-with-warning" ? [] : [{
      kind: value.status === "read-only" ? "read-only" as const : value.status === "unsupported" ? "unsupported" as const : "unknown" as const,
      targetId: snapshot.nodeId,
      property: capability,
      message: value.reason
    }]
  ));
  const warnings = snapshots.flatMap((snapshot) => snapshot.warnings.map((warning) => ({ kind: "warning" as const, targetId: snapshot.nodeId, property: warning.path ?? null, message: `${warning.code}: ${warning.message}` })));
  const notEvaluated = [
    ...(standards === null ? [{ kind: "not-evaluated" as const, targetId: null, property: null, message: "No active standards were selected." }] : []),
    ...((qaResult?.summary.notEvaluated ?? []).map((item) => ({ kind: "not-evaluated" as const, targetId: null, property: null, message: item })))
  ];
  return [...capabilityLimitations, ...warnings, ...notEvaluated].sort((left, right) => [left.kind, left.targetId ?? "", left.property ?? "", left.message].join("|").localeCompare([right.kind, right.targetId ?? "", right.property ?? "", right.message].join("|")));
};

const orderTargets = (scope: ScopeScanResult, snapshots: readonly MotionSnapshot[]): readonly string[] => {
  const scoped = scope.nodes.map((node) => node.id);
  const extras = snapshots.map((snapshot) => snapshot.nodeId).filter((nodeId) => !scoped.includes(nodeId)).sort();
  return [...scoped.filter((nodeId) => snapshots.some((snapshot) => snapshot.nodeId === nodeId)), ...extras];
};

const classifyStaleState = (scope: ScopeScanResult | null, snapshots: readonly MotionSnapshot[]): HandoffScopeSummary["staleState"] => {
  if (scope === null || scope.nodes.length === 0) return "missing-scope";
  if (snapshots.length === 0) return "missing-motion";
  return snapshots.length < scope.nodes.length ? "partial-motion" : "current";
};

const trackRange = (track: NormalizedManualTrack): { readonly start: number; readonly end: number; readonly duration: number } => {
  const times = track.keyframes.map((keyframe) => keyframe.timeMs);
  const start = times.length === 0 ? 0 : Math.min(...times);
  const end = times.length === 0 ? 0 : Math.max(...times);
  return { start, end, duration: end - start };
};

const summarizeTrackEasing = (keyframes: readonly NormalizedKeyframe[]): string => {
  const values = [...new Set(keyframes.map((keyframe) => formatEasing(keyframe.easing)))];
  if (values.length === 0) return "unknown";
  return values.length === 1 ? values[0] : `mixed: ${values.join(", ")}`;
};

const formatEasing = (easing: NormalizedEasing): string => {
  switch (easing.kind) {
    case "linear":
      return "linear";
    case "preset":
      return `preset:${easing.name}`;
    case "cubic-bezier":
      return `cubic-bezier(${String(easing.x1)}, ${String(easing.y1)}, ${String(easing.x2)}, ${String(easing.y2)})`;
    case "spring":
      return "spring";
    case "unknown":
      return "unknown";
  }
};

const compareWarning = (left: HandoffWarningSummary, right: HandoffWarningSummary): number =>
  [left.code, left.path ?? "", left.message].join("|").localeCompare([right.code, right.path ?? "", right.message].join("|"));

const compareDeviation = (left: HandoffDeviationSummary, right: HandoffDeviationSummary): number =>
  [left.severity, left.status, left.category, left.nodeId ?? "", left.property ?? "", left.id].join("|").localeCompare([right.severity, right.status, right.category, right.nodeId ?? "", right.property ?? "", right.id].join("|"));

const capabilityEntries = (capabilities: MotionSnapshot["capabilities"]): readonly (readonly [string, MotionCapability])[] =>
  Object.entries(capabilities) as readonly (readonly [string, MotionCapability])[];

const finiteMs = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;

const nullableMs = (value: number | null): string =>
  value === null ? "-" : `${String(value)} ms`;

const formatValue = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(stableSanitize(value));
};

const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string => [
  `| ${headers.map(escapeMarkdown).join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.map((cell) => escapeMarkdown(cell)).join(" | ")} |`)
].join("\n");

const escapeMarkdown = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const stableSanitize = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(stableSanitize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => typeof item !== "function").sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableSanitize(item)]));
  }
  return value;
};

const deepFreeze = (value: unknown): unknown => {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }
  return value;
};
