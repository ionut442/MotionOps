import type { ReactElement } from "react";
import { useApplicationState } from "../ApplicationStateProvider";
import { WORKSPACE_LABELS } from "../../domain/workspaces";
import { Icon } from "./Icon";

export function GlobalHeader(): ReactElement {
  const { state } = useApplicationState();
  const workspace = WORKSPACE_LABELS[state.activeWorkspace];

  return (
    <header className="global-header" data-testid="global-header">
      <div className="global-header-brand">
        <span className="global-header-logo" aria-hidden="true">
          <Icon name="motion" size={16} />
        </span>
        <span className="global-header-title">MotionOps</span>
      </div>
      <div className="global-header-workspace" aria-label="Active workflow step" data-testid="header-workspace">
        <span className="workspace-context-label">{workspace.label}</span>
      </div>
      <div className="global-header-actions">
        <button
          className="header-action-button"
          data-testid="header-help"
          onClick={() => {
            window.parent.postMessage({ pluginMessage: { type: "open-help" } }, "*");
          }}
          title="Help & documentation"
          type="button"
        >
          <Icon name="help" size={14} />
          <span className="visually-hidden">Help</span>
        </button>
        <button
          className="header-action-button"
          data-testid="header-settings"
          onClick={() => {
            window.parent.postMessage({ pluginMessage: { type: "open-settings" } }, "*");
          }}
          title="Settings"
          type="button"
        >
          <Icon name="settings" size={14} />
          <span className="visually-hidden">Settings</span>
        </button>
      </div>
    </header>
  );
}
