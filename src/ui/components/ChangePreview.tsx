import { formatEasing, formatMilliseconds } from "../../domain/inspector";
import type { NormalizedEasing } from "../../domain/motion";
import { propertyLabel } from "../editPresentation";

export interface ChangePreviewProps {
  plan: ChangePreviewPlan;
  context?: OperationPreviewContext;
}

export interface OperationPreviewContext {
  readonly mode?: "timing" | "easing" | "copy-paste" | "stagger";
  readonly sourceName?: string;
  readonly destinationNames?: readonly string[];
  readonly easingGroups?: readonly {
    readonly id: string;
    readonly name: string;
    readonly raw: string;
    readonly easing: NormalizedEasing;
    readonly properties: readonly string[];
    readonly segmentCount: number;
  }[];
  readonly newEasing?: NormalizedEasing;
  readonly staggerIntervalMs?: number;
}

export interface ChangePreviewPlan {
  operation: {
    kind: "empty" | "set-duration" | "replace-easing" | "set-delay" | "scale-timing" | "spring" | "paste-motion" | "sequencer-draft";
  };
  mutations: unknown[];
  skipped: {
    target: string;
    code: string;
    message: string;
  }[];
  warnings: {
    path: string;
    code: string;
    message: string;
  }[];
  expected: {
    affectedTargets: number;
    manualMutations: number;
    styleMutations: number;
    timelineMutations: number;
    skippedTargets: number;
    expectedResults: string[];
    beforeAfterExamples: { label: string; before: string; after: string }[];
  };
}

interface PreviewDetail {
  readonly property: string;
  readonly before: string;
  readonly after: string;
}

