import { api } from "@/lib/api";

export type Vector = Record<"V" | "L" | "M" | "H" | "F" | "S" | "C", number | null>;
export type Volatility = {
  state: string;
  confidence: number;
  confidence_meaning?: string;
  cluster_score?: number | null;
  cluster_contributions?: Record<string, number>;
  components: Record<string, number | null>;
};
export type FactorRow = {
  factor: string;
  status: string;
  reason: string | null;
  beta: number | null;
  standard_error: number | null;
  t_stat: number | null;
  exposure_z: number | null;
  stability: number | null;
  rolling_beta: number[];
  lower?: number;
  upper?: number;
};
export type Fracture = {
  status: string;
  score: number | null;
  available_contribution_sum: number;
  contributions: Record<string, number | null>;
  coverage: number;
  state: string;
  weights: Record<string, number>;
};
export type SurfaceCell = {
  temperature: number;
  sensitivity: number;
  objective: number;
  stress: number;
  n: number;
  components: Record<string, number>;
  contributions: Record<string, number>;
};
export type OptimizerPoint = {
  as_of: string;
  observed_at: string;
  temperature: number;
  sensitivity: number;
  objective: number;
  stress: number;
  n: number;
  gradient_change: number | null;
};
export type SeasonMetric = {
  status: string;
  observations: number;
  current: number | null;
  mean: number | null;
  median: number | null;
  mad: number | null;
  percentile: number | null;
  z: number | null;
};
export type SeasonCell = {
  weekday: number;
  bucket: string;
  current_at: string;
  baseline_end: string | null;
  metrics: Record<string, SeasonMetric>;
};
export type MarketRegimeArtifact = {
  schema_version: string;
  artifact_hash: string;
  world: {
    id: string;
    ticker: string;
    scope: "SYNTHETIC_DEMO" | "PIT_LOCAL";
    source: string;
    revision: string;
    price_basis: string;
    calendar_note: string;
    as_of: string;
    input_hash: string;
    observations: number;
    timezone: string;
  };
  claims: Record<string, false>;
  policy: {
    version: string;
    objective_weights: Record<string, number>;
    fracture_weights: Record<string, number>;
    temperature_grid: number[];
    sensitivity_grid: number[];
    regime_minimum: number;
    momentum_horizons: number[];
    momentum_weights: number[];
  };
  current: {
    observed_at: string;
    available_at: string;
    asset_return: number | null;
    regime: string;
    vector: Vector;
    vector_complete: boolean;
    volatility: Volatility;
    fracture: Fracture;
    momentum: { signal: number | null; horizons: Record<string, number | null>; weights: number[] };
    factors: {
      status: string;
      rows: FactorRow[];
      n: number;
      condition: number | null;
      alpha: number | null;
      raw_return: number | null;
      explained_return: number | null;
      residual_return: number | null;
      fit_end: string | null;
      covariance_method: string;
      complete_factor_universe: boolean;
    };
    events: {
      status: string;
      pressure: number | null;
      intensity_per_calendar_hour: number | null;
      event_count: number | null;
      burst_z: number | null;
      fitted_rho: number | null;
      training_as_of: string | null;
      time_basis: string;
      criticality_status: string;
      graph_status: string;
      edge_confidence_status: string;
      causal_status: string;
      method: string;
    };
    macro: {
      status: string;
      score: number | null;
      series: Array<{
        series: string;
        value: number;
        z: number | null;
        stress: number | null;
        observations: number;
        observed_at: string;
        available_at: string;
        revision: string;
        direction: string;
      }>;
    };
    liquidity: {
      value: number | null;
      z: number | null;
      stress: number | null;
      spread_bps: number | null;
    };
  };
  timeline: Array<{
    observed_at: string;
    available_at: string;
    regime: string;
    vector: Vector;
    fracture: number | null;
    vol: number | null;
    cluster: number | null;
    momentum: number | null;
  }>;
  volatility_history: Array<Volatility & { observed_at: string }>;
  seasonality: {
    status: string;
    timezone: string;
    bucket_minutes: number;
    cells: SeasonCell[];
    metrics: string[];
    baseline_rule: string;
    vol_unit: string;
    event_unit: string;
  };
  factor_pnl: Array<{ observed_at: string; raw: number; explained: number; residual: number }>;
  factor_pnl_note: string;
  momentum_regimes: Array<{
    regime: string;
    n: number;
    status: string;
    mean_signal: number | null;
    mean_return: number | null;
    hit_rate: number | null;
    sharpe: number | null;
    turnover: number | null;
    drawdown: number | null;
    confidence: number;
    note: string;
  }>;
  landscape: {
    status: string;
    reason: string | null;
    n: number;
    cells: SurfaceCell[];
    optimum: SurfaceCell | null;
    gradient_change: number | null;
    policy?: string;
    evaluation?: string;
    cost_model?: string;
    return_unit?: string;
    objective_weights?: Record<string, number>;
  };
  optimizer_path: OptimizerPoint[];
  limitations: string[];
};

