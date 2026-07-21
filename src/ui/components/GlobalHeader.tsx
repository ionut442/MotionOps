import {
  getWorkspaceById,
  getWorkspaceIndex,
  WORKSPACES,
  type WorkspaceId
} from "../workspaces";
import { useApplicationState } from "../applicationStateContext";
import { getDocumentStatusPresentation } from "../documentStatusPresentation";
import { DocumentStatus } from "./DocumentStatus";
import { Icon } from "./Icon";

export const GlobalHeader = ({
  activeWorkspace,
  onHelpOpen
}: {
  activeWorkspace: WorkspaceId;
  onHelpOpen: () => void;
}) => {
  const applicationState = useApplicationState();
  const workspace = getWorkspaceById(activeWorkspace);
  const workspaceIndex = getWorkspaceIndex(activeWorkspace);
  const documentStatus = getDocumentStatusPresentation(applicationState);

  return (
    <header className="shell-header global-header" aria-label="MotionOps header">
      <div className="global-header-identity">
        <span className="brand-mark">
          <Icon name="motion" size={17} />
        </span>
        <span className="global-header-product">
          <span className="global-header-product-name">MotionOps</span>
          <span className="global-header-product-caption">Motion workflow toolkit</span>
        </span>
      </div>

      <div className="global-header-workspace" aria-label="Active workflow step" data-testid="header-workspace">
        <Icon name="sparkles" size={13} />
        <span className="workspace-context-label">{workspace.label}</span>
        <span className="global-header-step">
          {String(workspaceIndex + 1)}/{String(WORKSPACES.length)}
        </span>
      </div>

      <div className="global-header-status-slot">
        <DocumentStatus presentation={documentStatus} />
        <button
          aria-label="Open help and limitations"
          className="help-trigger"
          onClick={onHelpOpen}
          title="Help and limitations"
          type="button"
        >
          <Icon name="help" size={15} />
        </button>
      </div>
    </header>
  );
};
