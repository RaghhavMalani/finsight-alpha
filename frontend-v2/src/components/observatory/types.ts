export type Provenance = {
  input_hash: string;
  as_of: string;
  latest_observation: string;
  latest_availability: string;
  source: string[];
  evidence_quality: string[];
  evidence_mode: string;
  coverage: string;
  disclosure: string;
  observations: number;
  price_basis: string;
  raw_snapshot_ids: string[];
};
export type TraceBase = {
  schema_version: "model-observatory/2";
  ticker: string;
  as_of: string;
  seed: number;
  provenance: Provenance;
  feature_names: string[];
  claims: { market_claim_eligible: false; causal_claim_eligible: false; validated_alpha: false };
};
export type HMMFrame = {
  iteration: number;
  loglik: number;
  means: number[][];
  covariance_diagonal: number[][];
  transmat: number[][];
  posterior_tail: number[][];
  convergence_delta: number | null;
  converged: boolean;
};
export type HMMTrace = TraceBase & {
  kind: "hmm";
  n_states: number;
  frames: HMMFrame[];
  labels: Record<string, string>;
  dates_tail: string[];
  scaler_hash: string;
  fit_rows: number;
  max_iter: number;
  semantics: string;
  feature_start: string;
  latest_feature: string;
  /** EM stops when the log-likelihood gain falls below this. */
  tolerance?: number;
};
export type Stage = {
  fold: number;
  stage: number;
  val_logloss: number;
  val_auc: number | null;
  feature_importance: number[];
};
export type Fold = {
  fold: number;
  stage_trace: "AVAILABLE";
  frames: Stage[];
  model: string;
  fit_start: string;
  fit_end: string;
  validation_start: string;
  validation_end: string;
  fit_rows: number;
  validation_rows: number;
  training_target_information_end: string;
  validation_feature_start: string;
  fit_indices: number[];
  validation_indices: number[];
};
export type SignalTrace = TraceBase & {
  kind: "signal";
  folds: Fold[];
  horizon: number;
  embargo: number;
  selected_model: string;
  selection: {
    model: string;
    validation_auc: number | null;
    stage_trace: string;
    stage_trace_note: string;
  }[];
  holdout: {
    label: string;
    start: string;
    end: string;
    feature_start: string;
    rows: number;
    auc: number | null;
    baseline_accuracy: number | null;
    model: string;
    indices: number[];
    training_target_information_end: string;
    visible_after_selection: boolean;
    /** Percentile bootstrap of holdout AUC over resampled holdout rows. */
    auc_ci95: AucInterval | null;
  };
  inference: { date: string; included_in_labeled_rows: boolean };
  importance_semantics: string;
  split_contract: string;
  /** Feature family names in display order, and each feature's family (exporter-assigned). */
  families: string[];
  family: string[];
  /** Spearman ρ of final-stage importances between consecutive folds. */
  rho: (number | null)[];
  /** Every family's validation AUC ≤ 0.5: picking the best of them would be selection on noise. */
  suppressed: boolean;
  verdict: Verdict;
  verdict_reason: VerdictReason;
};
export type AucInterval = {
  low: number;
  high: number;
  resamples: number;
  valid_resamples: number;
  seed: number;
};
export type Verdict = "edge" | "none" | "inconclusive";
export type VerdictReason =
  | "holdout_ci_above_chance"
  | "validation_at_or_below_chance"
  | "holdout_ci_below_chance"
  | "holdout_ci_spans_chance"
  | "validation_edge_too_small"
  | "holdout_auc_unavailable";
export type ModelTrace = HMMTrace | SignalTrace;
export type TraceRequest = { kind: "hmm" | "signal"; ticker: string; asOf: string };
export type Manifest = {
  schema_version: string;
  as_of: string;
  artifacts: Record<string, { url: string; sha256: string; input_hash: string }>;
};

/**
 * The exporter's verdict rule (src/observatory/evidence.py), restated so a trace whose verdict
 * disagrees with its own numbers is rejected:
 * edge when the holdout CI's lower bound > 0.5 and the best validation AUC > 0.52; none when
 * the CI's upper bound < 0.5 or every validation AUC ≤ 0.5; inconclusive otherwise.
 */
