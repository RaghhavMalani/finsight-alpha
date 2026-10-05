import { api } from "@/lib/api";

const PROTOCOLS = [
  "ZERO",
  "KNOWN",
  "ORACLE",
  "STATIONARY_MEAN",
  "WARM_1",
  "WARM_2",
  "WARM_5",
  "WARM_10",
  "LEFT_CENSORED",
];
const DECISIONS = [
  "BOUNDARY_REPAIR_WARRANTED",
  "IDENTIFIABILITY_AWARE_ABSTENTION_WARRANTED",
  "EVIDENCE_INSUFFICIENT",
];
const STATES = ["HIGH", "PARTIAL", "LOW", "UNRESOLVED"];
const METHODS = [
  "inverse_hessian",
  "event_attribution",
  "parametric_bootstrap",
  "profile_likelihood",
];
export type Coverage = {
  protocol: string;
  method: string;
  axis: string;
  stratum: string;
  worlds: number;
  parameters: number;
  covered: number;
  coverage: number | null;
  meanWidth: number | null;
  rhoCoverage: number | null;
};
export type BoundaryRow = {
  name: string;
  rho: number;
  rhoError: number;
  beta: number;
  mu: number[];
  matrix: number[][];
  success: boolean;
  state: string;
  calibrated: boolean;
  condition: number | null;
  topology: string;
  exact: boolean;
  changed: number;
  errorGain: number;
  likelihoodDelta: number;
  methods: Array<{ name: string; available: boolean; reason: string | null }>;
  edges: Array<{
    source: number;
    target: number;
    kind: string;
    truth: number;
    estimate: number;
    lower: number;
    upper: number;
    support: number;
    ll: number;
    primary: string | null;
    tags: string[];
    reversed: boolean;
  }>;
};
export type BoundaryWorld = {
  id: string;
  seed: number;
  family: string;
  regime: string;
  information: string;
  counts: number[];
  hash: string;
  horizon: number;
  halfLife: number;
  rho: number;
  matrix: number[][];
  rows: BoundaryRow[];
};
export type BoundaryArtifact = {
  hash: string;
  fileHash: string;
  parentHash: string;
  worldCount: number;
  fitCount: number;
  protocols: string[];
  decision: {
    value: string;
    boundary: boolean;
    abstention: boolean;
    pairs: number;
    rmses: Record<string, number | null>;
    reductions: Record<string, number | null>;
    fraction: number | null;
    gain: number | null;
    groups: Array<{ name: string; n: number; error: number | null }>;
  };
  curves: Array<{ protocol: string; truth: number; n: number; mean: number; rmse: number }>;
  confusion: Array<{ protocol: string; labels: string[]; matrix: number[][]; worlds: number }>;
  categories: Array<{
    protocol: string;
    total: number;
    counts: Array<{ name: string; count: number }>;
  }>;
  coverage: Coverage[];
  geometry: Array<{
    protocol: string;
    correlations: Array<{ name: string; n: number; pearson: number | null }>;
    groups: Array<{
      name: string;
      fits: number;
      graphError: number | null;
      rhoError: number | null;
      failure: number | null;
    }>;
  }>;
  states: Array<{ protocol: string; counts: Array<{ name: string; count: number }> }>;
  worlds: BoundaryWorld[];
};

function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid boundary evidence object");
  return v as Record<string, unknown>;
}
function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error("Invalid boundary evidence list");
  return v;
}
function str(v: unknown): string {
  if (typeof v !== "string") throw new Error("Invalid boundary evidence text");
  return v;
}
function num(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error("Invalid boundary evidence number");
  return v;
}
function nullable(v: unknown): number | null {
  return v === null ? null : num(v);
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Invalid boundary evidence flag");
  return v;
}
function count(v: unknown): number {
  const n = num(v);
  if (!Number.isInteger(n) || n < 0) throw new Error("Invalid evidence count");
  return n;
}
function ratio(v: unknown): number | null {
  const n = nullable(v);
  if (n !== null && (n < 0 || n > 1)) throw new Error("Invalid evidence fraction");
  return n;
}
function seal(v: unknown): string {
  const s = str(v);
  if (!/^[a-f0-9]{64}$/.test(s)) throw new Error("Invalid evidence seal");
  return s;
}
function requiredRatio(v: unknown): number {
  const n = ratio(v);
  if (n === null) throw new Error("Missing support fraction");
  return n;
}
function choice(v: unknown, allowed: string[]): string {
  const s = str(v);
  if (!allowed.includes(s)) throw new Error("Unknown evidence label");
  return s;
}
function matrix(v: unknown, n: number): number[][] {
  const m = arr(v).map((r) => arr(r).map(num));
  if (m.length !== n || m.some((r) => r.length !== n || r.some((x) => x < 0)))
    throw new Error("Invalid branching matrix");
  return m;
}
function numericRecord(v: unknown): Record<string, number | null> {
  return Object.fromEntries(Object.entries(obj(v)).map(([k, x]) => [k, nullable(x)]));
}

