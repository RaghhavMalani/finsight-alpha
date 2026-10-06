import type { CameraFit } from "./SceneFrame";
import type { SignalTrace, Verdict } from "./types";

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
  /** Family names in display order, and each feature's index into them. */
  families: string[];
  family: number[];
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
  rho: (number | null)[];
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
  const families = trace.families;
  const family = trace.family.map((name) => families.indexOf(name));
  const meanImp = features.map(
    (_, i) =>
      folds.reduce((a, f) => a + f.importance[f.importance.length - 1][i], 0) / folds.length,
  );
  const inputOrder = features
    .map((_, i) => i)
    .sort((a, b) => family[a] - family[b] || meanImp[b] - meanImp[a] || a - b);
  const inputSlot = new Array<number>(features.length);
  inputOrder.forEach((f, k) => (inputSlot[f] = k));
  return {
    trace,
    features,
    families,
    family,
    folds,
    frames: folds.flatMap((f, k) => f.stages.map((_, s) => [k, s] as [number, number])),
    rho: trace.rho,
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
  FAMILY_COLORS[view.families[view.family[i]]] ?? NEUTRAL;

export function signalFit(view: SignalView): CameraFit {
  return {
    key: `signal:${view.trace.ticker}:${view.trace.as_of}`,
    radius: 10.2,
    direction: [0.22, 0.08, 1],
    target: [-0.3, 0.55, 0],
    factor: 0.93,
    narrow: 1,
  };
}

export const VERDICT_TITLE: Record<Verdict, string> = {
  edge: "Predictive edge",
  none: "No predictive edge",
  inconclusive: "Inconclusive",
};

const f3 = (v: number) => v.toFixed(3);

/** One sentence under the verdict, built from the numbers the exporter's rule used. */
export function verdictLead(trace: SignalTrace) {
  const ho = trace.holdout,
    ci = ho.auc_ci95,
    interval = ci ? `${f3(ci.low)}–${f3(ci.high)}` : null;
  const vals = trace.selection.map((s) => s.validation_auc).filter((a): a is number => a != null);
  const best = vals.length ? Math.max(...vals) : null;
  const holdout = ho.auc == null ? "could not be scored" : `came in at ${f3(ho.auc)}`;
  switch (trace.verdict_reason) {
    case "validation_at_or_below_chance":
      return `Every model family scored at or below a coin flip on validation, and the untouched holdout ${holdout}${interval ? ` (95% CI ${interval})` : ""}.`;
    case "holdout_ci_below_chance":
      return `The untouched holdout ${holdout}, and its 95% interval (${interval}) sits entirely below chance.`;
    case "holdout_ci_above_chance":
      return `The untouched holdout ${holdout} with a 95% interval (${interval}) above chance, and the best family reached ${best == null ? "n/a" : f3(best)} on validation.`;
    case "holdout_ci_spans_chance":
      return `The best family reached ${best == null ? "n/a" : f3(best)} on validation, but the holdout's 95% interval (${interval}) still includes a coin flip.`;
    case "validation_edge_too_small":
      return `The holdout's 95% interval (${interval}) clears chance, but no family beat 0.52 on validation, so the pick can't be trusted.`;
    case "holdout_auc_unavailable":
      return "The holdout AUC could not be computed, so there is no out-of-sample check.";
  }
}

/** What fold-to-fold rank stability says, given the verdict. */
export function stabilityNote(trace: SignalTrace) {
  const rho = trace.rho.filter((r): r is number => r != null);
  if (!rho.length) return null;
  const lo = Math.min(...rho),
    hi = Math.max(...rho),
    span = `ρ ${lo.toFixed(2)}–${hi.toFixed(2)}`;
  const horizon = trace.horizon === 1 ? "next-day" : `${trace.horizon}-day`;
  const steady = lo >= 0.8;
  const movement = steady
    ? `Feature rankings barely move between folds (${span}).`
    : lo >= 0.5
      ? `Feature rankings shift between folds (${span}).`
      : `Feature rankings reshuffle between folds (${span}).`;
  const subject = steady ? "The model keeps leaning on the same inputs, and they" : "The inputs";
  const outcome =
    trace.verdict === "edge"
      ? `${subject} carry a measurable ${horizon} edge on the holdout.`
      : trace.verdict === "none"
        ? `${subject} still don't predict ${horizon} direction.`
        : `${subject} can't yet be told apart from chance on ${horizon} direction.`;
  return `${movement} ${outcome}`;
}

/** Symmetric scale around 0.50: ±0.10, widened in 0.05 steps to fit every value shown. */
export function aucScale(values: (number | null | undefined)[]) {
  const dev = Math.max(
    0,
    ...values.filter((v): v is number => v != null).map((v) => Math.abs(v - 0.5)),
  );
  const half = Math.max(0.1, Math.ceil((dev - 1e-9) * 20) / 20);
  return {
    lo: 0.5 - half,
    hi: 0.5 + half,
    pos: (v: number) => ((v - (0.5 - half)) / (2 * half)) * 100,
  };
}

/** Ribbon: validation AUC above (green) or below (red) 0.50 at every fold × stage. */
export function paintAucRibbon(view: SignalView, index: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const n = view.frames.length,
      bw = w / n;
    view.frames.forEach(([k, s], i) => {
      const a = view.folds[k].auc[s];
      if (a == null) return;
      const hh = 3 + Math.min(1, Math.abs(a - 0.5) / 0.08) * (h - 4);
      ctx.fillStyle = a < 0.5 ? TONE_HEX.down : TONE_HEX.up;
      ctx.globalAlpha = i <= index ? 0.8 : 0.18;
      ctx.fillRect(i * bw, a < 0.5 ? h / 2 : h / 2 - hh / 2, Math.max(1, bw - 0.5), hh / 2);
    });
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = TONE_HEX.flat;
    ctx.fillRect(0, h / 2, w, 0.5);
  };
}
