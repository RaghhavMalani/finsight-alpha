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

export function formatDelta(value: number, precision: number): string {
  const n = Math.abs(value).toFixed(precision);
  if (Number(n) === 0) return n;
  return `${value < 0 ? "−" : "+"}${n}`;
}