export const ChangePreview = ({ context, plan }: ChangePreviewProps) => {
  const detailRows = previewDetails(plan);
  const warningGroups = aggregateMessages(plan.warnings.map((warning) => warning.message));
  const skippedGroups = aggregateMessages(plan.skipped.map((skip) => skip.message));
  const hasTimingVisual = plan.operation.kind === "set-duration" || plan.operation.kind === "set-delay" || plan.operation.kind === "scale-timing";
  const hasPasteMapping = context?.mode === "copy-paste" && plan.operation.kind === "paste-motion";
  const hasStaggerVisual = context?.mode === "stagger" && plan.operation.kind === "paste-motion";

  return (
    <section aria-label="Change preview" className="change-preview">
      <header className="change-preview-header">
        <h3>{outcomeTitle(plan, context)}</h3>
        <p>{outcomeDescription(plan)}</p>
      </header>

      {hasTimingVisual && detailRows.length > 0 ? <TimelineComparison first={detailRows[0]} /> : null}
      {plan.operation.kind === "replace-easing" ? <EasingComparison context={context} details={detailRows} /> : null}
      {hasPasteMapping ? <PasteMappingPreview context={context} details={detailRows} /> : null}
      {hasStaggerVisual ? <StaggerTimeline context={context} details={detailRows} /> : null}

      <dl className="change-preview-summary">
        <div>
          <dt>Layers</dt>
          <dd>{plan.expected.affectedTargets}</dd>
        </div>
        <div>
          <dt>Properties</dt>
          <dd>{Math.max(plan.expected.manualMutations, detailRows.length)}</dd>
        </div>
        {plan.operation.kind === "paste-motion" ? (
          <div>
            <dt>Paste changes</dt>
            <dd>{plan.mutations.length}</dd>
          </div>
        ) : null}
      </dl>

      {warningGroups.length > 0 ? (
        <section aria-label="Important warnings" className="change-preview-callout" data-tone="warning">
          <strong>{warningGroups.length === 1 ? warningGroups[0].label : `${String(warningGroups.length)} warning types`}</strong>
          {warningGroups.length === 1 ? null : (
            <ul>
              {warningGroups.map((warning) => (
                <li key={warning.label}>{warning.label}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {skippedGroups.length > 0 ? (
        <details className="change-preview-section" open>
          <summary>{plan.skipped.length} skipped destination{plan.skipped.length === 1 ? "" : "s"}</summary>
          <ul>
            {skippedGroups.map((skip) => (
              <li key={skip.label}>
                {skip.count > 1 ? `${String(skip.count)} targets: ` : null}
                {skip.label}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {detailRows.length > 0 ? (
        <details className="change-preview-section" open={detailRows.length <= 3}>
          <summary>Property details</summary>
          <div className="change-preview-table" role="table" aria-label="Property before and after values">
            <div role="row">
              <span role="columnheader">Property</span>
            <span role="columnheader">{plan.operation.kind === "replace-easing" ? "Current easing" : "Before"}</span>
            <span role="columnheader">{plan.operation.kind === "replace-easing" ? "New easing" : "After"}</span>
            </div>
            {detailRows.map((row) => (
              <div role="row" key={`${row.property}-${row.before}-${row.after}`}>
                <span role="cell">{row.property}</span>
                <span role="cell">{row.before}</span>
                <span role="cell">{row.after}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
};

const outcomeTitle = (plan: ChangePreviewPlan, context?: OperationPreviewContext): string => {
  const propertyCount = Math.max(plan.expected.manualMutations, plan.expected.beforeAfterExamples.length, plan.mutations.length);
  switch (plan.operation.kind) {
    case "set-duration":
    case "set-delay":
    case "scale-timing":
      return `${String(propertyCount)} ${plural("property", propertyCount)} will change on ${String(plan.expected.affectedTargets)} ${plural("layer", plan.expected.affectedTargets)}`;
    case "replace-easing":
      return `${String(propertyCount)} animated ${plural("segment", propertyCount)} will use ${context?.newEasing ? friendlyEasingName(context.newEasing) : "the selected easing"}`;
    case "paste-motion":
      if (context?.mode === "stagger") {
        return `${String(context.destinationNames?.length ?? plan.expected.affectedTargets)} targets will stagger`;
      }
      return `Paste motion to ${String(plan.expected.affectedTargets)} ${plural("destination", plan.expected.affectedTargets)}`;
    case "empty":
      return "No changes will be applied";
    case "spring":
      return "Spring easing is not ready to apply";
    case "sequencer-draft":
      return "Sequence preview";
    default:
      return assertNever(plan.operation.kind);
  }
};

const outcomeDescription = (plan: ChangePreviewPlan): string => {
  switch (plan.operation.kind) {
    case "replace-easing":
      return "Keyframe times and values will not change.";
    case "paste-motion":
      return plan.skipped.length > 0
        ? `${String(plan.skipped.length)} destination ${plural("target", plan.skipped.length)} will be skipped.`
        : "Motion will be copied from the source to the eligible destinations.";
    case "set-duration":
    case "set-delay":
    case "scale-timing":
      return "Review timing before writing these changes.";
    case "empty":
      return "Select editable properties and configure a change to preview.";
    case "spring":
      return "Spring data remains read-only until a safe writer path is available.";
    case "sequencer-draft":
      return "Review the generated sequence before applying.";
    default:
      return assertNever(plan.operation.kind);
  }
};

const TimelineComparison = ({ first }: { readonly first: PreviewDetail }) => {
  const beforeEnd = extractLastMs(first.before);
  const afterEnd = extractLastMs(first.after);
  const max = Math.max(beforeEnd, afterEnd, 1);
  return (
    <div className="change-preview-visual" aria-label={`Current end ${formatMilliseconds(beforeEnd)}. New end ${formatMilliseconds(afterEnd)}.`}>
      <TimelineBar label="Current" value={beforeEnd} max={max} />
      <TimelineBar label="New" value={afterEnd} max={max} tone="new" />
    </div>
  );
};

const TimelineBar = ({ label, value, max, tone = "current" }: { readonly label: string; readonly value: number; readonly max: number; readonly tone?: "current" | "new" }) => (
  <div className="change-preview-timeline-row">
    <span>{label}</span>
    <span className="change-preview-timeline-track">
      <span className="change-preview-timeline-fill" data-tone={tone} style={{ width: `${String(Math.max(4, Math.min(100, (value / max) * 100)))}%` }} />
    </span>
    <span>{formatMilliseconds(value)}</span>
  </div>
);

const EasingComparison = ({ context, details }: { readonly context?: OperationPreviewContext; readonly details: readonly PreviewDetail[] }) => {
  const groups = context?.easingGroups ?? [];
  const newEasing = context?.newEasing;
  return (
    <div className="change-preview-visual change-preview-easing" aria-label="Easing replacement preview">
      <p>Keyframe times and property values will remain unchanged.</p>
      <div className="change-preview-easing-columns">
        <section>
          <strong>Current</strong>
          {groups.length > 0 ? groups.map((group) => (
            <div className="change-preview-curve-row" key={group.id} title={group.raw}>
              <CurveSvg easing={group.easing} label={`${group.name} current curve`} />
              <span>{group.name} · {String(group.properties.length)} {plural("property", group.properties.length)}</span>
            </div>
          )) : (
            <span>{details.length > 1 ? "Mixed current easing" : details[0]?.before ?? "Current easing"}</span>
          )}
        </section>
        <section>
          <strong>New</strong>
          <div className="change-preview-curve-row" data-size="large">
            <CurveSvg easing={newEasing} label={`${newEasing ? friendlyEasingName(newEasing) : "Selected"} new curve`} />
            <span>{newEasing ? friendlyEasingName(newEasing) : "Selected easing"} · all {String(Math.max(details.length, 1))} {plural("property", Math.max(details.length, 1))}</span>
          </div>
        </section>
      </div>
      <div className="change-preview-motion-demo" aria-label="Static motion comparison">
        <span>Current</span>
        <i><b /></i>
        <span>New</span>
        <i data-tone="new"><b /></i>
        <button type="button">Replay</button>
      </div>
    </div>
  );
};

const PasteMappingPreview = ({ context, details }: { readonly context?: OperationPreviewContext; readonly details: readonly PreviewDetail[] }) => {
  const destinations = context?.destinationNames?.slice(0, 4) ?? details.map((detail) => detail.property).slice(0, 4);
  return (
    <div className="change-preview-mapping" aria-label="Copy paste mapping preview">
      <div className="change-preview-source-card">
        <strong>{context?.sourceName ?? "Source layer"}</strong>
        <span>{String(Math.max(details.length, 1))} properties</span>
      </div>
      <div className="change-preview-connector" aria-hidden="true" />
      <div className="change-preview-destination-stack">
        {destinations.map((destination, index) => (
          <article key={`${destination}-${String(index)}`}>
            <strong title={destination}>{destination}</strong>
            <span>{String(Math.max(1, details.length - index))} properties mapped</span>
            <small>{index === 0 ? "replace existing compatible motion" : "copy compatible properties"}</small>
          </article>
        ))}
      </div>
    </div>
  );
};

const StaggerTimeline = ({ context, details }: { readonly context?: OperationPreviewContext; readonly details: readonly PreviewDetail[] }) => {
  const names = context?.destinationNames ?? details.map((detail) => detail.property);
  const interval = context?.staggerIntervalMs ?? 100;
  const rows = names.slice(0, 8).map((name, index) => ({ property: name, before: "", after: "", start: index * interval, end: index * interval + 450 }));
  const total = Math.max(1, ...rows.map((row) => row.end));
  return (
    <div className="change-preview-stagger" aria-label={`${String(names.length)} staggered layers preview`}>
      <div className="change-preview-stagger-summary">
        <strong>{String(names.length)} targets</strong>
        <span>Delay between starts {formatMilliseconds(interval)} · total span {formatMilliseconds(total)}</span>
      </div>
      {rows.map((row, index) => (
        <div className="change-preview-stagger-row" key={`${row.property}-${String(index)}`}>
          <span title={row.property}>{row.property}</span>
          <span>
            <i style={{ marginLeft: `${String((row.start / total) * 100)}%`, width: `${String(Math.max(5, ((row.end - row.start) / total) * 100))}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
};

const CurveSvg = ({ easing, label }: { readonly easing?: NormalizedEasing; readonly label: string }) => (
  <svg viewBox="0 0 96 48" role="img" aria-label={label}>
    <line x1="4" y1="44" x2="92" y2="4" />
    <path d={curvePath(easing)} />
  </svg>
);

const curvePath = (easing: NormalizedEasing | undefined): string => {
  const curve = normalizedCurve(easing);
  if (curve === null) return "M4 44 L92 4";
  return `M4 44 C ${String(4 + curve.x1 * 88)} ${String(44 - curve.y1 * 40)}, ${String(4 + curve.x2 * 88)} ${String(44 - curve.y2 * 40)}, 92 4`;
};

const normalizedCurve = (easing: NormalizedEasing | undefined): { x1: number; y1: number; x2: number; y2: number } | null => {
  if (!easing || easing.kind === "linear") return null;
  if (easing.kind === "cubic-bezier") return easing;
  if (easing.kind === "preset") {
    if (easing.name === "EASE_IN") return { x1: 0.42, y1: 0, x2: 1, y2: 1 };
    if (easing.name === "EASE_OUT") return { x1: 0, y1: 0, x2: 0.58, y2: 1 };
    if (easing.name === "EASE_IN_AND_OUT") return { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
  }
  return null;
};

const friendlyEasingName = (easing: NormalizedEasing): string => {
  if (easing.kind === "linear") return "Linear";
  if (easing.kind === "preset") {
    if (easing.name === "EASE_IN") return "Ease in";
    if (easing.name === "EASE_OUT") return "Ease out";
    if (easing.name === "EASE_IN_AND_OUT") return "Ease in and out";
  }
  return formatEasing(easing);
};

const previewDetails = (plan: ChangePreviewPlan): readonly PreviewDetail[] => {
  const fromMutations = plan.mutations
    .map((mutation) => mutationDetail(mutation, plan.operation.kind))
    .filter((detail): detail is PreviewDetail => detail !== null);
  if (fromMutations.length > 0) {
    return fromMutations;
  }
  return plan.expected.beforeAfterExamples.map((example) => ({
    property: propertyLabel(example.label.split(":").at(-1) ?? example.label),
    before: example.before,
    after: example.after
  }));
};

const mutationDetail = (mutation: unknown, operationKind: ChangePreviewPlan["operation"]["kind"]): PreviewDetail | null => {
  if (!isRecord(mutation)) {
    return null;
  }
  const property = typeof mutation.property === "string" ? mutation.property : typeof mutation.target === "string" ? mutation.target : "Motion";
  return {
    property: propertyLabel(property.split(".").at(-1) ?? property),
    before: operationKind === "replace-easing" ? trackEasing(mutation.before) ?? previewValue(mutation.before, "Current") : trackRange(mutation.before) ?? previewValue(mutation.before, "Current"),
    after: operationKind === "replace-easing" ? trackEasing(mutation.after) ?? previewValue(mutation.after, "New") : trackRange(mutation.after) ?? previewValue(mutation.after, "New")
  };
};

const trackEasing = (value: unknown): string | null => {
  if (!isRecord(value) || !Array.isArray(value.keyframes)) return null;
  const labels = value.keyframes
    .map((keyframe) => isRecord(keyframe) && isRecord(keyframe.easing) ? friendlyEasingName(keyframe.easing as NormalizedEasing) : null)
    .filter((label): label is string => label !== null);
  return labels.length === 0 ? null : [...new Set(labels)].join(", ");
};

const trackRange = (value: unknown): string | null => {
  if (!isRecord(value) || !Array.isArray(value.keyframes) || value.keyframes.length === 0) {
    return null;
  }
  const times = value.keyframes
    .map((keyframe) => (isRecord(keyframe) && typeof keyframe.timeMs === "number" ? keyframe.timeMs : null))
    .filter((time): time is number => time !== null);
  if (times.length === 0) {
    return null;
  }
  return `${formatMilliseconds(Math.min(...times))}-${formatMilliseconds(Math.max(...times))}`;
};

const previewValue = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const extractLastMs = (value: string): number => {
  const matches = [...value.matchAll(/(\d+)\s*ms/g)];
  return Number(matches.at(-1)?.[1] ?? 0);
};

const aggregateMessages = (messages: readonly string[]): readonly { label: string; count: number }[] => {
  const groups = new Map<string, number>();
  for (const message of messages) {
    const clean = cleanTechnicalText(message);
    groups.set(clean, (groups.get(clean) ?? 0) + 1);
  }
  return [...groups.entries()].map(([label, count]) => ({ label, count }));
};

const cleanTechnicalText = (text: string): string =>
  text
    .replace(/(?:timelines|manualTracks|styleInstances)\.[\w:.-]+/g, "the selected animation")
    .replace(/\bmanual replacement mutation\(s\)/gi, "manual animation change")
    .replace(/\bstyle mutation\(s\)/gi, "animation style change")
    .replace(/\btimeline mutation\(s\)/gi, "timeline change")
    .replace(/\bsupported-with-warning\b/g, "editable with limitations");

const plural = (word: string, count: number): string => {
  if (count === 1) {
    return word;
  }
  return word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const assertNever = (value: never): never => {
  throw new Error(`Unhandled operation preview kind: ${String(value)}`);
};