export function adaptHawkesBoundary(input: unknown): BoundaryArtifact {
  const root = obj(input),
    execution = obj(root.execution),
    summary = obj(root.summary),
    policy = obj(root.uncertainty_policy);
  if (
    root.schema_version !== "dynamics-hawkes-boundary/0.4.1.1" ||
    root.milestone !== "D0.4.1.1" ||
    execution.latent_worlds !== 200 ||
    execution.protocol_fits !== 1800 ||
    execution.independent_replicates !== 200 ||
    execution.zero_audit_worlds !== 20 ||
    execution.paired_retained_events !== true
  )
    throw new Error("Incomplete matched boundary suite");
  for (const key of [
    "market_claim_eligible",
    "causal_claim_eligible",
    "predictive_validity_tested",
    "economic_utility_tested",
    "causal_identification_tested",
    "estimator_repair_implemented",
  ])
    if (obj(root.claims)[key] !== false) throw new Error("Boundary evidence exceeded claim scope");
  if (
    policy.fixed_attribution_history !== "HISTORICAL_ZERO_HISTORY_UNMODIFIED" ||
    policy.refit_profile_scope !== "TWENTY_NEW_ZERO_CRITICALITY_WORLDS_ONLY" ||
    policy.new_interval_methods !== 0 ||
    summary.failure_categories_are_causal !== false ||
    summary.predictive_value !== "NOT_TESTED" ||
    summary.economic_value !== "NOT_TESTED" ||
    summary.causal_interpretation !== "NOT_ESTABLISHED"
  )
    throw new Error("Changed diagnostic policy");
  const protocols = arr(root.protocol_names).map(str);
  if (JSON.stringify(protocols) !== JSON.stringify(PROTOCOLS))
    throw new Error("Changed boundary protocols");
  const decision = obj(summary.decision);
  if (
    decision.repair_implemented !== false ||
    decision.intrinsic_nonidentifiability_established !== false
  )
    throw new Error("Unsupported repair or causality claim");
  const terminal = choice(decision.decision, DECISIONS),
    boundary = bool(decision.boundary_predicate),
    abstention = bool(decision.abstention_predicate);
  if (terminal !== (boundary ? DECISIONS[0] : abstention ? DECISIONS[1] : DECISIONS[2]))
    throw new Error("Inconsistent decision");
  const worlds = arr(root.representatives).map((value) => {
    const w = obj(value),
      truth = obj(w.truth),
      counts = arr(w.counts).map(count),
      n = counts.length;
    if (n < 1 || n > 3) throw new Error("Invalid observed channels");
    const rows = arr(w.protocols).map((value) => {
      const row = obj(value),
        fit = obj(row.fit),
        errors = obj(row.errors),
        comparison = obj(row.comparison_to_zero);
      const methods = Object.entries(obj(row.methods)).map(([name, value]) => {
        const method = obj(value);
        return {
          name: choice(name, METHODS),
          available: bool(method.available),
          reason: method.reason === null ? null : str(method.reason),
        };
      });
      if (methods.length !== 4) throw new Error("Missing uncertainty method");
      return {
        name: choice(row.protocol, PROTOCOLS),
        rho: num(fit.spectral_radius),
        rhoError: num(errors.rho),
        beta: num(fit.beta),
        mu: arr(fit.baseline).map(num),
        matrix: matrix(fit.branching_matrix, n),
        success: bool(obj(fit.optimizer).success),
        state: choice(row.structural_identifiability, STATES),
        calibrated: bool(obj(row.residuals).calibrated),
        condition: nullable(obj(row.geometry).condition),
        topology: str(row.fitted_topology),
        exact: bool(obj(row.graph).exact_graph),
        changed: count(comparison.supported_entries_changed),
        errorGain: num(comparison.rho_absolute_error_improvement),
        likelihoodDelta: num(comparison.known_history_common_model_delta),
        methods,
        edges: arr(row.edge_failures).map((value) => {
          const e = obj(value);
          return {
            source: count(e.source),
            target: count(e.target),
            kind: choice(e.kind, ["FALSE", "MISSED"]),
            truth: num(e.true_contribution),
            estimate: num(e.estimated_contribution),
            lower: num(e.lower),
            upper: num(e.upper),
            support: requiredRatio(e.support_fraction),
            ll: num(e.likelihood_ablation_delta),
            primary: e.primary_category === null ? null : str(e.primary_category),
            tags: arr(e.tags).map(str),
            reversed: bool(e.reversed),
          };
        }),
      };
    });
    if (JSON.stringify(rows.map((r) => r.name)) !== JSON.stringify(PROTOCOLS))
      throw new Error("Incomplete matched representative");
    return {
      id: str(w.id),
      seed: count(w.seed),
      family: str(w.family),
      regime: str(w.regime),
      information: str(w.information),
      counts,
      hash: seal(w.hash),
      horizon: num(w.horizon),
      halfLife: num(w.half_life),
      rho: num(truth.rho),
      matrix: matrix(truth.G, n),
      rows,
    };
  });
  if (worlds.length !== 10 || new Set(worlds.map((w) => w.id)).size !== 10)
    throw new Error("Incomplete representative set");
  const confusion = arr(summary.confusion).map((value) => {
    const r = obj(value);
    const m = matrix(r.matrix, 4);
    if (m.flat().some((v) => !Number.isInteger(v)) || m.flat().reduce((a, b) => a + b, 0) !== 100)
      throw new Error("Invalid topology accounting");
    return {
      protocol: choice(r.protocol, PROTOCOLS),
      labels: arr(r.labels).map(str),
      matrix: m,
      worlds: count(r.latent_worlds),
    };
  });
  const curves = arr(summary.rho_curves).map((value) => {
    const r = obj(value);
    return {
      protocol: choice(r.protocol, PROTOCOLS),
      truth: num(r.true_rho),
      n: count(r.n),
      mean: num(r.mean_fitted_rho),
      rmse: num(r.rmse),
    };
  });
  if (curves.length !== 45 || confusion.length !== 9)
    throw new Error("Incomplete boundary projections");
  return {
    hash: seal(root.artifact_hash),
    fileHash: seal(root.file_sha256),
    parentHash: seal(obj(obj(root.parent_seals)["D0.4.1"]).canonical_hash),
    worldCount: count(execution.latent_worlds),
    fitCount: count(execution.protocol_fits),
    protocols,
    worlds,
    curves,
    confusion,
    decision: {
      value: terminal,
      boundary,
      abstention,
      pairs: count(decision.paired_critical_worlds),
      rmses: numericRecord(decision.rho_rmse),
      reductions: numericRecord(decision.rmse_reduction),
      fraction: ratio(decision.oracle_improved_fraction),
      gain: nullable(decision.oracle_mean_absolute_error_improvement),
      groups: Object.entries(obj(decision.known_graph_condition_groups)).map(([name, v]) => {
        const r = obj(v);
        return { name, n: count(r.n), error: ratio(r.error_rate) };
      }),
    },
    categories: arr(summary.false_edge_categories).map((value) => {
      const r = obj(value);
      const counts = Object.entries(obj(r.counts)).map(([name, v]) => ({ name, count: count(v) }));
      if (counts.reduce((a, b) => a + b.count, 0) !== count(r.false_edges))
        throw new Error("Invalid false-edge accounting");
      return { protocol: choice(r.protocol, PROTOCOLS), total: count(r.false_edges), counts };
    }),
    coverage: arr(summary.coverage).map((value) => {
      const r = obj(value);
      if (count(r.covered) > count(r.parameters)) throw new Error("Invalid coverage accounting");
      return {
        protocol: choice(r.protocol, PROTOCOLS),
        method: choice(r.method, METHODS),
        axis: str(r.axis),
        stratum: str(r.stratum),
        worlds: count(r.worlds),
        parameters: count(r.parameters),
        covered: count(r.covered),
        coverage: ratio(r.coverage),
        meanWidth: nullable(r.mean_width),
        rhoCoverage: ratio(r.rho_coverage),
      };
    }),
    geometry: arr(summary.geometry).map((value) => {
      const r = obj(value);
      return {
        protocol: choice(r.protocol, PROTOCOLS),
        correlations: Object.entries(obj(r.correlations)).map(([name, v]) => {
          const c = obj(v);
          const pearson = nullable(c.pearson);
          if (pearson !== null && Math.abs(pearson) > 1) throw new Error("Invalid correlation");
          return { name, n: count(c.n), pearson };
        }),
        groups: arr(r.groups).map((value) => {
          const g = obj(value);
          return {
            name: str(g.group),
            fits: count(g.fits),
            graphError: ratio(g.graph_error_rate),
            rhoError: nullable(g.rho_absolute_error),
            failure: ratio(g.optimizer_failure_rate),
          };
        }),
      };
    }),
    states: arr(summary.epistemic_states).map((value) => {
      const r = obj(value);
      return {
        protocol: choice(r.protocol, PROTOCOLS),
        counts: Object.entries(obj(r.counts)).map(([name, v]) => ({
          name: choice(name, STATES),
          count: count(v),
        })),
      };
    }),
  };
}

export async function fetchHawkesBoundary(): Promise<BoundaryArtifact> {
  return adaptHawkesBoundary(
    await api<unknown>("/dynamics/certification/hawkes-boundary-decomposition"),
  );
}
