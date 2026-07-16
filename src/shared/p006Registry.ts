import type { MotionDiagnosticCommand } from "./diagnostics";

export type P006TestId =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R06"
  | "R07"
  | "R08"
  | "R09"
  | "R10";

export type P006FixtureBuilderId =
  | "no-motion"
  | "manual-opacity"
  | "manual-multi-property"
  | "native-style"
  | "mixed-style-manual"
  | "parent-children"
  | "auto-layout-stagger"
  | "extended-timeline"
  | "mixed-multi-selection";

export interface P006SelectionDefinition {
  id: string;
  title: string;
  roles: readonly string[];
}

export interface P006TestDefinition {
  id: P006TestId;
  title: string;
  slug: string;
  fixtureName: string;
  description: string;
  fixtureBuilder: P006FixtureBuilderId | null;
  selections: readonly P006SelectionDefinition[];
  commands: readonly MotionDiagnosticCommand[];
}

export const p006ReadCommands = [
  "READ_CURRENT_SELECTION",
  "READ_MOTION_DATA",
  "READ_MANUAL_TRACKS",
  "READ_ANIMATION_STYLES",
  "READ_DERIVED_ANIMATIONS",
  "READ_TIMELINES"
] as const satisfies readonly MotionDiagnosticCommand[];

export const p006MotionReadCommands = [
  "READ_MOTION_DATA",
  "READ_MANUAL_TRACKS",
  "READ_ANIMATION_STYLES",
  "READ_DERIVED_ANIMATIONS",
  "READ_TIMELINES"
] as const satisfies readonly MotionDiagnosticCommand[];

