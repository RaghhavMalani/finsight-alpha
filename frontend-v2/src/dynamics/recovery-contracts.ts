import { api } from "@/lib/api";

export type RepairRoot = {
  clusterId: number;
  location: number;
  locationCi95: [number, number];
  persistence: number;
  stable: boolean;
  stableSupport: number;
  derivativeMedian: number;
  occupancyCount: number;
  dataSupport: string;
};

export type RepairCase = {
  cellId: string;
  role: string;
  truth: {
    observations: number;
    gamma: number;
    theta: number;
    sigma: number;
  };
  before: null | {
    certifiedCorrect: boolean;
  };
  after: {
    topologyCertified: boolean;
    stateDiffusionCertified: boolean;
    topologyMatch: boolean;
  };
  topologyRepair: null | {
    certificateScore: number;
    signTopologySupport: number;
    barrierSupport: number;
    holdoutGain: number;
    rootCertificate: RepairRoot[];
  };
  diffusionRepair: null | {
    twiceLogLikelihoodRatio: number;
    bootstrapDominance: number;
    diffusionRatio: number;
    reconstructionError: number;
    varianceSignal: boolean;
    reconstructionPassed: boolean;
  };
};

export type RecoveryMetrics = {
  linearSpecificity: number;
  falseNonlinearDiscoveryRate: number;
  falseBasinDiscoveryRate: number;
  doubleWellDetection: number;
  basinRecall: number;
  basinPrecision: number;
  topologyAccuracy: number;
  stateDiffusionDetection: number;
  numericalFailureRate: number;
  sealedHoldoutCompliance: boolean;
};

export type RecoveryWaterfall = {
  doubleWell: Record<string, number | null>;
  stateDiffusion: Record<string, number | null>;
};

export type RecoveryRocPoint = {
  threshold: number;
  recall: number;
  falseDiscovery: number;
};

