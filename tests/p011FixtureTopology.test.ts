import { describe, expect, it } from "vitest";
import {
  p011RequiredTopologyRoles,
  validateP011Topology,
  type P011RoleInfo
} from "../src/shared/p011FixtureTopology";

const completeRoleTable = (): P011RoleInfo[] =>
  p011RequiredTopologyRoles.map((requirement) => ({
    role: requirement.role,
    nodeId: `node-${requirement.role}`,
    nodeType: requirement.type,
    parentRole: requirement.parentRole ?? null,
    sourceRole: null
  }));

const withoutRole = (role: string): P011RoleInfo[] =>
  completeRoleTable().filter((entry) => entry.role !== role);

describe("P0-011 fixture topology validation", () => {
  it("accepts the complete component and instance topology", () => {
    const roles = completeRoleTable();

    expect(roles).toHaveLength(27);
    expect(validateP011Topology(roles)).toEqual([]);
  });

  it("rejects a root-only fixture", () => {
    const errors = validateP011Topology([
      {
        role: "fixture-root",
        nodeId: "root",
        nodeType: "FRAME",
        parentRole: null,
        sourceRole: null
      }
    ]);

    expect(errors).toHaveLength(26);
    expect(errors.some((error) => error.path === "control-frame")).toBe(true);
    expect(errors.some((error) => error.path === "direct-instance-a")).toBe(true);
  });

  it("rejects missing component, variant, sibling, direct instance, and nested roles", () => {
    for (const role of ["simple-component", "variant-a", "direct-instance-b", "direct-instance-a-child", "nested-inner-instance-a-child"]) {
      const errors = validateP011Topology(withoutRole(role));

      expect(errors).toContainEqual({
        code: "P011_TOPOLOGY_ROLE_MISSING",
        message: `Missing P0-011 role ${role}.`,
        path: role
      });
    }
  });

  it("rejects invalid component-set parenting", () => {
    const roles = completeRoleTable().map((entry) =>
      entry.role === "variant-a" ? { ...entry, parentRole: "fixture-root" } : entry
    );

    expect(validateP011Topology(roles)).toContainEqual({
      code: "P011_TOPOLOGY_PARENT_MISMATCH",
      message: "variant-a expected parent component-set, got fixture-root.",
      path: "variant-a"
    });
  });

  it("rejects all-present cloned descendants when their parent roles are missing", () => {
    const roles = completeRoleTable().map((entry) =>
      entry.role === "nested-inner-instance-a-child" ? { ...entry, parentRole: null } : entry
    );

    expect(roles).toHaveLength(27);
    expect(validateP011Topology(roles)).toContainEqual({
      code: "P011_TOPOLOGY_PARENT_MISMATCH",
      message: "nested-inner-instance-a-child expected parent nested-inner-instance-a, got null.",
      path: "nested-inner-instance-a-child"
    });
  });

  it("does not block topology on unavailable live source-role introspection", () => {
    const roles = completeRoleTable().map((entry) =>
      entry.nodeType === "INSTANCE" ? { ...entry, sourceRole: null } : entry
    );

    expect(validateP011Topology(roles)).toEqual([]);
  });
});
