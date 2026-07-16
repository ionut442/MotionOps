export type P011CaseId =
  | "C01"
  | "C02"
  | "C03"
  | "C04"
  | "C05"
  | "C06"
  | "C07"
  | "C08"
  | "C09"
  | "C10"
  | "C11"
  | "C12";

export type P011NodeCategory =
  | "control-frame-child"
  | "main-component-root"
  | "main-component-child"
  | "component-set-container"
  | "variant-component"
  | "direct-instance-root"
  | "direct-instance-descendant"
  | "nested-instance-root"
  | "nested-instance-descendant"
  | "sibling-instance-isolation"
  | "style-by-category"
  | "undo-boundary";

export type P011CapabilityAttempt =
  | "read-motion"
  | "replace-manual-track"
  | "remove-reapply-style"
  | "write-timeline-duration"
  | "verify-isolation"
  | "verify-linkage"
  | "verify-undo";

export interface P011CaseDefinition {
  id: P011CaseId;
  title: string;
  slug: string;
  category: P011NodeCategory;
  targetRole: string;
  attempts: readonly P011CapabilityAttempt[];
}

export const p011CaseDefinitions = [
  {
    id: "C01",
    title: "Control frame baseline",
    slug: "control-frame-baseline",
    category: "control-frame-child",
    targetRole: "control-child",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-isolation", "verify-undo"]
  },
  {
    id: "C02",
    title: "Main component root",
    slug: "main-component-root",
    category: "main-component-root",
    targetRole: "simple-component",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "remove-reapply-style", "verify-linkage"]
  },
  {
    id: "C03",
    title: "Child inside main component",
    slug: "main-component-child",
    category: "main-component-child",
    targetRole: "simple-component-child",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C04",
    title: "Component-set container",
    slug: "component-set-container",
    category: "component-set-container",
    targetRole: "component-set",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-linkage"]
  },
  {
    id: "C05",
    title: "Variant component inside component set",
    slug: "variant-component",
    category: "variant-component",
    targetRole: "variant-a",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "remove-reapply-style", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C06",
    title: "Direct instance root",
    slug: "direct-instance-root",
    category: "direct-instance-root",
    targetRole: "direct-instance-a",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "remove-reapply-style", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C07",
    title: "Descendant inside direct instance",
    slug: "direct-instance-descendant",
    category: "direct-instance-descendant",
    targetRole: "direct-instance-a-child",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C08",
    title: "Nested instance root",
    slug: "nested-instance-root",
    category: "nested-instance-root",
    targetRole: "nested-inner-instance",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C09",
    title: "Descendant inside nested instance",
    slug: "nested-instance-descendant",
    category: "nested-instance-descendant",
    targetRole: "nested-inner-instance-child",
    attempts: ["read-motion", "replace-manual-track", "write-timeline-duration", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C10",
    title: "Source and sibling isolation",
    slug: "source-sibling-isolation",
    category: "sibling-instance-isolation",
    targetRole: "direct-instance-a",
    attempts: ["replace-manual-track", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C11",
    title: "Safe style path by node category",
    slug: "safe-style-path-by-category",
    category: "style-by-category",
    targetRole: "style-target",
    attempts: ["read-motion", "remove-reapply-style", "verify-isolation", "verify-linkage"]
  },
  {
    id: "C12",
    title: "Restoration and undo boundary",
    slug: "restoration-undo-boundary",
    category: "undo-boundary",
    targetRole: "control-child",
    attempts: ["replace-manual-track", "verify-undo", "verify-isolation"]
  }
] as const satisfies readonly P011CaseDefinition[];

export const getP011CaseDefinition = (id: string): P011CaseDefinition | undefined =>
  p011CaseDefinitions.find((definition) => definition.id === id);

export const p011EvidenceFilename = (runId: string, definition: P011CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
