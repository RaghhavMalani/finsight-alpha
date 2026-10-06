/**
 * Synthetic lab worlds with known ground truth. Every value here is generated in the browser
 * from a seed; none of it is market data. A world plants one rule (or none) between its
 * features and tomorrow's direction, so the lab can show whether an architecture finds a real
 * effect, misses it, or invents one in noise.
 */
import { gauss, rng } from "../format.ts";
import { mat, type Mat } from "./mlp.ts";

export const WORLDS = {
  interaction: {
    label: "Nonlinear interaction",
    rule: "direction follows tanh(momentum × volatility): a sign flip no linear model can see",
  },
  geo: {
    label: "Geo shock",
    rule: "large near-hub seismic energy precedes down days, scaled by volatility",
  },
  linear: {
    label: "Linear drift",
    rule: "direction leans on 20-day momentum minus RSI, linearly",
  },
  null: {
    label: "Null world",
    rule: "no rule at all: tomorrow's direction is a fair coin",
  },
} as const;
export type WorldKind = keyof typeof WORLDS;
export type WorldSpec = { kind: WorldKind; strength: number; seed: number; days: number };
export const DEFAULT_WORLD: WorldSpec = { kind: "interaction", strength: 1, seed: 7, days: 1600 };

/** Feature families and synthetic feature names, in the backend's family order. */
export const LAB_FEATURES: [string, string[]][] = [
  ["Returns & momentum", ["syn_return_1d", "syn_momentum_5", "syn_momentum_20", "syn_gap"]],
  ["Trend & levels", ["syn_sma_gap_20", "syn_rsi_14", "syn_distance_high"]],
  ["Volatility", ["syn_realized_vol_5", "syn_realized_vol_20", "syn_range", "syn_drawdown"]],
  ["Volume", ["syn_volume_z", "syn_volume_trend"]],
  ["Cross-asset", ["syn_beta_60", "syn_relative_momentum"]],
  [
    "Geo events",
    ["syn_geo_count_m5_7d", "syn_geo_max_mag_7d", "syn_geo_energy_log_30d", "syn_geo_near_hub_30d"],
  ],
];

export type World = {
  spec: WorldSpec;
  features: string[];
  family: string[];
  x: Mat;
  y: Float64Array;
  /** True P(up | features) under the planted rule; the best any model could do. */
  truth: Float64Array;
  dates: string[];
};

