import { useEffect, useId, type ReactNode } from "react";
import { getContextDrawerModePresentation, type ContextDrawerMode } from "../contextDrawerMode";
import { Icon } from "./Icon";

export interface ContextDrawerShellProps {
  open: boolean;
  mode: ContextDrawerMode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export const ContextDrawerShell = ({
  open,
  mode,
  title,
  description,
  children,
  footer,
  onClose
}: ContextDrawerShellProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const presentation = getContextDrawerModePresentation(mode);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <aside
      aria-describedby={description === undefined ? undefined : descriptionId}
      aria-labelledby={titleId}
      className="context-drawer-shell"
      data-mode={mode}
      data-tone={presentation.tone}
      role="complementary"
    >
      <div className="context-drawer-header">
        <div className="context-drawer-title-group">
          <span className="context-drawer-mode">{presentation.accessibleLabel}</span>
          <h2 className="context-drawer-title" id={titleId}>
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="context-drawer-description" id={descriptionId}>
              {description}
            </p>
          )}
        </div>
        <button
          aria-label={`Close ${presentation.accessibleLabel.toLowerCase()}`}
          className="context-drawer-close"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="context-drawer-content" data-testid="context-drawer-scroll">
        {children}
      </div>

      {footer === undefined ? null : <div className="context-drawer-footer">{footer}</div>}
    </aside>
  );
};
