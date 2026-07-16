import { asRecord } from "./object";
import type { CapabilityStatus, MotionCapability, MotionCapabilitySet, MotionSceneNode } from "./types";

const capability = (status: CapabilityStatus, reason: string): MotionCapability => ({ status, reason });

const hasFunction = (record: Record<string, unknown>, name: string): boolean => typeof record[name] === "function";

const hasReadable = (record: Record<string, unknown>, name: string): boolean => name in record;

export const classifyMotionCapabilities = (node: MotionSceneNode): MotionCapabilitySet => {
  const record = asRecord(node) ?? {};
  const hasManualTracks = hasReadable(record, "manualKeyframeTracks");
  const hasStyles = hasReadable(record, "animationStyles");
  const hasAnimations = hasReadable(record, "animations");
  const hasTimelines = hasReadable(record, "timelines");
  const componentDefinitions = hasReadable(record, "componentPropertyDefinitions");
  const componentState = hasReadable(record, "componentProperties");
  const componentPropertyReads = componentDefinitions || componentState;
  const componentMotionTracks = hasManualTracks && componentState;
  const hasBooleanComponentProperty = Object.values(asRecord(record.componentProperties) ?? {}).some((state) => {
    const stateRecord = asRecord(state);
    return stateRecord?.type === "BOOLEAN";
  });

  const category = classifyNodeCategory(node);

  return {
    derivedAnimationReads: hasAnimations
      ? capability("supported", "P0-006 accepted derived animation reads.")
      : capability("unsupported", "No animations collection on this node."),
    manualTrackReads: hasManualTracks
      ? capability("supported", "P0-006 accepted manual track reads.")
      : capability("unsupported", "No manualKeyframeTracks collection on this node."),
    manualTrackReplacement: hasFunction(record, "applyManualKeyframeTrack")
      ? capability("supported-with-warning", "P0-007 preserved track identity but edited keyframe IDs are observational only.")
      : capability("unsupported", "No applyManualKeyframeTrack method on this node."),
    styleInstanceReads: hasStyles
      ? capability("supported", "P0-006/P0-008 accepted style-instance reads.")
      : capability("unsupported", "No animationStyles collection on this node."),
    styleRemoveReapply:
      hasFunction(record, "removeAnimationStyle") && hasFunction(record, "applyAnimationStyle")
        ? capability("supported-with-warning", "P0-008 supports remove applied instance then reapply available style.")
        : capability("unsupported", "Style remove/reapply methods are unavailable on this node."),
    directStyleReapply: hasFunction(record, "applyAnimationStyle")
      ? capability("unsupported", "P0-008 found direct reapply/update duplicates style instances.")
      : capability("unsupported", "No applyAnimationStyle method on this node."),
    timelineReads: hasTimelines
      ? capability("supported", "P0-006 accepted timeline reads.")
      : capability("unsupported", "No timelines collection on this node."),
    timelineDurationWrites: hasFunction(record, "setTimelineDuration")
      ? capability("supported-with-warning", "P0-009 accepted duration writes with immediate re-read and below-keyframe warning.")
      : capability("unsupported", "No setTimelineDuration method on this node."),
    componentPropertyReads: componentPropertyReads
      ? capability("supported", "P0-012 accepted property API reads.")
      : capability("unsupported", "No component property API fields on this node."),
    componentPropertyMotionTrackReads: componentMotionTracks
      ? capability("supported-with-warning", "P0-012 CP09 found BOOLEAN property Motion track exposure.")
      : componentPropertyReads
        ? capability("read-only", "Property API is visible but Motion track exposure is not present.")
        : capability("unsupported", "No component property Motion exposure detected."),
    componentPropertyWrites: componentState && hasFunction(record, "setProperties") && hasBooleanComponentProperty
      ? capability("supported-with-warning", "P0-012 CP09 supports BOOLEAN setProperties writes; undo re-read is partial.")
      : componentDefinitions
        ? capability("read-only", "Definitions are readable, but this node has no instance property state.")
        : componentState
          ? capability("read-only", "Component-property state is readable but no verified BOOLEAN write path is available.")
          : capability("unsupported", "No writable component property state detected."),
    componentRoots: category.componentRoots,
    componentChildren: category.componentChildren,
    componentSets: category.componentSets,
    variantComponents: category.variantComponents,
    instanceRoots: category.instanceRoots,
    instanceDescendants: category.instanceDescendants,
    nestedInstances: category.nestedInstances,
    nestedDescendants: category.nestedDescendants
  };
};

const classifyNodeCategory = (node: MotionSceneNode): Pick<
  MotionCapabilitySet,
  | "componentRoots"
  | "componentChildren"
  | "componentSets"
  | "variantComponents"
  | "instanceRoots"
  | "instanceDescendants"
  | "nestedInstances"
  | "nestedDescendants"
> => {
  const parentTypes = collectParentTypes(node);
  const isComponent = node.type === "COMPONENT";
  const isComponentSet = node.type === "COMPONENT_SET";
  const isInstance = node.type === "INSTANCE";
  const insideComponent = parentTypes.includes("COMPONENT");
  const insideComponentSet = parentTypes.includes("COMPONENT_SET");
  const insideInstance = parentTypes.includes("INSTANCE");
  const nestedInstance = isInstance && insideInstance;

  return {
    componentRoots: isComponent
      ? capability("read-only", "P0-011 evidence keeps component roots restricted for writes.")
      : capability("unknown", "Node is not a component root."),
    componentChildren: insideComponent
      ? capability("read-only", "P0-011 keeps component children restricted.")
      : capability("unknown", "Node is not inside a component."),
    componentSets: isComponentSet
      ? capability("read-only", "P0-011 keeps component sets restricted.")
      : capability("unknown", "Node is not a component set."),
    variantComponents: isComponent && insideComponentSet
      ? capability("read-only", "P0-011 treats variant components as restricted.")
      : capability("unknown", "Node is not a variant component."),
    instanceRoots: isInstance && !insideInstance
      ? capability("read-only", "P0-011 full-run evidence was not accepted; only separately verified component-property writes may mutate instances.")
      : capability("unknown", "Node is not a top-level instance root."),
    instanceDescendants: !isInstance && insideInstance
      ? capability("read-only", "P0-011 keeps instance descendants restricted unless explicitly supported later.")
      : capability("unknown", "Node is not an instance descendant."),
    nestedInstances: nestedInstance
      ? capability("read-only", "P0-011 nested instance support remains restricted.")
      : capability("unknown", "Node is not a nested instance."),
    nestedDescendants: insideInstance && parentTypes.filter((type) => type === "INSTANCE").length > 1
      ? capability("read-only", "P0-011 nested descendants remain restricted.")
      : capability("unknown", "Node is not a nested descendant.")
  };
};

const collectParentTypes = (node: MotionSceneNode): string[] => {
  const types: string[] = [];
  let parent = node.parent;
  while (parent) {
    types.push(parent.type);
    parent = parent.parent;
  }
  return types;
};
