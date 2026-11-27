// Forge v2 (U4): Reality Ladder deltas, computed from the checkpoint records. New in v2.
// scripts/verify-forge2.mjs recomputes the same deltas from the raw artifact with its own code.
import type { RealityCheckpoint, ResearchMetric } from "@/forge/contracts/observer";

export type RealityMetric = "sharpe" | "maxDrawdown" | "slippage" | "latencyCost" | "runtime";

export const REALITY_METRICS: readonly { key: RealityMetric; label: string }[] = [
  { key: "sharpe", label: "Sharpe" },
  { key: "maxDrawdown", label: "Max drawdown" },
  { key: "slippage", label: "Slippage" },
  { key: "latencyCost", label: "Latency cost" },
  { key: "runtime", label: "Runtime" },
];

/**
 * Which consecutive checkpoints each `aggregate.decomposition` component of the
 * forge-reality-ladder/0.2.4.1 schema measures: its value is the signed Sharpe change between them
 * (each matches the artifact's decomposition value; verify-forge2.mjs checks that).
 */
export const COMPONENT_STEPS: Readonly<Record<string, readonly [string, string]>> = {
  idealization_gap: ["L0_ANALYTICAL", "L1_VECTORBT"],
  model_semantic_decay: ["L1_VECTORBT", "L2_NAUTILUS"],
  fee_decay: ["L2_NAUTILUS", "L3_FEES_SLIPPAGE"],
  latency_decay: ["L3_FEES_SLIPPAGE", "L3_LATENCY"],
  stress_decay: ["L3_LATENCY", "L4_COUNTERFACTUAL_STRESS"],
};

export function checkpointMetric(c: RealityCheckpoint, metric: RealityMetric): ResearchMetric {
  return c[metric];
}

export type LadderStep = Readonly<{
  from: RealityCheckpoint;
  to: RealityCheckpoint;
  fromIndex: number;
  toIndex: number;
  delta: number;
}>;

/** Signed change between consecutive checkpoints, in the artifact's checkpoint order. */
export function ladderSteps(
  checkpoints: readonly RealityCheckpoint[],
  metric: RealityMetric,
): LadderStep[] {
  return checkpoints.slice(1).map((to, i) => ({
    from: checkpoints[i],
    to,
    fromIndex: i,
    toIndex: i + 1,
    delta: checkpointMetric(to, metric).value - checkpointMetric(checkpoints[i], metric).value,
  }));
}

/**
 * The largest degradation of Sharpe (the artifact's primary metric, where lower is worse): the most
 * negative consecutive change. Null when no step lowers it.
 */
export function largestSharpeDegradation(checkpoints: readonly RealityCheckpoint[]) {
  let worst: LadderStep | null = null;
  for (const step of ladderSteps(checkpoints, "sharpe"))
    if (step.delta < 0 && (!worst || step.delta < worst.delta)) worst = step;
  return worst;
}

/**
 * Whether the artifact's recorded largest degradation names the computed step: its component must
 * map to the same pair of checkpoints, and its value must equal the computed Δ.
 */
export function degradationAgrees(
  worst: LadderStep | null,
  recorded: { component: string; change: number },
) {
  const pair = COMPONENT_STEPS[recorded.component];
  if (!worst || !pair) return false;
  return (
    pair[0] === worst.from.id &&
    pair[1] === worst.to.id &&
    Math.abs(worst.delta - recorded.change) < 1e-9
  );
}

export function formatDelta(value: number, precision: number): string {
  const n = Math.abs(value).toFixed(precision);
  if (Number(n) === 0) return n;
  return `${value < 0 ? "−" : "+"}${n}`;
}

/** Short x labels: the level prefix (L0…L4), lettered a, b… where two checkpoints share one. */
export function shortCodes(checkpoints: readonly RealityCheckpoint[]): string[] {
  const prefix = checkpoints.map((c) => c.id.split("_")[0]);
  return prefix.map((p, i) => {
    const same = prefix.filter((q) => q === p).length;
    if (same < 2) return p;
    const nth = prefix.slice(0, i).filter((q) => q === p).length;
    return p + String.fromCharCode(97 + nth);
  });
}

/** Runs of consecutive checkpoints with an identical recorded value: [start, end] indices. */
export function equalRuns(values: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  values.forEach((v, i) => {
    const last = runs[runs.length - 1];
    if (last && values[last[1]] === v) last[1] = i;
    else runs.push([i, i]);
  });
  return runs;
}

/** Two or three round y ticks spanning the values and zero. */
export function niceTicks(values: readonly number[]): { ticks: number[]; decimals: number } {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const raw = (hi - lo) / 2 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 1e-9; t += step)
    ticks.push(Number(t.toFixed(12)));
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  const e = Math.floor(Math.log10(step));
  const decimals = Math.max(0, -e + (Math.abs(step / 10 ** e - 2.5) < 1e-9 ? 1 : 0));
  return { ticks, decimals };
}
