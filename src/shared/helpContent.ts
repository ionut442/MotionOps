export interface HelpSection {
  readonly title: string;
  readonly items: readonly string[];
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    title: "Workflow",
    items: [
      "MotionOps helps review, edit, sequence, QA, and hand off native Figma Motion data from an explicit Scope.",
      "The five workspaces are Scope, Inspect, Edit, Sequence, and Review.",
      "Scope defines a draft target set from the current selection, then shares it only after Confirm scope.",
      "Manual Scope uses hierarchy checkboxes instead of raw Figma node IDs.",
      "Preview before Apply is the normal write path, and stale data blocks guarded writes.",
      "Native Figma Motion remains the source of truth after every read, write, and reread."
    ]
  },
  {
    title: "Motion Support",
    items: [
      "Manual Motion tracks can be inspected and planned through supported timing and easing workflows.",
      "Style Motion is visible where exposed by Figma, but style limitations remain explicit and are not hidden.",
      "Unsupported, read-only, partial, and unknown states are shown as warnings instead of being treated as success.",
      "Copy/Paste, Sequencer, Stagger, QA safe fixes, and Handoff use the same scoped Motion data and guarded Apply boundary.",
      "Native Undo behavior still requires final live desktop and browser evidence before full release support is claimed."
    ]
  },
  {
    title: "Standards And Handoff",
    items: [
      "Review includes personal and file-level Motion standards storage.",
      "QA compares Motion against standards, records exceptions, and only offers safe fixes where the write path is supported.",
      "Handoff exports Markdown or JSON summaries for review and implementation notes.",
      "Report JSON is an export format, not a Motion backup or restoration format."
    ]
  },
  {
    title: "Privacy",
    items: [
      "Analytics are disabled in this release candidate.",
      "MotionOps does not perform cloud scanning, automatic monitoring, screenshots, or design-file uploads.",
      "No file, page, layer, Motion, Scope, standard, QA, report, client, or user content is sent to an analytics provider."
    ]
  },
  {
    title: "Known Limits",
    items: [
      "Figma Motion APIs are beta, and browser/desktop parity remains blocked until real Figma sessions are verified.",
      "Dynamic-page behavior requires explicit current-page and live large-file verification.",
      "There is no playback or playhead control, custom pivot or anchor editing, custom preview engine, Motion backup or restore, or Lottie, After Effects, Rive, or Jitter conversion.",
      "Unknown beta fields, springs, style writes, paint/effect tracks, and unsupported properties stay warning, read-only, partial, or unknown until evidence proves otherwise."
    ]
  }
];

export const HELP_EXCLUSIONS: readonly string[] = [
  "No playback or playhead control.",
  "No custom pivot or anchor editing.",
  "No custom preview engine.",
  "No code generation.",
  "No Motion backup or restore.",
  "No Lottie, After Effects, Rive, or Jitter conversion.",
  "No cloud scanning.",
  "No automatic background monitoring."
];

export const HELP_FALSE_CLAIM_PATTERNS: readonly RegExp[] = [
  /fully verified browser and desktop parity/i,
  /live figma parity is complete/i,
  /restores motion from report json/i,
  /analytics are enabled/i,
  /cloud scans/i
];
