export type WorkspaceId = "scope" | "inspect" | "edit" | "sequence" | "review";

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  accessibleLabel?: string;
}

export interface WorkspaceNavigationState {
  activeWorkspace: WorkspaceId;
}

export const WORKSPACES = [
  { id: "scope", label: "Scope", accessibleLabel: "Scope workspace" },
  { id: "inspect", label: "Inspect", accessibleLabel: "Inspect workspace" },
  { id: "edit", label: "Edit", accessibleLabel: "Edit workspace" },
  { id: "sequence", label: "Sequence", accessibleLabel: "Sequence workspace" },
  { id: "review", label: "Review", accessibleLabel: "Review workspace" }
] as const satisfies readonly WorkspaceDefinition[];

export const INITIAL_WORKSPACE_ID = WORKSPACES[0].id;

export const isWorkspaceId = (value: unknown): value is WorkspaceId =>
  typeof value === "string" && WORKSPACES.some((workspace) => workspace.id === value);

export const parseWorkspaceId = (value: unknown): WorkspaceId | null =>
  isWorkspaceId(value) ? value : null;

export const getWorkspaceById = (id: WorkspaceId): WorkspaceDefinition => {
  const workspace = WORKSPACES.find((candidate) => candidate.id === id);
  if (workspace === undefined) {
    throw new Error(`Unknown workspace: ${id}`);
  }
  return workspace;
};

export const getWorkspaceIndex = (id: WorkspaceId): number =>
  WORKSPACES.findIndex((workspace) => workspace.id === id);

export const getWorkspaceTabId = (id: WorkspaceId): string => `workspace-tab-${id}`;

export const getWorkspacePanelId = (id: WorkspaceId): string => `workspace-panel-${id}`;