export type TargetedRecoveryArtifact = {
  artifactHash: string;
  milestone: string;
  question: string;
  capabilityStatus: string;
  graduationDecision: string;
  graduationPassed: boolean;
  graduationChecks: Record<string, boolean>;
  metrics: RecoveryMetrics;
  waterfall: RecoveryWaterfall;
  cases: RepairCase[];
  topologyRoc: RecoveryRocPoint[];
  diffusionRoc: RecoveryRocPoint[];
  lockedTopologyPersistence: number;
  lockedDiffusionLlr: number;
  historical: Record<string, { before: number; after: number; runs: number }>;
  routing: {
    hawkesEligible: boolean;
    hawkesStarted: boolean;
  };
  realMarketClaim: {
    selectedModel: string;
    marketClaim: string;
    rerunPerformed: boolean;
    interpretation: string;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.3 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.3.3 projection rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.3.3 projection rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.3 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.3.3 projection rejected: ${label}.`);
  return value;
}

function adaptRoot(value: unknown): RepairRoot {
  const row = object(value, "root");
  const ci = array(row.location_ci95, "root.location_ci95");
  return {
    clusterId: number(row.cluster_id, "root.cluster_id"),
    location: number(row.location, "root.location"),
    locationCi95: [number(ci[0], "root.ci.low"), number(ci[1], "root.ci.high")],
    persistence: number(row.persistence, "root.persistence"),
    stable: bool(row.stable, "root.stable"),
    stableSupport: number(row.stable_support, "root.stable_support"),
    derivativeMedian: number(row.derivative_median, "root.derivative_median"),
    occupancyCount: number(row.occupancy_count, "root.occupancy_count"),
    dataSupport: text(row.data_support, "root.data_support"),
  };
}

function adaptCase(value: unknown): RepairCase {
  const row = object(value, "case");
  const truth = object(row.truth, "case.truth");
  const after = object(row.after, "case.after");
  const rawBefore = row.before;
  const rawTopology = row.topology_repair;
  const rawDiffusion = row.diffusion_repair;
  let topologyRepair: RepairCase["topologyRepair"] = null;
  let diffusionRepair: RepairCase["diffusionRepair"] = null;
  if (rawTopology !== null) {
    const topology = object(rawTopology, "case.topology_repair");
    topologyRepair = {
      certificateScore: number(topology.certificate_score, "topology.certificate_score"),
      signTopologySupport: number(topology.sign_topology_support, "topology.sign_topology_support"),
      barrierSupport: number(topology.barrier_support, "topology.barrier_support"),
      holdoutGain: number(
        topology.holdout_mean_nll_gain_vs_ou,
        "topology.holdout_mean_nll_gain_vs_ou",
      ),
      rootCertificate: array(topology.root_certificate, "topology.root_certificate").map(adaptRoot),
    };
  }
  if (rawDiffusion !== null) {
    const diffusion = object(rawDiffusion, "case.diffusion_repair");
    diffusionRepair = {
      twiceLogLikelihoodRatio: number(
        diffusion.twice_log_likelihood_ratio,
        "diffusion.twice_log_likelihood_ratio",
      ),
      bootstrapDominance: number(diffusion.bootstrap_dominance, "diffusion.bootstrap_dominance"),
      diffusionRatio: number(
        diffusion.diffusion_max_min_ratio,
        "diffusion.diffusion_max_min_ratio",
      ),
      reconstructionError: number(
        diffusion.diffusion_reconstruction_error,
        "diffusion.diffusion_reconstruction_error",
      ),
      varianceSignal: bool(diffusion.variance_signal, "diffusion.variance_signal"),
      reconstructionPassed: bool(
        diffusion.g_reconstruction_pass,
        "diffusion.g_reconstruction_pass",
      ),
    };
  }
  return {
    cellId: text(row.cell_id, "case.cell_id"),
    role: text(row.role, "case.role"),
    truth: {
      observations: number(truth.observations, "truth.observations"),
      gamma: number(truth.gamma, "truth.gamma"),
      theta: number(truth.theta, "truth.theta"),
      sigma: number(truth.sigma, "truth.sigma"),
    },
    before:
      rawBefore === null
        ? null
        : {
            certifiedCorrect: bool(
              object(rawBefore, "case.before").certified_correct,
              "before.certified_correct",
            ),
          },
    after: {
      topologyCertified: bool(after.topology_certified, "after.topology_certified"),
      stateDiffusionCertified: bool(
        after.state_diffusion_certified,
        "after.state_diffusion_certified",
      ),
      topologyMatch: bool(after.topology_match, "after.topology_match"),
    },
    topologyRepair,
    diffusionRepair,
  };
}

export function adaptTargetedRecovery(value: unknown): TargetedRecoveryArtifact {
  const root = object(value, "root");
  const capability = object(root.capability, "capability");
  const graduation = object(root.graduation, "graduation");
  const checks = object(graduation.checks, "graduation.checks");
  const metrics = object(root.confirmation_metrics, "confirmation_metrics");
  const waterfall = object(root.causal_waterfall, "causal_waterfall");
  const doubleWell = object(waterfall.double_well, "waterfall.double_well");
  const stateDiffusion = object(waterfall.state_diffusion, "waterfall.state_diffusion");
  const calibration = object(root.calibration, "calibration");
  const locked = object(root.locked_configuration, "locked_configuration");
  const historical = object(
    object(root.historical_audit, "historical_audit").summary,
    "historical.summary",
  );
  const routing = object(root.routing, "routing");
  const market = object(root.real_market_claim, "real_market_claim");
  const numericRecord = (row: Record<string, unknown>, label: string) =>
    Object.fromEntries(
      Object.entries(row).map(([key, item]) => [key, nullableNumber(item, `${label}.${key}`)]),
    );
  return {
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    question: text(root.question, "question"),
    capabilityStatus: text(capability.status, "capability.status"),
    graduationDecision: text(graduation.decision, "graduation.decision"),
    graduationPassed: bool(graduation.passed, "graduation.passed"),
    graduationChecks: Object.fromEntries(
      Object.entries(checks).map(([key, item]) => [key, bool(item, `checks.${key}`)]),
    ),
    metrics: {
      linearSpecificity: number(metrics.linear_specificity, "metrics.linear_specificity"),
      falseNonlinearDiscoveryRate: number(
        metrics.false_nonlinear_discovery_rate,
        "metrics.false_nonlinear_discovery_rate",
      ),
      falseBasinDiscoveryRate: number(
        metrics.false_basin_discovery_rate,
        "metrics.false_basin_discovery_rate",
      ),
      doubleWellDetection: number(metrics.double_well_detection, "metrics.double_well_detection"),
      basinRecall: number(metrics.basin_recall, "metrics.basin_recall"),
      basinPrecision: number(metrics.basin_precision, "metrics.basin_precision"),
      topologyAccuracy: number(
        metrics.potential_topology_accuracy,
        "metrics.potential_topology_accuracy",
      ),
      stateDiffusionDetection: number(
        metrics.state_diffusion_detection,
        "metrics.state_diffusion_detection",
      ),
      numericalFailureRate: number(
        metrics.numerical_failure_rate,
        "metrics.numerical_failure_rate",
      ),
      sealedHoldoutCompliance: bool(
        metrics.sealed_holdout_compliance,
        "metrics.sealed_holdout_compliance",
      ),
    },
    waterfall: {
      doubleWell: numericRecord(doubleWell, "waterfall.double_well"),
      stateDiffusion: numericRecord(stateDiffusion, "waterfall.state_diffusion"),
    },
    cases: array(root.confirmation_cases, "confirmation_cases")
      .map(adaptCase)
      .filter((row) => row.role === "double_well" || row.role === "state_diffusion"),
    topologyRoc: array(calibration.topology_roc, "calibration.topology_roc").map((item) => {
      const row = object(item, "topology_roc.row");
      return {
        threshold: number(row.persistence_threshold, "topology_roc.threshold"),
        recall: number(row.true_basin_recall, "topology_roc.recall"),
        falseDiscovery: number(row.false_basin_discovery_rate, "topology_roc.false_discovery"),
      };
    }),
    diffusionRoc: array(calibration.diffusion_roc, "calibration.diffusion_roc").map((item) => {
      const row = object(item, "diffusion_roc.row");
      return {
        threshold: number(row.twice_log_likelihood_ratio_threshold, "diffusion_roc.threshold"),
        recall: number(row.state_diffusion_recall, "diffusion_roc.recall"),
        falseDiscovery: number(row.false_state_diffusion_rate, "diffusion_roc.false_discovery"),
      };
    }),
    lockedTopologyPersistence: number(
      locked.locked_topology_persistence,
      "locked.locked_topology_persistence",
    ),
    lockedDiffusionLlr: number(locked.locked_diffusion_llr, "locked.locked_diffusion_llr"),
    historical: Object.fromEntries(
      Object.entries(historical).map(([key, item]) => {
        const row = object(item, `historical.${key}`);
        return [
          key,
          {
            before: number(row.before, `historical.${key}.before`),
            after: number(row.after, `historical.${key}.after`),
            runs: number(row.runs, `historical.${key}.runs`),
          },
        ];
      }),
    ),
    routing: {
      hawkesEligible: bool(routing.d0_4_hawkes_eligible, "routing.d0_4_hawkes_eligible"),
      hawkesStarted: bool(routing.hawkes_started, "routing.hawkes_started"),
    },
    realMarketClaim: {
      selectedModel: text(market.selected_model, "market.selected_model"),
      marketClaim: text(market.market_claim, "market.market_claim"),
      rerunPerformed: bool(market.rerun_performed, "market.rerun_performed"),
      interpretation: text(market.interpretation, "market.interpretation"),
    },
  };
}

export async function fetchTargetedRecovery(): Promise<TargetedRecoveryArtifact> {
  return adaptTargetedRecovery(await api<unknown>("/dynamics/certification/targeted-recovery"));
}
