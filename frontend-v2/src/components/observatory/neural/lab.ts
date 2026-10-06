/**
 * The lab run: train an architecture on a synthetic world with the production split shape,
 * score it on validation, and open the holdout only on request. Pure functions, so the worker
 * and the verification script run the same code.
 */
import { selectionVerdict, type AucInterval, type Verdict, type VerdictReason } from "../types.ts";
import {
  auc,
  bootstrapAuc,
  predict,
  snapshotEpochs,
  transform,
  trainNetwork,
  type Architecture,
  type EpochRow,
  type Snapshot,
} from "./mlp.ts";
import {
  LAB_FEATURES,
  makeWorld,
  selectColumns,
  sliceRows,
  splitWorld,
  WORLDS,
  type World,
  type WorldSpec,
} from "./world.ts";

export type ValidationStatus = "above_chance" | "below_chance" | "spans_chance" | "unavailable";
export const validationStatus = (ci: AucInterval | null): ValidationStatus =>
  !ci
    ? "unavailable"
    : ci.low > 0.5
      ? "above_chance"
      : ci.high < 0.5
        ? "below_chance"
        : "spans_chance";

export type HoldoutResult = {
  sealed: boolean;
  note: string | null;
  rows: number;
  start: string;
  end: string;
  auc: number | null;
  auc_ci95: AucInterval | null;
  verdict: Verdict | null;
  verdict_reason: VerdictReason | null;
};

/** What the scene and readout need from any neural run: lab, replay or live. */
export type NeuralRun = {
  kind: "neural";
  architecture: Architecture;
  layer_sizes: number[];
  parameter_count: number;
  feature_names: string[];
  families: string[];
  family: string[];
  epochs: EpochRow[];
  snapshot_epochs: number[];
  snapshots: Snapshot[];
  best_val_loss_epoch: number;
  validation: {
    start: string;
    end: string;
    rows: number;
    auc: number | null;
    auc_ci95: AucInterval | null;
    loss: number;
    status: ValidationStatus;
  };
  holdout: HoldoutResult;
  attribution: number[];
  family_attribution: Record<string, number>;
  probe: { date: string; input: number[]; activations: number[][]; output: number } | null;
};
export type LabRun = NeuralRun & {
  source: "synthetic";
  world: WorldSpec & { label: string; rule: string };
  truth: { validation_auc_ceiling: number | null; holdout_auc_ceiling: number | null };
};

const worlds = new Map<string, World>();
export function worldFor(spec: WorldSpec) {
  const key = JSON.stringify(spec);
  let world = worlds.get(key);
  if (!world) {
    world = makeWorld(spec);
    worlds.clear();
    worlds.set(key, world);
  }
  return world;
}

export function columnsFor(world: World, families: string[]) {
  return world.features.map((_, i) => i).filter((i) => families.includes(world.family[i]));
}

const LAB_SEALED =
  "Validation only. Open the holdout once you have settled on an architecture; every later look is selection on the holdout.";

