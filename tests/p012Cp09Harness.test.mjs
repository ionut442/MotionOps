import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = async () => readFile("src/plugin/diagnostics/p012Fixtures.ts", "utf8");

describe("P0-012 CP09 harness contracts", () => {
  it("does not run Undo before write support is proven", async () => {
    const text = await source();
    const commitIndex = text.indexOf("figma.commitUndo()");
    const writeIndex = text.indexOf("const writeSupported = await runWriteProbe()", commitIndex);
    const undoIndex = text.indexOf("figma.triggerUndo()", writeIndex);
    const guardIndex = text.indexOf("if (!writeSupported)", writeIndex);
    expect(commitIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(commitIndex);
    expect(guardIndex).toBeGreaterThan(writeIndex);
    expect(undoIndex).toBeGreaterThan(guardIndex);
  });

  it("uses one shared component-property writer for CP07 and CP09", async () => {
    const text = await source();
    expect(text.match(/const writeP012ComponentProperty =/g)).toHaveLength(1);
    expect(text.match(/writeP012ComponentProperty\(/g)?.length).toBe(1);
    expect(text).toContain("const runWriteProbe = async");
    expect(text.match(/await runWriteProbe\(\)/g)?.length).toBe(2);
    expect(text).toContain("target.setProperties({ [propertyName]: planned })");
    expect(text).toContain("setProperties.call(target, { [propertyName]: beforeValue })");
  });
});
