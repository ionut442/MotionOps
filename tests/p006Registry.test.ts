import { describe, expect, it } from "vitest";
import { implementedMotionDiagnosticCommands } from "../src/shared/diagnostics";
import {
  p006EvidenceFilename,
  p006ExpectedFiles,
  p006TestDefinitions
} from "../src/shared/p006Registry";

describe("P0-006 test registry", () => {
  it("defines R01 through R10 exactly once", () => {
    const ids = p006TestDefinitions.map((definition) => definition.id);
    expect(ids).toEqual(["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps R01 fixtureless and every other test fixture-backed", () => {
    expect(p006TestDefinitions[0].fixtureBuilder).toBeNull();
    for (const definition of p006TestDefinitions.slice(1)) {
      expect(definition.fixtureBuilder).not.toBeNull();
      expect(definition.fixtureName).toContain(definition.id);
    }
  });

  it("uses valid command lists and deterministic unique filenames", () => {
    const validCommands = new Set(implementedMotionDiagnosticCommands);
    const allFiles = p006TestDefinitions.flatMap((definition) => {
      for (const command of definition.commands) {
        expect(validCommands.has(command)).toBe(true);
      }
      return p006ExpectedFiles(definition);
    });
    expect(new Set(allFiles).size).toBe(allFiles.length);
    expect(allFiles.every((file) => /^R(?:0[1-9]|10)-[a-z0-9-]+-[a-z0-9-]+\.json$/.test(file))).toBe(true);
  });

  it("generates canonical known filenames", () => {
    const r04 = p006TestDefinitions.find((definition) => definition.id === "R04");
    if (r04 === undefined) {
      throw new Error("R04 definition missing.");
    }
    expect(p006EvidenceFilename(r04, "multi-property", "READ_MOTION_DATA")).toBe(
      "R04-multi-property-read-motion-data.json"
    );
    const r07 = p006TestDefinitions.find((definition) => definition.id === "R07");
    if (r07 === undefined) {
      throw new Error("R07 definition missing.");
    }
    expect(p006EvidenceFilename(r07, "parent-and-child-explicit-targets", "READ_TIMELINES")).toBe(
      "R07-parent-and-child-explicit-targets-read-timelines.json"
    );
    expect(r07.selections[2].title).toContain("explicit targets");
  });
});
