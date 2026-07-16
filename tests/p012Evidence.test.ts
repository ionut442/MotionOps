import { describe, expect, it } from "vitest";
import {
  classifyP012Terminal,
  createP012RunManifest,
  displayNameFromComponentPropertyKey,
  p012Fingerprint,
  p012SemanticFingerprint,
  type P012EvidenceRecord,
  type P012RunResult
} from "../src/shared/p012Evidence";
import { p012CaseDefinitions, p012EvidenceFilename } from "../src/shared/p012Registry";

const baseRecord = (overrides: Partial<P012EvidenceRecord> = {}): P012EvidenceRecord => ({
  evidenceSchemaVersion: 1,
  runId: "p012-test-abcdef",
  caseId: "CP01",
  targetProvenance: { mode: "EXPLICIT_NODE_IDS", requestedNodeIds: ["1"], resolvedNodeIds: ["1"], failedNodeIds: [], fixtureRootId: "root", targetRole: "target-instance", siblingRole: "sibling-instance", sourceRole: "source-component" },
  componentId: "component",
  componentSetId: "set",
  instanceId: "target",
  siblingInstanceId: "sibling",
  nestedInstanceId: "nested",
  componentPropertyIdentifier: "ShowBadge#1:2",
  propertyType: "BOOLEAN",
  propertyValue: { before: true, planned: false, after: false, restored: true },
  definitions: [],
  targetProperties: {},
  siblingProperties: {},
  variantProperties: {},
  rawTrackShape: {},
  motionSourceType: "componentProperties",
  semanticTrackClassification: "property-api-only",
  writableResult: "WRITABLE",
  sourceAndSiblingFingerprints: {
    before: { sourceComponent: "a", componentSet: "b", targetInstance: "c", siblingInstance: "d", nestedInstance: "e", unrelatedMotion: "f" },
    after: { sourceComponent: "a", componentSet: "b", targetInstance: "changed", siblingInstance: "d", nestedInstance: "e", unrelatedMotion: "f" },
    restored: { sourceComponent: "a", componentSet: "b", targetInstance: "c", siblingInstance: "d", nestedInstance: "e", unrelatedMotion: "f" },
    sourceUnchanged: true,
    siblingUnchanged: true,
    nestedUnchanged: true,
    unrelatedMotionUnchanged: true
  },
  overrideState: { before: true, after: false, createdOrChanged: true },
  componentLinkage: { targetMainComponentIdBefore: "component", targetMainComponentIdAfter: "component", siblingMainComponentIdBefore: "component", siblingMainComponentIdAfter: "component", preserved: true },
  restoration: { attempted: true, restored: true, restoredBy: "setProperties" },
  undoRedo: { undoTested: false, undoRestored: null, redoTested: false, redoRestoredMutation: null },
  terminalClassification: "PARTIAL",
  result: { status: "PARTIAL", passed: true, reasons: ["synthetic"] },
  errors: [],
  warnings: [],
  timeout: false,
  environment: { editorType: "figma", figmaMode: "default", currentPageId: "0:1", currentPageName: "Page 1", timestamp: "2026-07-13T00:00:00.000Z" },
  timestamp: "2026-07-13T00:00:00.000Z",
  filename: "p012-test-abcdef-CP01-discover-definitions.json",
  ...overrides
});

