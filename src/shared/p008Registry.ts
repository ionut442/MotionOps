export type P008CaseId = "S01" | "S02" | "S03" | "S04" | "S05" | "S06";

export type P008Operation =
  | "NO_OP_REAPPLY"
  | "CONFIGURATION_CHANGE"
  | "REPEATED_REAPPLY"
  | "SIBLING_ISOLATION"
  | "RESTORATION"
  | "REMOVE_AND_REAPPLY";

export interface P008CaseDefinition {
  id: P008CaseId;
  title: string;
  slug: string;
  fixtureName: string;
  targetRole: string;
  operation: P008Operation;
  expectedStyleCount: number;
  requiresManualSibling: boolean;
  requiresWritableConfig: boolean;
}

export const p008CaseDefinitions = [
  {
    id: "S01",
    title: "No-op style reapply",
    slug: "noop-reapply",
    fixtureName: "S01 - No-op Style Reapply",
    targetRole: "style-target",
    operation: "NO_OP_REAPPLY",
    expectedStyleCount: 1,
    requiresManualSibling: false,
    requiresWritableConfig: false
  },
  {
    id: "S02",
    title: "Supported configuration change",
    slug: "configuration-change",
    fixtureName: "S02 - Configuration Change",
    targetRole: "style-target",
    operation: "CONFIGURATION_CHANGE",
    expectedStyleCount: 1,
    requiresManualSibling: false,
    requiresWritableConfig: true
  },
  {
    id: "S03",
    title: "Repeated reapply",
    slug: "repeated-reapply",
    fixtureName: "S03 - Repeated Reapply",
    targetRole: "style-target",
    operation: "REPEATED_REAPPLY",
    expectedStyleCount: 1,
    requiresManualSibling: false,
    requiresWritableConfig: false
  },
  {
    id: "S04",
    title: "Sibling isolation",
    slug: "sibling-isolation",
    fixtureName: "S04 - Sibling Isolation",
    targetRole: "style-target",
    operation: "SIBLING_ISOLATION",
    expectedStyleCount: 1,
    requiresManualSibling: true,
    requiresWritableConfig: false
  },
  {
    id: "S05",
    title: "Configuration restoration",
    slug: "restoration",
    fixtureName: "S05 - Restoration",
    targetRole: "style-target",
    operation: "RESTORATION",
    expectedStyleCount: 1,
    requiresManualSibling: false,
    requiresWritableConfig: true
  },
  {
    id: "S06",
    title: "Remove and reapply",
    slug: "remove-and-reapply",
    fixtureName: "S06 - Remove And Reapply",
    targetRole: "style-target",
    operation: "REMOVE_AND_REAPPLY",
    expectedStyleCount: 1,
    requiresManualSibling: false,
    requiresWritableConfig: false
  }
] as const satisfies readonly P008CaseDefinition[];

export const getP008CaseDefinition = (id: string): P008CaseDefinition | undefined =>
  p008CaseDefinitions.find((definition) => definition.id === id);

export const p008EvidenceFilename = (runId: string, definition: P008CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
