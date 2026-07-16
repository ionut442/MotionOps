import { describe, expect, it } from "vitest";
import {
  classifyUndoEvidence,
  createP010RunManifest,
  createSemanticState,
  nextInstructionFor,
  observeSettledState,
  p010ApiContract,
  semanticEqual,
  stableFingerprint,
  type P010RunResult
} from "../src/shared/p010Evidence";
import { p010CaseDefinitions, p010EvidenceFilename } from "../src/shared/p010Registry";

const state = (label: string, value = 0.5) =>
  createSemanticState(label, [
    {
      id: "node-1",
      role: "manual-primary",
      manualKeyframeTracks: { OPACITY: { keyframes: [{ timelinePosition: 0, value }, { timelinePosition: 0.5, value: 1 }] } },
      animationStyles: [{ id: "style-instance-1", styleId: "style-1" }],
      timelines: [{ id: "timeline-1", duration: value + 1 }],
      animations: { OPACITY: { timelineDuration: value + 1 } },
      pluginData: { owner: "P0-010" }
    }
  ]);

describe("P0-010 undo evidence helpers", () => {
  it("records exact synchronous undo API contract from typings/docs", () => {
    expect(p010ApiContract()).toMatchObject({
      commitUndoSignature: "commitUndo(): void",
      commitUndoReturn: "void",
      commitUndoAsync: false,
      triggerUndoSignature: "triggerUndo(): void",
      triggerUndoReturn: "void",
      triggerUndoAsync: false
    });
    expect(p010ApiContract().liveAmbiguities).toContain("No-op writes and empty undo entries.");
  });

  it("creates deterministic matrix and filenames", () => {
    expect(p010CaseDefinitions.map((definition) => definition.id)).toEqual([
      "U01",
      "U02",
      "U03",
      "U04",
      "U05",
      "U06",
      "U07",
      "U08",
      "U09",
      "U10"
    ]);
    expect(p010EvidenceFilename("p010-test-abcdef", p010CaseDefinitions[0])).toBe(
      "p010-test-abcdef-U01-one-manual-write-one-undo.json"
    );
  });

  it("compares before after undo semantic restoration", () => {
    const before = state("before", 0.4);
    const afterApply = state("after-apply", 0.8);
    const afterUndo = state("after-undo", 0.4);
    expect(semanticEqual(before, afterUndo)).toBe(true);
    const classified = classifyUndoEvidence(p010CaseDefinitions[0], before, afterApply, afterUndo, null, null, []);
    expect(classified.oneOrMultipleUndoStepsRequired).toBe("one");
    expect(classified.result.status).toBe("PASS");
  });

  it("treats regenerated manual track and keyframe ids as semantic restoration", () => {
    const before = createSemanticState("before", [
      {
        id: "node-1",
        role: "manual-primary",
        manualKeyframeTracks: {
          OPACITY: {
            id: "old-track",
            keyframes: [
              { id: "old-a", timelinePosition: 0, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 0.4 } },
              { id: "old-b", timelinePosition: 0.5, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 1 } }
            ]
          }
        },
        animationStyles: [{ id: "old-style-instance", styleId: "style-1" }],
        timelines: [{ id: "timeline-1", duration: 1.4 }],
        animations: { OPACITY: { timelineDuration: 1.4 } },
        pluginData: { owner: "P0-010" }
      }
    ]);
    const afterUndo = createSemanticState("after-undo", [
      {
        id: "node-1",
        role: "manual-primary",
        manualKeyframeTracks: {
          OPACITY: {
            id: "new-track",
            keyframes: [
              { id: "new-a", timelinePosition: 0, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 0.4 } },
              { id: "new-b", timelinePosition: 0.5, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 1 } }
            ]
          }
        },
        animationStyles: [{ id: "new-style-instance", styleId: "style-1" }],
        timelines: [{ id: "timeline-1", duration: 1.4 }],
        animations: { OPACITY: { timelineDuration: 1.4 } },
        pluginData: { owner: "P0-010" }
      }
    ]);
    expect(semanticEqual(before, afterUndo)).toBe(true);
  });

  it("observes immediate, delayed, intermediate, and timeout settle states", async () => {
    let reads = 0;
    const immediate = await observeSettledState({
      beforeAction: "applied",
      expected: "before",
      read: async () => Promise.resolve("before"),
      fingerprint: (value) => value,
      equalsExpected: (value, expected) => value === expected,
      now: () => reads * 10,
      sleep: async () => {
        await Promise.resolve();
        reads += 1;
      }
    });
    expect(immediate.observation.reachedExpected).toBe(true);

    const sequence = ["applied", "intermediate", "before"];
    let index = 0;
    let clock = 0;
    const delayed = await observeSettledState({
      beforeAction: "applied",
      expected: "before",
      read: async () => Promise.resolve(sequence[Math.min(index++, sequence.length - 1)]),
      fingerprint: (value) => value,
      equalsExpected: (value, expected) => value === expected,
      now: () => clock,
      sleep: async (ms) => {
        await Promise.resolve();
        clock += ms;
      }
    });
    expect(delayed.observation.firstDetectedChangeMs).not.toBeNull();
    expect(delayed.observation.reachedExpected).toBe(false);

    let timeoutClock = 0;
    const timeout = await observeSettledState({
      beforeAction: "applied",
      expected: "before",
      read: async () => Promise.resolve("applied"),
      fingerprint: (value) => value,
      equalsExpected: (value, expected) => value === expected,
      now: () => timeoutClock,
      sleep: async (ms) => {
        await Promise.resolve();
        timeoutClock += ms;
      },
      timeoutMs: 100,
      intervalMs: 50
    });
    expect(timeout.observation.timedOut).toBe(true);
  });

  it("detects second undo requirement for separate operations", () => {
    const before = state("before", 0.4);
    const afterApply = state("after-apply", 0.8);
    const afterUndo = state("after-undo", 0.6);
    const afterSecondUndo = state("after-second-undo", 0.4);
    const classified = classifyUndoEvidence(p010CaseDefinitions[5], before, afterApply, afterUndo, afterSecondUndo, null, []);
    expect(classified.observation.separateUndoOrdering).toBe(true);
    expect(classified.oneOrMultipleUndoStepsRequired).toBe("two");
    expect(classified.result.status).toBe("PASS");
  });

  it("classifies no-op and partial failure rollback probes without hanging", () => {
    const before = state("before", 0.4);
    const noop = classifyUndoEvidence(p010CaseDefinitions[6], before, before, before, null, null, []);
    expect(noop.observation.noOpCreatedHistory).toBe("none");
    const rollback = classifyUndoEvidence(p010CaseDefinitions[7], before, state("after-apply", 0.9), before, null, null, []);
    expect(rollback.observation.triggerUndoSafe).toBe(true);
    expect(rollback.result.status).toBe("PARTIAL");
    expect(rollback.result.capabilityConclusion).toBe("supported-with-warning");
  });

  it("downgrades one-undo success when native redo does not restore the applied state", () => {
    const before = state("before", 0.4);
    const afterApply = state("after-apply", 0.8);
    const afterRedo = state("after-redo", 0.6);
    const classified = classifyUndoEvidence(p010CaseDefinitions[2], before, afterApply, before, null, afterRedo, []);
    expect(classified.observation.firstUndoRestoredOriginal).toBe(true);
    expect(classified.observation.redoRestoredApplied).toBe(false);
    expect(classified.result.status).toBe("PARTIAL");
    expect(classified.result.capabilityConclusion).toBe("supported-with-warning");
  });

  it("treats the U08 controlled partial failure as conclusive rollback evidence", () => {
    const before = state("before", 0.4);
    const afterApply = state("after-apply", 0.9);
    const classified = classifyUndoEvidence(p010CaseDefinitions[7], before, afterApply, before, null, afterApply, [
      { code: "P010_CONTROLLED_PARTIAL_FAILURE", message: "Controlled partial failure after first mutation.", path: "U08" }
    ]);
    expect(classified.observation.triggerUndoSafe).toBe(true);
    expect(classified.observation.redoRestoredApplied).toBe(true);
    expect(classified.result.status).toBe("PASS");
    expect(classified.result.capabilityConclusion).toBe("supported-with-warning");
  });

  it("finalizes mixed manifests and keeps stable hashes deterministic", () => {
    const result: P010RunResult = {
      runId: "p010-test-abcdef",
      status: "PARTIAL",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      files: ["p010-test-abcdef-U01-one-manual-write-one-undo.json"],
      evidence: [
        {
          evidenceSchemaVersion: 1,
          runId: "p010-test-abcdef",
          caseId: "U01",
          transactionStrategyId: "A_WRITE_THEN_COMMIT",
          targetProvenance: { mode: "EXPLICIT_NODE_IDS", requestedNodeIds: ["1"], resolvedNodeIds: ["1"], failedNodeIds: [], fixtureRootId: "root", roles: ["manual-primary"] },
          operationIds: ["manual"],
          sourceTypes: ["manual-track"],
          apiContract: p010ApiContract(),
          semanticStateBefore: state("before"),
          semanticStateAfterApply: state("after", 0.8),
          semanticStateAfterFirstUndo: null,
          semanticStateAfterSecondUndo: null,
          semanticStateAfterRedo: null,
          manualTrackFingerprints: [],
          styleInstanceFingerprints: [],
          timelineFingerprints: [],
          derivedAnimationFingerprints: [],
          oneOrMultipleUndoStepsRequired: "unknown",
          rollbackAttempt: { attempted: false, method: "none", result: "not-tested" },
          observation: {
            firstUndoRestoredOriginal: null,
            secondUndoRequired: null,
            redoRestoredApplied: null,
            separateUndoOrdering: null,
            noOpCreatedHistory: "unknown",
            triggerUndoSafe: null,
            partialWritesRemained: null
          },
          settleObservations: { firstUndo: null, secondUndo: null, redo: null },
          failureAudit: {
            classification: "unknown",
            reason: "Pending",
            nativeUndoChangedDocument: null,
            redoChangedDocument: null
          },
          errors: [],
          warnings: [],
          timeout: false,
          terminalClassification: "PARTIAL",
          result: { status: "PARTIAL", passed: true, reasons: [], capabilityConclusion: "supported-with-warning", nextStep: "native-undo", nextInstruction: "Undo" },
          environment: { editorType: "figma", figmaMode: "default", currentPageId: "page", currentPageName: "Page", timestamp: "2026-07-13T00:00:01.000Z" },
          timestamp: "2026-07-13T00:00:01.000Z",
          filename: "p010-test-abcdef-U01-one-manual-write-one-undo.json"
        }
      ],
      warnings: [],
      errors: []
    };
    expect(createP010RunManifest(result).classification).toBe("mixed");
    expect(stableFingerprint({ b: 2, a: 1 })).toBe(stableFingerprint({ a: 1, b: 2 }));
    expect(nextInstructionFor(p010CaseDefinitions[0], "native-undo")).toContain("Ctrl+Z");
  });
});
