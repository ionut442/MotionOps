import { HELP_EXCLUSIONS, HELP_SECTIONS } from "../../shared/helpContent";
import { ContextDrawerShell } from "./ContextDrawerShell";

export const HelpDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <ContextDrawerShell
    description="Release-candidate guidance for supported workflows, privacy, and current limitations."
    mode="context"
    onClose={onClose}
    open={open}
    title="Help and limitations"
  >
    <div className="help-content">
      {HELP_SECTIONS.map((section) => (
        <section className="help-section" key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className="help-section">
        <h3>Excluded</h3>
        <ul>
          {HELP_EXCLUSIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  </ContextDrawerShell>
);