describe("P0-012 evidence helpers", () => {
  it("defines the CP01-CP10 matrix and deterministic filenames", () => {
    expect(p012CaseDefinitions.map((definition) => definition.id)).toEqual([
      "CP01",
      "CP02",
      "CP03",
      "CP04",
      "CP05",
      "CP06",
      "CP07",
      "CP08",
      "CP09",
      "CP10"
    ]);
    expect(p012EvidenceFilename("p012-test-abcdef", p012CaseDefinitions[0])).toBe(
      "p012-test-abcdef-CP01-discover-definitions.json"
    );
  });

  it("normalizes component property display names and stable fingerprints", () => {
    expect(displayNameFromComponentPropertyKey("ShowBadge#1:2")).toBe("ShowBadge");
    expect(displayNameFromComponentPropertyKey("State")).toBe("State");
    expect(p012Fingerprint({ b: 2, a: 1 })).toBe(p012Fingerprint({ a: 1, b: 2 }));
  });

  it("classifies property-api-only writes as partial terminal evidence", () => {
    const terminal = classifyP012Terminal("WRITABLE", "property-api-only", [], true, true);
    expect(terminal.status).toBe("PARTIAL");
    expect(terminal.reasons).toContain("semantic-track-property-api-only");
  });

  it("classifies absent tracks as unsupported instead of failed", () => {
    const terminal = classifyP012Terminal("UNSUPPORTED", "not-exposed", [{ code: "P012_UNSUPPORTED", message: "No track" }], true, null);
    expect(terminal.status).toBe("UNSUPPORTED");
    expect(terminal.terminalClassification).toBe("UNSUPPORTED");
  });

  it("accepts CP01 read-only definitions as conclusive negative evidence", () => {
    const result: P012RunResult = {
      runId: "p012-test-abcdef",
      status: "READ_ONLY",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["cp01.json"],
      warnings: [],
      errors: [],
      evidence: [baseRecord({ caseId: "CP01", terminalClassification: "READ_ONLY", writableResult: "READ_ONLY", result: { status: "READ_ONLY", passed: true, reasons: [] }, filename: "cp01.json" })]
    };
    expect(createP012RunManifest(result).accepted).toBe(true);
  });

  it("accepts CP02 read-only instance state as conclusive negative evidence", () => {
    const result: P012RunResult = {
      runId: "p012-test-abcdef",
      status: "READ_ONLY",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["cp02.json"],
      warnings: [],
      errors: [],
      evidence: [baseRecord({ caseId: "CP02", terminalClassification: "READ_ONLY", writableResult: "READ_ONLY", result: { status: "READ_ONLY", passed: true, reasons: [] }, filename: "cp02.json" })]
    };
    expect(createP012RunManifest(result).accepted).toBe(true);
  });

  it("accepts CP08 unsupported not-exposed evidence as conclusive", () => {
    const result: P012RunResult = {
      runId: "p012-test-abcdef",
      status: "UNSUPPORTED",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["cp08.json"],
      warnings: [],
      errors: [],
      evidence: [baseRecord({ caseId: "CP08", terminalClassification: "UNSUPPORTED", writableResult: "UNSUPPORTED", result: { status: "UNSUPPORTED", passed: true, reasons: [] }, filename: "cp08.json" })]
    };
    const manifest = createP012RunManifest(result);
    expect(manifest.accepted).toBe(true);
    expect(manifest.classification).toBe("unsupported");
  });

  it("classifies explicit API write rejection as unsupported, not failed", () => {
    const terminal = classifyP012Terminal("UNSUPPORTED", "component-property-track", [{ code: "P012_PROPERTY_WRITE_UNSUPPORTED", message: "unsupported" }], true, null);
    expect(terminal.status).toBe("UNSUPPORTED");
  });

  it("classifies read-only property tracks as read-only, not failed", () => {
    const terminal = classifyP012Terminal("READ_ONLY", "component-property-track", [{ code: "P012_PROPERTY_WRITE_READ_ONLY", message: "read only" }], true, null);
    expect(terminal.status).toBe("READ_ONLY");
  });

  it("classifies missing writable tracks as blocked precondition", () => {
    const terminal = classifyP012Terminal("BLOCKED_PRECONDITION", "not-exposed", [], true, null);
    expect(terminal.status).toBe("BLOCKED_PRECONDITION");
  });

  it("classifies successful write plus failed restoration as partial", () => {
    const terminal = classifyP012Terminal("WRITABLE", "component-property-track", [], true, false);
    expect(terminal.status).toBe("PARTIAL");
  });

  it("keeps harness exceptions as error", () => {
    const terminal = classifyP012Terminal("ERROR", "component-property-track", [{ code: "P012_PROPERTY_WRITE_ERROR", message: "throw" }], true, null);
    expect(terminal.status).toBe("ERROR");
  });

  it("boolean semantic comparison ignores regenerated track and keyframe ids", () => {
    const first = { OPACITY: { id: "track-a", keyframes: [{ id: "kf-a", timelinePosition: 0, value: { type: "BOOLEAN", value: true } }] } };
    const second = { OPACITY: { id: "track-b", keyframes: [{ id: "kf-b", timelinePosition: 0, value: { type: "BOOLEAN", value: true } }] } };
    expect(p012SemanticFingerprint(first)).toBe(p012SemanticFingerprint(second));
  });

  it("finalizes mixed manifests as accepted", () => {
    const result: P012RunResult = {
      runId: "p012-test-abcdef",
      status: "PARTIAL",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["a.json", "b.json"],
      warnings: [],
      errors: [],
      evidence: [baseRecord(), baseRecord({ caseId: "CP08", terminalClassification: "UNSUPPORTED", result: { status: "UNSUPPORTED", passed: true, reasons: [] }, filename: "b.json" })]
    };
    const manifest = createP012RunManifest(result);
    expect(manifest.accepted).toBe(true);
    expect(manifest.classification).toBe("mixed");
  });
});
