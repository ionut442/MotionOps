import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFeatureGate, FEATURE_IDS } from "../src/shared/featureAccess";

const filesUnder = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(fullPath);
      return [fullPath];
    })
  );
  return nested.flat();
};

describe("feature access abstraction", () => {
  it("makes current release features available by default and fails unknown features safely", () => {
    const gate = createFeatureGate();
    for (const featureId of FEATURE_IDS) {
      expect(gate.get(featureId)).toEqual({ available: true });
    }
    expect(gate.get("billing-only")).toEqual({ available: false, reason: "Unknown feature." });
  });

  it("supports dependency-injected UI overrides without network or design data", () => {
    const gate = createFeatureGate({ "safe-fixes": { available: false, reason: "Disabled in this build." } });
    expect(gate.get("safe-fixes")).toEqual({ available: false, reason: "Disabled in this build." });
    expect(gate.get("handoff")).toEqual({ available: true });
    expect(JSON.stringify(gate)).not.toMatch(/fetch|XMLHttpRequest|nodeId|layer|page|manualKeyframeTracks/i);
  });

  it("keeps domain and Motion core independent from licensing", async () => {
    const files = [
      ...(await filesUnder(join(process.cwd(), "src", "domain"))),
      ...(await filesUnder(join(process.cwd(), "src", "plugin", "motion")))
    ].filter((file) => /\.(ts|tsx)$/.test(file));

    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text, file).not.toMatch(/featureAccess|FeatureGate|license|billing|subscription/i);
    }
  });
});
