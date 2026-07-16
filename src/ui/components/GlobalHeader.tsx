import { getWorkspaceById, type WorkspaceId } from "../workspaces";
import { useApplicationState } from "../applicationStateContext";
import { getDocumentStatusPresentation } from "../documentStatusPresentation";
import { DocumentStatus } from "./DocumentStatus";

export const GlobalHeader = ({
  activeWorkspace,
  onHelpOpen
}: {
  activeWorkspace: WorkspaceId;
  onHelpOpen: () => void;
}) => {
  const applicationState = useApplicationState();
  const workspace = getWorkspaceById(activeWorkspace);
  const documentStatus = getDocumentStatusPresentation(applicationState);

  return (
    <header className="shell-header global-header" aria-label="MotionOps header">
      <div className="global-header-identity">
        <p className="eyebrow">Product</p>
        <h1>MotionOps</h1>
      </div>
      <div className="global-header-workspace" aria-label="Active workspace" data-testid="header-workspace">
        <span className="global-header-separator" aria-hidden="true">
          /
        </span>
        <span className="workspace-context-label">{workspace.label}</span>
        <span className="workspace-context-caption">workspace</span>
      </div>
      <div className="global-header-status-slot">
        <DocumentStatus presentation={documentStatus} />
        <button aria-label="Open help and limitations" className="help-trigger" onClick={onHelpOpen} type="button">
          ?
        </button>
      </div>
    </header>
  );
};
