export type WorkspaceId = "scope" | "inspect" | "edit" | "sequence" | "review";

export const WORKSPACE_ORDER: readonly WorkspaceId[] = ["scope", "inspect", "edit", "sequence", "review"];

export const WORKSPACE_LABELS: Record<WorkspaceId, { readonly label: string }> = {
  scope: { label: "Scope" },
  inspect: { label: "Inspect" },
  edit: { label: "Edit" },
  sequence: { label: "Sequence" },
  review: { label: "Review" }
};
