import type { RibbonPainter } from "./Timeline";
import type { CameraFit } from "./SceneFrame";
import { FAMILY_COLORS, NEUTRAL, TONE_HEX } from "./signal-model";
import type { NeuralRun } from "./neural/lab";
import type { NeuralEpochRow, NeuralSnapshot } from "./types";

/** Geo inputs share the globe's quake colour. */
export const NEURAL_FAMILY_COLORS: Record<string, string> = {
  ...FAMILY_COLORS,
  "Geo events": "#FFD166",
};
export const POSITIVE = "#3FE0FF";
export const NEGATIVE = "#FF4FD8";

export type NeuralSource = "lab" | "replay" | "live";
/** The fields every neural run shares, whether trained in the browser or by the backend. */
export type NeuralLike = Pick<
  NeuralRun,
  | "architecture"
  | "layer_sizes"
  | "parameter_count"
  | "feature_names"
  | "families"
  | "family"
  | "snapshot_epochs"
  | "best_val_loss_epoch"
  | "attribution"
  | "family_attribution"
> & {
  epochs: NeuralEpochRow[];
  snapshots: NeuralSnapshot[];
  probe: { date: string; input: number[]; activations: number[][]; output: number } | null;
};

export type NeuralView = {
  source: NeuralSource;
  run: NeuralLike;
  sizes: number[];
  features: string[];
  families: string[];
  family: number[];
  /** Row of each input in the input column: grouped by family, then attribution. */
  inputSlot: number[];
  epochs: NeuralEpochRow[];
  snapshots: NeuralSnapshot[];
  /** Highest epoch with weights; the scrubber runs over epochs 0…lastEpoch. */
  lastEpoch: number;
  /** Changes only when the network's shape or inputs change, so geometry is rebuilt rarely. */
  structureKey: string;
  training: boolean;
};

export function neuralView(run: NeuralLike, source: NeuralSource, training = false): NeuralView {
  const families = run.families,
    family = run.family.map((f) => families.indexOf(f));
  const attribution = run.attribution.length === run.feature_names.length ? run.attribution : null;
  const order = run.feature_names
    .map((_, i) => i)
    .sort(
      (a, b) =>
        family[a] - family[b] || (attribution ? attribution[b] - attribution[a] : 0) || a - b,
    );
  const inputSlot = new Array<number>(run.feature_names.length);
  order.forEach((f, k) => (inputSlot[f] = k));
  const lastEpoch = run.snapshots.length ? run.snapshots[run.snapshots.length - 1].epoch : 0;
  return {
    source,
    run,
    sizes: run.layer_sizes,
    features: run.feature_names,
    families,
    family,
    inputSlot,
    epochs: run.epochs,
    snapshots: run.snapshots,
    lastEpoch,
    // Training's end is included: the strongest-edge set of a large layer is re-chosen once
    // the final weights exist.
    structureKey: JSON.stringify([source, run.layer_sizes, run.feature_names, training]),
    training,
  };
}

export const familyHex = (view: NeuralView, i: number) =>
  NEURAL_FAMILY_COLORS[view.families[view.family[i]]] ?? NEUTRAL;

/**
 * Weights, biases and activation summaries at a (possibly fractional) epoch, linearly
 * interpolated between the two recorded snapshots around it. Recorded epochs are exact.
 */
export function stateAt(view: NeuralView, epoch: number) {
  const snaps = view.snapshots;
  if (!snaps.length) return null;
  let hi = snaps.findIndex((s) => s.epoch >= epoch);
  if (hi < 0) hi = snaps.length - 1;
  const lo = Math.max(0, snaps[hi].epoch > epoch ? hi - 1 : hi);
  const a = snaps[lo],
    b = snaps[hi],
    t = b.epoch === a.epoch ? 0 : (epoch - a.epoch) / (b.epoch - a.epoch);
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    exact: t === 0 || t === 1,
    weights: a.weights.map((w, l) =>
      w.map((row, k) => row.map((v, o) => mix(v, b.weights[l][k][o]))),
    ),
    biases: a.biases.map((v, l) => v.map((x, o) => mix(x, b.biases[l][o]))),
    meanActivation: a.mean_activation.map((v, l) =>
      v.map((x, o) => mix(x, b.mean_activation[l][o])),
    ),
    activeFraction: a.active_fraction.map((v, l) =>
      v.map((x, o) => mix(x, b.active_fraction[l][o])),
    ),
  };
}

/** Epoch metrics at scrub epoch e (epoch 0 is the untrained network and has none). */
export const epochRow = (view: NeuralView, epoch: number) =>
  epoch >= 1 ? (view.epochs[Math.min(view.epochs.length, epoch) - 1] ?? null) : null;

export function neuralFit(view: NeuralView, left: number): CameraFit {
  return {
    key: `neural:${view.sizes.join("-")}`,
    radius: 10.2,
    direction: [0.16, 0.1, 1],
    // Left of centre, so the family names beside the input column clear the editor.
    target: [-1.4, 0, -0.6],
    factor: 0.9,
    narrow: 1.25,
    left,
  };
}

/** Ribbon: validation AUC above (green) or below (red) 0.50 at every epoch, as the signal scene. */
export function paintNeuralRibbon(view: NeuralView, epoch: number): RibbonPainter {
  return (ctx, w, h) => {
    const total = Math.max(1, view.run.architecture.epochs),
      bw = w / total;
    view.epochs.forEach((row) => {
      const a = row.val_auc;
      if (a == null) return;
      const hh = 3 + Math.min(1, Math.abs(a - 0.5) / 0.15) * (h - 4);
      ctx.fillStyle = a < 0.5 ? TONE_HEX.down : TONE_HEX.up;
      ctx.globalAlpha = row.epoch <= epoch ? 0.8 : 0.18;
      ctx.fillRect(
        (row.epoch - 1) * bw,
        a < 0.5 ? h / 2 : h / 2 - hh / 2,
        Math.max(1, bw - 0.5),
        hh / 2,
      );
    });
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = TONE_HEX.flat;
    ctx.fillRect(0, h / 2, w, 0.5);
  };
}
