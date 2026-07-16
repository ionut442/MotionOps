import type { DiagnosticError } from "./diagnostics";

export type P011ConstructionStage =
  | "ROOT"
  | "CONTROL"
  | "SIMPLE_COMPONENT"
  | "DIRECT_INSTANCES"
  | "VARIANT_COMPONENTS"
  | "COMPONENT_SET"
  | "INNER_COMPONENT"
  | "OUTER_COMPONENT"
  | "NESTED_INSTANCES"
  | "MOTION_SEEDING"
  | "REGISTRY_WRITE"
  | "TOPOLOGY_VERIFY"
  | "UI_RESPONSE";

export interface P011ConstructionDiagnostic {
  requestId: string | null;
  stage: P011ConstructionStage;
  entered: boolean;
  completed: boolean;
  createdNodeType: string | null;
  createdNodeId: string | null;
  expectedParentRole: string | null;
  actualParentType: string | null;
  registryRole: string | null;
  cleanupAttempted: boolean;
  cleanupCompleted: boolean;
  terminalResult: "PASS" | "ERROR" | "RUNNING";
  message: string | null;
}

export interface P011RoleRequirement {
  role: string;
  type: string;
  parentRole?: string;
}

export interface P011RoleInfo {
  role: string;
  nodeId: string;
  nodeType: string;
  parentRole: string | null;
  sourceRole: string | null;
}

export const p011RequiredTopologyRoles: readonly P011RoleRequirement[] = [
  { role: "fixture-root", type: "FRAME" },
  { role: "control-frame", type: "FRAME", parentRole: "fixture-root" },
  { role: "control-child", type: "RECTANGLE", parentRole: "control-frame" },
  { role: "simple-component", type: "COMPONENT" },
  { role: "simple-component-child", type: "RECTANGLE", parentRole: "simple-component" },
  { role: "direct-instance-a", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "direct-instance-b", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "direct-instance-a-child", type: "RECTANGLE", parentRole: "direct-instance-a" },
  { role: "direct-instance-b-child", type: "RECTANGLE", parentRole: "direct-instance-b" },
  { role: "variant-a", type: "COMPONENT", parentRole: "component-set" },
  { role: "variant-b", type: "COMPONENT", parentRole: "component-set" },
  { role: "component-set", type: "COMPONENT_SET" },
  { role: "variant-a-child", type: "RECTANGLE", parentRole: "variant-a" },
  { role: "variant-b-child", type: "RECTANGLE", parentRole: "variant-b" },
  { role: "variant-instance-a", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "variant-instance-b", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "inner-component", type: "COMPONENT" },
  { role: "inner-component-child", type: "RECTANGLE", parentRole: "inner-component" },
  { role: "outer-component", type: "COMPONENT" },
  { role: "inner-instance-in-outer-component", type: "INSTANCE", parentRole: "outer-component" },
  { role: "outer-instance-a", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "outer-instance-b", type: "INSTANCE", parentRole: "fixture-root" },
  { role: "nested-inner-instance-a", type: "INSTANCE", parentRole: "outer-instance-a" },
  { role: "nested-inner-instance-b", type: "INSTANCE", parentRole: "outer-instance-b" },
  { role: "nested-inner-instance-a-child", type: "RECTANGLE", parentRole: "nested-inner-instance-a" },
  { role: "nested-inner-instance-b-child", type: "RECTANGLE", parentRole: "nested-inner-instance-b" },
  { role: "style-target", type: "RECTANGLE", parentRole: "fixture-root" }
];

export const validateP011Topology = (roles: readonly P011RoleInfo[]): DiagnosticError[] => {
  const byRole = new Map(roles.map((role) => [role.role, role]));
  const errors: DiagnosticError[] = [];
  for (const requirement of p011RequiredTopologyRoles) {
    const actual = byRole.get(requirement.role);
    if (actual === undefined) {
      errors.push({ code: "P011_TOPOLOGY_ROLE_MISSING", message: `Missing P0-011 role ${requirement.role}.`, path: requirement.role });
      continue;
    }
    if (actual.nodeType !== requirement.type) {
      errors.push({ code: "P011_TOPOLOGY_TYPE_MISMATCH", message: `${requirement.role} expected ${requirement.type}, got ${actual.nodeType}.`, path: requirement.role });
    }
    if (requirement.parentRole !== undefined && actual.parentRole !== requirement.parentRole) {
      errors.push({ code: "P011_TOPOLOGY_PARENT_MISMATCH", message: `${requirement.role} expected parent ${requirement.parentRole}, got ${actual.parentRole ?? "null"}.`, path: requirement.role });
    }
  }
  return errors;
};
