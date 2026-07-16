import { describe, expect, it } from "vitest";
import {
  createNotTestedResult,
  isAnyMotionDiagnosticCommand,
  isMotionDiagnosticRequest,
  isMotionDiagnosticResultMessage,
  type DiagnosticEnvironment
} from "../src/shared/diagnostics";
import { canOpenMotionApiLab } from "../src/shared/labConfig";
import { detectNodeMotionFeatures } from "../src/plugin/diagnostics/featureDetection";
import { createFixtureRegistry, ownsFixtureNode } from "../src/plugin/diagnostics/fixtureRegistry";

const environment: DiagnosticEnvironment = {
  editorType: "figma",
  figmaMode: "default",
  currentPageId: "0:1",
  currentPageName: "Page 1",
  selectionCount: 0,
  dynamicPageAccess: "configured",
  apiLabEnabled: true,
  runtimeSignals: {}
};

describe("diagnostic protocol", () => {
  it("validates implemented and future command names", () => {
    expect(isAnyMotionDiagnosticCommand("GET_ENVIRONMENT")).toBe(true);
    expect(isAnyMotionDiagnosticCommand("TEST_UNDO_BOUNDARY")).toBe(true);
    expect(isAnyMotionDiagnosticCommand("UNKNOWN_COMMAND")).toBe(false);
  });

  it("validates request and result correlation shape", () => {
    expect(
      isMotionDiagnosticRequest({
        type: "MOTION_DIAGNOSTIC_REQUEST",
        requestId: "req-1",
        command: "READ_MOTION_DATA",
        target: { mode: "EXPLICIT_NODE_IDS", nodeIds: ["1:2"] },
        testContext: { testCaseId: "R04", subcaseId: "multi-property", expectedRoles: ["animated-target"] }
      })
    ).toBe(true);
    expect(
      isMotionDiagnosticRequest({
        type: "MOTION_DIAGNOSTIC_REQUEST",
        requestId: "req-1",
        command: "READ_MOTION_DATA"
      })
    ).toBe(false);

    expect(
      isMotionDiagnosticRequest({
        type: "P007_RUN_CASE",
        requestId: "req-2",
        caseId: "W01"
      })
    ).toBe(false);

    const result = createNotTestedResult("TEST_UNDO_BOUNDARY", environment, Date.now(), "Later task.");
    expect(
      isMotionDiagnosticResultMessage({
        type: "MOTION_DIAGNOSTIC_RESULT",
        requestId: "req-1",
        result
      })
    ).toBe(true);
  });

  it("keeps production lab closed when config is false", () => {
    expect(canOpenMotionApiLab(false)).toBe(false);
    expect(canOpenMotionApiLab(true)).toBe(true);
  });
});

describe("capability classification", () => {
  it("detects available Motion read properties and write methods", () => {
    const node = {
      animationStyles: [],
      animations: {},
      manualKeyframeTracks: {},
      timelines: [],
      applyManualKeyframeTrack: () => undefined
    };

    const features = detectNodeMotionFeatures(node);
    expect(features.readProperties.animationStyles).toBe(true);
    expect(features.writeMethods.applyManualKeyframeTrack).toBe(true);
    expect(features.writeMethods.removeManualKeyframeTrack).toBe(false);
  });

  it("classifies unsupported node shapes without throwing", () => {
    const features = detectNodeMotionFeatures({ type: "DOCUMENT" });
    expect(features.readProperties.animations).toBe(false);
    expect(features.capabilities.some((capability) => capability.status === "UNSUPPORTED")).toBe(true);
  });
});

describe("fixture ownership registry", () => {
  it("stores unique created IDs under a root", () => {
    const registry = createFixtureRegistry("root", ["child", "root", "child"]);
    expect(registry.createdNodeIds).toEqual(["root", "child"]);
  });

  it("requires stored ID and fixture root ancestry for ownership", () => {
    const registry = createFixtureRegistry("root", ["child"]);
    expect(ownsFixtureNode(registry, "child", ["root"])).toBe(true);
    expect(ownsFixtureNode(registry, "child", ["other-root"])).toBe(false);
    expect(ownsFixtureNode(registry, "unregistered", ["root"])).toBe(false);
  });
});