export const p006TestDefinitions = [
  {
    id: "R01",
    title: "Empty Selection",
    slug: "empty-selection",
    fixtureName: "",
    description: "Clears selection and reads environment plus empty selection behavior.",
    fixtureBuilder: null,
    selections: [{ id: "empty-selection", title: "Empty selection", roles: [] }],
    commands: ["GET_ENVIRONMENT", "READ_CURRENT_SELECTION", "READ_MOTION_DATA"]
  },
  {
    id: "R02",
    title: "No Motion",
    slug: "no-motion",
    fixtureName: "R02 - No Motion",
    description: "Plain rectangle with no manual tracks and no native style.",
    fixtureBuilder: "no-motion",
    selections: [{ id: "no-motion", title: "No-motion rectangle", roles: ["animated-target"] }],
    commands: p006ReadCommands
  },
  {
    id: "R03",
    title: "Manual Opacity",
    slug: "generated-opacity",
    fixtureName: "R03 - Manual Opacity",
    description: "Generated opacity track baseline, separate from manual R03 evidence.",
    fixtureBuilder: "manual-opacity",
    selections: [{ id: "generated-opacity", title: "Generated opacity rectangle", roles: ["animated-target"] }],
    commands: p006ReadCommands
  },
  {
    id: "R04",
    title: "Manual Multi-Property",
    slug: "multi-property",
    fixtureName: "R04 - Manual Multi-Property",
    description: "Translation, scale, and rotation manual tracks with an intermediate keyframe.",
    fixtureBuilder: "manual-multi-property",
    selections: [{ id: "multi-property", title: "Multi-property rectangle", roles: ["animated-target"] }],
    commands: p006ReadCommands
  },
  {
    id: "R05",
    title: "Native Animation Style",
    slug: "native-style",
    fixtureName: "R05 - Native Animation Style",
    description: "Applies one available native Motion animation style when Figma exposes one.",
    fixtureBuilder: "native-style",
    selections: [{ id: "native-style", title: "Native style rectangle", roles: ["animated-target"] }],
    commands: ["READ_ANIMATION_STYLES", "READ_DERIVED_ANIMATIONS", "READ_MOTION_DATA", "READ_TIMELINES"]
  },
  {
    id: "R06",
    title: "Mixed Style and Manual",
    slug: "mixed-style-manual",
    fixtureName: "R06 - Mixed Style and Manual",
    description: "Attempts native style plus non-overlapping manual translation.",
    fixtureBuilder: "mixed-style-manual",
    selections: [{ id: "mixed-style-manual", title: "Mixed style/manual rectangle", roles: ["animated-target"] }],
    commands: p006ReadCommands
  },
  {
    id: "R07",
    title: "Parent and Children",
    slug: "parent-children",
    fixtureName: "R07 - Parent and Children",
    description: "Animated parent, animated child, and static children.",
    fixtureBuilder: "parent-children",
    selections: [
      { id: "parent-only", title: "Parent explicit target", roles: ["animated-parent"] },
      { id: "child-only", title: "Animated child explicit target", roles: ["animated-child"] },
      { id: "parent-and-child-explicit-targets", title: "Parent and child explicit targets", roles: ["animated-parent", "animated-child"] }
    ],
    commands: p006MotionReadCommands
  },
  {
    id: "R08",
    title: "Auto-Layout Stagger",
    slug: "auto-layout-stagger",
    fixtureName: "R08 - Auto-Layout Stagger",
    description: "Three direct children with staggered opacity and translation tracks.",
    fixtureBuilder: "auto-layout-stagger",
    selections: [
      { id: "parent-selected", title: "Auto-layout parent selected", roles: ["auto-layout-parent"] },
      { id: "children-selected", title: "All children selected", roles: ["stagger-child-1", "stagger-child-2", "stagger-child-3"] },
      { id: "child-1-selected", title: "Child 1 selected", roles: ["stagger-child-1"] },
      { id: "child-2-selected", title: "Child 2 selected", roles: ["stagger-child-2"] },
      { id: "child-3-selected", title: "Child 3 selected", roles: ["stagger-child-3"] }
    ],
    commands: p006MotionReadCommands
  },
  {
    id: "R09",
    title: "Extended Timeline",
    slug: "extended-timeline",
    fixtureName: "R09 - Extended Timeline",
    description: "Manual opacity ending at 0.5s with timeline duration set to 1s when available.",
    fixtureBuilder: "extended-timeline",
    selections: [{ id: "extended-timeline", title: "Extended timeline rectangle", roles: ["animated-target"] }],
    commands: ["READ_TIMELINES", "READ_MOTION_DATA", "READ_MANUAL_TRACKS"]
  },
  {
    id: "R10",
    title: "Mixed Multi-Selection",
    slug: "mixed-selection",
    fixtureName: "R10 - Mixed Multi-Selection",
    description: "Manual, native-style, and no-motion nodes selected together.",
    fixtureBuilder: "mixed-multi-selection",
    selections: [{ id: "mixed-selection", title: "Manual/style/no-motion selected", roles: ["manual-node", "style-node", "no-motion-node"] }],
    commands: p006ReadCommands
  }
] as const satisfies readonly P006TestDefinition[];

const commandSlugByCommand = {
  GET_ENVIRONMENT: "get-environment",
  READ_CURRENT_SELECTION: "read-current-selection",
  READ_MOTION_DATA: "read-motion-data",
  READ_MANUAL_TRACKS: "read-manual-tracks",
  READ_ANIMATION_STYLES: "read-animation-styles",
  READ_DERIVED_ANIMATIONS: "read-derived-animations",
  READ_TIMELINES: "read-timelines",
  VERIFY_EXPLICIT_TARGET_PIPELINE: "verify-explicit-target-pipeline",
  CREATE_DISPOSABLE_FIXTURE: "create-disposable-fixture",
  CLEAR_DISPOSABLE_FIXTURE: "clear-disposable-fixture",
  EXPORT_LAST_RESULT: "export-last-result"
} as const satisfies Record<MotionDiagnosticCommand, string>;

export const getP006TestDefinition = (id: string): P006TestDefinition | undefined =>
  p006TestDefinitions.find((definition) => definition.id === id);

export const p006EvidenceFilename = (
  test: Pick<P006TestDefinition, "id" | "slug">,
  subcaseId: string,
  command: MotionDiagnosticCommand
): string => {
  const subcaseSlug = subcaseId === test.slug ? test.slug : subcaseId;
  return `${test.id}-${subcaseSlug}-${commandSlugByCommand[command]}.json`;
};

export const p006ExpectedFiles = (test: P006TestDefinition): string[] =>
  test.selections.flatMap((selection) =>
    test.commands.map((command) => p006EvidenceFilename(test, selection.id, command))
  );
