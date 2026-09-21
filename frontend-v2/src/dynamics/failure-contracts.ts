import { api } from "@/lib/api";

export type FailureClassification =
  | "DATA_LIMITED"
  | "ESTIMATOR_LIMITED"
  | "IDENTIFIABLE"
  | "NEGATIVE_CONTROL"
  | "OUT_OF_FAMILY_CONTROL";

export type PowerSurfaceRow = {
  cellId: string;
  family: string;
  effectBand: string;
  effect: number;
  observations: number;
  runs: number;
  oraclePower: number | null;
  practicalPower: Record<string, number>;
  bestPracticalEstimator: string;
  bestPracticalPower: number;
  identifiabilityGap: number | null;
  classification: FailureClassification;
  information: {
    medianPerStepKl: number | null;
    medianInformationMass: number | null;
  };
  sindyTermStability: null | {
    trueTerms: string[];
    inclusionFrequency: Record<string, number>;
  };
  sindySupportSeparationRate: number | null;
  coefficientError: null | {
    medianFullLibrary: number;
    medianOracleSupport: number;
    primaryFailureCounts: Record<string, number>;
  };
  topologyDecomposition: null | {
    trueDriftAccuracy: number;
    oracleSupportAccuracy: number;
    fullSindyFieldAccuracy: number;
    certifiedSindyAccuracy: number;
    primaryFailureCounts: Record<string, number>;
  };
};

export type N80Estimate = {
  n80: number | null;
  display: string;
  method: string;
  extrapolated: boolean;
};

export type SampleComplexityRow = {
  family: string;
  effect: number;
  effectBand: string;
  oracle: N80Estimate;
  practical: Record<string, N80Estimate>;
  sampleEfficiencyRatioVsOracle: Record<string, number | null>;
};