const fail = (label: string): never => {
  throw new Error("Market Regime evidence failed closed: " + label);
};
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(label);
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) return fail(label);
  return value;
}
function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.length) fail(label);
}
function number(value: unknown, label: string, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(label);
}
function count(value: unknown, label: string) {
  number(value, label);
  if (!Number.isInteger(value) || (value as number) < 0) fail(label);
}
function fraction(value: unknown, label: string, nullable = false) {
  number(value, label, nullable);
  if (value !== null && ((value as number) < 0 || (value as number) > 1)) fail(label);
}
function date(value: unknown, label: string) {
  text(value, label);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value as string) || !Number.isFinite(Date.parse(value as string)))
    fail(label);
}
function enumValue(value: unknown, choices: string[], label: string) {
  if (!choices.includes(value as string)) fail(label);
}
function numericRecord(value: unknown, label: string, nullable = true) {
  for (const [key, v] of Object.entries(record(value, label)))
    number(v, label + "." + key, nullable);
}
function vector(value: unknown) {
  const r = record(value, "vector");
  if (Object.keys(r).sort().join() !== ["C", "F", "H", "L", "M", "S", "V"].join())
    fail("vector components");
  for (const key of Object.keys(r)) {
    number(r[key], key, true);
    if (
      r[key] !== null &&
      (key === "M"
        ? Math.abs(r[key] as number) > 1
        : (r[key] as number) < 0 || (r[key] as number) > 1)
    )
      fail(key + " bounds");
  }
}
function cell(value: unknown) {
  const r = record(value, "landscape cell");
  for (const key of ["temperature", "sensitivity", "objective"]) number(r[key], key);
  fraction(r.stress, "stress");
  count(r.n, "sample count");
  numericRecord(r.components, "objective components", false);
  numericRecord(r.contributions, "objective contributions", false);
  const weights: Record<string, number> = {
    research_return: 1,
    drawdown: -1.2,
    slippage: -1,
    conflict: -0.02,
    turnover: -0.005,
    tail: -1,
  };
  for (const [name, weight] of Object.entries(weights)) {
    if (
      Math.abs(
        (record(r.components, "components")[name] as number) * weight -
          (record(r.contributions, "contributions")[name] as number),
      ) > 2e-8
    )
      fail("component weight");
  }
  if (
    Object.keys(record(r.components, "components")).sort().join() !==
    ["conflict", "drawdown", "research_return", "slippage", "tail", "turnover"].join()
  )
    fail("objective component set");
  const sum = Object.values(record(r.contributions, "contributions")).reduce<number>(
    (a, b) => a + (b as number),
    0,
  );
  if (Math.abs(sum - (r.objective as number)) > 2e-8) fail("objective accounting");
}
const regimes = [
  "BULL_TREND",
  "BEAR_TREND",
  "CHOP_LOW_VOL",
  "CHOP_HIGH_VOL",
  "LIQUIDITY_STRESS",
  "MACRO_SHOCK",
  "EVENT_DRIVEN",
  "UNRESOLVED",
];
const factorStates = ["NEUTRAL", "WATCH", "EXPOSED", "UNIDENTIFIABLE"];
function vol(value: unknown) {
  const r = record(value, "volatility");
  enumValue(
    r.state,
    ["LOW_VOL", "NORMAL", "HIGH_VOL", "VOL_CLUSTER", "VOL_SHOCK", "VOL_BREAK", "UNRESOLVED"],
    "vol state",
  );
  fraction(r.confidence, "vol confidence");
  if (r.cluster_score !== undefined) fraction(r.cluster_score, "cluster", true);
  numericRecord(r.components, "vol components");
  if (r.cluster_contributions)
    numericRecord(r.cluster_contributions, "cluster contributions", false);
}

