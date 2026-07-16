export interface FixtureRegistry {
  rootId: string;
  createdNodeIds: string[];
  createdAt: string;
}

export const fixtureRootName = "__MOTIONOPS_API_LAB__";
export const fixtureRegistryStorageKey = "motionops.apiLab.fixtureRegistry";

export const createFixtureRegistry = (rootId: string, createdNodeIds: string[]): FixtureRegistry => ({
  rootId,
  createdNodeIds: Array.from(new Set([rootId, ...createdNodeIds])),
  createdAt: new Date().toISOString()
});

export const ownsFixtureNode = (
  registry: FixtureRegistry,
  nodeId: string,
  parentChainIds: string[]
): boolean =>
  registry.createdNodeIds.includes(nodeId) &&
  (nodeId === registry.rootId || parentChainIds.includes(registry.rootId));
