import { describe, expect, it } from "vitest";
import { createDefaultStandards } from "../src/domain/standards";
import { createStandardsStorage } from "../src/plugin/standardsStorage";

const createPorts = () => {
  const client = new Map<string, unknown>();
  const pluginData = new Map<string, string>();
  return {
    client,
    pluginData,
    ports: {
      clientGet: (key: string) => Promise.resolve(client.get(key)),
      clientSet: (key: string, value: unknown) => { client.set(key, value); return Promise.resolve(); },
      rootGetPluginData: (key: string) => pluginData.get(key) ?? "",
      rootSetPluginData: (key: string, value: string) => { pluginData.set(key, value); },
      nowMs: () => 100
    }
  };
};

describe("Phase 8 standards storage adapter", () => {
  it("supports personal save/read/list/delete, active selection, file storage, import, export, and corrupt data fallback", async () => {
    const { ports, client } = createPorts();
    const storage = createStandardsStorage(ports);
    const standards = { ...createDefaultStandards(100), id: "team-motion", name: "Team Motion" };
    let state = await storage.handle({ kind: "save-personal", standards, selectActive: true });
    expect(state.personal.map((item) => item.id)).toContain("team-motion");
    expect(state.active?.id).toBe("team-motion");
    state = await storage.handle({ kind: "rename-personal", id: "team-motion", name: "Renamed Motion" });
    expect(state.personal.find((item) => item.id === "team-motion")?.name).toBe("Renamed Motion");
    state = await storage.handle({ kind: "save-file", standards });
    expect(state.file?.id).toBe("team-motion");
    state = await storage.handle({ kind: "export-active" });
    expect(state.exportedJson).toContain("team-motion");
    state = await storage.handle({ kind: "import-json", json: state.exportedJson ?? "" });
    expect(state.importResult?.ok).toBe(true);
    state = await storage.handle({ kind: "delete-personal", id: "team-motion" });
    expect(state.personal.map((item) => item.id)).not.toContain("team-motion");

    client.set("motionops.standards.personal.v1", { items: ["corrupt"] });
    state = await storage.handle({ kind: "list-personal" });
    expect(state.personal.length).toBeGreaterThan(0);
    expect(JSON.stringify(state)).not.toMatch(/manualKeyframeTracks|animationStyles|screenshots/);
  });
});
