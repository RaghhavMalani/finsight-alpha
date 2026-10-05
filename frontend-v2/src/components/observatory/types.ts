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
  schema_version: "model-observatory/1";
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
  };
  inference: { date: string; included_in_labeled_rows: boolean };
  importance_semantics: string;
  split_contract: string;
};
export type ModelTrace = HMMTrace | SignalTrace;
export type TraceRequest = { kind: "hmm" | "signal"; ticker: string; asOf: string };
export type Manifest = {
  schema_version: string;
  as_of: string;
  artifacts: Record<string, { url: string; sha256: string; input_hash: string }>;
};
export type Vec3 = [number, number, number];
export type SceneNode = {
  id: number;
  position: Vec3;
  color: string;
  radius: number;
  label: string;
  values: string[];
};
export type Curve = {
  start: Vec3;
  end: Vec3;
  control: Vec3;
  color: string;
  weight: number;
  from: number;
  to: number;
  group?: number;
  stage?: number;
};
export const PALETTE = ["#42C98B", "#F0A929", "#5CA9E6", "#F06464", "#A98CF0", "#A7B0B7"];
export const FONT = "/fonts/jetbrains-mono-latin-400-normal.woff";
export const decimal = (x: number | null, digits = 3) =>
  x == null ? "UNAVAILABLE" : x.toFixed(digits);

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
    trace.schema_version !== "model-observatory/1" ||
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
