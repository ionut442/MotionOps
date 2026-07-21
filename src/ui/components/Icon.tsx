import type { CSSProperties, SVGProps } from "react";

export type IconName =
  | "motion"
  | "layers"
  | "inspect"
  | "edit"
  | "sequence"
  | "review"
  | "help"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "refresh"
  | "filter"
  | "check"
  | "minus"
  | "search"
  | "eye"
  | "sparkles"
  | "settings"
  | "close"
  | "undo"
  | "play"
  | "copy"
  | "timing"
  | "easing"
  | "stagger"
  | "qa"
  | "handoff";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  readonly name: IconName;
  readonly size?: number;
}

const strokes: Record<Exclude<IconName, "motion">, readonly string[]> = {
  layers: ["M3.25 5.25 8 2.75l4.75 2.5L8 7.75l-4.75-2.5Z", "m3.25 8 1.75.92L8 10.5l3-1.58L12.75 8", "m3.25 10.75 4.75 2.5 4.75-2.5"],
  inspect: ["M7.25 12.25a5 5 0 1 1 3.54-1.46", "m10.75 10.75 2.5 2.5", "M7.25 5v4.5", "M5 7.25h4.5"],
  edit: ["m3 11.75.65-2.55 6.9-6.9a1.05 1.05 0 0 1 1.48 0l.67.67a1.05 1.05 0 0 1 0 1.48l-6.9 6.9-2.55.65Z", "m9.75 3.1 3.15 3.15", "M3.25 13h9.5"],
  sequence: ["M3 4h10", "M3 8h10", "M3 12h10", "M5.25 2.75v2.5", "M10.75 6.75v2.5", "M7.75 10.75v2.5"],
  review: ["M8 2.5 12.5 4v3.65c0 2.55-1.52 4.6-4.5 5.85-2.98-1.25-4.5-3.3-4.5-5.85V4L8 2.5Z", "m5.7 8 1.45 1.45 3.2-3.2"],
  help: ["M6.3 6.1a1.85 1.85 0 1 1 2.72 1.63C8.36 8.1 8 8.5 8 9.2", "M8 11.75h.01", "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"],
  "chevron-down": ["m4.25 6.25 3.75 3.5 3.75-3.5"],
  "chevron-left": ["m9.75 3.75-4.25 4.25 4.25 4.25"],
  "chevron-right": ["m6.25 3.75 4.25 4.25-4.25 4.25"],
  refresh: ["M12.75 5.5V2.75L11.4 4.1A5.25 5.25 0 1 0 13.25 8", "M12.75 2.75H10"],
  filter: ["M2.75 3.25h10.5L9.25 8v3.5l-2.5 1.25V8l-4-4.75Z"],
  check: ["m3.25 8.1 3 3.05 6.5-6.5"],
  minus: ["M3.5 8h9"],
  search: ["M7 11.5a4.5 4.5 0 1 1 3.18-1.32", "m10.25 10.25 3 3"],
  eye: ["M2.25 8s2-3.5 5.75-3.5S13.75 8 13.75 8 11.75 11.5 8 11.5 2.25 8 2.25 8Z", "M8 9.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"],
  sparkles: ["m6.25 2 .55 1.7L8.5 4.25l-1.7.55-.55 1.7-.55-1.7L4 4.25l1.7-.55L6.25 2Z", "m10.5 7 .85 2.15L13.5 10l-2.15.85L10.5 13l-.85-2.15L7.5 10l2.15-.85L10.5 7Z", "M3.5 9.5v2", "M2.5 10.5h2"],
  settings: ["M8 5.75A2.25 2.25 0 1 1 8 10.25 2.25 2.25 0 0 1 8 5.75Z", "M6.8 2.75h2.4l.35 1.3a4.3 4.3 0 0 1 1 .58l1.3-.38 1.2 2.08-.95.93c.04.24.06.49.06.74s-.02.5-.06.74l.95.93-1.2 2.08-1.3-.38a4.3 4.3 0 0 1-1 .58l-.35 1.3H6.8l-.35-1.3a4.3 4.3 0 0 1-1-.58l-1.3.38-1.2-2.08.95-.93A4.5 4.5 0 0 1 3.84 8c0-.25.02-.5.06-.74l-.95-.93 1.2-2.08 1.3.38a4.3 4.3 0 0 1 1-.58l.35-1.3Z"],
  close: ["m4 4 8 8", "m12 4-8 8"],
  undo: ["M5.25 5.25 2.75 7.5 5.25 9.75", "M3 7.5h5.25a4.25 4.25 0 0 1 4.25 4.25"],
  play: ["m5 3.25 7 4.75-7 4.75v-9.5Z"],
  copy: ["M5.25 5.25h7v7h-7z", "M3.75 10.75h-1v-8h8v1"],
  timing: ["M8 3.25A4.75 4.75 0 1 1 3.25 8 4.75 4.75 0 0 1 8 3.25Z", "M8 5.25V8l2 1.25", "M6.25 1.75h3.5"],
  easing: ["M2.75 12.5c2.1 0 2.25-9 5.25-9 2.1 0 2.25 9 5.25 9", "M2.75 12.5h10.5"],
  stagger: ["M3 4.25h4v2.5H3z", "M5.5 7.25h4v2.5h-4z", "M8 10.25h4v2.5H8z"],
  qa: ["M8 2.5 12.5 4v3.65c0 2.55-1.52 4.6-4.5 5.85-2.98-1.25-4.5-3.3-4.5-5.85V4L8 2.5Z", "M5.5 8h5", "M8 5.5v5"],
  handoff: ["M3 3.25h6.5l3.5 3.5v6H3v-9.5Z", "M9.5 3.25v3.5H13", "M5.25 10.25h5.5"]
};

export const Icon = ({ name, size = 16, style, ...props }: IconProps) => {
  const sharedStyle: CSSProperties = {
    display: "block",
    flex: "0 0 auto",
    ...style
  };

  if (name === "motion") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        style={sharedStyle}
        viewBox="0 0 16 16"
        width={size}
        {...props}
      >
        <path d="M3 2.5h4.5v4.5H3z" fill="currentColor" opacity=".95" />
        <path d="M8.5 2.5H13V7H8.5z" fill="currentColor" opacity=".62" />
        <path d="M3 8h4.5v5.5H5.25A2.25 2.25 0 0 1 3 11.25V8Z" fill="currentColor" opacity=".62" />
        <circle cx="10.75" cy="10.25" fill="currentColor" opacity=".95" r="2.25" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      style={sharedStyle}
      viewBox="0 0 16 16"
      width={size}
      {...props}
    >
      {strokes[name].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.25"
        />
      ))}
    </svg>
  );
};
