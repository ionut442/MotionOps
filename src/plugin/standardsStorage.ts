import {
  createDefaultStandards,
  exportStandardsJson,
  parseStandardsJson,
  parseStandardsValue,
  type MotionStandards,
  type StandardsImportResult,
  type StandardsSource
} from "../domain/standards";

export type StandardsStorageAction =
  | { readonly kind: "list-personal" }
  | { readonly kind: "read-personal"; readonly id: string }
  | { readonly kind: "save-personal"; readonly standards: MotionStandards; readonly selectActive?: boolean }
  | { readonly kind: "rename-personal"; readonly id: string; readonly name: string }
  | { readonly kind: "delete-personal"; readonly id: string }
  | { readonly kind: "select-active"; readonly source: StandardsSource; readonly id?: string; readonly standards?: MotionStandards }
  | { readonly kind: "read-file" }
  | { readonly kind: "save-file"; readonly standards: MotionStandards }
  | { readonly kind: "import-json"; readonly json: string }
  | { readonly kind: "export-active" };

export interface StandardsStorageSummary {
  readonly id: string;
  readonly name: string;
  readonly source: StandardsSource;
  readonly standardsVersion: string;
  readonly updatedAtMs?: number;
}

export interface StandardsStorageState {
  readonly personal: readonly StandardsStorageSummary[];
  readonly file?: StandardsStorageSummary;
  readonly activeSource: StandardsSource;
  readonly activeId?: string;
  readonly active?: MotionStandards;
  readonly importResult?: StandardsImportResult;
  readonly exportedJson?: string;
  readonly errors: readonly StandardsStorageError[];
}

export interface StandardsStorageError {
  readonly code: "STORAGE_READ_FAILED" | "STORAGE_WRITE_FAILED" | "NOT_FOUND" | "VALIDATION_FAILED" | "NO_ACTIVE_STANDARD";
  readonly message: string;
  readonly detail?: string;
}

export interface StandardsStoragePorts {
  readonly clientGet: (key: string) => Promise<unknown>;
  readonly clientSet: (key: string, value: unknown) => Promise<void>;
  readonly rootGetPluginData: (key: string) => string;
  readonly rootSetPluginData: (key: string, value: string) => void;
  readonly nowMs: () => number;
}

const personalKey = "motionops.standards.personal.v1";
const activeKey = "motionops.standards.active.v1";
const fileKey = "motionops.standards.file.v1";

interface PersonalStore {
  readonly items: readonly MotionStandards[];
}

interface ActiveStore {
  readonly source: StandardsSource;
  readonly id?: string;
  readonly imported?: MotionStandards;
}

export const createStandardsStorage = (ports: StandardsStoragePorts) => ({
  handle: async (action: StandardsStorageAction): Promise<StandardsStorageState> => await handleAction(ports, action)
});

const handleAction = async (ports: StandardsStoragePorts, action: StandardsStorageAction): Promise<StandardsStorageState> => {
  try {
    switch (action.kind) {
      case "save-personal": {
        const validated = parseStandardsValue(action.standards);
        const standards = validated.standards;
        if (!validated.ok || standards === undefined) return await stateWithErrors(ports, validationError(validated));
        const store = await readPersonalStore(ports);
        const next = [...store.items.filter((item) => item.id !== standards.id), standards];
        await writePersonalStore(ports, { items: next });
        if (action.selectActive) await writeActive(ports, { source: "personal", id: standards.id });
        break;
      }
      case "rename-personal": {
        const store = await readPersonalStore(ports);
        const target = store.items.find((item) => item.id === action.id);
        if (target === undefined) return await stateWithErrors(ports, [{ code: "NOT_FOUND", message: "Personal standards set was not found." }]);
        await writePersonalStore(ports, { items: store.items.map((item) => item.id === action.id ? { ...item, name: action.name, metadata: { ...item.metadata, updatedAtMs: ports.nowMs() } } : item) });
        break;
      }
      case "delete-personal": {
        const store = await readPersonalStore(ports);
        await writePersonalStore(ports, { items: store.items.filter((item) => item.id !== action.id) });
        break;
      }
      case "select-active":
        await writeActive(ports, { source: action.source, id: action.id, imported: action.standards });
        break;
      case "save-file": {
        const validated = parseStandardsValue(action.standards);
        const standards = validated.standards;
        if (!validated.ok || standards === undefined) return await stateWithErrors(ports, validationError(validated));
        ports.rootSetPluginData(fileKey, exportStandardsJson(standards));
        break;
      }
      case "import-json":
        return { ...(await readState(ports)), importResult: parseStandardsJson(action.json) };
      case "export-active": {
        const state = await readState(ports);
        if (state.active === undefined) return { ...state, errors: [{ code: "NO_ACTIVE_STANDARD", message: "No active standards set is selected." }] };
        return { ...state, exportedJson: exportStandardsJson(state.active) };
      }
      case "list-personal":
      case "read-personal":
      case "read-file":
        break;
    }
    return await readState(ports);
  } catch (cause) {
    return {
      personal: [],
      activeSource: "personal",
      errors: [{ code: "STORAGE_READ_FAILED", message: "Standards storage failed safely.", detail: cause instanceof Error ? cause.message : undefined }]
    };
  }
};

