import type { DocumentStatusPresentation } from "../documentStatusPresentation";

export const DocumentStatus = ({
  presentation
}: {
  presentation: DocumentStatusPresentation;
}) => {
  const descriptionId = "document-status-description";
  const description = [presentation.description, presentation.supportText]
    .filter((part): part is string => part !== undefined)
    .join(" ");

  return (
    <section
      aria-busy={presentation.busy}
      aria-describedby={descriptionId}
      aria-label={`Document status: ${presentation.label}`}
      className="document-status"
      data-testid="document-status"
      data-tone={presentation.tone}
    >
      <span aria-hidden="true" className="document-status-marker" />
      <span className="document-status-copy">
        <span className="document-status-label">{presentation.label}</span>
        <span className="document-status-description" id={descriptionId}>
          {description}
        </span>
      </span>
    </section>
  );
};
