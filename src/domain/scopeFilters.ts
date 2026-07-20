import type { ScopeScanNode, ScopeScanResult } from "./scopeScan";

export interface ScopeFilterDefinition {
  readonly search: string;
  readonly visibleOnly: boolean;
  readonly unlockedOnly: boolean;
  readonly nodeTypes: readonly string[];
  readonly excludedNodeIds: readonly string[];
}

export const createDefaultScopeFilters = (): ScopeFilterDefinition =>
  Object.freeze({
    search: "",
    visibleOnly: false,
    unlockedOnly: false,
    nodeTypes: Object.freeze([]),
    excludedNodeIds: Object.freeze([])
  });

const normalizeSearch = (value: string): string => value.trim().toLocaleLowerCase();

const normalizeSet = (values: readonly string[]): ReadonlySet<string> => new Set(values);

const matchesFilters = (
  node: ScopeScanNode,
  filters: ScopeFilterDefinition,
  selectedTypes: ReadonlySet<string>,
  excludedIds: ReadonlySet<string>
): boolean => {
  const search = normalizeSearch(filters.search);
  if (search.length > 0 && !node.name.toLocaleLowerCase().includes(search)) {
    return false;
  }

  if (filters.visibleOnly && !node.visible) {
    return false;
  }

  if (filters.unlockedOnly && node.locked) {
    return false;
  }

  if (selectedTypes.size > 0 && !selectedTypes.has(node.type)) {
    return false;
  }

  if (excludedIds.has(node.id)) {
    return false;
  }

  return true;
};

export const applyScopeFilters = (
  result: ScopeScanResult,
  filters: ScopeFilterDefinition
): ScopeScanResult => {
  const selectedTypes = normalizeSet(filters.nodeTypes);
  const excludedIds = normalizeSet(filters.excludedNodeIds);
  const keptNodes = result.nodes.filter((node) =>
    matchesFilters(node, filters, selectedTypes, excludedIds)
  );
  const keptIds = new Set(keptNodes.map((node) => node.id));
  const filteredNodes = keptNodes.map((node) =>
    Object.freeze({
      ...node,
      childIds: Object.freeze(node.childIds.filter((childId) => keptIds.has(childId)))
    })
  );

  return Object.freeze({
    roots: Object.freeze(result.roots.filter((rootId) => keptIds.has(rootId))),
    nodes: Object.freeze(filteredNodes),
    issues: Object.freeze([...result.issues])
  });
};

export const hasActiveScopeFilters = (filters: ScopeFilterDefinition): boolean =>
  normalizeSearch(filters.search).length > 0 ||
  filters.visibleOnly ||
  filters.unlockedOnly ||
  filters.nodeTypes.length > 0 ||
  filters.excludedNodeIds.length > 0;
