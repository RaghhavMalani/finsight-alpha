import { api } from "@/lib/api";

export type Matrix = number[][];
export type Interval = {
  estimate: Matrix;
  lower: Matrix;
  upper: Matrix;
};
export type IdentifiabilityWorld = {
  id: string;
  regime: string;
  information: string;
  channels: string[];
  counts: number[];
  hash: string;
  truth: Matrix;
  fitted: Matrix;
  trueRho: number;
  fittedRho: number;
  fitSuccess: boolean;
  exactGraph: boolean;
  directionClass: string;
  residualCalibrated: boolean;
  interval: Interval;
  edgeSupport: Matrix;
  supportProbability: Matrix;
};
export type MethodCoverage = {
  method: string;
  worlds: number;
  parameters: number;
  coverage: number | null;
  meanWidth: number | null;
  medianWidth: number | null;
  bias: number | null;
  rmse: number | null;
  failures: number;
  rhoCoverage: number | null;
};
export type HawkesIdentifiability = {
  hash: string;
  fileHash: string;
  parentHash: string;
  question: string;
  status: string;
  worldCount: number;
  auditCount: number;
  gates: Record<string, boolean>;
  capabilities: Array<{ name: string; tested: boolean; status: string }>;
  metrics: Record<string, number | null>;
  graphMetrics: Record<string, number | null>;
  worlds: IdentifiabilityWorld[];
  methods: MethodCoverage[];
  calibration: Array<{ truth: number; mean: number; rmse: number }>;
  frontier: Array<{
    regime: string;
    asymmetry: number;
    frontier: string;
    cells: Array<{ information: string; worlds: number; rate: number | null }>;
  }>;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid D0.4.1 object: ${label}`);
  }
  return value as Record<string, unknown>;
}
function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid D0.4.1 array: ${label}`);
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid D0.4.1 text");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid D0.4.1 number");
  }
  return value;
}
function nullable(value: unknown): number | null {
  return value === null ? null : number(value);
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid D0.4.1 boolean");
  return value;
}
function matrix(value: unknown, dimension: number): Matrix {
  const rows = list(value, "matrix").map((row) => list(row, "matrix row").map(number));
  if (rows.length !== dimension || rows.some((row) => row.length !== dimension)) {
    throw new Error("Invalid D0.4.1 matrix dimensions");
  }
  if (rows.some((row) => row.some((entry) => entry < 0))) {
    throw new Error("Invalid negative branching parameter");
  }
  return rows;
}

function world(value: unknown): IdentifiabilityWorld {
  const row = object(value, "representative");
  const identity = object(row.world, "world");
  const truth = object(row.truth, "truth");
  const fit = object(row.fit, "fit");
  const graph = object(row.graph_evaluation, "graph");
  const uncertainty = object(row.uncertainty, "uncertainty");
  const attribution = object(uncertainty.event_attribution, "attribution");
  const branch = object(attribution.branching, "interval");
  const channels = list(identity.channels, "channels").map(text);
  const n = channels.length;
  if (n < 1 || n > 3 || attribution.available !== true) {
    throw new Error("Unavailable D0.4.1 representative evidence");
  }
  const support = matrix(attribution.edge_support, n);
  const probability = matrix(attribution.bootstrap_support_probability, n);
  const counts = list(identity.event_counts, "counts").map(number);
  const fitted = matrix(fit.branching_matrix, n);
  const interval = {
    estimate: matrix(branch.estimate, n),
    lower: matrix(branch.lower, n),
    upper: matrix(branch.upper, n),
  };
  if (counts.length !== n || counts.some((v) => !Number.isInteger(v) || v < 0)) {
    throw new Error("Invalid D0.4.1 event counts");
  }
  if (
    fitted.some((row, target) =>
      row.some(
        (value, source) =>
          Math.abs(value - interval.estimate[target][source]) > 1e-7 ||
          interval.lower[target][source] > interval.upper[target][source] ||
          support[target][source] !== Number(interval.lower[target][source] > 0.035),
      ),
    )
  ) {
    throw new Error("Inconsistent D0.4.1 interval or support evidence");
  }
  if (support.flat().some((v) => v !== 0 && v !== 1) || probability.flat().some((v) => v > 1)) {
    throw new Error("Invalid D0.4.1 support evidence");
  }
  return {
    id: text(identity.world_id),
    regime: text(identity.regime),
    information: text(identity.information_regime),
    channels,
    counts,
    hash: text(identity.world_hash),
    truth: matrix(truth.branching_matrix, n),
    fitted,
    trueRho: number(truth.spectral_radius),
    fittedRho: number(fit.spectral_radius),
    fitSuccess: boolean(object(fit.optimizer, "optimizer").success),
    exactGraph: boolean(graph.exact_graph),
    directionClass: text(graph.direction_class),
    residualCalibrated: boolean(object(row.residual_diagnostics, "residuals").calibrated),
    interval,
    edgeSupport: support,
    supportProbability: probability,
  };
}

