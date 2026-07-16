import { describe, expect, test } from "vitest";
import {
  createDefaultScopeDefinition,
  isValidScopeDepth,
  normalizeManualNodeIds,
  parseScopeDefinition,
  serializeScopeDefinition,
  type ScopeDefinition
} from "../src/domain/scope";

describe("scope domain model", () => {
  test("defaults to current selection", () => {
    expect(createDefaultScopeDefinition()).toEqual({ mode: "current-selection" });
  });

  test("parses every supported Scope variant", () => {
    const values: ScopeDefinition[] = [
      { mode: "current-selection" },
      { mode: "direct-children" },
      { mode: "all-descendants" },
      { mode: "depth-limited", maxDepth: 2 },
      { mode: "manual", nodeIds: ["1:1", "2:2"] }
    ];

    for (const value of values) {
      expect(parseScopeDefinition(value)).toEqual({ ok: true, value });
      expect(JSON.parse(JSON.stringify(serializeScopeDefinition(value)))).toEqual(value);
    }
  });

  test("validates finite integral depth at least one", () => {
    expect(isValidScopeDepth(1)).toBe(true);
    expect(isValidScopeDepth(3)).toBe(true);
    expect(isValidScopeDepth(0)).toBe(false);
    expect(isValidScopeDepth(1.5)).toBe(false);
    expect(isValidScopeDepth(Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("deduplicates manual IDs deterministically by first occurrence", () => {
    expect(normalizeManualNodeIds(["3:3", "1:1", "3:3", "2:2", "1:1"])).toEqual([
      "3:3",
      "1:1",
      "2:2"
    ]);
  });

  test("keeps manual IDs as opaque strings", () => {
    expect(parseScopeDefinition({ mode: "manual", nodeIds: ["", "  ", "node-name"] })).toEqual({
      ok: true,
      value: { mode: "manual", nodeIds: ["", "  ", "node-name"] }
    });
  });

  test("returns typed serializable validation issues for invalid shapes", () => {
    expect(parseScopeDefinition(null)).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_shape", path: "" }]
    });
    expect(parseScopeDefinition({ mode: "unknown" })).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_mode", path: "mode" }]
    });
    expect(parseScopeDefinition({ mode: "depth-limited", maxDepth: 0 })).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_depth", path: "maxDepth" }]
    });
    expect(parseScopeDefinition({ mode: "manual", nodeIds: ["1:1", 5] })).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_node_id", path: "nodeIds.1" }]
    });
  });

  test("returns immutable Scope objects", () => {
    const parsed = parseScopeDefinition({ mode: "manual", nodeIds: ["1:1", "1:1"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(parsed.value.mode).toBe("manual");
    if (parsed.value.mode === "manual") {
      expect(Object.isFrozen(parsed.value.nodeIds)).toBe(true);
    }
  });
});
