import { assertDerivedPayload, ReplayError } from "../replay/contracts.ts";

export type RegimeKind = "snapshot" | "timeline" | "factors" | "lineage" | "history" | "matrix";
export type ModuleStatus = {
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "LOCAL_ONLY";
  reason: string | null;
  unblock: string | null;
  badges: string[];
};
export type Issue = {
  id: string;
  kind: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  asset: string;
  status: string;
};
export type Envelope<T> = {
  kind: RegimeKind;
  mode: "replay" | "live";
  asOf: string | null;
  inputHash: string | null;
  sources: string[];
  payload: T;
};
export type Snapshot = {
  asset: string;
  market: string;
  series_label: string;
  not_a: string | null;
  country: string;
  tier: "PUBLIC" | "LOCAL_ONLY";
  badges: string[];
  requested_as_of: string;
  state_at: string | null;
  stale_calendar_days: number | null;
  observation_unit: "session" | "observation";
  input_hash: string;
  run_ids: Record<string, string>;
  evidence_scope: string;
  evidence_quality: { weakest: string | null; present: string[] };
  calendar: Record<string, unknown>;
  module_statuses: Record<string, ModuleStatus>;
  issues: Issue[];
  claims: Record<string, false>;
  current: {
    regime: {
      hmm_state: string;
      hmm_posterior: number;
      expected_duration: number | null;
      hmm_converged: boolean;
    } | null;
    volatility: Record<string, number | string | null>;
    hmm4: { hmm_state: string; hmm_posterior: number; hmm_converged: boolean } | null;
    momentum: { momentum_signal: number; momentum_sign: string } | null;
    factors: {
      market_beta: number;
      r_squared: number | null;
      intercept: number;
      neutrality: string;
    } | null;
    units: { volatility: string; duration: string | null };
  };
  volatility: {
    status: string;
    garch: Record<string, unknown>;
    arch_lm: Record<string, unknown> | null;
    components: Record<string, number | null> | null;
    state_counts: Record<string, number> | null;
    cluster_score: number | null;
  };
  hmm: Record<"hmm2" | "hmm4", HmmSummary>;
  coupling: {
    volatility_run: string;
    hmm2_run: string;
    bound_producer_runs: string[];
    semantics: string;
  };
  momentum: {
    status: string;
    definition?: string;
    index_label?: string;
    signal_by_state?: Record<string, Summary>;
    signal_by_state_semantics?: string;
    mom_factor_by_regime?: Record<
      string,
      Summary & { descriptive_sharpe: number | null; sharpe_unit: string }
    >;
    mom_factor_semantics?: string;
  };
  factors: {
    status: string;
    name?: string;
    target?: string;
    controls?: string[];
    full_window?: {
      status: string;
      n?: number;
      r_squared?: number | null;
      terms?: Term[];
      inference?: string;
    };
    by_state?: Record<
      string,
      {
        status: string;
        n?: number;
        r_squared?: number | null;
        terms?: Term[];
        raw_mean?: number;
        residual_mean?: number;
      }
    >;
    stability?: number | null;
    seven_factor?: string;
    decomposition?: {
      observations: number;
      cumulative: { raw: number | null; explained: number | null; residual: number | null };
      semantics: string;
    };
  };
  fracture: {
    score: number | null;
    available_contribution_sum: number;
    coverage: number;
    status: string;
  } | null;
  frozen_research: {
    title: string;
    source: string;
    sha256: string;
    verdicts: Record<string, string>;
    research_os: string;
    inference_replacement: string;
    note: string;
  };
  layers: Record<"current" | "within_run" | "sealed", string>;
};
export type Summary = {
  n: number;
  mean?: number;
  median?: number;
  positive_fraction?: number;
  mad?: number;
  sd?: number | null;
};
export type Term = {
  term: string;
  coefficient: number;
  hac_se: number;
  t: number | null;
  interval_95: [number, number];
  neutrality: string | null;
};
export type HmmSummary = {
  status: string;
  reason?: string;
  labels?: string[];
  transition_matrix?: number[][];
  expected_duration?: (number | null)[];
  duration_unit?: string;
  transition_entropy?: number[];
  occupancy?: number[];
  return_mean?: number[];
  return_variance?: number[];
  converged?: boolean;
  convergence_rule?: string;
  iterations?: number;
  log_likelihood?: number | null;
  current_state?: string;
  current_posterior?: number[];
  posterior_semantics?: string;
  path_semantics?: string;
  labelling_rule?: string;
  posterior_tail?: { dates: string[]; rows: number[][] };
  recent_switches?: number;
  ood?: boolean;
};
export type Timeline = {
  asset: string;
  observation_unit: string;
  path_semantics: string;
  posterior_semantics: string;
  dates: string[];
  volatility: {
    state_codes: number[];
    states: string[];
    rv_20: (number | null)[];
    rv_unit: string;
    tail: Record<string, number | string | null>[];
  };
  hmm2: { offset: number; state_codes: number[]; labels: string[]; confidence: number[] };
  hmm4: { offset: number; state_codes: number[]; labels: string[]; confidence: number[] };
  momentum_signal_tail: [string, number | null][];
};
export type History = { asset: string; semantics: string; entries: HistoryEntry[] };
export type HistoryEntry = {
  as_of: string;
  state_at: string;
  run_ids: Record<string, string>;
  hmm2_state: string | null;
  hmm2_posterior: number | null;
  volatility_state: string | null;
  momentum_sign: string | null;
  evidence: string | null;
  snapshot_artifact: string;
};
export type Matrix = {
  rows: MatrixRow[];
  summaries: {
    state_agreement: {
      pair: string[];
      same_state: boolean | null;
      state_at: string[];
      state_at_gap_days: number | null;
      volatility_stress_gap: number | null;
    }[];
    historical_agreement: {
      pair: string[];
      overlapping_dates: number;
      agreement_share: number | null;
      first_overlap: string | null;
      last_overlap: string | null;
      method: string;
    }[];
    volatility_dispersion: number | null;
    rotation_observations: {
      asset: string;
      last_state_change: string | null;
      state: string | null;
    }[];
  };
  semantics: string;
};
export type MatrixCell = {
  value: number | string | null;
  status: string;
  reason: string | null;
  run_id: string | null;
  detail: Record<string, unknown> | null;
};
export type MatrixRow = {
  asset: string;
  market: string;
  series_label: string;
  tier: string;
  state_at: string | null;
  observation_unit: string;
  badges: string[];
  cells: Record<string, MatrixCell>;
};
export type LineageView = {
  asset: string;
  question: string;
  chain: string;
  runs: Record<string, LineageChain>;
};
export type LineageChain = {
  status: "VERIFIED" | "INVALID";
  run_id: string;
  reason?: string;
  plugin?: string;
  as_of?: string;
  state_at?: string | null;
  code_manifest_sha256?: string;
  lineage_digest?: string;
  data_hash?: string;
  execution?: { commit?: string; dirty_computation?: boolean };
  sources?: {
    source: string;
    source_url: string;
    source_version_id: string;
    capture_sha256: string;
    captured_at: string;
    clock_quality: string;
    availability_rule: string;
    licence_decision: { status: string; dataset_key: string; permitted_uses: string[] };
    admissions: string[];
    signals: number;
    library_coverage?: Record<string, { first_date: string; last_date: string; rows: number }>;
    analysis_window?: string[];
  }[];
  producers?: LineageChain[];
};

