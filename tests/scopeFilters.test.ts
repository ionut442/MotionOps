import { describe, expect, test } from "vitest";
import {
  applyScopeFilters,
  createDefaultScopeFilters,
  hasActiveScopeFilters,
  type ScopeFilterDefinition
} from "../src/domain/scopeFilters";
import type { ScopeScanResult } from "../src/domain/scopeScan";

const result: ScopeScanResult = {
  roots: ["frame"],
  nodes: [
    {
      id: "frame",
      parentId: null,
      name: "Checkout Frame",
      type: "FRAME",
      depth: 0,
      childIds: ["hidden", "locked", "text"],
      visible: true,
      locked: false,
      hasChildren: true,
      childrenIncluded: true,
      rootIds: ["frame"],
      traversalIndex: 0
    },
    {
      id: "hidden",
      parentId: "frame",
      name: "Hidden Background",
      type: "RECTANGLE",
      depth: 1,
      childIds: [],
      visible: false,
      locked: false,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["frame"],
      traversalIndex: 1
    },
    {
      id: "locked",
      parentId: "frame",
      name: "Locked Logo",
      type: "VECTOR",
      depth: 1,
      childIds: [],
      visible: true,
      locked: true,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["frame"],
      traversalIndex: 2
    },
    {
      id: "text",
      parentId: "frame",
      name: "Checkout Title",
      type: "TEXT",
      depth: 1,
      childIds: [],
      visible: true,
      locked: false,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["frame"],
      traversalIndex: 3
    }
  ],
  issues: []
};

const filters = (overrides: Partial<ScopeFilterDefinition>): ScopeFilterDefinition => ({
  ...createDefaultScopeFilters(),
  ...overrides
});

const ids = (filtered: ScopeScanResult) => filtered.nodes.map((node) => node.id);

describe("Scope filters", () => {
  test("searches by layer name case-insensitively", () => {
    expect(ids(applyScopeFilters(result, filters({ search: "checkout" })))).toEqual([
      "frame",
      "text"
    ]);
    expect(ids(applyScopeFilters(result, filters({ search: "LOGO" })))).toEqual(["locked"]);
  });

  test("filters visible-only and unlocked-only rows", () => {
    expect(ids(applyScopeFilters(result, filters({ visibleOnly: true })))).toEqual([
      "frame",
      "locked",
      "text"
    ]);
    expect(ids(applyScopeFilters(result, filters({ unlockedOnly: true })))).toEqual([
      "frame",
      "hidden",
      "text"
    ]);
  });

  test("filters by node type", () => {
    expect(ids(applyScopeFilters(result, filters({ nodeTypes: ["TEXT", "VECTOR"] })))).toEqual([
      "locked",
      "text"
    ]);
  });

  test("excludes hidden and locked layers", () => {
    expect(ids(applyScopeFilters(result, filters({ excludeHidden: true })))).toEqual([
      "frame",
      "locked",
      "text"
    ]);
    expect(ids(applyScopeFilters(result, filters({ excludeLocked: true })))).toEqual([
      "frame",
      "hidden",
      "text"
    ]);
  });

  test("combines filters deterministically without mutating scan results", () => {
    const before = JSON.stringify(result);
    const filtered = applyScopeFilters(
      result,
      filters({ search: "checkout", visibleOnly: true, unlockedOnly: true })
    );
    expect(ids(filtered)).toEqual(["frame", "text"]);
    expect(JSON.stringify(result)).toBe(before);
  });

  test("clearing filters restores the unfiltered result", () => {
    const defaults = createDefaultScopeFilters();
    expect(hasActiveScopeFilters(defaults)).toBe(false);
    expect(ids(applyScopeFilters(result, defaults))).toEqual(["frame", "hidden", "locked", "text"]);
  });

  test("manual exclusions are deterministic and reversible by filter state", () => {
    const excluded = applyScopeFilters(result, filters({ excludedNodeIds: ["locked"] }));
    expect(ids(excluded)).toEqual(["frame", "hidden", "text"]);
    expect(ids(applyScopeFilters(result, filters({ excludedNodeIds: [] })))).toEqual([
      "frame",
      "hidden",
      "locked",
      "text"
    ]);
  });
});
