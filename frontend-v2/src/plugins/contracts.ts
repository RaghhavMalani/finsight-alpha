import { assertDerivedPayload, ReplayError, type ReplayEntry } from "../replay/contracts.ts";
import { sha256 } from "../replay/client.ts";

type Metric = { mse: number; correlation: number | null; rows: number; semantics: string };
type Hook = {
  status: string;
  reason?: string;
  metrics?: Metric;
  coefficients?: Record<string, number>;
  r_squared?: number | null;
};
export type PluginReplay = {
  schema_version: "plugin-replay/1" | "plugin-replay/2";
  execution?: { commit: string; dirty_computation: false; dependency_manifest_hash: string };
  run_id: string;
  label: string;
  scope: "SYNTHETIC_REFERENCE";
  computation_ready: true;
  holdout_openings: number;
  claims: Record<string, false>;
  contract: {
    as_of: string;
    seed: number;
    data_hash: string;
    scope: string;
    code: {
      commit?: string;
      dirty_computation?: false;
      schema_version?: string;
      sources?: Record<string, string>;
    };
    splits: {
      groups: Record<"fit" | "validation" | "development" | "holdout", number[]>;
      horizon_purge_rows: number;
      embargo_rows: number;
      fit_information_end: string;
      validation_start: string;
      development_information_end: string;
      holdout_start: string;
    };
  };
  inference_capability: { method: string; confirmation_status: string };
  metrics: Metric;
  arena: {
    ranking: { candidate: number; validation: Metric }[];
    selected: { candidate: number; validation: Metric };
  };
  honesty: Record<string, Hook>;
  observatory: {
    frames: { step: number; stage: "validation" | "holdout"; rows: number; metrics: Metric }[];
    semantics: string;
  };
  predictions: { decision_at: string; signals: { momentum_signal: number } }[];
  accounting: { counts: Record<string, number>; attempts: number; event_chain_tip: string };
  issues: {
    id: string;
    severity: string;
    kind: string;
    reason: string;
    run_id: string;
    status: string;
    first_seen_at: string;
    evidence: string[];
  }[];
};

const fail = (reason: string): never => {
  throw new ReplayError(`Plugin evidence unavailable: ${reason}`);
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected record");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail("expected array");
  return value as unknown[];
}
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const time = (v: unknown): v is string =>
  typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function metric(value: unknown) {
  const m = object(value);
  if (
    !finite(m.mse) ||
    m.mse < 0 ||
    !Number.isInteger(m.rows) ||
    Number(m.rows) < 1 ||
    !(m.correlation === null || (finite(m.correlation) && Math.abs(m.correlation) <= 1.000001)) ||
    typeof m.semantics !== "string" ||
    !m.semantics.includes("descriptive")
  )
    fail("invalid diagnostic metric");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}

