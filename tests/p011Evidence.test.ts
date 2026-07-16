import { describe, expect, it } from "vitest";
import {
  classifyP011Capabilities,
  classifyP011Terminal,
  createP011RunManifest,
  stableFingerprint,
  type P011MotionSnapshot,
  type P011MutationAttempt,
  type P011RunResult
} from "../src/shared/p011Evidence";
import { p011CaseDefinitions, p011EvidenceFilename } from "../src/shared/p011Registry";

const snapshot = (fingerprintSeed: string): P011MotionSnapshot => ({
  nodeId: `node-${fingerprintSeed}`,
  nodeName: `Node ${fingerprintSeed}`,
  nodeType: "RECTANGLE",
  role: "control-child",
  manualKeyframeTracks: { OPACITY: { keyframes: [{ timelinePosition: 0, value: { type: "FLOAT", value: 0.2 } }] } },
  animationStyles: [],
  timelines: [{ id: "timeline-1", duration: 1.2 }],
  derivedAnimations: { OPACITY: { timelineDuration: 1.2 } },
  overrides: [],
  mainComponentId: null,
  componentSetId: null,
  componentPropertyReferences: null,
  children: [],
  fingerprint: stableFingerprint({ fingerprintSeed })
});

const attempt = (accepted: boolean, changed: boolean): P011MutationAttempt => ({
  capability: "replace-manual-track",
  attempted: true,
  accepted,
  rejected: !accepted,
  error: accepted ? null : { code: "P011_WRITE_REJECTED", message: "Rejected", path: "replace-manual-track" },
  beforeFingerprint: "before",
  afterFingerprint: changed ? "after" : "before",
  changed,
  semanticEqualToBefore: !changed,
  plannedMutation: { property: "OPACITY" }
});

describe("P0-011 evidence helpers", () => {
  it("creates deterministic C01-C12 matrix and filenames", () => {
    expect(p011CaseDefinitions.map((definition) => definition.id)).toEqual([
      "C01",
      "C02",
      "C03",
      "C04",
      "C05",
      "C06",
      "C07",
      "C08",
      "C09",
      "C10",
      "C11",
      "C12"
    ]);
    expect(p011EvidenceFilename("p011-test-abcdef", p011CaseDefinitions[0])).toBe(
      "p011-test-abcdef-C01-control-frame-baseline.json"
    );
  });

  it("classifies accepted changed manual write as supported", () => {
    const capabilities = classifyP011Capabilities(
      snapshot("before"),
      snapshot("after"),
      null,
      [attempt(true, true)],
      true,
      true,
      true,
      false,
      "direct-instance-root"
    );
    expect(capabilities.replaceManualTracks).toBe("supported");
    expect(capabilities.preserveSourceComponent).toBe("supported");
    expect(capabilities.preserveSiblingInstances).toBe("supported");
    expect(capabilities.createLocalOverride).toBe("unsupported");
  });

  it("classifies rejected writes as read-only terminal evidence", () => {
    const terminal = classifyP011Terminal([attempt(false, false)], [{ code: "P011_WRITE_REJECTED", message: "Rejected" }], [], true);
    expect(terminal.status).toBe("READ_ONLY");
    expect(terminal.terminalClassification).toBe("READ_ONLY");
  });

  it("marks mixed manifests accepted when cases terminate conclusively", () => {
    const baseRecord = {
      evidenceSchemaVersion: 1 as const,
      runId: "p011-test-abcdef",
      caseId: "C01" as const,
      targetProvenance: { mode: "EXPLICIT_NODE_IDS" as const, requestedNodeIds: [], resolvedNodeIds: [], failedNodeIds: [], fixtureRootId: null, targetRole: "control-child", targetRolePath: [], ambiguous: false },
      nodeId: "1",
      nodeType: "RECTANGLE",
      ancestorNodeTypes: [],
      sourceComponentId: null,
      componentSetId: null,
      variantRelationship: {},
      outerInstanceId: null,
      innerInstanceId: null,
      targetRole: "control-child",
      nodeCategory: "control-frame-child" as const,
      sourceTypesVisible: { derivedAnimations: true, manualTracks: true, styleInstances: false, timelines: true },
      apiContract: { typingsPackage: "@figma/plugin-typings" as const, typingsVersion: "1.130.0", componentApis: [], instanceApis: [], runtimeCaveat: "" },
      capabilityAttempts: [],
      stateBefore: null,
      stateAfter: null,
      restoredState: null,
      manualTrackFingerprints: [],
      styleInstanceFingerprints: [],
      timelineFingerprints: [],
      derivedAnimationFingerprints: [],
      sourceComponentFingerprints: { before: null, after: null, unchanged: null },
      siblingInstanceFingerprints: { before: null, after: null, unchanged: null },
      overrideState: { before: null, after: null, createdOrChanged: null },
      componentLinkageState: { beforeMainComponentId: null, afterMainComponentId: null, preserved: null },
      semanticEquality: { targetChanged: null, restoredToBefore: null, identityChanges: [] },
      capabilityClassification: classifyP011Capabilities(null, null, null, [], null, null, null, null, "control-frame-child"),
      terminalClassification: "PASS" as const,
      result: { status: "PASS" as const, passed: true, reasons: [] },
      errors: [],
      warnings: [],
      timeout: false,
      environment: { editorType: "figma", figmaMode: "default", currentPageId: "0:1", currentPageName: "Page 1", timestamp: "2026-07-13T00:00:00.000Z" },
      timestamp: "2026-07-13T00:00:00.000Z",
      filename: "a.json"
    };
    const result: P011RunResult = {
      runId: "p011-test-abcdef",
      status: "PARTIAL",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["a.json", "b.json"],
      warnings: [],
      errors: [],
      evidence: [baseRecord, { ...baseRecord, caseId: "C02", terminalClassification: "READ_ONLY", result: { status: "READ_ONLY", passed: true, reasons: [] }, filename: "b.json" }]
    };
    const manifest = createP011RunManifest(result);
    expect(manifest.accepted).toBe(true);
    expect(manifest.classification).toBe("mixed");
  });
});
