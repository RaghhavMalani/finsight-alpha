import { api } from "@/lib/api";

export type NonlinearModelCode = "M0" | "M1" | "M2" | "M3";
export type NonlinearVerdict = "ACCEPT" | "REJECT" | "ABSTAIN";

export type NonlinearFieldPoint = {
  state: number;
  drift: number;
  driftLower90: number;
  driftUpper90: number;
  diffusion: number;
  diffusionLower90: number;
  diffusionUpper90: number;
  driftPotential: number;
  stationaryDensity: number;
  effectivePotential: number;
  effectivePotentialLower90: number;
  effectivePotentialUpper90: number;
  localTransitionSupport: number;
};

export type CertifiedFixedPoint = {
  state: number;
  derivative: number;
  stable: boolean;
  bootstrapRootSupport: number;
  bootstrapStableSupport: number;
  localTransitionSupport: number;
  certifiedForDisplay: boolean;
  status: "CERTIFIED" | "WITHHELD";
};

export type NonlinearModel = {
  code: NonlinearModelCode;
  label: string;
  equation: string;
  nominalParameters: number;
  effectiveParameters: number;
  complexityPenalty: number;
  adjustedHoldoutNll: number;
  scientificVerdict: "ACCEPT" | "REJECT";
  holdoutScore: {
    meanNll: number;
    rmse: number;
    mae: number;
    coverage90: number;
    calibrationError90: number;
    meanIntervalScore90: number;
  };
  checks: Array<{
    code: string;
    status: "PASS" | "FAIL";
    critical: boolean;
    message: string;
  }>;
};

export type NonlinearPromotion = {
  verdict: "PROMOTE" | "REJECT";
  failClosed: boolean;
  adjustedNllGainOverOu: number;
  adjustedNllGainOverM2: number | null;
  pairedBootstrapDominanceOverOu: number;
  diffusionMaxMinRatio: number;
  criteria: Record<string, boolean>;
};

export type NonlinearExperiment = {
  schemaVersion: string;
  artifactHash: string;
  milestone: string;
  experiment: {
    id: string;
    pairId: string;
    question: string;
    evidenceClass: string;
    excludedScope: string[];
  };
  parent: {
    artifactHash: string;
    fileSha256: string;
    worldHash: string;
    milestone: string;
    candidateCompression: string;
    holdoutCommitmentHash: string;
    reusePolicy: string;
    discoveryRerun: boolean;
    integrityValid: boolean;
  };
  world: {
    worldHash: string;
    asOf: string;
    source: string;
    revision: string;
    observations: number;
    uniqueDeltaTimes: number;
    irregularTimeUsed: boolean;
  };
  split: {
    trainObservations: number;
    sealedHoldoutObservations: number;
    holdoutCommitmentHash: string;
    standardizationFrozenBeforeHoldout: boolean;
  };
  theory: {
    sde: string;
    driftPotential: string;
    stationaryDensity: string;
    effectivePotential: string;
    warning: string;
  };
  complexity: Record<
    "M2" | "M3",
    {
      selectionBoundaryIndex: number;
      outerHoldoutStartIndex: number;
      selectionMetric: string;
      selected: { knotCount: number; regularization: number };
    }
  >;
  models: NonlinearModel[];
  fields: Record<
    NonlinearModelCode,
    {
      points: NonlinearFieldPoint[];
      fixedPoints: CertifiedFixedPoint[];
      bootstrap: {
        successfulRepetitions: number;
        requestedRepetitions: number;
        fieldStability: number;
      };
    }
  >;
  promotion: Record<"M2" | "M3", NonlinearPromotion>;
  dynamicalStabilityMonitor: {
    name: string;
    claimBoundary: string;
    windowProtocol: string;
    model: NonlinearModelCode;
    windows: Array<{
      asOf: string;
      endIndex: number;
      observations: number;
      certifiedStableStates: number;
      basins: Array<{
        state: number;
        restoringStrength: number;
        barrierHeight: number;
        oneStepExitProbability: number;
        horizon: number;
        bootstrapStability: number;
        localTransitionSupport: number;
      }>;
    }>;
    trend: {
      certifiedStateCount: number;
      stateCountChange: number;
      restoringStrengthWeakening: boolean;
      barrierShrinking: boolean;
      status: "STABLE" | "WATCH";
    };
  };
  verdicts: {
    nonlinearDynamics: "ACCEPT" | "REJECT";
    selectedModel: NonlinearModelCode;
    economic: NonlinearVerdict;
    marketClaim: NonlinearVerdict;
  };
  executionReality: Array<{ stage: string; status: "PASS" | "NOT_MEASURED" }>;
  decisionSummary: string;
};

