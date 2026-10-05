import { regimeStates, type RegimeState } from "./regime-palette";
import type { CameraFit } from "./SceneFrame";
import type { HMMTrace } from "./types";

/** The three fit features that place a state: 20d return (x), 20d vol (y), 52w drawdown (z). */
export const HMM_AXES = ["rolling_return_20", "realized_vol_20", "drawdown_from_252_high"] as const;
/** World units per standard deviation. */
export const SIGMA = 1.55;

export type HMMFrameView = {
  iteration: number;
  loglik: number;
  delta: number | null;
  converged: boolean;
  /** State means and standard deviations on HMM_AXES, in the fit's standardized units. */
  mu: number[][];
  sd: number[][];
  transmat: number[][];
  /** Dominant state and its posterior for each session in the posterior tail. */
  dominant: number[];
  posterior: number[];
};
export type HMMView = {
  trace: HMMTrace;
  states: RegimeState[];
  frames: HMMFrameView[];
  dates: string[];
  /** Centre of the final state means (world units), and the radius that frames them. */
  center: [number, number, number];
  radius: number;
};

export function hmmView(trace: HMMTrace): HMMView {
  const axes = HMM_AXES.map((name) => trace.feature_names.indexOf(name));
  if (axes.some((j) => j < 0)) throw new Error("HMM trace lacks the regime-space axes");
  const frames = trace.frames.map((f) => ({
    iteration: f.iteration,
    loglik: f.loglik,
    delta: f.convergence_delta,
    converged: f.converged,
    mu: f.means.map((m) => axes.map((j) => m[j])),
    sd: f.covariance_diagonal.map((v) => axes.map((j) => Math.sqrt(v[j]))),
    transmat: f.transmat,
    dominant: f.posterior_tail.map((p) => p.indexOf(Math.max(...p))),
    posterior: f.posterior_tail.map((p) => Math.max(...p)),
  }));
  const last = frames[frames.length - 1].mu.map((m) => m.map((v) => v * SIGMA));
  const lo = [0, 1, 2].map((j) => Math.min(...last.map((m) => m[j]))),
    hi = [0, 1, 2].map((j) => Math.max(...last.map((m) => m[j])));
  const center = [0, 1, 2].map((j) => (lo[j] + hi[j]) / 2) as [number, number, number];
  const radius =
    Math.max(...last.map((m) => Math.hypot(m[0] - center[0], m[1] - center[1], m[2] - center[2]))) +
    2.2;
  return {
    trace,
    states: regimeStates(trace),
    frames,
    dates: trace.dates_tail.map((d) => d.slice(0, 10)),
    center,
    radius,
  };
}

/** Parameters between recorded EM iterations, for easing; `frame` is the nearer recorded one. */
export function interpolate(view: HMMView, t: number) {
  const n = view.frames.length,
    a = Math.floor(t),
    b = Math.min(a + 1, n - 1),
    u = t - a;
  const A = view.frames[a],
    B = view.frames[b];
  const mix = (x: number, y: number) => x + (y - x) * u;
  return {
    mu: A.mu.map((r, i) => r.map((v, j) => mix(v, B.mu[i][j]))),
    sd: A.sd.map((r, i) => r.map((v, j) => mix(v, B.sd[i][j]))),
    transmat: A.transmat.map((r, i) => r.map((v, j) => mix(v, B.transmat[i][j]))),
    frame: u < 0.5 ? a : b,
  };
}

/** Long-run share of time in each state (power iteration on the transition matrix). */
export function stationary(transmat: number[][]) {
  const k = transmat.length;
  let p = Array(k).fill(1 / k);
  for (let n = 0; n < 200; n++) {
    const q = Array(k).fill(0);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) q[j] += p[i] * transmat[i][j];
    p = q;
  }
  return p;
}

/** Days in each state over the posterior tail. */
export function occupancy(frame: HMMFrameView, states: number) {
  const counts = Array(states).fill(0);
  for (const s of frame.dominant) counts[s]++;
  return counts;
}

export function hmmFit(view: HMMView): CameraFit {
  return {
    key: `hmm:${view.trace.ticker}:${view.trace.as_of}`,
    radius: view.radius,
    direction: [0.85, 0.42, 1.25],
    target: [0, 0, 0],
    factor: 0.92,
  };
}
