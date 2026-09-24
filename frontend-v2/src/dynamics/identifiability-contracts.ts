import { api } from "@/lib/api";

export type IdentifiabilityLevel = "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED";

export type IdentifiabilityFrontierRow = {
  effect: number;
  observations: number;
  runs: number;
  correctSelectionProbability: number;
  nonlinearDetectionProbability: number;
  abstentionProbability: number;
  identifiability: IdentifiabilityLevel;
};

export type IdentifiabilityArtifact = {
  schemaVersion: string;
  artifactHash: string;
  milestone: string;
  question: string;
  frozen: boolean;
  profile: string;
  cells: number;
  runs: number;
  powerThreshold: number;
  estimatorProtocol: {
    sourceSha256: string;
    parentArtifactHash: string;
    parentFileSha256: string;
    mutationPolicy: string;
  };
  capabilityCard: {
    status: string;
    worlds: number;
    repetitionsPerCell: number;
    theoryIdentificationAccuracy: number;
    linearSpecificity: number;
    falseNonlinearDiscoveryRate: number;
    nonlinearDetectionRate: number;
    nonlinearFalseNegativeRate: number;
    stateDependentDiffusionDetection: number;
    misspecificationAbstentionRate: number;
    basinPrecision: number;
    basinRecall: number;
    potentialTopologyAccuracy: number;
    falseBasinDiscoveryRate: number;
    medianDriftReconstructionError: number | null;
    medianDiffusionReconstructionError: number | null;
    detectionByEffectBand: Record<"weak" | "medium" | "strong", number>;
    minimumReliableSampleSize: {
      strongNonlinearDrift: number | null;
      strongStateDiffusion: number | null;
    };
    weakEffectPolicy: string;
  };
  frontiers: {
    nonlinearDrift: IdentifiabilityFrontierRow[];
    stateDependentDiffusion: IdentifiabilityFrontierRow[];
  };
  realMarketContext: {
    pairId: string;
    observations: number;
    d03SelectedModel: string;
    d03NonlinearVerdict: string;
    identifiability: "HIGH" | "MEDIUM" | "LOW";
    claim: string;
  };
  representativeLandscape: {
    family: string;
    expectedStablePoints: number[];
    expectedUnstablePoints: number[];
    inferredStablePoints: number[];
    inferredUnstablePoints: number[];
    topologyMatch: boolean;
    points: Array<{
      state: number;
      truePotential: number;
      inferredPotential: number;
    }>;
  } | null;
  interpretation: string;
  excludedScope: string[];
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.1 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.3.1 projection rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.3.1 projection rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.1 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.3.1 projection rejected: ${label}.`);
  return value;
}

function adaptFrontier(value: unknown, effectKey: "cubic" | "gamma"): IdentifiabilityFrontierRow {
  const row = object(value, `frontier.${effectKey}`);
  return {
    effect: number(row[effectKey], `frontier.${effectKey}`),
    observations: number(row.observations, "frontier.observations"),
    runs: number(row.runs, "frontier.runs"),
    correctSelectionProbability: number(
      row.correct_selection_probability,
      "frontier.correct_selection_probability",
    ),
    nonlinearDetectionProbability: number(
      row.nonlinear_detection_probability,
      "frontier.nonlinear_detection_probability",
    ),
    abstentionProbability: number(row.abstention_probability, "frontier.abstention_probability"),
    identifiability: text(row.identifiability, "frontier.identifiability") as IdentifiabilityLevel,
  };
}

export function adaptIdentifiabilityArtifact(value: unknown): IdentifiabilityArtifact {
  const root = object(value, "root");
  const protocol = object(root.estimator_protocol, "estimator_protocol");
  const card = object(root.capability_card, "capability_card");
  const byBand = object(card.detection_by_effect_band, "capability_card.detection_by_effect_band");
  const sampleSize = object(
    card.minimum_reliable_sample_size,
    "capability_card.minimum_reliable_sample_size",
  );
  const frontiers = object(root.frontiers, "frontiers");
  const market = object(root.real_market_context, "real_market_context");
  const cases = array(root.cases, "cases");
  const landscapeCase = cases.find((value) => object(value, "case").family === "double_well");
  let representativeLandscape: IdentifiabilityArtifact["representativeLandscape"] = null;
  if (landscapeCase) {
    const item = object(landscapeCase, "double_well_case");
    const truth = object(item.truth, "double_well_case.truth");
    const inference = object(item.inference, "double_well_case.inference");
    const landscape = object(inference.landscape, "double_well_case.inference.landscape");
    representativeLandscape = {
      family: text(item.family, "double_well_case.family"),
      expectedStablePoints: array(truth.stable_points, "truth.stable_points").map((point) =>
        number(point, "truth.stable_point"),
      ),
      expectedUnstablePoints: array(truth.unstable_points, "truth.unstable_points").map((point) =>
        number(point, "truth.unstable_point"),
      ),
      inferredStablePoints: array(inference.stable_points, "inference.stable_points").map((point) =>
        number(point, "inference.stable_point"),
      ),
      inferredUnstablePoints: array(inference.unstable_points, "inference.unstable_points").map(
        (point) => number(point, "inference.unstable_point"),
      ),
      topologyMatch: bool(inference.topology_match, "inference.topology_match"),
      points: array(landscape.points, "landscape.points").map((value) => {
        const point = object(value, "landscape.point");
        return {
          state: number(point.state, "landscape.point.state"),
          truePotential: number(point.true_potential, "landscape.point.true_potential"),
          inferredPotential: number(point.inferred_potential, "landscape.point.inferred_potential"),
        };
      }),
    };
  }
  return {
    schemaVersion: text(root.schema_version, "schema_version"),
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    question: text(root.question, "question"),
    frozen: bool(root.frozen, "frozen"),
    profile: text(root.profile, "profile"),
    cells: number(root.cells, "cells"),
    runs: number(root.runs, "runs"),
    powerThreshold: number(root.power_threshold, "power_threshold"),
    estimatorProtocol: {
      sourceSha256: text(protocol.source_sha256, "protocol.source_sha256"),
      parentArtifactHash: text(protocol.parent_artifact_hash, "protocol.parent_artifact_hash"),
      parentFileSha256: text(protocol.parent_file_sha256, "protocol.parent_file_sha256"),
      mutationPolicy: text(protocol.mutation_policy, "protocol.mutation_policy"),
    },
    capabilityCard: {
      status: text(card.status, "card.status"),
      worlds: number(card.worlds, "card.worlds"),
      repetitionsPerCell: number(card.repetitions_per_cell, "card.repetitions_per_cell"),
      theoryIdentificationAccuracy: number(
        card.theory_identification_accuracy,
        "card.theory_identification_accuracy",
      ),
      linearSpecificity: number(card.linear_specificity, "card.linear_specificity"),
      falseNonlinearDiscoveryRate: number(
        card.false_nonlinear_discovery_rate,
        "card.false_nonlinear_discovery_rate",
      ),
      nonlinearDetectionRate: number(
        card.nonlinear_detection_rate,
        "card.nonlinear_detection_rate",
      ),
      nonlinearFalseNegativeRate: number(
        card.nonlinear_false_negative_rate,
        "card.nonlinear_false_negative_rate",
      ),
      stateDependentDiffusionDetection: number(
        card.state_dependent_diffusion_detection,
        "card.state_dependent_diffusion_detection",
      ),
      misspecificationAbstentionRate: number(
        card.misspecification_abstention_rate,
        "card.misspecification_abstention_rate",
      ),
      basinPrecision: number(card.basin_precision, "card.basin_precision"),
      basinRecall: number(card.basin_recall, "card.basin_recall"),
      potentialTopologyAccuracy: number(
        card.potential_topology_accuracy,
        "card.potential_topology_accuracy",
      ),
      falseBasinDiscoveryRate: number(
        card.false_basin_discovery_rate,
        "card.false_basin_discovery_rate",
      ),
      medianDriftReconstructionError: nullableNumber(
        card.median_drift_reconstruction_error,
        "card.median_drift_reconstruction_error",
      ),
      medianDiffusionReconstructionError: nullableNumber(
        card.median_diffusion_reconstruction_error,
        "card.median_diffusion_reconstruction_error",
      ),
      detectionByEffectBand: {
        weak: number(byBand.weak, "card.detection_by_effect_band.weak"),
        medium: number(byBand.medium, "card.detection_by_effect_band.medium"),
        strong: number(byBand.strong, "card.detection_by_effect_band.strong"),
      },
      minimumReliableSampleSize: {
        strongNonlinearDrift: nullableNumber(
          sampleSize.strong_nonlinear_drift,
          "card.minimum_reliable_sample_size.strong_nonlinear_drift",
        ),
        strongStateDiffusion: nullableNumber(
          sampleSize.strong_state_diffusion,
          "card.minimum_reliable_sample_size.strong_state_diffusion",
        ),
      },
      weakEffectPolicy: text(card.weak_effect_policy, "card.weak_effect_policy"),
    },
    frontiers: {
      nonlinearDrift: array(frontiers.nonlinear_drift, "frontiers.nonlinear_drift").map((row) =>
        adaptFrontier(row, "cubic"),
      ),
      stateDependentDiffusion: array(
        frontiers.state_dependent_diffusion,
        "frontiers.state_dependent_diffusion",
      ).map((row) => adaptFrontier(row, "gamma")),
    },
    realMarketContext: {
      pairId: text(market.pair_id, "market.pair_id"),
      observations: number(market.observations, "market.observations"),
      d03SelectedModel: text(market.d03_selected_model, "market.d03_selected_model"),
      d03NonlinearVerdict: text(market.d03_nonlinear_verdict, "market.d03_nonlinear_verdict"),
      identifiability: text(market.identifiability, "market.identifiability") as
        "HIGH" | "MEDIUM" | "LOW",
      claim: text(market.claim, "market.claim"),
    },
    representativeLandscape,
    interpretation: text(root.interpretation, "interpretation"),
    excludedScope: array(root.excluded_scope, "excluded_scope").map((item) =>
      text(item, "excluded_scope.item"),
    ),
  };
}

export async function fetchIdentifiabilityArtifact(): Promise<IdentifiabilityArtifact> {
  return adaptIdentifiabilityArtifact(
    await api<unknown>("/dynamics/certification/nonlinear-identifiability"),
  );
}