export type NonlinearCertification = {
  repetitions: number;
  controlWorlds: number;
  runs: number;
  metrics: {
    theoryClassAccuracy: number;
    falseNonlinearDiscoveryRate: number;
    falseNonlinearNonDiscoveryRate: number;
    falseBasinDiscoveryRate: number;
    economicAbstentionRate: number;
    nonlinearOosDominanceRate: number;
  };
};

export type NonlinearLabPayload = {
  experiment: NonlinearExperiment;
  certification: NonlinearCertification;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.3 projection rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.3 projection rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3 projection rejected: ${label}.`);
  }
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.3 projection rejected: ${label}.`);
  return value;
}

function adaptField(value: unknown, label: string): NonlinearFieldPoint {
  const point = object(value, label);
  return {
    state: number(point.state, `${label}.state`),
    drift: number(point.drift, `${label}.drift`),
    driftLower90: number(point.drift_lower_90, `${label}.drift_lower_90`),
    driftUpper90: number(point.drift_upper_90, `${label}.drift_upper_90`),
    diffusion: number(point.diffusion, `${label}.diffusion`),
    diffusionLower90: number(point.diffusion_lower_90, `${label}.diffusion_lower_90`),
    diffusionUpper90: number(point.diffusion_upper_90, `${label}.diffusion_upper_90`),
    driftPotential: number(point.drift_potential, `${label}.drift_potential`),
    stationaryDensity: number(point.stationary_density, `${label}.stationary_density`),
    effectivePotential: number(point.effective_potential, `${label}.effective_potential`),
    effectivePotentialLower90: number(
      point.effective_potential_lower_90,
      `${label}.effective_potential_lower_90`,
    ),
    effectivePotentialUpper90: number(
      point.effective_potential_upper_90,
      `${label}.effective_potential_upper_90`,
    ),
    localTransitionSupport: number(
      point.local_transition_support,
      `${label}.local_transition_support`,
    ),
  };
}

