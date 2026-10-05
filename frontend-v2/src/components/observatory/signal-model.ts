import type { CameraFit } from "./SceneFrame";
import type { SignalTrace } from "./types";

/** Hue per feature family. The exporter assigns families; the frontend never guesses them. */
export const FAMILY_COLORS: Record<string, string> = {
  "Returns & momentum": "#3FE0FF",
  "Trend & levels": "#A98CF0",
  Volatility: "#FF5FD2",
  Volume: "#42E08B",
  "Cross-asset": "#FF8A5B",
};
/** Lines without an exporter-assigned family. */
export const NEUTRAL = "#8A939B";

export type SignalView = {
  trace: SignalTrace;
  features: string[];
  /** Family names in display order, and each feature's index into them (null: not exported). */
  families: string[] | null;
  family: number[] | null;
  folds: {
    fold: number;
    validationStart: string;
    validationEnd: string;
    stages: number[];
    auc: (number | null)[];
    importance: number[][];
  }[];
  /** Every scrub position: [fold index, stage index]. */
  frames: [number, number][];
  rho: (number | null)[] | null;
  /** Row of each feature in the input column: grouped by family, then mean final importance. */
  inputSlot: number[];
};

export function signalView(trace: SignalTrace): SignalView {
  const features = trace.feature_names;
  const folds = trace.folds.map((f) => ({
    fold: f.fold,
    validationStart: f.validation_start.slice(0, 10),
    validationEnd: f.validation_end.slice(0, 10),
    stages: f.frames.map((s) => s.stage),
    auc: f.frames.map((s) => s.val_auc),
    importance: f.frames.map((s) => s.feature_importance),
  }));
  const families = trace.families ?? null;
  const family =
    families && trace.family ? trace.family.map((name) => families.indexOf(name)) : null;
  const meanImp = features.map(
    (_, i) =>
      folds.reduce((a, f) => a + f.importance[f.importance.length - 1][i], 0) / folds.length,
  );
  const inputOrder = features
    .map((_, i) => i)
    .sort((a, b) => (family ? family[a] - family[b] : 0) || meanImp[b] - meanImp[a] || a - b);
  const inputSlot = new Array<number>(features.length);
  inputOrder.forEach((f, k) => (inputSlot[f] = k));
  return {
    trace,
    features,
    families,
    family,
    folds,
    frames: folds.flatMap((f, k) => f.stages.map((_, s) => [k, s] as [number, number])),
    rho: trace.rho ?? null,
    inputSlot,
  };
}

/** Importance shown in fold column L (1-based) at scrub position idx; null while pending. */
export function importanceAt(view: SignalView, L: number, idx: number) {
  const [f, s] = view.frames[idx],
    k = L - 1,
    fold = view.folds[k];
  if (k < f) return fold.importance[fold.importance.length - 1];
  if (k === f) return fold.importance[s];
  return null;
}

/** Validation AUC of a fold at scrub position idx: final stage if done, current if active. */
export function foldAuc(view: SignalView, k: number, idx: number) {
  const [f, s] = view.frames[idx],
    fold = view.folds[k];
  return k < f ? fold.auc[fold.auc.length - 1] : k === f ? fold.auc[s] : null;
}

export type Tone = "down" | "flat" | "up";
/** Red under 0.50, grey from 0.50 to 0.52, green above 0.52. */
export const aucTone = (a: number): Tone => (a < 0.5 ? "down" : a > 0.52 ? "up" : "flat");
export const TONE_VAR: Record<Tone, string> = {
  down: "var(--obs-down)",
  flat: "var(--obs-muted)",
  up: "var(--obs-up)",
};
export const TONE_HEX: Record<Tone, string> = { down: "#F06464", flat: "#9AA2A9", up: "#42C98B" };

export const familyColor = (view: SignalView, i: number) =>
  view.family && view.families
    ? (FAMILY_COLORS[view.families[view.family[i]]] ?? NEUTRAL)
    : NEUTRAL;

export function signalFit(view: SignalView): CameraFit {
  return {
    key: `signal:${view.trace.ticker}:${view.trace.as_of}`,
    radius: 10.2,
    direction: [0.22, 0.08, 1],
    target: [-0.3, 0.55, 0],
    factor: 0.93,
    narrow: 1.3,
  };
}