export type FailureDecompositionArtifact = {
  artifactHash: string;
  milestone: string;
  question: string;
  worlds: number;
  cells: number;
  parentHash: string;
  summary: {
    powerThreshold: number;
    classificationCounts: Record<FailureClassification, number>;
    medianIdentifiabilityGap: number | null;
    maximumIdentifiabilityGap: number | null;
    estimatorLimitedCells: string[];
    dataLimitedCells: string[];
  };
  surfaces: PowerSurfaceRow[];
  sampleComplexity: SampleComplexityRow[];
  routing: {
    targetedRepairWarranted: boolean;
    basis: string;
    newEstimatorWarranted: boolean;
    hawkesDeferred: boolean;
  };
  realMarketClaim: {
    selectedModel: string;
    marketClaim: string;
    oracleClassification: string;
    interpretation: string;
    rerunPerformed: boolean;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.2.1 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.3.2.1 projection rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.3.2.1 projection rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.2.1 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.3.2.1 projection rejected: ${label}.`);
  return value;
}

function stringNumberRecord(value: unknown, label: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(object(value, label)).map(([key, item]) => [
      key,
      number(item, `${label}.${key}`),
    ]),
  );
}

function adaptN80(value: unknown, label: string): N80Estimate {
  const row = object(value, label);
  return {
    n80: nullableNumber(row.n80, `${label}.n80`),
    display: text(row.display, `${label}.display`),
    method: text(row.method, `${label}.method`),
    extrapolated: bool(row.extrapolated, `${label}.extrapolated`),
  };
}

function adaptSurface(value: unknown): PowerSurfaceRow {
  const row = object(value, "surface");
  const information = object(row.information, "surface.information");
  const rawStability = row.sindy_term_stability;
  const rawCoefficient = row.coefficient_error;
  const rawTopology = row.topology_decomposition;
  let sindyTermStability: PowerSurfaceRow["sindyTermStability"] = null;
  let coefficientError: PowerSurfaceRow["coefficientError"] = null;
  let topologyDecomposition: PowerSurfaceRow["topologyDecomposition"] = null;
  if (rawStability !== null) {
    const stability = object(rawStability, "surface.sindy_term_stability");
    sindyTermStability = {
      trueTerms: array(stability.true_terms, "stability.true_terms").map((term) =>
        text(term, "stability.true_term"),
      ),
      inclusionFrequency: stringNumberRecord(
        stability.inclusion_frequency,
        "stability.inclusion_frequency",
      ),
    };
  }
  if (rawCoefficient !== null) {
    const coefficient = object(rawCoefficient, "surface.coefficient_error");
    coefficientError = {
      medianFullLibrary: number(coefficient.median_full_library, "coefficient.median_full_library"),
      medianOracleSupport: number(
        coefficient.median_oracle_support,
        "coefficient.median_oracle_support",
      ),
      primaryFailureCounts: stringNumberRecord(
        coefficient.primary_failure_counts,
        "coefficient.primary_failure_counts",
      ),
    };
  }
  if (rawTopology !== null) {
    const topology = object(rawTopology, "surface.topology_decomposition");
    topologyDecomposition = {
      trueDriftAccuracy: number(topology.true_drift_accuracy, "topology.true_drift_accuracy"),
      oracleSupportAccuracy: number(
        topology.oracle_support_accuracy,
        "topology.oracle_support_accuracy",
      ),
      fullSindyFieldAccuracy: number(
        topology.full_sindy_field_accuracy,
        "topology.full_sindy_field_accuracy",
      ),
      certifiedSindyAccuracy: number(
        topology.certified_sindy_accuracy,
        "topology.certified_sindy_accuracy",
      ),
      primaryFailureCounts: stringNumberRecord(
        topology.primary_failure_counts,
        "topology.primary_failure_counts",
      ),
    };
  }
  return {
    cellId: text(row.cell_id, "surface.cell_id"),
    family: text(row.family, "surface.family"),
    effectBand: text(row.effect_band, "surface.effect_band"),
    effect: number(row.effect, "surface.effect"),
    observations: number(row.observations, "surface.observations"),
    runs: number(row.runs, "surface.runs"),
    oraclePower: nullableNumber(row.oracle_power, "surface.oracle_power"),
    practicalPower: stringNumberRecord(row.practical_power, "surface.practical_power"),
    bestPracticalEstimator: text(row.best_practical_estimator, "surface.best_practical_estimator"),
    bestPracticalPower: number(row.best_practical_power, "surface.best_practical_power"),
    identifiabilityGap: nullableNumber(row.identifiability_gap, "surface.identifiability_gap"),
    classification: text(row.classification, "surface.classification") as FailureClassification,
    information: {
      medianPerStepKl: nullableNumber(
        information.median_per_step_kl,
        "information.median_per_step_kl",
      ),
      medianInformationMass: nullableNumber(
        information.median_information_mass,
        "information.median_information_mass",
      ),
    },
    sindyTermStability,
    sindySupportSeparationRate: nullableNumber(
      row.sindy_support_separation_rate,
      "surface.sindy_support_separation_rate",
    ),
    coefficientError,
    topologyDecomposition,
  };
}

export function adaptFailureDecomposition(value: unknown): FailureDecompositionArtifact {
  const root = object(value, "root");
  const parent = object(root.parent, "parent");
  const evaluation = object(root.evaluation, "evaluation");
  const summary = object(root.summary, "summary");
  const counts = object(summary.classification_counts, "summary.classification_counts");
  const routing = object(root.routing, "routing");
  const market = object(root.real_market_claim, "real_market_claim");
  const sampleComplexity = array(root.sample_complexity, "sample_complexity").map((value) => {
    const row = object(value, "sample_complexity.row");
    const practical = object(row.practical, "sample_complexity.practical");
    const efficiency = object(
      row.sample_efficiency_ratio_vs_oracle,
      "sample_complexity.sample_efficiency_ratio_vs_oracle",
    );
    return {
      family: text(row.family, "sample_complexity.family"),
      effect: number(row.effect, "sample_complexity.effect"),
      effectBand: text(row.effect_band, "sample_complexity.effect_band"),
      oracle: adaptN80(row.oracle, "sample_complexity.oracle"),
      practical: Object.fromEntries(
        Object.entries(practical).map(([key, estimate]) => [
          key,
          adaptN80(estimate, `practical.${key}`),
        ]),
      ),
      sampleEfficiencyRatioVsOracle: Object.fromEntries(
        Object.entries(efficiency).map(([key, ratio]) => [
          key,
          nullableNumber(ratio, `efficiency.${key}`),
        ]),
      ),
    };
  });
  return {
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    question: text(root.question, "question"),
    worlds: number(evaluation.worlds, "evaluation.worlds"),
    cells: number(evaluation.cells, "evaluation.cells"),
    parentHash: text(parent.artifact_hash, "parent.artifact_hash"),
    summary: {
      powerThreshold: number(summary.power_threshold, "summary.power_threshold"),
      classificationCounts: {
        DATA_LIMITED: number(counts.DATA_LIMITED, "counts.DATA_LIMITED"),
        ESTIMATOR_LIMITED: number(counts.ESTIMATOR_LIMITED, "counts.ESTIMATOR_LIMITED"),
        IDENTIFIABLE: number(counts.IDENTIFIABLE, "counts.IDENTIFIABLE"),
        NEGATIVE_CONTROL: number(counts.NEGATIVE_CONTROL, "counts.NEGATIVE_CONTROL"),
        OUT_OF_FAMILY_CONTROL: number(counts.OUT_OF_FAMILY_CONTROL, "counts.OUT_OF_FAMILY_CONTROL"),
      },
      medianIdentifiabilityGap: nullableNumber(
        summary.median_identifiability_gap,
        "summary.median_identifiability_gap",
      ),
      maximumIdentifiabilityGap: nullableNumber(
        summary.maximum_identifiability_gap,
        "summary.maximum_identifiability_gap",
      ),
      estimatorLimitedCells: array(
        summary.estimator_limited_cells,
        "summary.estimator_limited_cells",
      ).map((item) => text(item, "summary.estimator_limited_cell")),
      dataLimitedCells: array(summary.data_limited_cells, "summary.data_limited_cells").map(
        (item) => text(item, "summary.data_limited_cell"),
      ),
    },
    surfaces: array(root.oracle_power_surface, "oracle_power_surface").map(adaptSurface),
    sampleComplexity,
    routing: {
      targetedRepairWarranted: bool(
        routing.d0_3_3_targeted_repair_warranted,
        "routing.d0_3_3_targeted_repair_warranted",
      ),
      basis: text(routing.basis, "routing.basis"),
      newEstimatorWarranted: bool(
        routing.new_estimator_warranted,
        "routing.new_estimator_warranted",
      ),
      hawkesDeferred: bool(routing.hawkes_deferred, "routing.hawkes_deferred"),
    },
    realMarketClaim: {
      selectedModel: text(market.selected_model, "market.selected_model"),
      marketClaim: text(market.market_claim, "market.market_claim"),
      oracleClassification: text(market.oracle_classification, "market.oracle_classification"),
      interpretation: text(market.interpretation, "market.interpretation"),
      rerunPerformed: bool(market.rerun_performed, "market.rerun_performed"),
    },
  };
}

export async function fetchFailureDecomposition(): Promise<FailureDecompositionArtifact> {
  return adaptFailureDecomposition(
    await api<unknown>("/dynamics/certification/failure-decomposition"),
  );
}
