export type ContextDrawerMode = "context" | "change-preview";

export interface ContextDrawerModePresentation {
  accessibleLabel: string;
  tone: "neutral" | "preview";
}

export const getContextDrawerModePresentation = (
  mode: ContextDrawerMode
): ContextDrawerModePresentation => {
  switch (mode) {
    case "context":
      return { accessibleLabel: "Context drawer", tone: "neutral" };
    case "change-preview":
      return { accessibleLabel: "Change preview drawer", tone: "preview" };
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
};

export const isContextDrawerMode = (value: unknown): value is ContextDrawerMode =>
  value === "context" || value === "change-preview";
