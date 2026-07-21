import { Icon, type IconName } from "./Icon";
import { Tooltip } from "./ui";

const iconForNodeType = (nodeType: string): IconName => {
  switch (nodeType.toUpperCase()) {
    case "FRAME":
    case "SECTION":
    case "SLICE":
      return "frame-node";
    case "RECTANGLE":
    case "ROUNDED_RECTANGLE":
    case "LINE":
      return "rectangle-node";
    case "ELLIPSE":
      return "ellipse-node";
    case "GROUP":
      return "group-node";
    case "COMPONENT":
    case "COMPONENT_SET":
      return "component-node";
    case "INSTANCE":
      return "instance-node";
    case "TEXT":
      return "text-node";
    default:
      return "shape-node";
  }
};

const labelForNodeType = (nodeType: string): string =>
  nodeType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const FigmaNodeIcon = ({
  nodeType,
  size = 14
}: {
  readonly nodeType: string;
  readonly size?: number;
}) => (
  <Tooltip content={labelForNodeType(nodeType)}>
    <span className="figma-node-icon" data-node-type={nodeType.toLowerCase()}>
      <Icon name={iconForNodeType(nodeType)} size={size} />
      <span className="visually-hidden">{labelForNodeType(nodeType)}</span>
    </span>
  </Tooltip>
);

export const MotionSourceIcon = ({
  sourceKind,
  size = 13
}: {
  readonly sourceKind: string;
  readonly size?: number;
}) => {
  const presentation: { readonly icon: IconName; readonly label: string } =
    sourceKind === "manual"
      ? { icon: "manual-motion", label: "Manual Motion" }
      : sourceKind === "style"
        ? { icon: "style-motion", label: "Animation style" }
        : sourceKind === "mixed"
          ? { icon: "layers", label: "Mixed Motion sources" }
          : { icon: "motion-off", label: "No Motion" };

  return (
    <Tooltip content={presentation.label}>
      <span className="inspector-icon-token" data-kind={sourceKind}>
        <Icon name={presentation.icon} size={size} />
        <span className="visually-hidden">{presentation.label}</span>
      </span>
    </Tooltip>
  );
};
