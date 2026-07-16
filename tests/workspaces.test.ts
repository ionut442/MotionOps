import { describe, expect, test } from "vitest";
import {
  getWorkspaceById,
  getWorkspaceIndex,
  getWorkspacePanelId,
  getWorkspaceTabId,
  INITIAL_WORKSPACE_ID,
  isWorkspaceId,
  parseWorkspaceId,
  WORKSPACES,
  type WorkspaceDefinition,
  type WorkspaceId
} from "../src/ui/workspaces";

const expectedWorkspaces = ["scope", "inspect", "edit", "sequence", "review"] as const;
const expectedLabels = ["Scope", "Inspect", "Edit", "Sequence", "Review"] as const;

const workspaceCopy = <T>(values: readonly T[]): T[] => [...values];

describe("workspace definitions", () => {
  test("contains exactly the five production workspaces in deterministic order", () => {
    expect(WORKSPACES).toHaveLength(5);
    expect(WORKSPACES.map((workspace) => workspace.id)).toEqual(workspaceCopy(expectedWorkspaces));
    expect(WORKSPACES.map((workspace) => workspace.label)).toEqual(workspaceCopy(expectedLabels));
  });

  test("keeps workspace ids and labels unique", () => {
    expect(new Set(WORKSPACES.map((workspace) => workspace.id))).toHaveProperty("size", 5);
    expect(new Set(WORKSPACES.map((workspace) => workspace.label))).toHaveProperty("size", 5);
  });

  test("uses Scope as the deterministic initial workspace", () => {
    expect(INITIAL_WORKSPACE_ID).toBe("scope");
  });

  test("maps every workspace to stable tabs and panels", () => {
    const byId = Object.fromEntries(
      WORKSPACES.map((workspace) => [workspace.id, getWorkspaceById(workspace.id)])
    ) as Record<WorkspaceId, WorkspaceDefinition>;

    expect(Object.keys(byId)).toEqual(workspaceCopy(expectedWorkspaces));
    expect(getWorkspaceIndex("sequence")).toBe(3);
    expect(getWorkspaceTabId("inspect")).toBe("workspace-tab-inspect");
    expect(getWorkspacePanelId("review")).toBe("workspace-panel-review");
  });

  test("rejects invalid external workspace values safely", () => {
    expect(isWorkspaceId("scope")).toBe(true);
    expect(isWorkspaceId("inspector")).toBe(false);
    expect(parseWorkspaceId("edit")).toBe("edit");
    expect(parseWorkspaceId("motion")).toBeNull();
    expect(parseWorkspaceId(null)).toBeNull();
  });
});
