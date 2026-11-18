import type { CSSProperties } from "react";

/**
 * One source for the glow language shared by God's Eye, the Observatory and the research
 * workspaces: light on pure black, cyan for settled evidence, amber for work in progress,
 * red for what failed. Text colours hold at least 4.5:1 on black; `faint` is for strokes only.
 */
export const COLOR = {
  void: "#000000",
  fg: "#e7eaec",
  /** 8.4:1 on black. The dimmest colour allowed for text. */
  muted: "#9aa2a9",
  /** 3.7:1 on black. Hairlines, ticks and dormant geometry only, never text. */
  faint: "#5f676f",
  cyan: "#3fe0ff",
  cyanSoft: "#8fd3ff",
  /** Settled but not supported: the colour of an inconclusive verdict. */
  teal: "#2a9fb8",
  amber: "#f0a929",
  geo: "#ffd166",
  magenta: "#ff4fd8",
  red: "#ff4d5e",
  up: "#42c98b",
} as const;
export type ColorName = keyof typeof COLOR;

/** The same colours as integers, for three.js materials. */
export const HEX = Object.fromEntries(
  Object.entries(COLOR).map(([k, v]) => [k, parseInt(v.slice(1), 16)]),
) as Record<ColorName, number>;

/** Linear-ish RGB triples (0..1) for shader attributes. */
export function rgb(name: ColorName): [number, number, number] {
  const n = HEX[name];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Evidence states and the light each one gives off. */
export const STATE = {
  dormant: { color: "faint", glow: 0.18 },
  running: { color: "amber", glow: 1 },
  verified: { color: "cyan", glow: 1 },
  inconclusive: { color: "muted", glow: 0.7 },
  unavailable: { color: "muted", glow: 0.28 },
  falsified: { color: "red", glow: 0.55 },
  repaired: { color: "amber", glow: 0.5 },
  held: { color: "up", glow: 0.8 },
  recorded: { color: "muted", glow: 0.45 },
  uncalibrated: { color: "red", glow: 0.5 },
  challenge: { color: "magenta", glow: 1 },
  challenged: { color: "amber", glow: 0.9 },
  frozen: { color: "fg", glow: 1 },
} as const satisfies Record<string, { color: ColorName; glow: number }>;
export type EvidenceState = keyof typeof STATE;

/**
 * Motion carries meaning: it only happens when recorded state changes. Durations are in
 * seconds of replay clock, so a paused replay is a still image.
 */
export const MOTION = {
  /** Flare after a resolve or failure, then settle. */
  flare: 1.1,
  /** A skeptic challenge: a slower, wider shock ring. */
  shock: 2.2,
  /** Running nodes breathe at this rate while their run is open. */
  pulseHz: 1.6,
  /** Particles per second along a flowing edge, as fraction of the path. */
  flow: 0.9,
  /** Recorded replay is compressed into this many seconds, preserving order. */
  replaySeconds: 16,
  ease: "cubic-bezier(.2,.7,.2,1)",
  fast: "140ms",
  slow: "420ms",
} as const;

export const FONT = {
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  ui: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const BLOOM = { strength: 0.9, radius: 0.55, threshold: 0.05 } as const;

/** CSS custom properties for a visual root, so stylesheets read the same tokens. */
export function tokenStyle(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(COLOR)) vars[`--vx-${k}`] = v;
  vars["--vx-mono"] = FONT.mono;
  vars["--vx-ui"] = FONT.ui;
  vars["--vx-ease"] = MOTION.ease;
  vars["--vx-fast"] = MOTION.fast;
  vars["--vx-slow"] = MOTION.slow;
  return vars as CSSProperties;
}