const readState = async (ports: StandardsStoragePorts): Promise<StandardsStorageState> => {
  const personal = await readPersonalStore(ports);
  const active = await readActive(ports);
  const file = readFileStandards(ports);
  const activeStandards =
    active.source === "file" ? file :
    active.source === "imported" ? active.imported :
    personal.items.find((item) => item.id === active.id) ?? personal.items[0];
  return {
    personal: personal.items.map((item) => summary(item, "personal")),
    file: file === undefined ? undefined : summary(file, "file"),
    activeSource: active.source,
    activeId: active.id,
    active: activeStandards,
    errors: []
  };
};

const stateWithErrors = async (ports: StandardsStoragePorts, errors: readonly StandardsStorageError[]): Promise<StandardsStorageState> => ({
  ...(await readState(ports)),
  errors
});

const readPersonalStore = async (ports: StandardsStoragePorts): Promise<PersonalStore> => {
  const raw = await ports.clientGet(personalKey);
  if (!raw) return { items: [createDefaultStandards(ports.nowMs())] };
  if (typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return { items: [createDefaultStandards(ports.nowMs())] };
  const parsed = (raw as { items: unknown[] }).items.flatMap((item) => {
    const result = parseStandardsValue(item);
    const standards = result.standards;
    return result.ok && standards !== undefined ? [standards] : [];
  });
  return { items: parsed.length === 0 ? [createDefaultStandards(ports.nowMs())] : parsed };
};

const writePersonalStore = async (ports: StandardsStoragePorts, store: PersonalStore): Promise<void> => {
  await ports.clientSet(personalKey, { items: store.items.map((item) => JSON.parse(exportStandardsJson(item)) as unknown) });
};

const readActive = async (ports: StandardsStoragePorts): Promise<ActiveStore> => {
  const raw = await ports.clientGet(activeKey);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { source: "personal" };
  const source = (raw as { source?: unknown }).source;
  return source === "file" || source === "imported" || source === "personal" ? raw as unknown as ActiveStore : { source: "personal" };
};

const writeActive = async (ports: StandardsStoragePorts, active: ActiveStore): Promise<void> => {
  await ports.clientSet(activeKey, active.imported === undefined ? active : { ...active, imported: JSON.parse(exportStandardsJson(active.imported)) as unknown });
};

const readFileStandards = (ports: StandardsStoragePorts): MotionStandards | undefined => {
  const raw = ports.rootGetPluginData(fileKey);
  if (raw.trim().length === 0) return undefined;
  const result = parseStandardsJson(raw);
  return result.ok ? result.standards : undefined;
};

const summary = (standards: MotionStandards, source: StandardsSource): StandardsStorageSummary => ({
  id: standards.id,
  name: standards.name,
  source,
  standardsVersion: standards.metadata.version,
  updatedAtMs: standards.metadata.updatedAtMs
});

const validationError = (result: StandardsImportResult): StandardsStorageError[] =>
  result.errors.map((item) => ({ code: "VALIDATION_FAILED", message: item.message, detail: item.path }));