const fail = (reason: string): never => {
  throw new ReplayError(reason);
};
const CLAIM_KEYS = [
  "causal_claim_eligible",
  "inference_certified",
  "market_claim_eligible",
  "precise_edge_confidence",
  "trusted_graph",
  "validated_alpha",
];
export const PUBLIC_LABELS: Record<string, string> = {
  "US-MKT": "US MARKET-FACTOR REGIME",
  "IN-MKT": "INDIA MARKET-FACTOR REGIME",
};
export const LOCAL_LABELS: Record<string, string> = {
  SPY: "SPY REGIME",
  QQQ: "QQQ REGIME",
  IWM: "IWM REGIME",
};
const SOURCES = new Set(["ken-french:daily-factors", "iima:daily-factors"]);
const STATUSES = new Set(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "LOCAL_ONLY"]);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function claims(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join() !== CLAIM_KEYS.join() ||
    Object.values(value).some((v) => v !== false)
  )
    fail("Regime evidence cannot grant market, alpha, inference or causal claims.");
}

function probabilities(row: unknown, label: string) {
  if (
    !Array.isArray(row) ||
    !row.length ||
    !row.every((p) => finite(p) && p >= -1e-9 && p <= 1 + 1e-9)
  )
    fail(`${label} must contain probabilities.`);
  const total = (row as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-6) fail(`${label} must sum to one.`);
}