export function selectionVerdict(
  ci: AucInterval | null,
  validationAucs: (number | null)[],
): [Verdict, VerdictReason] {
  const values = validationAucs.filter((a): a is number => a != null);
  if (values.length && values.every((a) => a <= 0.5))
    return ["none", "validation_at_or_below_chance"];
  if (!ci) return ["inconclusive", "holdout_auc_unavailable"];
  if (ci.high < 0.5) return ["none", "holdout_ci_below_chance"];
  if (ci.low > 0.5)
    return values.length && Math.max(...values) > 0.52
      ? ["edge", "holdout_ci_above_chance"]
      : ["inconclusive", "validation_edge_too_small"];
  return ["inconclusive", "holdout_ci_spans_chance"];
}

/** Tickers the manifest declares, in manifest order. Each has a checked HMM and signal replay. */
export function manifestTickers(manifest: Manifest) {
  return [...new Set(Object.keys(manifest.artifacts).map((key) => key.split(":")[0]))];
}

/** Missing checksums must never turn a replay into an unchecked live trace. */
export function validateManifest(value: unknown): Manifest {
  const manifest = value as Manifest;
  const fail = () => {
    throw new Error("Replay manifest evidence or schema is invalid");
  };
  if (
    !manifest ||
    manifest.schema_version !== "model-observatory-manifest/1" ||
    !Number.isFinite(Date.parse(manifest.as_of)) ||
    !manifest.artifacts ||
    typeof manifest.artifacts !== "object"
  )
    fail();
  const keys = Object.keys(manifest.artifacts);
  if (!keys.length || keys.some((key) => !/^[A-Z]{1,6}:(hmm|signal)$/.test(key))) fail();
  // Every declared ticker must carry both scenes, so a missing half can't be silently skipped.
  for (const ticker of manifestTickers(manifest))
    for (const kind of ["hmm", "signal"]) {
      const entry = manifest.artifacts[`${ticker}:${kind}`];
      if (
        !entry ||
        entry.url !== `/artifacts/observatory/${ticker.toLowerCase()}-${kind}.json` ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !/^[a-f0-9]{64}$/.test(entry.input_hash)
      )
        fail();
    }
  return manifest;
}

