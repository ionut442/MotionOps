import type { DiagnosticCapability } from "../../shared/diagnostics";

const motionReadProperties = [
  "animationStyles",
  "animations",
  "manualKeyframeTracks",
  "timelines"
] as const;

const motionWriteMethods = [
  "applyAnimationStyle",
  "removeAnimationStyle",
  "applyManualKeyframeTrack",
  "removeManualKeyframeTrack",
  "setTimelineDuration"
] as const;

export interface NodeMotionFeatureSummary {
  readProperties: Record<string, boolean>;
  writeMethods: Record<string, boolean>;
  capabilities: DiagnosticCapability[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

export const detectNodeMotionFeatures = (node: unknown): NodeMotionFeatureSummary => {
  const record = asRecord(node);
  const readProperties = Object.fromEntries(
    motionReadProperties.map((property) => [property, property in record])
  );
  const writeMethods = Object.fromEntries(
    motionWriteMethods.map((method) => [method, typeof record[method] === "function"])
  );

  const capabilities: DiagnosticCapability[] = [
    ...Object.entries(readProperties).map(([name, available]) => ({
      name,
      status: available ? "UNKNOWN" : "UNSUPPORTED",
      summary: available
        ? "Property is present; live read behavior still requires verification."
        : "Property is not present on this node shape."
    }) satisfies DiagnosticCapability),
    ...Object.entries(writeMethods).map(([name, available]) => ({
      name,
      status: available ? "NOT_TESTED" : "UNSUPPORTED",
      summary: available
        ? "Method is present; method availability is not proof that writes succeed."
        : "Method is not present on this node shape."
    }) satisfies DiagnosticCapability)
  ];

  return { readProperties, writeMethods, capabilities };
};