export async function validatePluginReplay(
  value: unknown,
  entry: ReplayEntry,
): Promise<PluginReplay> {
  assertDerivedPayload(value);
  const r = object(value),
    c = object(r.contract),
    code = object(c.code),
    cap = object(r.inference_capability);
  const provenance = r.schema_version === "plugin-replay/2" ? object(r.execution) : code;
  if (
    r.schema_version === "plugin-replay/2" &&
    (c.schema_version !== "plugin-computation/2" ||
      code.schema_version !== "computation-dependencies/2" ||
      !hash(provenance.dependency_manifest_hash) ||
      !Object.keys(object(code.sources)).length)
  )
    fail("v2 dependency declaration");
  if (
    r.schema_version === "plugin-replay/2" &&
    (await sha256(new TextEncoder().encode(JSON.stringify(canonical(code))).buffer)) !==
      provenance.dependency_manifest_hash
  )
    fail("v2 dependency manifest substitution");
  if (
    !["plugin-replay/1", "plugin-replay/2"].includes(String(r.schema_version)) ||
    r.status !== "COMPUTED" ||
    r.computation_ready !== true ||
    r.scope !== "SYNTHETIC_REFERENCE" ||
    c.scope !== r.scope ||
    r.tenant_id !== "public-fixture" ||
    c.tenant_id !== r.tenant_id ||
    c.asset !== "SDK-FIXTURE" ||
    code.plugin !== "examples.momentum_plugin.MomentumModel" ||
    !hash(r.run_id) ||
    !hash(c.data_hash) ||
    c.data_hash !== entry.input_hash ||
    c.as_of !== entry.as_of ||
    entry.scope !== r.scope ||
    entry.kind !== "plugin-run" ||
    provenance.dirty_computation !== false ||
    typeof provenance.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(provenance.commit as string)
  )
    fail("source/run/scope binding");
  if (
    JSON.stringify(r.sources) !== JSON.stringify(["project:nervous-fixture"]) ||
    JSON.stringify(entry.sources) !== JSON.stringify(r.sources)
  )
    fail("source identity");
  for (const key of [
    "inference_certified",
    "market_claim_eligible",
    "causal_claim_eligible",
    "validated_alpha",
  ])
    if (object(r.claims)[key] !== false) fail("claim promotion");
  if (
    cap.inference_certified !== false ||
    cap.market_claim_eligible !== false ||
    cap.validated_alpha !== false ||
    cap.method !== "NULL_MBB_T" ||
    cap.confirmation_status !== "NOT_CONFIRMED" ||
    array(cap.supported_domains).length
  )
    fail("retroactive inference certificate");
  const splits = object(c.splits),
    groups = object(splits.groups);
  for (const name of ["fit", "validation", "development", "holdout"]) {
    const indexes = array(groups[name]);
    if (
      !indexes.length ||
      indexes.some(
        (v, i) =>
          !Number.isInteger(v) || Number(v) < 0 || (i > 0 && Number(v) <= Number(indexes[i - 1])),
      )
    )
      fail("split index family");
  }
  const fit = array(groups.fit),
    validation = array(groups.validation),
    development = array(groups.development),
    holdout = array(groups.holdout);
  if (object(r.metrics).rows !== holdout.length) fail("evaluation row family");
  if (
    Number(fit.at(-1)) >= Number(validation[0]) ||
    Number(development.at(-1)) >= Number(holdout[0]) ||
    [...fit, ...validation].some((i) => !development.includes(i))
  )
    fail("overlapping chronology");
  for (const [end, start] of [
    [splits.fit_information_end, splits.validation_start],
    [splits.development_information_end, splits.holdout_start],
  ])
    if (!time(end) || !time(start) || Date.parse(end) >= Date.parse(start))
      fail("target realization leakage");
  if (
    !Number.isInteger(splits.horizon_purge_rows) ||
    Number(splits.horizon_purge_rows) < 1 ||
    !Number.isInteger(splits.embargo_rows) ||
    Number(splits.embargo_rows) < 0
  )
    fail("purge/embargo");
  if ((await sha256(new TextEncoder().encode(JSON.stringify(canonical(c))).buffer)) !== r.run_id)
    fail("contract identity changed");
  metric(r.metrics);
  const arena = object(r.arena),
    ranking = array(arena.ranking),
    selected = object(arena.selected);
  if (!ranking.length || arena.selection_scope !== "validation_only")
    fail("missing validation arena");
  ranking.forEach((row, i) => {
    const item = object(row);
    if (item.candidate !== i) fail("candidate accounting");
    metric(item.validation);
  });
  const best = ranking.reduce((a, b) =>
    Number(object(object(b).validation).mse) < Number(object(object(a).validation).mse) ? b : a,
  );
  if (JSON.stringify(selected) !== JSON.stringify(best)) fail("selection used unrecorded evidence");
  const accounting = object(r.accounting),
    counts = object(accounting.counts);
  if (
    counts.CANDIDATE_STARTED !== ranking.length ||
    counts.CANDIDATE_COMPLETED !== ranking.length ||
    counts.HOLDOUT_OPENED !== 1 ||
    r.holdout_openings !== 1 ||
    !hash(accounting.event_chain_tip) ||
    !Number.isInteger(accounting.attempts) ||
    Number(accounting.attempts) < 1
  )
    fail("attempt/holdout accounting");
  const predictions = array(r.predictions);
  if (predictions.length !== holdout.length) fail("holdout row count");
  predictions.forEach((p, i) => {
    const row = object(p),
      signals = object(row.signals);
    if (
      !time(row.decision_at) ||
      Date.parse(row.decision_at) < Date.parse(String(splits.holdout_start)) ||
      Date.parse(row.decision_at) > Date.parse(String(c.as_of)) ||
      (i > 0 &&
        Date.parse(row.decision_at) <=
          Date.parse(String(object(predictions[i - 1]).decision_at))) ||
      Object.keys(signals).join() !== "momentum_signal" ||
      !finite(signals.momentum_signal)
    )
      fail("derived prediction clock/type");
  });
  const frames = array(object(r.observatory).frames);
  if (frames.length !== ranking.length + 1) fail("invented trace stages");
  frames.forEach((f, i) => {
    const frame = object(f);
    metric(frame.metrics);
    if (
      frame.step !== i ||
      frame.stage !== (i < ranking.length ? "validation" : "holdout") ||
      frame.rows !== (i < ranking.length ? validation.length : holdout.length)
    )
      fail("trace/evaluation binding");
    const expected = i < ranking.length ? object(ranking[i]).validation : r.metrics;
    if (JSON.stringify(frame.metrics) !== JSON.stringify(expected))
      fail("trace metric substitution");
  });
  const honesty = object(r.honesty);
  for (const name of ["null_world", "planted_effect"]) {
    const hook = object(honesty[name]);
    if (hook.status === "MEASURED") {
      metric(hook.metrics);
      if (
        hook.worlds !== 1 ||
        hook.type_i_error_estimated !== false ||
        hook.certificate !== false ||
        hook.evidence_scope !== "ENGINEERING_CONTROL_ONLY"
      )
        fail("engineering control promoted to calibration");
    } else if (hook.status !== "UNAVAILABLE" || typeof hook.reason !== "string")
      fail("missing control result");
  }
  if (object(honesty.leakage_sabotage).status !== "REJECTED_AS_REQUIRED")
    fail("future-feature sabotage escaped");
  const exposure = object(honesty.factor_neutrality);
  if (exposure.status === "MEASURED") {
    if (Object.values(object(exposure.coefficients)).some((v) => !finite(v)))
      fail("factor exposure types");
  } else if (exposure.status !== "UNAVAILABLE" || typeof exposure.reason !== "string")
    fail("factor exposure coverage");
  array(r.issues).forEach((item) => {
    const issue = object(item);
    if (
      issue.run_id !== r.run_id ||
      !hash(issue.id) ||
      !time(issue.first_seen_at) ||
      issue.status !== "OPEN" ||
      typeof issue.reason !== "string" ||
      !array(issue.evidence).includes("run:" + r.run_id)
    )
      fail("issue evidence binding");
  });
  return r as unknown as PluginReplay;
}
