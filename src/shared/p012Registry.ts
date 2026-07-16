export type P012CaseId =
  | "CP01"
  | "CP02"
  | "CP03"
  | "CP04"
  | "CP05"
  | "CP06"
  | "CP07"
  | "CP08"
  | "CP09"
  | "CP10";

export type P012PropertyKind = "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" | "VARIANT" | "UNSUPPORTED";

export interface P012CaseDefinition {
  id: P012CaseId;
  title: string;
  slug: string;
  propertyKind: P012PropertyKind;
  goal: string;
}

export const p012CaseDefinitions = [
  {
    id: "CP01",
    title: "Discover exposed component-property definitions",
    slug: "discover-definitions",
    propertyKind: "UNSUPPORTED",
    goal: "Read source component and component-set definitions, IDs, defaults, and options."
  },
  {
    id: "CP02",
    title: "Read instance component-property state",
    slug: "read-instance-state",
    propertyKind: "UNSUPPORTED",
    goal: "Read target and sibling instance values, linkage, and override state."
  },
  {
    id: "CP03",
    title: "Boolean property Motion discovery",
    slug: "boolean-motion-discovery",
    propertyKind: "BOOLEAN",
    goal: "Identify whether boolean component-property changes appear in Motion tracks."
  },
  {
    id: "CP04",
    title: "Text property Motion discovery",
    slug: "text-motion-discovery",
    propertyKind: "TEXT",
    goal: "Identify readable text property representation and value shape."
  },
  {
    id: "CP05",
    title: "Instance-swap property Motion discovery",
    slug: "instance-swap-motion-discovery",
    propertyKind: "INSTANCE_SWAP",
    goal: "Identify referenced component identity and whether it is stable."
  },
  {
    id: "CP06",
    title: "Variant-property Motion discovery",
    slug: "variant-motion-discovery",
    propertyKind: "VARIANT",
    goal: "Determine whether variant changes appear as property tracks or instance changes."
  },
  {
    id: "CP07",
    title: "Write probe on component-property track",
    slug: "write-probe",
    propertyKind: "BOOLEAN",
    goal: "Perform the smallest writable property change only when a real target exists."
  },
  {
    id: "CP08",
    title: "Unsupported and read-only classification",
    slug: "unsupported-read-only-classification",
    propertyKind: "UNSUPPORTED",
    goal: "Classify absent, read-only, or unsupported component-property Motion tracks conclusively."
  },
  {
    id: "CP09",
    title: "Undo behavior for property write",
    slug: "undo-behavior",
    propertyKind: "BOOLEAN",
    goal: "Use commitUndo before a property write and verify one Undo restores semantic state."
  },
  {
    id: "CP10",
    title: "Cross-node isolation",
    slug: "cross-node-isolation",
    propertyKind: "BOOLEAN",
    goal: "Verify target writes do not mutate source, sibling, nested, or unrelated Motion data."
  }
] as const satisfies readonly P012CaseDefinition[];

export const getP012CaseDefinition = (id: string): P012CaseDefinition | undefined =>
  p012CaseDefinitions.find((definition) => definition.id === id);

export const p012EvidenceFilename = (runId: string, definition: P012CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
