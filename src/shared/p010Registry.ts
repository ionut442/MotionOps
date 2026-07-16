export type P010CaseId =
  | "U01"
  | "U02"
  | "U03"
  | "U04"
  | "U05"
  | "U06"
  | "U07"
  | "U08"
  | "U09"
  | "U10";

export type P010SourceType = "manual-track" | "style-instance" | "timeline" | "no-op" | "partial-failure";

export type P010TransactionStrategyId = "A_WRITE_THEN_COMMIT" | "B_COMMIT_WRITE_COMMIT" | "C_INITIAL_BOUNDARY_WRITE_COMMIT" | "D_WRITE_COMMIT_FAILURE_TRIGGER_UNDO";

export type P010Action =
  | "PREPARE"
  | "APPLY"
  | "CONFIRM_UNDO"
  | "CONFIRM_SECOND_UNDO"
  | "CONFIRM_REDO"
  | "TRIGGER_UNDO"
  | "CLEAR_GENERATED";

export interface P010CaseDefinition {
  id: P010CaseId;
  title: string;
  slug: string;
  strategy: P010TransactionStrategyId;
  sourceTypes: readonly P010SourceType[];
  requiresNativeUndo: boolean;
  requiresSecondUndo: boolean;
  requiresRedo: boolean;
  usesTriggerUndo: boolean;
  fixtureRoles: readonly string[];
}

export const p010TransactionStrategyIds = [
  "A_WRITE_THEN_COMMIT",
  "B_COMMIT_WRITE_COMMIT",
  "C_INITIAL_BOUNDARY_WRITE_COMMIT"
] as const satisfies readonly P010TransactionStrategyId[];

export const p010CaseDefinitions = [
  {
    id: "U01",
    title: "One manual-track write, one undo",
    slug: "one-manual-write-one-undo",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["manual-track"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary"]
  },
  {
    id: "U02",
    title: "Multiple manual mutations grouped",
    slug: "multi-manual-grouping",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["manual-track"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary", "manual-secondary"]
  },
  {
    id: "U03",
    title: "Style remove/reapply grouped",
    slug: "style-remove-reapply-grouping",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["style-instance"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["style-primary"]
  },
  {
    id: "U04",
    title: "Timeline-duration write, one undo",
    slug: "timeline-duration-one-undo",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["timeline"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["timeline-primary"]
  },
  {
    id: "U05",
    title: "Mixed-source operation grouped",
    slug: "mixed-source-grouping",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["manual-track", "style-instance", "timeline"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary", "style-primary", "timeline-primary"]
  },
  {
    id: "U06",
    title: "Separate apply actions create separate undo steps",
    slug: "separate-apply-actions",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["manual-track"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary"]
  },
  {
    id: "U07",
    title: "No-op apply history behavior",
    slug: "noop-apply-history",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["no-op"],
    requiresNativeUndo: true,
    requiresSecondUndo: false,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary"]
  },
  {
    id: "U08",
    title: "Partial failure and rollback probe",
    slug: "partial-failure-rollback",
    strategy: "D_WRITE_COMMIT_FAILURE_TRIGGER_UNDO",
    sourceTypes: ["partial-failure", "manual-track"],
    requiresNativeUndo: false,
    requiresSecondUndo: false,
    requiresRedo: true,
    usesTriggerUndo: true,
    fixtureRoles: ["manual-primary"]
  },
  {
    id: "U09",
    title: "Async boundary probe",
    slug: "async-boundary",
    strategy: "A_WRITE_THEN_COMMIT",
    sourceTypes: ["manual-track"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary", "manual-secondary"]
  },
  {
    id: "U10",
    title: "Repeated transaction stability",
    slug: "repeated-transaction-stability",
    strategy: "B_COMMIT_WRITE_COMMIT",
    sourceTypes: ["manual-track", "timeline"],
    requiresNativeUndo: true,
    requiresSecondUndo: true,
    requiresRedo: true,
    usesTriggerUndo: false,
    fixtureRoles: ["manual-primary", "timeline-primary"]
  }
] as const satisfies readonly P010CaseDefinition[];

export const getP010CaseDefinition = (id: string): P010CaseDefinition | undefined =>
  p010CaseDefinitions.find((definition) => definition.id === id);

export const p010EvidenceFilename = (runId: string, definition: P010CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