function validateHmm(value: HmmSummary, unit: string, name: string) {
  if (value.status === "UNAVAILABLE") return;
  if (value.posterior_semantics !== "FILTERED_FORWARD_RECURSION")
    fail(`${name}: only filtered posteriors may be shown as historical states.`);
  if (!value.path_semantics?.startsWith("PARAMETER_RETROSPECTIVE"))
    fail(`${name}: within-run paths must be labelled PARAMETER_RETROSPECTIVE.`);
  const k = value.labels?.length ?? 0;
  if (!k || !value.labels!.every((l, i) => l === `VOL_RANK_${i + 1}_OF_${k}`))
    fail(`${name}: state labels must be the deterministic volatility ranks.`);
  value.transition_matrix?.forEach((row, i) => probabilities(row, `${name} transition row ${i}`));
  probabilities(value.current_posterior, `${name} current posterior`);
  if (value.duration_unit !== unit + "s") fail(`${name}: durations must be in ${unit}s.`);
  for (const row of value.posterior_tail?.rows ?? []) probabilities(row, `${name} posterior tail`);
}

export function validateSnapshot(value: Snapshot, mode: "replay" | "live") {
  claims(value.claims);
  const expected =
    PUBLIC_LABELS[value.asset] ?? (mode === "live" ? LOCAL_LABELS[value.asset] : undefined);
  if (!expected || value.market !== expected)
    fail("Regime label does not match its evidence source.");
  if (mode === "replay" && (value.tier !== "PUBLIC" || value.evidence_scope !== "PUBLIC_DERIVED"))
    fail("Local evidence cannot appear in public Replay.");
  if (value.tier === "LOCAL_ONLY" && !value.badges.includes("LOCAL ONLY"))
    fail("Local rows must carry their LOCAL ONLY badge.");
  if (value.asset === "IN-MKT") {
    if (value.observation_unit !== "observation" || !value.badges.includes("CALENDAR_UNAVAILABLE"))
      fail("India must use observation-step semantics without an evidenced calendar.");
    if (value.current.volatility.realized_vol_20_annualised !== undefined)
      fail("India volatility cannot be annualised without session evidence.");
  }
  if (!hash(value.input_hash)) fail("Snapshot input hash is malformed.");
  for (const [name, status] of Object.entries(value.module_statuses)) {
    if (!STATUSES.has(status.status)) fail(`Unknown module status for ${name}.`);
    if (status.status !== "AVAILABLE" && !status.reason) fail(`${name} needs its exact reason.`);
  }
  for (const name of ["events", "iohmm"])
    if (value.module_statuses[name]?.status !== "UNAVAILABLE")
      fail("Event pressure is unavailable without an admitted event stream.");
  validateHmm(value.hmm.hmm2, value.observation_unit, "hmm2");
  validateHmm(value.hmm.hmm4, value.observation_unit, "hmm4");
  const verdicts = value.frozen_research?.verdicts;
  if (
    !verdicts ||
    Object.keys(verdicts).sort().join() !== "CROSS_MARKET,ECONOMIC,REGIME_DEPENDENCE,STATISTICAL" ||
    !hash(value.frozen_research.sha256)
  )
    fail("Frozen Research OS verdicts must be the byte-bound Phase 4 card.");
  if (JSON.stringify(value.momentum).includes("INCONCLUSIVE"))
    fail("Descriptive momentum views cannot carry Research OS verdicts.");
  if (value.fracture && value.fracture.score !== null && value.fracture.coverage < 1)
    fail("A partial fracture cannot publish a full score.");
  return value;
}