export function adaptMarketRegime(value: unknown): MarketRegimeArtifact {
  const r = record(value, "root");
  if (r.schema_version !== "market-regime-lab/0.4.2") fail("schema");
  for (const hash of [r.artifact_hash, record(r.world, "world").input_hash])
    if (!/^[a-f0-9]{64}$/.test(hash as string)) fail("content address");
  const world = record(r.world, "world");
  enumValue(world.scope, ["SYNTHETIC_DEMO", "PIT_LOCAL"], "scope");
  for (const key of [
    "id",
    "ticker",
    "source",
    "revision",
    "price_basis",
    "calendar_note",
    "timezone",
  ])
    text(world[key], key);
  date(world.as_of, "as_of");
  count(world.observations, "world observations");
  const claims = record(r.claims, "claims");
  if (
    Object.keys(claims).sort().join() !==
      [
        "causal_claim_eligible",
        "market_claim_eligible",
        "precise_edge_confidence",
        "trusted_graph",
        "validated_alpha",
      ].join() ||
    Object.values(claims).some((v) => v !== false)
  )
    fail("claim boundary");
  const policy = record(r.policy, "policy");
  if (policy.version !== "market-regime/0.4.2") fail("policy version");
  numericRecord(policy.objective_weights, "objective weights", false);
  numericRecord(policy.fracture_weights, "fracture weights", false);
  for (const name of [
    "temperature_grid",
    "sensitivity_grid",
    "momentum_horizons",
    "momentum_weights",
  ])
    for (const n of array(policy[name], name)) number(n, name);
  count(policy.regime_minimum, "minimum sample");
  const current = record(r.current, "current");
  date(current.observed_at, "current timestamp");
  date(current.available_at, "current publication");
  if (Date.parse(current.available_at as string) > Date.parse(world.as_of as string))
    fail("future current state");
  enumValue(current.regime, regimes, "regime");
  vector(current.vector);
  vol(current.volatility);
  if (typeof current.vector_complete !== "boolean") fail("vector completeness");
  if (
    current.vector_complete !==
    Object.values(record(current.vector, "vector")).every((v) => v !== null)
  )
    fail("unsupported complete vector");
  const fracture = record(current.fracture, "fracture");
  enumValue(fracture.status, ["COMPLETE", "UNRESOLVED"], "fracture availability");
  enumValue(
    fracture.state,
    ["STABLE", "TRANSITION", "SEVERE_TRANSITION", "UNRESOLVED"],
    "fracture state",
  );
  fraction(fracture.score, "fracture score", true);
  fraction(fracture.coverage, "fracture coverage");
  numericRecord(fracture.contributions, "fracture contributions");
  text(fracture.state, "fracture state");
  if (fracture.status === "COMPLETE") {
    const parts = Object.values(record(fracture.contributions, "parts"));
    if (
      parts.length !== 6 ||
      parts.some((p) => p === null) ||
      fracture.score === null ||
      Math.abs(parts.reduce<number>((a, b) => a + (b as number), 0) - (fracture.score as number)) >
        2e-8
    )
      fail("fracture accounting");
  } else if (fracture.score !== null) fail("unsupported fracture score");
  const momentum = record(current.momentum, "momentum");
  number(momentum.signal, "momentum signal", true);
  numericRecord(momentum.horizons, "momentum horizons");
  const factors = record(current.factors, "factors");
  enumValue(factors.status, factorStates, "factor status");
  count(factors.n, "regression sample");
  number(factors.condition, "factor condition", true);
  const factorRows = array(factors.rows, "factor rows");
  if (
    factorRows.length !== 7 ||
    factorRows.map((v) => record(v, "factor").factor).join() !== "MKT,SMB,HML,MOM,QUAL,VOL,LIQ"
  )
    fail("factor universe");
  for (const value of factorRows) {
    const row = record(value, "factor");
    enumValue(row.status, factorStates, "factor row status");
    for (const key of ["beta", "standard_error", "t_stat", "exposure_z", "stability"])
      number(row[key], key, true);
    for (const beta of array(row.rolling_beta, "rolling beta")) number(beta, "rolling beta");
    if (row.status === "UNIDENTIFIABLE" && row.beta !== null) fail("unidentified beta");
  }
  text(factors.covariance_method, "covariance");
  const event = record(current.events, "events");
  for (const key of ["pressure", "fitted_rho"]) fraction(event[key], key, true);
  for (const key of ["intensity_per_calendar_hour", "event_count", "burst_z"])
    number(event[key], key, true);
  if (
    event.criticality_status !== "UNRESOLVED" ||
    event.graph_status !== "NOT_TRUSTED" ||
    event.edge_confidence_status !== "NOT_TRUSTED" ||
    event.causal_status !== "NOT_ESTABLISHED"
  )
    fail("Hawkes capability boundary");
  text(event.method, "event method");
  text(event.time_basis, "event unit");
  const macro = record(current.macro, "macro");
  fraction(macro.score, "macro score", true);
  for (const series of array(macro.series, "macro series")) {
    const row = record(series, "macro series");
    text(row.series, "series");
    number(row.value, "macro value");
    number(row.z, "macro z", true);
    fraction(row.stress, "macro stress", true);
    date(row.available_at, "macro publication");
    date(row.observed_at, "macro observation");
  }
  numericRecord(current.liquidity, "liquidity");
  const timeline = array(r.timeline, "timeline");
  if (timeline.length !== world.observations || !timeline.length) fail("timeline count");
  let previous = -Infinity;
  for (const point of timeline) {
    const row = record(point, "timeline row");
    vector(row.vector);
    date(row.available_at, "timeline publication");
    date(row.observed_at, "timeline observation");
    const t = Date.parse(row.available_at as string);
    if (t <= previous || t > Date.parse(world.as_of as string)) fail("PIT timeline order");
    previous = t;
    enumValue(row.regime, regimes, "timeline regime");
    for (const key of ["fracture", "vol", "cluster", "momentum"]) number(row[key], key, true);
  }
  for (const row of array(r.volatility_history, "volatility history")) vol(row);
  const season = record(r.seasonality, "seasonality");
  text(season.baseline_rule, "seasonality boundary");
  text(season.timezone, "season timezone");
  const metrics = array(season.metrics, "metrics");
  for (const v of array(season.cells, "season cells")) {
    const row = record(v, "season cell");
    count(row.weekday, "weekday");
    if ((row.weekday as number) > 6) fail("weekday");
    text(row.bucket, "bucket");
    date(row.current_at, "season timestamp");
    if (
      row.baseline_end !== null &&
      Date.parse(row.baseline_end as string) >= Date.parse(row.current_at as string)
    )
      fail("season future baseline");
    const values = record(row.metrics, "season metrics");
    for (const metric of metrics) {
      const m = record(values[metric as string], "metric");
      count(m.observations, "observations");
      for (const key of ["current", "mean", "median", "mad", "z"]) number(m[key], key, true);
      fraction(m.percentile, "percentile", true);
    }
  }
  for (const v of array(r.factor_pnl, "factor attribution path")) {
    const row = record(v, "pnl");
    date(row.observed_at, "pnl timestamp");
    for (const key of ["raw", "explained", "residual"]) number(row[key], key);
    if (Math.abs((row.raw as number) - (row.explained as number) - (row.residual as number)) > 2e-8)
      fail("attribution accounting");
  }
  for (const v of array(r.momentum_regimes, "regime statistics")) {
    const row = record(v, "regime stats");
    enumValue(row.regime, regimes, "stats regime");
    count(row.n, "stats n");
    for (const key of [
      "mean_signal",
      "mean_return",
      "hit_rate",
      "sharpe",
      "turnover",
      "drawdown",
      "confidence",
    ])
      number(row[key], key, true);
    if ((row.n as number) < 30 && (row.sharpe !== null || row.hit_rate !== null))
      fail("small-sample finding");
    text(row.note, "stats scope");
  }
  const surface = record(r.landscape, "landscape");
  count(surface.n, "landscape n");
  const cells = array(surface.cells, "surface cells");
  cells.forEach(cell);
  const coordinates = new Set(
    cells.map((v) => {
      const point = record(v, "point");
      if (
        !(policy.temperature_grid as number[]).includes(point.temperature as number) ||
        !(policy.sensitivity_grid as number[]).includes(point.sensitivity as number)
      )
        fail("parameter coordinates");
      return point.temperature + "/" + point.sensitivity;
    }),
  );
  if (coordinates.size !== cells.length) fail("duplicate surface point");
  if (surface.status === "UNAVAILABLE" && (cells.length || surface.optimum !== null))
    fail("unavailable surface");
  if (surface.status !== "UNAVAILABLE") {
    if (surface.status !== "ILLUSTRATIVE_RESEARCH") fail("landscape claim status");
    if (cells.length !== 121 || (surface.n as number) < 60) fail("surface grid");
    cell(surface.optimum);
    if (
      Math.abs(
        (record(surface.optimum, "optimum").objective as number) -
          Math.max(...cells.map((v) => record(v, "cell").objective as number)),
      ) > 2e-8
    )
      fail("surface optimum");
  }
  for (const point of array(r.optimizer_path, "optimizer path")) {
    const p = record(point, "optimizer point");
    for (const key of ["temperature", "sensitivity", "objective", "stress"]) number(p[key], key);
    count(p.n, "optimizer n");
    date(p.as_of, "optimizer timestamp");
    if (Date.parse(p.as_of as string) > Date.parse(world.as_of as string)) fail("future optimizer");
  }
  for (const limitation of array(r.limitations, "limitations")) text(limitation, "limitation");
  text(r.factor_pnl_note, "attribution scope");
  return value as MarketRegimeArtifact;
}

export async function fetchMarketRegime(world: string, asOf?: string) {
  const params = new URLSearchParams({ world });
  if (asOf) params.set("as_of", asOf);
  return adaptMarketRegime(
    await api<unknown>("/dynamics/regime-intelligence?" + params.toString()),
  );
}

export type RegimeCatalog = {
  worlds: Array<{
    id: string;
    label: string;
    available: boolean;
    scope: string;
    reason?: string | null;
  }>;
};
export async function fetchRegimeCatalog(): Promise<RegimeCatalog> {
  const value = await api<unknown>("/dynamics/regime-intelligence/worlds");
  const root = record(value, "catalog");
  if (root.read_only !== true || root.network_downloads !== false) fail("read-only catalog");
  for (const v of array(root.worlds, "catalog worlds")) {
    const row = record(v, "world");
    text(row.id, "id");
    text(row.label, "label");
    text(row.scope, "scope");
    if (typeof row.available !== "boolean") fail("availability");
  }
  return value as RegimeCatalog;
}
