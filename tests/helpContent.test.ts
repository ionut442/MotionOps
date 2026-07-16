import { describe, expect, it } from "vitest";
import { HELP_EXCLUSIONS, HELP_FALSE_CLAIM_PATTERNS, HELP_SECTIONS } from "../src/shared/helpContent";

const helpText = [
  ...HELP_SECTIONS.flatMap((section) => [section.title, ...section.items]),
  ...HELP_EXCLUSIONS
].join("\n");

describe("release help content", () => {
  it("covers the major workflows and limitations", () => {
    for (const expected of [
      "Scope, Inspect, Edit, Sequence, and Review",
      "Native Figma Motion remains the source of truth",
      "stale data blocks guarded writes",
      "Unsupported, read-only, partial, and unknown states",
      "Copy/Paste",
      "Sequencer",
      "QA",
      "Handoff",
      "personal and file-level Motion standards",
      "Analytics are disabled",
      "beta",
      "Dynamic-page"
    ]) {
      expect(helpText).toContain(expected);
    }
  });

  it("explains required exclusions and avoids false support claims", () => {
    for (const expected of [
      "No playback or playhead control.",
      "No custom pivot or anchor editing.",
      "No custom preview engine.",
      "No code generation.",
      "No Motion backup or restore.",
      "No Lottie, After Effects, Rive, or Jitter conversion.",
      "No cloud scanning.",
      "No automatic background monitoring."
    ]) {
      expect(helpText).toContain(expected);
    }

    for (const pattern of HELP_FALSE_CLAIM_PATTERNS) {
      expect(helpText).not.toMatch(pattern);
    }
  });
});