export function validateTimeline(value: Timeline) {
  if (
    !value.path_semantics.startsWith("PARAMETER_RETROSPECTIVE") ||
    value.posterior_semantics !== "FILTERED_FORWARD_RECURSION"
  )
    fail("Timeline paths must be filtered and parameter-retrospective.");
  const n = value.dates.length;
  for (const key of ["hmm2", "hmm4"] as const) {
    const series = value[key];
    if (
      !Number.isInteger(series.offset) ||
      series.offset < 0 ||
      series.offset + series.state_codes.length !== n ||
      series.state_codes.length !== series.confidence.length
    )
      fail(`${key} timeline is not a contiguous suffix of the observation dates.`);
    if (series.state_codes.some((c) => !Number.isInteger(c) || c < 0 || c >= series.labels.length))
      fail(`${key} timeline state outside its labels.`);
  }
  if (value.volatility.state_codes.length !== n || value.volatility.rv_20.length !== n)
    fail("Volatility timeline lengths differ.");
  return value;
}

export function validateMatrix(value: Matrix, mode: "replay" | "live") {
  for (const row of value.rows) {
    if (mode === "replay" && (row.tier !== "PUBLIC" || !PUBLIC_LABELS[row.asset]))
      fail("Local rows cannot enter the public matrix.");
    if (
      row.cells.event_pressure?.status !== "UNAVAILABLE" ||
      row.cells.event_pressure.value !== null
    )
      fail("Event pressure must stay unavailable, never zero.");
  }
  if (!/no forward fill/i.test(value.semantics))
    fail("Matrix must disclose its no-fill semantics.");
  return value;
}

