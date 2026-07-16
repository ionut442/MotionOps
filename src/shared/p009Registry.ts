export type P009CaseId = "T01" | "T02" | "T03" | "T04" | "T05" | "T06";

export type P009Operation =
  | "NO_OP_DURATION_WRITE"
  | "EXTEND_DURATION"
  | "SHORTEN_SAFE"
  | "SHORTEN_BELOW_FINAL_KEYFRAME"
  | "REPEATED_WRITES"
  | "RESTORE_ORIGINAL_DURATION";

export interface P009CaseDefinition {
  id: P009CaseId;
  title: string;
  slug: string;
  fixtureName: string;
  targetRole: string;
  operation: P009Operation;
}

export const p009CaseDefinitions = [
  {
    id: "T01",
    title: "No-op duration write",
    slug: "noop-duration-write",
    fixtureName: "T01 - No-op Duration Write",
    targetRole: "timeline-target",
    operation: "NO_OP_DURATION_WRITE"
  },
  {
    id: "T02",
    title: "Extend duration",
    slug: "extend-duration",
    fixtureName: "T02 - Extend Duration",
    targetRole: "timeline-target",
    operation: "EXTEND_DURATION"
  },
  {
    id: "T03",
    title: "Shorten safely",
    slug: "shorten-safely",
    fixtureName: "T03 - Shorten Safely",
    targetRole: "timeline-target",
    operation: "SHORTEN_SAFE"
  },
  {
    id: "T04",
    title: "Shorten below final keyframe",
    slug: "shorten-below-final-keyframe",
    fixtureName: "T04 - Shorten Below Final Keyframe",
    targetRole: "timeline-target",
    operation: "SHORTEN_BELOW_FINAL_KEYFRAME"
  },
  {
    id: "T05",
    title: "Repeated writes",
    slug: "repeated-writes",
    fixtureName: "T05 - Repeated Writes",
    targetRole: "timeline-target",
    operation: "REPEATED_WRITES"
  },
  {
    id: "T06",
    title: "Restore original duration",
    slug: "restore-original-duration",
    fixtureName: "T06 - Restore Original Duration",
    targetRole: "timeline-target",
    operation: "RESTORE_ORIGINAL_DURATION"
  }
] as const satisfies readonly P009CaseDefinition[];

export const getP009CaseDefinition = (id: string): P009CaseDefinition | undefined =>
  p009CaseDefinitions.find((definition) => definition.id === id);

export const p009EvidenceFilename = (runId: string, definition: P009CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
