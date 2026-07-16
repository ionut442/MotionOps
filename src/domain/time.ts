export type TimeMs = number & { readonly __brand: "TimeMs" };
export type FigmaSeconds = number & { readonly __brand: "FigmaSeconds" };

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
};

export const figmaSecondsToTimeMs = (seconds: number): TimeMs => {
  assertFinite(seconds, "Figma seconds");
  if (seconds < 0) {
    throw new Error("Figma seconds must be non-negative");
  }

  return Math.round(seconds * 1000) as TimeMs;
};

export const secondsToMilliseconds = figmaSecondsToTimeMs;

export const timeMsToFigmaSeconds = (milliseconds: number): FigmaSeconds => {
  assertFinite(milliseconds, "Time milliseconds");
  if (!Number.isInteger(milliseconds)) {
    throw new Error("Time milliseconds must be an integer");
  }

  if (milliseconds < 0) {
    throw new Error("Time milliseconds must be non-negative");
  }

  return (milliseconds / 1000) as FigmaSeconds;
};

export const millisecondsToSeconds = timeMsToFigmaSeconds;