export function adaptHawkesIdentifiability(value: unknown): HawkesIdentifiability {
  const root = object(value, "artifact");
  if (
    root.schema_version !== "dynamics-hawkes-identifiability/0.4.1" ||
    root.milestone !== "D0.4.1"
  ) {
    throw new Error("Unsupported Hawkes identifiability schema");
  }
  const claims = object(root.claim_boundary, "claims");
  for (const key of [
    "causal_claim_eligible",
    "market_claim_eligible",
    "predictive_validity_tested",
    "economic_utility_tested",
    "causal_identification_tested",
  ]) {
    if (claims[key] !== false) throw new Error(`D0.4.1 claim boundary violated: ${key}`);
  }
  const execution = object(root.execution, "execution");
  if (execution.worlds_executed !== 420 || execution.audit_worlds !== 44) {
    throw new Error("Incomplete D0.4.1 evidence");
  }
  const result = object(root.program_result, "result");
  const metrics = object(root.metrics, "metrics");
  const observatory = object(root.observatory, "observatory");
  const worlds = list(observatory.representative_worlds, "representatives").map(world);
  if (worlds.length !== 10 || new Set(worlds.map((item) => item.id)).size !== 10) {
    throw new Error("Invalid D0.4.1 representative set");
  }
  const numericMetrics = Object.fromEntries(
    Object.entries(metrics)
      .filter(([, v]) => typeof v === "number" || v === null)
      .map(([k, v]) => [k, nullable(v)]),
  );
  return {
    hash: text(root.artifact_hash),
    fileHash: text(root.file_sha256),
    parentHash: text(object(root.parent_seal, "parent").canonical_hash),
    question: text(root.scientific_question),
    status: text(result.status),
    worldCount: number(execution.worlds_executed),
    auditCount: number(execution.audit_worlds),
    gates: Object.fromEntries(
      Object.entries(object(result.promotion_gates, "gates")).map(([k, v]) => [k, boolean(v)]),
    ),
    capabilities: Object.entries(object(result.capability_vector, "capabilities")).map(
      ([name, v]) => {
        const row = object(v, "capability");
        return { name, tested: boolean(row.tested), status: text(row.status) };
      },
    ),
    metrics: numericMetrics,
    graphMetrics: Object.fromEntries(
      Object.entries(object(metrics.graph, "graph metrics")).map(([k, v]) => [k, nullable(v)]),
    ),
    worlds,
    methods: list(observatory.interval_coverage, "coverage").map((v) => {
      const row = object(v, "method");
      return {
        method: text(row.method),
        worlds: number(row.available_worlds),
        parameters: number(row.parameter_count),
        coverage: nullable(row.coverage),
        meanWidth: nullable(row.mean_width),
        medianWidth: nullable(row.median_width),
        bias: nullable(row.bias),
        rmse: nullable(row.rmse),
        failures: number(row.failed_worlds),
        rhoCoverage: nullable(row.spectral_radius_coverage),
      };
    }),
    calibration: list(observatory.spectral_radius_calibration, "calibration").map((v) => {
      const row = object(v, "rho calibration");
      return { truth: number(row.truth), mean: number(row.mean_estimate), rmse: number(row.rmse) };
    }),
    frontier: list(observatory.direction_frontier, "frontier").map((v) => {
      const row = object(v, "frontier row");
      return {
        regime: text(row.regime),
        asymmetry: number(row.edge_asymmetry),
        frontier: text(row.frontier),
        cells: list(row.cells, "frontier cells").map((item) => {
          const cell = object(item, "cell");
          return {
            information: text(cell.information_regime),
            worlds: number(cell.worlds),
            rate: nullable(cell.exact_graph_rate),
          };
        }),
      };
    }),
  };
}

export async function fetchHawkesIdentifiability(): Promise<HawkesIdentifiability> {
  return adaptHawkesIdentifiability(
    await api<unknown>("/dynamics/certification/hawkes-identifiability"),
  );
}