export function trainLab(
  spec: WorldSpec,
  arch: Architecture,
  families: string[],
  hooks: Parameters<typeof trainNetwork>[5] = {},
): LabRun | null {
  const world = worldFor(spec);
  const columns = columnsFor(world, families);
  if (!columns.length) throw new Error("Choose at least one input family");
  const split = splitWorld(world.x.rows);
  const x = selectColumns(world.x, columns);
  const xFit = sliceRows(x, split.fit),
    xVal = sliceRows(x, split.validation);
  const yFit = world.y.slice(...split.fit),
    yVal = world.y.slice(...split.validation);
  const epochs: EpochRow[] = [],
    snapshots: Snapshot[] = [];
  const result = trainNetwork(arch, xFit, yFit, xVal, yVal, {
    ...hooks,
    onEpoch: (row) => {
      epochs.push(row);
      hooks.onEpoch?.(row);
    },
    onSnapshot: (s) => {
      snapshots.push(s);
      hooks.onSnapshot?.(s);
    },
  });
  if (!result) return null;
  const { net, scaler, xv } = result;
  const pVal = net.forward(xv).p;
  const valAuc = auc(yVal, pVal),
    ci = valAuc == null ? null : bootstrapAuc(yVal, pVal);
  const attribution = net.attribution(xv);
  const names = columns.map((c) => world.features[c]),
    family = columns.map((c) => world.family[c]);
  const present = LAB_FEATURES.map(([f]) => f).filter((f) => family.includes(f));
  const familyAttribution = Object.fromEntries(
    present.map((f) => [
      f,
      Math.round(attribution.reduce((a, v, i) => a + (family[i] === f ? v : 0), 0) * 1e6) / 1e6,
    ]),
  );
  const last = sliceRows(x, [x.rows - 1, x.rows]);
  const probeInput = transform(last, scaler);
  const probe = net.forward(probeInput);
  const best = epochs.reduce((b, e) => (e.val_loss < b.val_loss ? e : b), epochs[0]);
  const truthVal = world.truth.slice(...split.validation),
    truthHold = world.truth.slice(...split.holdout),
    yHold = world.y.slice(...split.holdout);
  const ceiling = (y: Float64Array, t: Float64Array) =>
    spec.kind === "null" ? 0.5 : (auc(y, t) ?? null);
  return {
    kind: "neural",
    source: "synthetic",
    world: { ...spec, label: WORLDS[spec.kind].label, rule: WORLDS[spec.kind].rule },
    architecture: arch,
    layer_sizes: net.sizes,
    parameter_count: net.parameterCount,
    feature_names: names,
    families: present,
    family,
    epochs,
    snapshot_epochs: snapshotEpochs(arch.epochs),
    snapshots,
    best_val_loss_epoch: best.epoch,
    validation: {
      start: world.dates[split.validation[0]],
      end: world.dates[split.validation[1] - 1],
      rows: yVal.length,
      auc: valAuc,
      auc_ci95: ci,
      loss: epochs[epochs.length - 1].val_loss,
      status: validationStatus(ci),
    },
    holdout: {
      sealed: true,
      note: LAB_SEALED,
      rows: yHold.length,
      start: world.dates[split.holdout[0]],
      end: world.dates[split.holdout[1] - 1],
      auc: null,
      auc_ci95: null,
      verdict: null,
      verdict_reason: null,
    },
    attribution,
    family_attribution: familyAttribution,
    probe: {
      date: world.dates[x.rows - 1],
      input: Array.from(probeInput.data, (v) => Math.round(v * 1e5) / 1e5),
      activations: probe.inputs.slice(1).map((h) => Array.from(h.data)),
      output: probe.p[0],
    },
    truth: {
      validation_auc_ceiling: ceiling(yVal, truthVal),
      holdout_auc_ceiling: ceiling(yHold, truthHold),
    },
  };
}

/** Refit on all development rows, then score the untouched holdout once. */
export function openLabHoldout(run: LabRun): HoldoutResult {
  const world = worldFor(run.world);
  const columns = columnsFor(world, run.families);
  const split = splitWorld(world.x.rows);
  const x = selectColumns(world.x, columns);
  const dev = sliceRows(x, split.development),
    yDev = world.y.slice(...split.development);
  const fit = trainNetwork(run.architecture, dev, yDev, dev, yDev);
  if (!fit) throw new Error("Holdout refit was cancelled");
  const xHold = sliceRows(x, split.holdout),
    yHold = world.y.slice(...split.holdout);
  const p = predict(fit.net, fit.scaler, xHold);
  const value = auc(yHold, p),
    ci = value == null ? null : bootstrapAuc(yHold, p);
  const [verdict, reason] = selectionVerdict(ci, [run.validation.auc]);
  return {
    ...run.holdout,
    sealed: false,
    note: null,
    auc: value,
    auc_ci95: ci,
    verdict,
    verdict_reason: reason,
  };
}