export function validateFactors(value: unknown) {
  const fields = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some((k) => !keys.includes(k))
    )
      fail("Undeclared public factor field; source histories are forbidden.");
    return v as Record<string, unknown>;
  };
  const controls = ["mkt", "smb", "hml"];
  const keys = [
    "asset",
    "name",
    "status",
    "controls",
    "rolling_tail",
    "full_window",
    "stability",
    "semantics",
  ];
  const p = fields(value, keys);
  if (
    Object.keys(p).length !== keys.length ||
    JSON.stringify(p.controls) !== JSON.stringify(controls)
  )
    fail("Public factor schema or controls differ from the reviewed whitelist.");
  if (
    !PUBLIC_LABELS[p.asset as string] ||
    ![null, "PARTIAL_FACTOR_DIAGNOSTIC"].includes(p.name as string | null) ||
    !["COMPUTED", "PARTIAL", "AVAILABLE", "UNAVAILABLE"].includes(p.status as string) ||
    p.semantics !==
      "Prior-only rolling coefficients and full-window HAC diagnostics; no observation-level target, fitted return or residual is public"
  )
    fail("Undeclared public factor semantics.");
  if (p.stability !== null && !finite(p.stability))
    fail("Factor stability must be a finite scalar.");
  if (!Array.isArray(p.rolling_tail) || p.rolling_tail.length > 250)
    fail("Malformed factor exposure tail.");
  for (const row of p.rolling_tail as unknown[]) {
    const r = fields(row, ["observed_at", ...controls]);
    if (
      Object.keys(r).length !== 4 ||
      typeof r.observed_at !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(r.observed_at) ||
      !Number.isFinite(Date.parse(r.observed_at)) ||
      controls.some((c) => !finite(r[c]))
    )
      fail("Malformed factor exposure row.");
  }
  const fit = fields(p.full_window, [
    "status",
    "reason",
    "n",
    "condition",
    "r_squared",
    "terms",
    "inference",
  ]);
  for (const key of ["reason", "inference"])
    if (key in fit && typeof fit[key] !== "string")
      fail("Factor annotations must be text, never source-row containers.");
  if (fit.status === "UNAVAILABLE") {
    fields(fit, ["status", "reason"]);
    return value;
  }
  if (
    fit.status !== "AVAILABLE" ||
    !Number.isInteger(fit.n) ||
    (fit.n as number) < 60 ||
    !finite(fit.condition) ||
    (fit.r_squared !== null && !finite(fit.r_squared)) ||
    !Array.isArray(fit.terms) ||
    fit.terms.length !== 4
  )
    fail("Factor full-window diagnostics must aggregate at least 60 observations.");
  const terms = fit.terms as unknown[];
  const names = new Set<string>();
  for (const term of terms) {
    const t = fields(term, ["term", "coefficient", "hac_se", "t", "interval_95", "neutrality"]);
    if (
      Object.keys(t).length !== 6 ||
      !["intercept", ...controls].includes(t.term as string) ||
      !finite(t.coefficient) ||
      !finite(t.hac_se) ||
      (t.t !== null && !finite(t.t)) ||
      !Array.isArray(t.interval_95) ||
      t.interval_95.length !== 2 ||
      !t.interval_95.every(finite) ||
      ![null, "NEUTRAL", "WATCH", "EXPOSED"].includes(t.neutrality as string | null)
    )
      fail("Malformed public factor coefficient.");
    names.add(t.term as string);
  }
  if (names.size !== 4) fail("Factor coefficient terms must be distinct.");
  return value;
}

export function validateEnvelope<T>(value: unknown, kind: RegimeKind): Envelope<T> {
  assertDerivedPayload(value);
  if (!value || typeof value !== "object") fail("Regime evidence is malformed.");
  const v = value as Record<string, unknown>;
  let mode: "replay" | "live";
  if (v.schema_version === "regimes-replay/1") {
    mode = "replay";
    if (
      !Array.isArray(v.sources) ||
      !v.sources.length ||
      !v.sources.every((s) => typeof s === "string" && SOURCES.has(s)) ||
      !hash(v.input_hash)
    )
      fail("Public regime evidence must be licensed market-factor research.");
  } else if (v.schema_version === "regimes/1") {
    mode = "live";
    if (v.badge !== "LOCAL MODEL RUN")
      fail("Local views must say LOCAL MODEL RUN, never LIVE FEED.");
  } else return fail("Unknown regime evidence schema.");
  if (v.kind !== kind) fail("Regime evidence kind mismatch.");
  claims(v.claims);
  const payload = v.payload as T;
  if (!payload || typeof payload !== "object") fail("Regime payload missing.");
  const json = JSON.stringify(payload);
  if (/"smoothed"|predict_proba|"settings"|"contract"/.test(json))
    fail("Smoothed posteriors, raw contracts and settings are never shown.");
  if (mode === "replay" && /SYNTHETIC/i.test(json))
    fail("Synthetic worlds cannot enter real regime views.");
  if (kind === "snapshot") validateSnapshot(payload as Snapshot, mode);
  if (kind === "timeline") validateTimeline(payload as Timeline);
  if (kind === "matrix") validateMatrix(payload as Matrix, mode);
  if (kind === "factors" && mode === "replay") validateFactors(payload);
  return {
    kind,
    mode,
    asOf: (v.as_of as string) ?? (v.requested_as_of as string) ?? null,
    inputHash: (v.input_hash as string) ?? null,
    sources: (v.sources as string[]) ?? [],
    payload,
  };
}