/** Reject stronger claims, future evidence and malformed stage vectors before rendering. */
export function validateTrace(value: unknown, request: TraceRequest): ModelTrace {
  const trace = value as ModelTrace;
  const fail = () => {
    throw new Error("Trace evidence or schema is invalid");
  };
  const finite = (x: number) => Number.isFinite(x);
  const vector = (v: number[], size: number) =>
    Array.isArray(v) && v.length === size && v.every(finite);
  const probability = (v: number[], size: number) =>
    vector(v, size) &&
    v.every((x) => x >= 0 && x <= 1) &&
    Math.abs(v.reduce((a, b) => a + b, 0) - 1) < 0.001;
  if (
    !trace ||
    trace.seed !== 42 ||
    trace.schema_version !== "model-observatory/2" ||
    trace.kind !== request.kind ||
    trace.ticker !== request.ticker ||
    Date.parse(trace.as_of) !== Date.parse(request.asOf) ||
    !Array.isArray(trace.feature_names) ||
    !trace.feature_names.length
  )
    fail();
  const p = trace.provenance;
  const atCutoff = (date: string) =>
    Number.isFinite(Date.parse(date)) && Date.parse(date) <= Date.parse(trace.as_of);
  if (
    !p ||
    !/^[a-f0-9]{64}$/.test(p.input_hash) ||
    p.coverage !== "IEX_ONLY" ||
    p.source.join() !== "ALPACA_IEX" ||
    !p.evidence_quality.length ||
    !atCutoff(p.latest_observation) ||
    !Number.isFinite(Date.parse(p.latest_availability)) ||
    Date.parse(p.latest_availability) > Date.parse(trace.as_of) ||
    Date.parse(p.latest_observation) > Date.parse(p.latest_availability) ||
    Date.parse(p.as_of) !== Date.parse(trace.as_of) ||
    Object.values(trace.claims).some((x) => x !== false) ||
    trace.claims.market_claim_eligible !== false ||
    trace.claims.causal_claim_eligible !== false ||
    trace.claims.validated_alpha !== false ||
    Object.keys(trace.claims).length !== 3
  )
    fail();
  const qualities = [...new Set(p.evidence_quality)].sort();
  if (
    qualities.some(
      (q) => !["CONSERVATIVE_MARKET_TIME", "RECEIVE_TIMESTAMP_CAPTURED"].includes(q),
    ) ||
    p.evidence_mode !== (qualities.length === 2 ? "MIXED" : qualities[0])
  )
    fail();
  if (trace.kind === "hmm") {
    if (
      !trace.frames.length ||
      !Number.isInteger(trace.n_states) ||
      trace.n_states < 2 ||
      trace.n_states > 6 ||
      !atCutoff(trace.latest_feature) ||
      !atCutoff(trace.feature_start) ||
      !/^[a-f0-9]{64}$/.test(trace.scaler_hash) ||
      trace.dates_tail.some(
        (d) => !Number.isFinite(Date.parse(d)) || Date.parse(d) > Date.parse(trace.as_of),
      )
    )
      fail();
    trace.frames.forEach((f, i) => {
      if (
        f.iteration !== i + 1 ||
        !finite(f.loglik) ||
        f.means.length !== trace.n_states ||
        !f.means.every((v) => vector(v, trace.feature_names.length)) ||
        f.covariance_diagonal.length !== trace.n_states ||
        !f.covariance_diagonal.every((v) => vector(v, trace.feature_names.length)) ||
        f.covariance_diagonal.some((v) => v.some((x) => x < 0)) ||
        f.transmat.length !== trace.n_states ||
        !f.transmat.every((v) => probability(v, trace.n_states)) ||
        f.posterior_tail.length !== trace.dates_tail.length ||
        !f.posterior_tail.every((v) => probability(v, trace.n_states))
      )
        fail();
    });
  } else {
    if (
      !trace.folds.length ||
      !atCutoff(trace.inference.date) ||
      !atCutoff(trace.holdout.end) ||
      !atCutoff(trace.holdout.start) ||
      !atCutoff(trace.holdout.feature_start) ||
      !atCutoff(trace.holdout.training_target_information_end) ||
      trace.inference.included_in_labeled_rows ||
      !trace.holdout.visible_after_selection ||
      Date.parse(trace.holdout.training_target_information_end) >=
        Date.parse(trace.holdout.feature_start)
    )
      fail();
    const ci = trace.holdout.auc_ci95,
      aucs = trace.selection.map((s) => s.validation_auc),
      known = aucs.filter((a): a is number => a != null),
      [verdict, reason] = selectionVerdict(ci ?? null, aucs);
    if (
      !Array.isArray(trace.families) ||
      !trace.families.length ||
      new Set(trace.families).size !== trace.families.length ||
      !Array.isArray(trace.family) ||
      trace.family.length !== trace.feature_names.length ||
      trace.family.some((f) => !trace.families.includes(f)) ||
      !Array.isArray(trace.rho) ||
      trace.rho.length !== trace.folds.length - 1 ||
      trace.rho.some((r) => r !== null && (!finite(r) || r < -1 || r > 1)) ||
      ci === undefined ||
      (ci === null) !== (trace.holdout.auc === null) ||
      (ci !== null &&
        (![ci.low, ci.high].every(finite) ||
          ci.low < 0 ||
          ci.high > 1 ||
          ci.low > ci.high ||
          !Number.isInteger(ci.resamples) ||
          !Number.isInteger(ci.valid_resamples) ||
          ci.valid_resamples < 1 ||
          ci.valid_resamples > ci.resamples ||
          ci.seed !== 42)) ||
      trace.suppressed !== (known.length > 0 && known.every((a) => a <= 0.5)) ||
      trace.verdict !== verdict ||
      trace.verdict_reason !== reason
    )
      fail();
    const holdout = new Set(trace.holdout.indices);
    trace.folds.forEach((f) => {
      if (
        !f.frames.length ||
        f.model !== "gradient_boosting" ||
        f.stage_trace !== "AVAILABLE" ||
        f.fit_rows !== f.fit_indices.length ||
        f.validation_rows !== f.validation_indices.length ||
        ![
          f.fit_start,
          f.fit_end,
          f.validation_start,
          f.validation_end,
          f.validation_feature_start,
          f.training_target_information_end,
        ].every(atCutoff) ||
        Date.parse(f.training_target_information_end) >= Date.parse(f.validation_feature_start) ||
        [...f.fit_indices, ...f.validation_indices].some((i) => holdout.has(i))
      )
        fail();
      f.frames.forEach((s, i) => {
        if (
          s.stage !== i + 1 ||
          s.fold !== f.fold ||
          !finite(s.val_logloss) ||
          (s.val_auc !== null && !finite(s.val_auc)) ||
          !vector(s.feature_importance, trace.feature_names.length) ||
          s.feature_importance.some((x) => x < 0 || x > 1)
        )
          fail();
      });
    });
  }
  return trace;
}