function adaptExperiment(value: unknown): NonlinearExperiment {
  const root = object(value, "root");
  const experiment = object(root.experiment, "experiment");
  const parent = object(root.parent, "parent");
  const world = object(root.world, "world");
  const split = object(root.split, "split");
  const theory = object(root.theory, "theory");
  const verdicts = object(root.verdicts, "verdicts");
  const execution = object(root.execution, "execution");
  const complexityRoot = object(root.complexity_selection, "complexity_selection");
  const monitor = object(root.dynamical_stability_monitor, "dynamical_stability_monitor");
  const fieldsRoot = object(root.fields, "fields");
  const promotionRoot = object(root.promotion, "promotion");

  const adaptComplexity = (code: "M2" | "M3") => {
    const item = object(complexityRoot[code], `complexity_selection.${code}`);
    const selected = object(item.selected, `complexity_selection.${code}.selected`);
    return {
      selectionBoundaryIndex: number(item.selection_boundary_index, `${code}.selection_boundary`),
      outerHoldoutStartIndex: number(item.outer_holdout_start_index, `${code}.holdout_start`),
      selectionMetric: text(item.selection_metric, `${code}.selection_metric`),
      selected: {
        knotCount: number(selected.knot_count, `${code}.selected.knot_count`),
        regularization: number(selected.regularization, `${code}.selected.regularization`),
      },
    };
  };

  const adaptModel = (value: unknown, index: number): NonlinearModel => {
    const item = object(value, `models[${index}]`);
    const score = object(item.holdout_score, `models[${index}].holdout_score`);
    return {
      code: text(item.code, `models[${index}].code`) as NonlinearModelCode,
      label: text(item.label, `models[${index}].label`),
      equation: text(item.equation, `models[${index}].equation`),
      nominalParameters: number(item.nominal_parameters, `models[${index}].nominal_parameters`),
      effectiveParameters: number(
        item.effective_parameters,
        `models[${index}].effective_parameters`,
      ),
      complexityPenalty: number(item.complexity_penalty, `models[${index}].complexity_penalty`),
      adjustedHoldoutNll: number(
        item.adjusted_holdout_nll,
        `models[${index}].adjusted_holdout_nll`,
      ),
      scientificVerdict: text(item.scientific_verdict, `models[${index}].scientific_verdict`) as
        "ACCEPT" | "REJECT",
      holdoutScore: {
        meanNll: number(score.mean_nll, `models[${index}].score.mean_nll`),
        rmse: number(score.rmse, `models[${index}].score.rmse`),
        mae: number(score.mae, `models[${index}].score.mae`),
        coverage90: number(score.coverage_90, `models[${index}].score.coverage_90`),
        calibrationError90: number(
          score.calibration_error_90,
          `models[${index}].score.calibration_error_90`,
        ),
        meanIntervalScore90: number(
          score.mean_interval_score_90,
          `models[${index}].score.mean_interval_score_90`,
        ),
      },
      checks: array(item.checks, `models[${index}].checks`).map((checkValue, checkIndex) => {
        const check = object(checkValue, `models[${index}].checks[${checkIndex}]`);
        return {
          code: text(check.code, "check.code"),
          status: text(check.status, "check.status") as "PASS" | "FAIL",
          critical: bool(check.critical, "check.critical"),
          message: text(check.message, "check.message"),
        };
      }),
    };
  };

  const adaptModelField = (code: NonlinearModelCode) => {
    const field = object(fieldsRoot[code], `fields.${code}`);
    const bootstrap = object(field.bootstrap, `fields.${code}.bootstrap`);
    return {
      points: array(field.points, `fields.${code}.points`).map((point, index) =>
        adaptField(point, `fields.${code}.points[${index}]`),
      ),
      fixedPoints: array(field.fixed_points, `fields.${code}.fixed_points`).map(
        (pointValue, index) => {
          const point = object(pointValue, `fields.${code}.fixed_points[${index}]`);
          return {
            state: number(point.state, "fixed_point.state"),
            derivative: number(point.derivative, "fixed_point.derivative"),
            stable: bool(point.stable, "fixed_point.stable"),
            bootstrapRootSupport: number(
              point.bootstrap_root_support,
              "fixed_point.bootstrap_root_support",
            ),
            bootstrapStableSupport: number(
              point.bootstrap_stable_support,
              "fixed_point.bootstrap_stable_support",
            ),
            localTransitionSupport: number(
              point.local_transition_support,
              "fixed_point.local_transition_support",
            ),
            certifiedForDisplay: bool(
              point.certified_for_display,
              "fixed_point.certified_for_display",
            ),
            status: text(point.status, "fixed_point.status") as "CERTIFIED" | "WITHHELD",
          };
        },
      ),
      bootstrap: {
        successfulRepetitions: number(
          bootstrap.successful_repetitions,
          `fields.${code}.bootstrap.successful`,
        ),
        requestedRepetitions: number(
          bootstrap.requested_repetitions,
          `fields.${code}.bootstrap.requested`,
        ),
        fieldStability: number(bootstrap.field_stability, `fields.${code}.bootstrap.stability`),
      },
    };
  };

  const adaptPromotion = (code: "M2" | "M3"): NonlinearPromotion => {
    const item = object(promotionRoot[code], `promotion.${code}`);
    const criteria = object(item.criteria, `promotion.${code}.criteria`);
    return {
      verdict: text(item.verdict, `promotion.${code}.verdict`) as "PROMOTE" | "REJECT",
      failClosed: bool(item.fail_closed, `promotion.${code}.fail_closed`),
      adjustedNllGainOverOu: number(
        item.adjusted_nll_gain_over_ou,
        `promotion.${code}.adjusted_nll_gain_over_ou`,
      ),
      adjustedNllGainOverM2:
        item.adjusted_nll_gain_over_m2 === null
          ? null
          : number(item.adjusted_nll_gain_over_m2, `promotion.${code}.gain_over_m2`),
      pairedBootstrapDominanceOverOu: number(
        item.paired_bootstrap_dominance_over_ou,
        `promotion.${code}.dominance`,
      ),
      diffusionMaxMinRatio: number(
        item.diffusion_max_min_ratio,
        `promotion.${code}.diffusion_ratio`,
      ),
      criteria: Object.fromEntries(
        Object.entries(criteria).map(([key, criterion]) => [key, bool(criterion, key)]),
      ),
    };
  };

  return {
    schemaVersion: text(root.schema_version, "schema_version"),
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    experiment: {
      id: text(experiment.id, "experiment.id"),
      pairId: text(experiment.pair_id, "experiment.pair_id"),
      question: text(experiment.question, "experiment.question"),
      evidenceClass: text(experiment.evidence_class, "experiment.evidence_class"),
      excludedScope: array(experiment.excluded_scope, "experiment.excluded_scope").map(
        (item, index) => text(item, `experiment.excluded_scope[${index}]`),
      ),
    },
    parent: {
      artifactHash: text(parent.artifact_hash, "parent.artifact_hash"),
      fileSha256: text(parent.file_sha256, "parent.file_sha256"),
      worldHash: text(parent.world_hash, "parent.world_hash"),
      milestone: text(parent.milestone, "parent.milestone"),
      candidateCompression: text(parent.candidate_compression, "parent.candidate_compression"),
      holdoutCommitmentHash: text(parent.holdout_commitment_hash, "parent.holdout_commitment_hash"),
      reusePolicy: text(parent.reuse_policy, "parent.reuse_policy"),
      discoveryRerun: bool(parent.discovery_rerun, "parent.discovery_rerun"),
      integrityValid: bool(parent.integrity_valid, "parent.integrity_valid"),
    },
    world: {
      worldHash: text(world.world_hash, "world.world_hash"),
      asOf: text(world.as_of, "world.as_of"),
      source: text(world.source, "world.source"),
      revision: text(world.revision, "world.revision"),
      observations: number(world.observations, "world.observations"),
      uniqueDeltaTimes: number(world.unique_delta_times, "world.unique_delta_times"),
      irregularTimeUsed: bool(world.irregular_time_used, "world.irregular_time_used"),
    },
    split: {
      trainObservations: number(split.train_observations, "split.train_observations"),
      sealedHoldoutObservations: number(
        split.sealed_holdout_observations,
        "split.sealed_holdout_observations",
      ),
      holdoutCommitmentHash: text(split.holdout_commitment_hash, "split.holdout_commitment_hash"),
      standardizationFrozenBeforeHoldout: bool(
        split.standardization_frozen_before_holdout,
        "split.standardization_frozen_before_holdout",
      ),
    },
    theory: {
      sde: text(theory.sde, "theory.sde"),
      driftPotential: text(theory.drift_potential, "theory.drift_potential"),
      stationaryDensity: text(theory.stationary_density, "theory.stationary_density"),
      effectivePotential: text(theory.effective_potential, "theory.effective_potential"),
      warning: text(theory.warning, "theory.warning"),
    },
    complexity: { M2: adaptComplexity("M2"), M3: adaptComplexity("M3") },
    models: array(root.models, "models").map(adaptModel),
    fields: {
      M0: adaptModelField("M0"),
      M1: adaptModelField("M1"),
      M2: adaptModelField("M2"),
      M3: adaptModelField("M3"),
    },
    promotion: { M2: adaptPromotion("M2"), M3: adaptPromotion("M3") },
    dynamicalStabilityMonitor: {
      name: text(monitor.name, "monitor.name"),
      claimBoundary: text(monitor.claim_boundary, "monitor.claim_boundary"),
      windowProtocol: text(monitor.window_protocol, "monitor.window_protocol"),
      model: text(monitor.model, "monitor.model") as NonlinearModelCode,
      windows: array(monitor.windows, "monitor.windows").map((windowValue, windowIndex) => {
        const window = object(windowValue, `monitor.windows[${windowIndex}]`);
        return {
          asOf: text(window.as_of, "monitor.window.as_of"),
          endIndex: number(window.end_index, "monitor.window.end_index"),
          observations: number(window.observations, "monitor.window.observations"),
          certifiedStableStates: number(
            window.certified_stable_states,
            "monitor.window.certified_stable_states",
          ),
          basins: array(window.basins, "monitor.window.basins").map((basinValue, basinIndex) => {
            const basin = object(
              basinValue,
              `monitor.windows[${windowIndex}].basins[${basinIndex}]`,
            );
            return {
              state: number(basin.state, "monitor.basin.state"),
              restoringStrength: number(
                basin.restoring_strength,
                "monitor.basin.restoring_strength",
              ),
              barrierHeight: number(basin.barrier_height, "monitor.basin.barrier_height"),
              oneStepExitProbability: number(
                basin.one_step_exit_probability,
                "monitor.basin.one_step_exit_probability",
              ),
              horizon: number(basin.horizon, "monitor.basin.horizon"),
              bootstrapStability: number(
                basin.bootstrap_stability,
                "monitor.basin.bootstrap_stability",
              ),
              localTransitionSupport: number(
                basin.local_transition_support,
                "monitor.basin.local_transition_support",
              ),
            };
          }),
        };
      }),
      trend: (() => {
        const trend = object(monitor.trend, "monitor.trend");
        return {
          certifiedStateCount: number(
            trend.certified_state_count,
            "monitor.trend.certified_state_count",
          ),
          stateCountChange: number(trend.state_count_change, "monitor.trend.state_count_change"),
          restoringStrengthWeakening: bool(
            trend.restoring_strength_weakening,
            "monitor.trend.restoring_strength_weakening",
          ),
          barrierShrinking: bool(trend.barrier_shrinking, "monitor.trend.barrier_shrinking"),
          status: text(trend.status, "monitor.trend.status") as "STABLE" | "WATCH",
        };
      })(),
    },
    verdicts: {
      nonlinearDynamics: text(verdicts.nonlinear_dynamics, "verdicts.nonlinear") as
        "ACCEPT" | "REJECT",
      selectedModel: text(verdicts.selected_model, "verdicts.selected_model") as NonlinearModelCode,
      economic: text(verdicts.economic, "verdicts.economic") as NonlinearVerdict,
      marketClaim: text(verdicts.market_claim, "verdicts.market_claim") as NonlinearVerdict,
    },
    executionReality: array(execution.reality_ladder, "execution.reality_ladder").map(
      (stageValue, index) => {
        const stage = object(stageValue, `execution.reality_ladder[${index}]`);
        return {
          stage: text(stage.stage, "execution.stage"),
          status: text(stage.status, "execution.status") as "PASS" | "NOT_MEASURED",
        };
      },
    ),
    decisionSummary: text(root.decision_summary, "decision_summary"),
  };
}

