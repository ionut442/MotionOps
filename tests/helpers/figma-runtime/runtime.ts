import { clone, type RawManualTrack, type RawMotionNode, type RawStyleInstance, type RawTimeline } from "./motion-builders";

export type RuntimeCallKind =
  | "get-node"
  | "load-page"
  | "apply-manual-track"
  | "remove-style"
  | "apply-style"
  | "set-timeline-duration"
  | "set-properties";

export interface RuntimeCallRecord {
  kind: RuntimeCallKind;
  sequence: number;
  nodeId?: string;
  entityId?: string;
  success: boolean;
  counts?: Readonly<Record<string, number>>;
}

export type RuntimeFailureStage =
  | "api-unavailable"
  | "page-load"
  | "node-lookup"
  | "manual-track-write"
  | "style-removal"
  | "style-reapply"
  | "timeline-write"
  | "component-property-write"
  | "post-write-read";

export interface RuntimeFailureConfig {
  stage: RuntimeFailureStage;
  nodeId?: string;
  once?: boolean;
  message?: string;
}

export interface FigmaRuntimeOptions {
  loaded?: boolean;
  freshWrappers?: boolean;
  invalidateWrappersAfterWrite?: boolean;
  regenerateManualKeyframeIds?: boolean;
  regenerateAppliedStyleInstanceId?: boolean;
  duplicateStyleApplications?: boolean;
  failures?: RuntimeFailureConfig[];
}

interface StoredNode {
  raw: RawMotionNode;
  version: number;
  removed: boolean;
}

export interface RuntimeFigmaGlobal {
  getNodeByIdAsync(nodeId: string): Promise<unknown>;
  loadAllPagesAsync(): Promise<void>;
}

export class FigmaRuntime {
  private readonly nodes = new Map<string, StoredNode>();
  private readonly calls: RuntimeCallRecord[] = [];
  private readonly failures: RuntimeFailureConfig[];
  private sequence = 0;
  private loaded: boolean;

