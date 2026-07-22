import { formatMilliseconds } from "../../domain/inspector";
import { propertyLabel } from "../editPresentation";

export interface ChangePreviewProps {
  plan: ChangePreviewPlan;
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

export const ChangePreview = ({ plan }: ChangePreviewProps) => {
  const detailRows = previewDetails(plan);
  const warningGroups = aggregateMessages(plan.warnings.map((warning) => warning.message));
  const skippedGroups = aggregateMessages(plan.skipped.map((skip) => skip.message));
  const hasTimingVisual = plan.operation.kind === "set-duration" || plan.operation.kind === "set-delay" || plan.operation.kind === "scale-timing";
  const hasStaggerVisual = plan.operation.kind === "paste-motion" && detailRows.length > 1;

  return (
    <section aria-label="Change preview" className="change-preview">
      <header className="change-preview-header">
        <h3>{outcomeTitle(plan)}</h3>
        <p>{outcomeDescription(plan)}</p>
      </header>

      {hasTimingVisual && detailRows.length > 0 ? <TimelineComparison first={detailRows[0]} /> : null}
      {plan.operation.kind === "replace-easing" ? <EasingComparison details={detailRows} /> : null}
      {hasStaggerVisual ? <StaggerTimeline details={detailRows} /> : null}

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
              <span role="columnheader">Before</span>
              <span role="columnheader">After</span>
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

const outcomeTitle = (plan: ChangePreviewPlan): string => {
  const propertyCount = Math.max(plan.expected.manualMutations, plan.expected.beforeAfterExamples.length, plan.mutations.length);
  switch (plan.operation.kind) {
    case "set-duration":
    case "set-delay":
    case "scale-timing":
      return `${String(propertyCount)} ${plural("property", propertyCount)} will change on ${String(plan.expected.affectedTargets)} ${plural("layer", plan.expected.affectedTargets)}`;
    case "replace-easing":
      return `Replace easing on ${String(propertyCount)} animated ${plural("segment", propertyCount)}`;
    case "paste-motion":
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
      return "Review timing before writing these changes to Figma.";
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

const EasingComparison = ({ details }: { readonly details: readonly PreviewDetail[] }) => (
  <div className="change-preview-visual" aria-label="Easing replacement preview">
    <div className="change-preview-curve">
      <span>Before</span>
      <svg viewBox="0 0 96 36" role="img" aria-label={details.length > 1 ? `${String(details.length)} existing curves` : "Existing easing curve"}>
        <path d="M4 32 C 26 32, 32 4, 92 4" />
      </svg>
    </div>
    <div className="change-preview-curve">
      <span>After</span>
      <svg viewBox="0 0 96 36" role="img" aria-label="Selected easing curve">
        <path d="M4 32 C 28 20, 68 20, 92 4" />
      </svg>
    </div>
  </div>
);

const StaggerTimeline = ({ details }: { readonly details: readonly PreviewDetail[] }) => {
  const rows = details.slice(0, 6);
  return (
    <div className="change-preview-stagger" aria-label={`${String(details.length)} staggered layers preview`}>
      {rows.map((row, index) => (
        <div className="change-preview-stagger-row" key={`${row.property}-${String(index)}`}>
          <span title={row.property}>{row.property}</span>
          <span>
            <i style={{ marginLeft: `${String(index * 9)}%`, width: "42%" }} />
          </span>
        </div>
      ))}
    </div>
  );
};

const previewDetails = (plan: ChangePreviewPlan): readonly PreviewDetail[] => {
  const fromMutations = plan.mutations
    .map((mutation) => mutationDetail(mutation))
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

const mutationDetail = (mutation: unknown): PreviewDetail | null => {
  if (!isRecord(mutation)) {
    return null;
  }
  const property = typeof mutation.property === "string" ? mutation.property : typeof mutation.target === "string" ? mutation.target : "Motion";
  return {
    property: propertyLabel(property.split(".").at(-1) ?? property),
    before: trackRange(mutation.before) ?? previewValue(mutation.before, "Current"),
    after: trackRange(mutation.after) ?? previewValue(mutation.after, "New")
  };
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
    .replace(/\bstyle mutation\(s\)/gi, "Figma animation style change")
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
