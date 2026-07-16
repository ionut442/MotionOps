import type { CapabilityStatus } from "./types";

export type MotionPropertyId =
  | "OPACITY"
  | "TRANSLATION_X"
  | "TRANSLATION_Y"
  | "ROTATION"
  | "SCALE_X"
  | "SCALE_Y"
  | "WIDTH"
  | "HEIGHT"
  | "CORNER_RADIUS"
  | "STROKE_WEIGHT"
  | "PATH_TRIM"
  | "UNKNOWN";

export interface MotionPropertyCapability {
  id: MotionPropertyId;
  labels: readonly string[];
  sourceTypes: readonly string[];
  destinationNodeTypes: readonly string[];
  copy: CapabilityStatus;
  paste: CapabilityStatus;
  mergeBehavior: "replace-track" | "add-if-missing" | "read-only";
  valueRequirement: "scalar-number" | "geometry-number" | "unknown";
  requires: readonly string[];
  restrictions: readonly string[];
  evidence: string;
}

function writable(id: Exclude<MotionPropertyId, "UNKNOWN">, labels: readonly string[], evidence: string): MotionPropertyCapability {
  return {
    id,
    labels,
    sourceTypes: ["manual"],
    destinationNodeTypes: ["RECTANGLE", "FRAME", "COMPONENT", "INSTANCE", "GROUP", "VECTOR"],
    copy: "supported",
    paste: "supported-with-warning",
    mergeBehavior: "replace-track",
    valueRequirement: "scalar-number",
    requires: ["manual track replacement writer", "current destination manual track for stale guard"],
    restrictions: ["Style sources remain read-only.", "Live paste matrix remains blocked until P5-019."],
    evidence
  };
}

function cautious(id: Exclude<MotionPropertyId, "UNKNOWN">, labels: readonly string[], evidence: string): MotionPropertyCapability {
  return {
    id,
    labels,
    sourceTypes: ["manual"],
    destinationNodeTypes: [],
    copy: "supported-with-warning",
    paste: "read-only",
    mergeBehavior: "read-only",
    valueRequirement: "geometry-number",
    requires: ["P5-019 live verification"],
    restrictions: ["Readable data alone does not prove write support."],
    evidence
  };
}

export const motionPropertyRegistry: readonly MotionPropertyCapability[] = [
  writable("OPACITY", ["OPACITY", "Opacity"], "P0-006/P0-007 manual-track read and replacement evidence"),
  writable("TRANSLATION_X", ["TRANSLATION_X", "Translation X"], "P0-006/P0-007 manual-track read and replacement evidence"),
  writable("TRANSLATION_Y", ["TRANSLATION_Y", "Translation Y"], "P0-006/P0-007 manual-track read and replacement evidence"),
  writable("ROTATION", ["ROTATION", "Rotation"], "P0-006/P0-007 manual-track read and replacement evidence"),
  writable("SCALE_X", ["SCALE_X", "Scale X"], "P0-006/P0-007 manual-track read and replacement evidence"),
  writable("SCALE_Y", ["SCALE_Y", "Scale Y"], "P0-006/P0-007 manual-track read and replacement evidence"),
  cautious("WIDTH", ["WIDTH", "Width"], "Geometry write support still requires P5-019 live verification"),
  cautious("HEIGHT", ["HEIGHT", "Height"], "Geometry write support still requires P5-019 live verification"),
  cautious("CORNER_RADIUS", ["CORNER_RADIUS", "Corner radius"], "Corner radius write support still requires P5-019 live verification"),
  cautious("STROKE_WEIGHT", ["STROKE_WEIGHT", "Stroke weight"], "Stroke weight write support still requires P5-019 live verification"),
  cautious("PATH_TRIM", ["PATH_TRIM", "Path trim"], "Path trim write support still requires P5-019 live verification")
];

export const canonicalMotionPropertyId = (property: string): MotionPropertyId => {
  const normalized = property.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return motionPropertyRegistry.find((entry) => entry.labels.map((label) => label.toUpperCase().replace(/[\s-]+/g, "_")).includes(normalized))?.id ?? "UNKNOWN";
};

export const propertyCapabilityFor = (property: string): MotionPropertyCapability => {
  const id = canonicalMotionPropertyId(property);
  return motionPropertyRegistry.find((entry) => entry.id === id) ?? {
    id: "UNKNOWN",
    labels: [property],
    sourceTypes: ["manual"],
    destinationNodeTypes: [],
    copy: "supported-with-warning",
    paste: "read-only",
    mergeBehavior: "read-only",
    valueRequirement: "unknown",
    requires: [],
    restrictions: ["Unknown properties remain explicit and unsupported for paste."],
    evidence: "No live or automated capability evidence."
  };
};
