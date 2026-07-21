import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const redesignCss = readFileSync(new URL("../src/ui/redesign.css", import.meta.url), "utf8");
const inspectSource = readFileSync(new URL("../src/ui/InspectWorkspace.tsx", import.meta.url), "utf8");
const scopeSource = readFileSync(new URL("../src/ui/ScopeWorkspace.tsx", import.meta.url), "utf8");

const ruleFor = (selector: string): string => {
  const start = redesignCss.lastIndexOf(selector);
  if (start < 0) return "";
  const open = redesignCss.indexOf("{", start);
  const close = redesignCss.indexOf("}", open);
  return open < 0 || close < 0 ? "" : redesignCss.slice(open + 1, close);
};

describe("UI responsive contracts", () => {
  it("keeps every workspace stage banner at one compact height", () => {
    const rule = ruleFor(".workspace-stage-header");
    expect(rule).toContain("height: 64px");
    expect(rule).toContain("max-height: 64px");
    expect(rule).toContain("min-height: 64px");
    expect(redesignCss).toContain("grid-template-rows: max-content minmax(0, 1fr)");
  });

  it("makes enabled and disabled primary actions visually distinct", () => {
    expect(redesignCss).toContain(".primary-action:not(:disabled)");
    expect(redesignCss).toContain("background: var(--mo-accent) !important");
    expect(redesignCss).toContain(".primary-action:disabled");
    expect(redesignCss).toContain("background: #ececf0 !important");
    expect(redesignCss).toContain(".scope-action-bar > button > span");
    expect(scopeSource).toContain('disabled={draftScopeResult === null}');
  });

  it("uses icon-led Scope and Inspector rows", () => {
    expect(scopeSource).toContain("<FigmaNodeIcon");
    expect(scopeSource).toContain('name="hidden"');
    expect(scopeSource).toContain('name="locked"');
    expect(inspectSource).toContain("<FigmaNodeIcon");
    expect(inspectSource).toContain("<MotionSourceIcon");
    expect(inspectSource).toContain('name="partial"');
    expect(inspectSource).not.toContain("targetMetadataLabel");
  });

  it("stacks Inspector content before the list and detail can collide", () => {
    expect(redesignCss).toContain("container-name: inspector");
    expect(redesignCss).toContain("@container inspector (max-width: 720px)");
    expect(redesignCss).toContain("grid-template-rows: minmax(150px, 38%) minmax(220px, 1fr)");
  });

  it("provides component-level breakpoints for every dense workspace", () => {
    expect(redesignCss).toContain("@container scope (max-width: 700px)");
    expect(redesignCss).toContain("@container editor (max-width: 680px)");
    expect(redesignCss).toContain("@container sequencer (max-width: 780px)");
    expect(redesignCss).toContain("@container reviewer (max-width: 520px)");
  });
});
