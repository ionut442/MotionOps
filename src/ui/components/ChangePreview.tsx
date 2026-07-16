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

export const ChangePreview = ({ plan }: ChangePreviewProps) => {
  const targetCount = plan.expected.affectedTargets;
  const mutationCount = plan.mutations.length;

  return (
    <section aria-label="Change plan preview" className="change-preview">
      <header className="change-preview-header">
        <h3>{operationName(plan.operation.kind)}</h3>
        <p>{plan.expected.expectedResults.join(". ")}.</p>
      </header>

      <dl className="change-preview-counts">
        <div>
          <dt>Targets</dt>
          <dd>{targetCount}</dd>
        </div>
        <div>
          <dt>Mutations</dt>
          <dd>{mutationCount}</dd>
        </div>
        <div>
          <dt>Manual</dt>
          <dd>{plan.expected.manualMutations}</dd>
        </div>
        <div>
          <dt>Style</dt>
          <dd>{plan.expected.styleMutations}</dd>
        </div>
        <div>
          <dt>Timeline</dt>
          <dd>{plan.expected.timelineMutations}</dd>
        </div>
        <div>
          <dt>Skipped</dt>
          <dd>{plan.expected.skippedTargets}</dd>
        </div>
      </dl>

      <details className="change-preview-section" open={plan.skipped.length > 0}>
        <summary>Skipped targets ({plan.skipped.length})</summary>
        <ul>
          {plan.skipped.map((skip, index) => (
            <li key={`${skip.target}-${skip.code}-${String(index)}`}>
              <strong>{skip.target}</strong>: {skip.message}
            </li>
          ))}
        </ul>
      </details>

      <details className="change-preview-section" open={plan.warnings.length > 0}>
        <summary>Warnings ({plan.warnings.length})</summary>
        <ul>
          {plan.warnings.map((warning, index) => (
            <li key={`${warning.path}-${warning.code}-${String(index)}`}>
              <strong>{warning.path}</strong>: {warning.message}
            </li>
          ))}
        </ul>
      </details>

      <details className="change-preview-section" open={plan.expected.beforeAfterExamples.length > 0}>
        <summary>Before and after examples ({plan.expected.beforeAfterExamples.length})</summary>
        <ul>
          {plan.expected.beforeAfterExamples.map((example) => (
            <li key={example.label}>
              <strong>{example.label}</strong>: {example.before} {"->"} {example.after}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
};

const operationName = (kind: ChangePreviewPlan["operation"]["kind"]): string => {
  switch (kind) {
    case "empty":
      return "Empty operation";
    case "set-duration":
      return "Duration change";
    case "replace-easing":
      return "Easing replacement";
    case "set-delay":
      return "Delay change";
    case "scale-timing":
      return "Timing scale";
    case "spring":
      return "Spring change";
    case "paste-motion":
      return "Paste Motion";
    case "sequencer-draft":
      return "Sequencer draft";
    default:
      return assertNever(kind);
  }
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled operation preview kind: ${String(value)}`);
};