function adaptCertification(value: unknown): NonlinearCertification {
  const root = object(value, "certification");
  const metrics = object(root.metrics, "certification.metrics");
  return {
    repetitions: number(root.repetitions, "certification.repetitions"),
    controlWorlds: number(root.control_worlds, "certification.control_worlds"),
    runs: number(root.runs, "certification.runs"),
    metrics: {
      theoryClassAccuracy: number(metrics.theory_class_accuracy, "metrics.theory_class_accuracy"),
      falseNonlinearDiscoveryRate: number(
        metrics.false_nonlinear_discovery_rate,
        "metrics.false_nonlinear_discovery_rate",
      ),
      falseNonlinearNonDiscoveryRate: number(
        metrics.false_nonlinear_non_discovery_rate,
        "metrics.false_nonlinear_non_discovery_rate",
      ),
      falseBasinDiscoveryRate: number(
        metrics.false_basin_discovery_rate,
        "metrics.false_basin_discovery_rate",
      ),
      economicAbstentionRate: number(
        metrics.economic_abstention_rate_without_execution_evidence,
        "metrics.economic_abstention_rate",
      ),
      nonlinearOosDominanceRate: number(
        metrics.nonlinear_oos_dominance_rate,
        "metrics.nonlinear_oos_dominance_rate",
      ),
    },
  };
}

export async function fetchNonlinearLabPayload(): Promise<NonlinearLabPayload> {
  const [experiment, certification] = await Promise.all([
    api<unknown>("/dynamics/experiments/reference-nonlinear"),
    api<unknown>("/dynamics/certification/nonlinear?repetitions=2"),
  ]);
  return {
    experiment: adaptExperiment(experiment),
    certification: adaptCertification(certification),
  };
}