const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x: number) {
  // Abramowitz–Stegun 7.1.26, |error| < 1.5e-7.
  const s = Math.sign(x),
    a = Math.abs(x),
    t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

/**
 * Daily features from latent processes: a two-state volatility regime, AR(1) family factors,
 * and a self-exciting (Hawkes-like, branching ratio 0.5) earthquake stream for the geo inputs.
 * The target for day t uses only features observed on day t plus fresh N(0,1) noise, so a
 * purged chronological split has no leakage by construction.
 *
 * The planted rule is standardized over the world, so `strength` is its signal-to-noise
 * ratio: f(x) has standard deviation `strength` against unit noise.
 */
export function makeWorld(spec: WorldSpec): World {
  const r = rng(spec.seed * 7919 + 13),
    n = spec.days;
  const names = LAB_FEATURES.flatMap(([, f]) => f),
    family = LAB_FEATURES.flatMap(([fam, f]) => f.map(() => fam));
  const x = mat(n, names.length),
    y = new Float64Array(n),
    truth = new Float64Array(n);
  let regime = 0,
    trend = 0,
    volumeFactor = 0,
    cross = 0,
    price = 100,
    high = 100,
    intensity = 0.4;
  const returns: number[] = [],
    geo: { mag: number; hub: boolean; day: number }[] = [];
  const start = Date.UTC(2019, 0, 2);
  const dates: string[] = [];
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const sd = (v: number[]) => {
    const m = mean(v);
    return Math.sqrt(mean(v.map((u) => (u - m) ** 2)));
  };
  let first = 0;
  for (let t = 0; t < n; t++) {
    if (r() < (regime ? 0.04 : 0.015)) regime = 1 - regime;
    const sigma = regime ? 0.022 : 0.009;
    trend = 0.97 * trend + 0.24 * gauss(r);
    volumeFactor = 0.8 * volumeFactor + 0.6 * gauss(r);
    cross = 0.9 * cross + 0.43 * gauss(r);
    const ret = sigma * gauss(r) + 0.0004 * trend;
    returns.push(ret);
    price *= Math.exp(ret);
    high = Math.max(high * 0.999, price);
    // Each quake lifts tomorrow's rate by 0.15, which decays 30% a day: subcritical.
    const events = poisson(r, intensity);
    for (let k = 0; k < events; k++)
      geo.push({ mag: 4.5 + exponential(r) * 0.55, hub: r() < 0.14, day: t });
    intensity = 0.4 + (intensity - 0.4) * 0.7 + 0.15 * events;
    while (first < geo.length && geo[first].day <= t - 30) first++;
    const month = geo.slice(first),
      week = month.filter((e) => e.day > t - 7);
    const window = (d: number) => returns.slice(Math.max(0, t - d + 1));
    const row = [
      ret / 0.015,
      mean(window(5)) / 0.006,
      mean(window(20)) / 0.003,
      0.4 * gauss(r) + ret / 0.03,
      trend * 0.8 + 0.3 * gauss(r),
      Math.tanh(mean(window(14)) / 0.004) * 1.4 + 0.2 * gauss(r),
      Math.log(price / high) / 0.05,
      sd(window(5)) / 0.012,
      sd(window(20)) / 0.012,
      (sigma / 0.012) * (0.8 + 0.4 * r()),
      Math.log(price / high) / 0.08 + 0.1 * gauss(r),
      volumeFactor + (regime ? 0.8 : 0),
      0.6 * volumeFactor + 0.5 * gauss(r),
      1 + 0.3 * cross,
      cross + (0.5 * mean(window(20))) / 0.003,
      week.filter((e) => e.mag >= 5).length,
      week.length ? Math.max(...week.map((e) => e.mag)) : 4.5,
      Math.log10(month.reduce((a, e) => a + 10 ** (1.5 * e.mag + 4.8), 0) + 1),
      month.filter((e) => e.hub).length,
    ];
    x.data.set(row, t * names.length);
    dates.push(new Date(start + t * 86_400_000).toISOString().slice(0, 10));
  }
  const raw = Array.from({ length: n }, (_, t) =>
    planted(spec.kind, Array.from(x.data.subarray(t * names.length, (t + 1) * names.length))),
  );
  const m = mean(raw),
    s = sd(raw) || 1;
  for (let t = 0; t < n; t++) {
    const f = spec.kind === "null" ? 0 : (spec.strength * (raw[t] - m)) / s;
    truth[t] = phi(f);
    y[t] = f + gauss(r) > 0 ? 1 : 0;
  }
  return { spec, features: names, family, x, y, truth, dates };
}

/** The unscaled planted rule g(x); the world standardizes it and adds unit noise. */
function planted(kind: WorldKind, row: number[]) {
  switch (kind) {
    case "interaction":
      return Math.tanh(1.5 * row[1] * (row[8] - 1));
    case "geo":
      // Seismic energy near its own upper range, amplified by volatility, precedes down days.
      return -(1 / (1 + Math.exp(-4 * (row[17] - 15.2)))) * (0.5 + row[8]) - 0.3 * row[18];
    case "linear":
      return 0.6 * row[2] - 0.5 * row[5];
    default:
      return 0;
  }
}

function poisson(r: () => number, lambda: number) {
  const limit = Math.exp(-lambda);
  let k = 0,
    p = r();
  while (p > limit) {
    k++;
    p *= r();
  }
  return k;
}
const exponential = (r: () => number) => -Math.log(Math.max(1e-12, r()));

/**
 * The production split's shape: an outer chronological 20% holdout, an inner 20% validation
 * slice of the development rows, and a one-row purge before each boundary (horizon 1).
 */
export function splitWorld(n: number) {
  const outer = Math.floor(n * 0.8),
    developmentEnd = outer - 1,
    inner = Math.floor(developmentEnd * 0.8);
  return {
    fit: [0, inner - 1] as const,
    validation: [inner, developmentEnd] as const,
    development: [0, developmentEnd] as const,
    holdout: [outer, n] as const,
  };
}

export function sliceRows(x: Mat, [a, b]: readonly [number, number]): Mat {
  return { rows: b - a, cols: x.cols, data: x.data.slice(a * x.cols, b * x.cols) };
}
export function selectColumns(x: Mat, columns: number[]): Mat {
  const out = mat(x.rows, columns.length);
  for (let i = 0; i < x.rows; i++)
    columns.forEach((c, j) => (out.data[i * columns.length + j] = x.data[i * x.cols + c]));
  return out;
}
