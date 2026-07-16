export type P007CaseId = "W01" | "W02" | "W03" | "W04" | "W05" | "W06" | "W07" | "W08";

export type P007Operation =
  | "NO_OP_ROUND_TRIP"
  | "TIMING_MODIFICATION"
  | "VALUE_MODIFICATION"
  | "EASING_MODIFICATION"
  | "MULTI_KEYFRAME_PRESERVATION"
  | "SIBLING_TRACK_ISOLATION"
  | "REPEATED_REPLACEMENT"
  | "RESTORE_ORIGINAL";

export interface P007CaseDefinition {
  id: P007CaseId;
  title: string;
  slug: string;
  fixtureName: string;
  targetRole: string;
  propertyName: "OPACITY" | "TRANSLATION_X";
  operation: P007Operation;
  expectedMinKeyframes: number;
  requiresSiblingTrack: boolean;
}

export const p007CaseDefinitions = [
  {
    id: "W01",
    title: "Complete no-op round trip",
    slug: "noop-round-trip",
    fixtureName: "W01 - No-op Round Trip",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "NO_OP_ROUND_TRIP",
    expectedMinKeyframes: 2,
    requiresSiblingTrack: false
  },
  {
    id: "W02",
    title: "Timing modification with IDs preserved",
    slug: "timing-modification",
    fixtureName: "W02 - Timing Modification",
    targetRole: "write-target",
    propertyName: "TRANSLATION_X",
    operation: "TIMING_MODIFICATION",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: false
  },
  {
    id: "W03",
    title: "Value modification with IDs preserved",
    slug: "value-modification",
    fixtureName: "W03 - Value Modification",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "VALUE_MODIFICATION",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: false
  },
  {
    id: "W04",
    title: "Easing modification with IDs preserved",
    slug: "easing-modification",
    fixtureName: "W04 - Easing Modification",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "EASING_MODIFICATION",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: false
  },
  {
    id: "W05",
    title: "Multi-keyframe preservation",
    slug: "multi-keyframe-preservation",
    fixtureName: "W05 - Multi-keyframe Preservation",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "MULTI_KEYFRAME_PRESERVATION",
    expectedMinKeyframes: 4,
    requiresSiblingTrack: false
  },
  {
    id: "W06",
    title: "Sibling-track isolation",
    slug: "sibling-track-isolation",
    fixtureName: "W06 - Sibling-track Isolation",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "SIBLING_TRACK_ISOLATION",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: true
  },
  {
    id: "W07",
    title: "Repeated replacement without duplication",
    slug: "repeated-replacement",
    fixtureName: "W07 - Repeated Replacement",
    targetRole: "write-target",
    propertyName: "TRANSLATION_X",
    operation: "REPEATED_REPLACEMENT",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: false
  },
  {
    id: "W08",
    title: "Restore original payload",
    slug: "restore-original-payload",
    fixtureName: "W08 - Restore Original Payload",
    targetRole: "write-target",
    propertyName: "OPACITY",
    operation: "RESTORE_ORIGINAL",
    expectedMinKeyframes: 3,
    requiresSiblingTrack: false
  }
] as const satisfies readonly P007CaseDefinition[];

export const getP007CaseDefinition = (id: string): P007CaseDefinition | undefined =>
  p007CaseDefinitions.find((definition) => definition.id === id);

export const p007EvidenceFilename = (runId: string, definition: P007CaseDefinition): string =>
  `${runId}-${definition.id}-${definition.slug}.json`;
