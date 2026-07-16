export const FEATURE_IDS = [
  "scope",
  "inspect",
  "edit-timing",
  "edit-easing",
  "copy-paste",
  "sequencer",
  "stagger",
  "standards",
  "qa",
  "safe-fixes",
  "handoff",
  "help"
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export interface FeatureAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

export interface FeatureGate {
  get(featureId: string): FeatureAvailability;
}

export type FeatureOverrides = Partial<Record<FeatureId, FeatureAvailability>>;

const knownFeatures = new Set<string>(FEATURE_IDS);

export const createFeatureGate = (overrides: FeatureOverrides = {}): FeatureGate => ({
  get(featureId: string): FeatureAvailability {
    if (!knownFeatures.has(featureId)) {
      return { available: false, reason: "Unknown feature." };
    }
    return overrides[featureId as FeatureId] ?? { available: true };
  }
});

export const defaultFeatureGate = createFeatureGate();