  constructor(nodes: RawMotionNode[] = [], private readonly options: FigmaRuntimeOptions = {}) {
    this.loaded = options.loaded ?? true;
    this.failures = [...(options.failures ?? [])];
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  addNode(node: RawMotionNode): void {
    this.nodes.set(node.id, { raw: clone(node), version: 0, removed: false });
  }

  replaceNode(nodeId: string, node: RawMotionNode): void {
    this.nodes.set(nodeId, { raw: clone({ ...node, id: nodeId }), version: 0, removed: false });
  }

  removeNode(nodeId: string): void {
    const stored = this.nodes.get(nodeId);
    if (stored) {
      stored.removed = true;
      stored.version += 1;
    }
  }

  setLoaded(loaded: boolean): void {
    this.loaded = loaded;
  }

  createGlobal(): RuntimeFigmaGlobal {
    return {
      getNodeByIdAsync: async (nodeId: string): Promise<unknown> => this.getNodeByIdAsync(nodeId),
      loadAllPagesAsync: async (): Promise<void> => this.loadAllPagesAsync()
    };
  }

  install(): RuntimeFigmaGlobal {
    const figma = this.createGlobal();
    Object.defineProperty(globalThis, "figma", { value: figma, configurable: true });
    return figma;
  }

  uninstall(): void {
    Reflect.deleteProperty(globalThis, "figma");
  }

  history(): RuntimeCallRecord[] {
    return this.calls.map((call) => ({ ...call, counts: call.counts ? { ...call.counts } : undefined }));
  }

  rawNode(nodeId: string): RawMotionNode | null {
    const stored = this.nodes.get(nodeId);
    return stored && !stored.removed ? clone(stored.raw) : null;
  }

  async loadAllPagesAsync(): Promise<void> {
    await Promise.resolve();
    const failure = this.consumeFailure("page-load");
    if (failure) {
      this.record("load-page", false);
      throw new Error(failure.message ?? "Page load failed under dynamic-page.");
    }
    this.loaded = true;
    this.record("load-page", true);
  }

  async getNodeByIdAsync(nodeId: string): Promise<unknown> {
    await Promise.resolve();
    const apiFailure = this.consumeFailure("api-unavailable", nodeId);
    if (apiFailure) {
      this.record("get-node", false, nodeId);
      throw new Error(apiFailure.message ?? "figma is undefined");
    }
    if (!this.loaded) {
      this.record("get-node", false, nodeId);
      throw new Error("Page not loaded under dynamic-page.");
    }
    const lookupFailure = this.consumeFailure("node-lookup", nodeId);
    if (lookupFailure) {
      this.record("get-node", false, nodeId);
      throw new Error(lookupFailure.message ?? "Node lookup failed.");
    }
    const stored = this.nodes.get(nodeId);
    const success = stored !== undefined && !stored.removed;
    this.record("get-node", success, nodeId);
    return success ? this.wrapNode(nodeId, stored) : null;
  }

  private wrapNode(nodeId: string, stored: StoredNode): RawMotionNode {
    const wrapper = clone(stored.raw);
    let wrapperVersion = stored.version;
    const assertCurrent = (): void => {
      if ((this.options.invalidateWrappersAfterWrite ?? true) && wrapperVersion !== stored.version) {
        throw new Error("Stale Figma node wrapper invalidated after write.");
      }
    };
    const mutate = (stage: RuntimeFailureStage, mutation: () => void, entityId?: string, counts?: RuntimeCallRecord["counts"]): void => {
      assertCurrent();
      const failure = this.consumeFailure(stage, nodeId);
      if (failure) {
        this.record(callKindForFailure(stage), false, nodeId, entityId, counts);
        throw new Error(failure.message ?? `${stage} failed.`);
      }
      mutation();
      stored.version += 1;
      wrapperVersion = stored.version;
      this.record(callKindForFailure(stage), true, nodeId, entityId, counts);
    };

    return Object.assign(wrapper, {
      applyManualKeyframeTrack: (_target: unknown, track: RawManualTrack) => {
        mutate(
          "manual-track-write",
          () => {
            const target = asPropertyTarget(_target);
            const property = target?.name ?? "UNKNOWN";
            const nextTrack = clone(track);
            if (this.options.regenerateManualKeyframeIds) {
              nextTrack.keyframes = (nextTrack.keyframes ?? []).map((keyframe, index) => ({ ...keyframe, id: `${property}-regen-${String(index + 1)}` }));
            }
            stored.raw.manualKeyframeTracks = { ...(stored.raw.manualKeyframeTracks ?? {}), [property]: nextTrack };
          },
          asPropertyTarget(_target)?.name,
          { keyframeCount: Array.isArray(track.keyframes) ? track.keyframes.length : 0 }
        );
      },
      removeAnimationStyle: (appliedStyleInstanceId: string) => {
        mutate(
          "style-removal",
          () => {
            stored.raw.animationStyles = (stored.raw.animationStyles ?? []).filter((style) => style.id !== appliedStyleInstanceId);
          },
          appliedStyleInstanceId,
          { styleInstanceCount: stored.raw.animationStyles?.length ?? 0 }
        );
      },
      applyAnimationStyle: (availableAnimationStyleId: string) => {
        mutate(
          "style-reapply",
          () => {
            const existing = stored.raw.animationStyles ?? [];
            const id = this.options.regenerateAppliedStyleInstanceId ? `${availableAnimationStyleId}-applied-${String(stored.version + 1)}` : availableAnimationStyleId;
            const next: RawStyleInstance = { id, styleId: availableAnimationStyleId, name: availableAnimationStyleId };
            stored.raw.animationStyles = this.options.duplicateStyleApplications ? [...existing, next] : [...existing.filter((style) => style.styleId !== availableAnimationStyleId), next];
          },
          availableAnimationStyleId,
          { styleInstanceCount: stored.raw.animationStyles?.length ?? 0 }
        );
      },
      setTimelineDuration: (timelineId: string, duration: number) => {
        mutate(
          "timeline-write",
          () => {
            stored.raw.timelines = (stored.raw.timelines ?? []).map((timeline): RawTimeline => (timeline.id === timelineId ? { ...timeline, duration } : timeline));
            stored.raw.animations = updateDerivedDuration(stored.raw.animations, duration);
            if (this.consumeFailure("post-write-read", nodeId) !== null) {
              stored.removed = true;
            }
          },
          timelineId,
          { timelineCount: stored.raw.timelines?.length ?? 0 }
        );
      },
      setProperties: (values: Record<string, unknown>) => {
        const keys = Object.keys(values);
        mutate(
          "component-property-write",
          () => {
            const current = { ...(stored.raw.componentProperties ?? {}) };
            for (const key of keys) {
              current[key] = { ...current[key], value: values[key] };
            }
            stored.raw.componentProperties = current;
          },
          keys[0],
          { propertyCount: keys.length }
        );
      }
    });
  }

  private consumeFailure(stage: RuntimeFailureStage, nodeId?: string): RuntimeFailureConfig | null {
    const index = this.failures.findIndex((failure) => failure.stage === stage && (failure.nodeId === undefined || failure.nodeId === nodeId));
    if (index === -1) {
      return null;
    }
    const failure = this.failures[index];
    if (failure.once !== false) {
      this.failures.splice(index, 1);
    }
    return failure;
  }

  private record(kind: RuntimeCallKind, success: boolean, nodeId?: string, entityId?: string, counts?: RuntimeCallRecord["counts"]): void {
    this.sequence += 1;
    this.calls.push({ kind, sequence: this.sequence, nodeId, entityId, success, counts });
  }
}

export const withFigmaRuntime = async <T>(runtime: FigmaRuntime, run: () => T | Promise<T>): Promise<T> => {
  runtime.install();
  try {
    return await run();
  } finally {
    runtime.uninstall();
  }
};

const asPropertyTarget = (value: unknown): { name?: string } | null =>
  typeof value === "object" && value !== null && "name" in value ? (value as { name?: string }) : null;

const updateDerivedDuration = (animations: RawMotionNode["animations"], duration: number): RawMotionNode["animations"] => {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(animations ?? {})) {
    output[key] = typeof value === "object" && value !== null ? { ...(value as Record<string, unknown>), timelineDuration: duration } : value;
  }
  return output;
};

const callKindForFailure = (stage: RuntimeFailureStage): RuntimeCallKind => {
  switch (stage) {
    case "page-load":
      return "load-page";
    case "api-unavailable":
    case "node-lookup":
    case "post-write-read":
      return "get-node";
    case "manual-track-write":
      return "apply-manual-track";
    case "style-removal":
      return "remove-style";
    case "style-reapply":
      return "apply-style";
    case "timeline-write":
      return "set-timeline-duration";
    case "component-property-write":
      return "set-properties";
    default:
      return assertNever(stage);
  }
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled runtime stage: ${String(value)}`);
};
