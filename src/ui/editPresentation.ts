const PROPERTY_LABELS: Record<string, string> = {
  CORNER_RADIUS: "Corner radius",
  OPACITY: "Opacity",
  ROTATION: "Rotation",
  SCALE_X: "Scale X",
  SCALE_Y: "Scale Y",
  STROKE_WEIGHT: "Stroke weight",
  TRANSLATION_X: "Position X",
  TRANSLATION_Y: "Position Y",
  X: "Position X",
  Y: "Position Y"
};

export const propertyLabel = (property: string): string => {
  const known = PROPERTY_LABELS[property];
  if (known) {
    return known;
  }
  return property
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

export const statusLabel = (status: string): string => {
  switch (status) {
    case "supported":
      return "Editable";
    case "supported-with-warning":
      return "Editable with limitations";
    case "read-only":
      return "Read-only";
    case "partial":
      return "Partially editable";
    case "unsupported":
      return "Not editable";
    default:
      return propertyLabel(status);
  }
};
