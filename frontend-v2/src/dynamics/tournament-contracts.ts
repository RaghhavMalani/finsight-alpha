import { api } from "@/lib/api";

export type TournamentSummary = {
  estimatorId: string;
  label: string;
  runs: number;
  linearSpecificity: number;
  falseNonlinearDiscoveryRate: number;
  nonlinearDetectionRate: number;
  stateDiffusionDetectionRate: number;
  basinPrecision: number;
  basinRecall: number;
  potentialTopologyAccuracy: number;
  falseBasinDiscoveryRate: number;
  medianDriftReconstructionError: number | null;
  medianDiffusionReconstructionError: number | null;
  meanSealedOosNll: number | null;
  meanCalibrationError90: number | null;
  medianRuntimeWorkUnits: number | null;
  numericalFailureRate: number;
  lawRecovery: null | {
    worlds: number;
    meanTermPrecision: number;
    meanTermRecall: number;
    medianCoefficientError: number;
    structuralEquationMatchRate: number;
  };
};

export type EnvelopeRow = {
  effect: number;
  observations: number;
  runs: number;
  correctSelectionProbability: number;
  identifiable: boolean;
};

export type TournamentArtifact = {
  artifactHash: string;
  milestone: string;
  question: string;
  worlds: number;
  fits: number;
  parentHash: string;
  summaries: TournamentSummary[];
  graduation: Array<{
    estimatorId: string;
    graduated: boolean;
    criteria: Record<string, boolean>;
  }>;
  envelopes: Record<
    string,
    { nonlinearDrift: EnvelopeRow[]; stateDependentDiffusion: EnvelopeRow[] }
  >;
  realMarketClaim: {
    selectedModel: string;
    marketClaim: string;
    interpretation: string;
    rerunPerformed: boolean;
  };
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.2 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.3.2 projection rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.3.2 projection rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.2 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.3.2 projection rejected: ${label}.`);
  return value;
}

function adaptLaw(value: unknown): TournamentSummary["lawRecovery"] {
  if (value === null) return null;
  const law = object(value, "law_recovery");
  return {
    worlds: number(law.worlds, "law_recovery.worlds"),
    meanTermPrecision: number(law.mean_term_precision, "law_recovery.mean_term_precision"),
    meanTermRecall: number(law.mean_term_recall, "law_recovery.mean_term_recall"),
    medianCoefficientError: number(
      law.median_coefficient_error,
      "law_recovery.median_coefficient_error",
    ),
    structuralEquationMatchRate: number(
      law.structural_equation_match_rate,
      "law_recovery.structural_equation_match_rate",
    ),
  };
}

function adaptSummary(value: unknown): TournamentSummary {
  const row = object(value, "estimator");
  return {
    estimatorId: text(row.estimator_id, "estimator.estimator_id"),
    label: text(row.label, "estimator.label"),
    runs: number(row.runs, "estimator.runs"),
    linearSpecificity: number(row.linear_specificity, "estimator.linear_specificity"),
    falseNonlinearDiscoveryRate: number(
      row.false_nonlinear_discovery_rate,
      "estimator.false_nonlinear_discovery_rate",
    ),
    nonlinearDetectionRate: number(
      row.nonlinear_detection_rate,
      "estimator.nonlinear_detection_rate",
    ),
    stateDiffusionDetectionRate: number(
      row.state_diffusion_detection_rate,
      "estimator.state_diffusion_detection_rate",
    ),
    basinPrecision: number(row.basin_precision, "estimator.basin_precision"),
    basinRecall: number(row.basin_recall, "estimator.basin_recall"),
    potentialTopologyAccuracy: number(
      row.potential_topology_accuracy,
      "estimator.potential_topology_accuracy",
    ),
    falseBasinDiscoveryRate: number(
      row.false_basin_discovery_rate,
      "estimator.false_basin_discovery_rate",
    ),
    medianDriftReconstructionError: nullableNumber(
      row.median_drift_reconstruction_error,
      "estimator.median_drift_reconstruction_error",
    ),
    medianDiffusionReconstructionError: nullableNumber(
      row.median_diffusion_reconstruction_error,
      "estimator.median_diffusion_reconstruction_error",
    ),
    meanSealedOosNll: nullableNumber(row.mean_sealed_oos_nll, "estimator.mean_sealed_oos_nll"),
    meanCalibrationError90: nullableNumber(
      row.mean_calibration_error_90,
      "estimator.mean_calibration_error_90",
    ),
    medianRuntimeWorkUnits: nullableNumber(
      row.median_runtime_work_units,
      "estimator.median_runtime_work_units",
    ),
    numericalFailureRate: number(row.numerical_failure_rate, "estimator.numerical_failure_rate"),
    lawRecovery: adaptLaw(row.law_recovery),
  };
}

function adaptEnvelope(value: unknown, effectKey: "cubic" | "gamma"): EnvelopeRow {
  const row = object(value, `envelope.${effectKey}`);
  return {
    effect: number(row[effectKey], `envelope.${effectKey}`),
    observations: number(row.observations, "envelope.observations"),
    runs: number(row.runs, "envelope.runs"),
    correctSelectionProbability: number(
      row.correct_selection_probability,
      "envelope.correct_selection_probability",
    ),
    identifiable: bool(row.identifiable, "envelope.identifiable"),
  };
}

export function adaptTournamentArtifact(value: unknown): TournamentArtifact {
  const root = object(value, "root");
  const evaluation = object(root.evaluation, "evaluation");
  const parent = object(root.parent, "parent");
  const market = object(root.real_market_claim, "real_market_claim");
  const rawEnvelopes = object(root.identifiability_envelopes, "identifiability_envelopes");
  const envelopes: TournamentArtifact["envelopes"] = {};
  for (const [estimatorId, raw] of Object.entries(rawEnvelopes)) {
    const item = object(raw, `identifiability_envelopes.${estimatorId}`);
    envelopes[estimatorId] = {
      nonlinearDrift: array(item.nonlinear_drift, "envelope.nonlinear_drift").map((row) =>
        adaptEnvelope(row, "cubic"),
      ),
      stateDependentDiffusion: array(
        item.state_dependent_diffusion,
        "envelope.state_dependent_diffusion",
      ).map((row) => adaptEnvelope(row, "gamma")),
    };
  }
  return {
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    question: text(root.question, "question"),
    worlds: number(evaluation.worlds, "evaluation.worlds"),
    fits: number(evaluation.fits, "evaluation.fits"),
    parentHash: text(parent.artifact_hash, "parent.artifact_hash"),
    summaries: array(root.estimators, "estimators").map(adaptSummary),
    graduation: array(root.graduation, "graduation").map((value) => {
      const row = object(value, "graduation.row");
      const criteria = object(row.criteria, "graduation.criteria");
      return {
        estimatorId: text(row.estimator_id, "graduation.estimator_id"),
        graduated: bool(row.graduated, "graduation.graduated"),
        criteria: Object.fromEntries(
          Object.entries(criteria).map(([key, passed]) => [key, bool(passed, `criteria.${key}`)]),
        ),
      };
    }),
    envelopes,
    realMarketClaim: {
      selectedModel: text(market.selected_model, "market.selected_model"),
      marketClaim: text(market.market_claim, "market.market_claim"),
      interpretation: text(market.interpretation, "market.interpretation"),
      rerunPerformed: bool(market.rerun_performed, "market.rerun_performed"),
    },
  };
}

export async function fetchTournamentArtifact(): Promise<TournamentArtifact> {
  return adaptTournamentArtifact(
    await api<unknown>("/dynamics/certification/estimator-tournament"),
  );
}
