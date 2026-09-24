import { api } from "@/lib/api";

export type DynamicsCheckStatus = "PASS" | "FAIL" | "NOT_MEASURED";
export type DynamicsVerdict = "ACCEPT" | "REJECT" | "ABSTAIN";

export type DynamicsWindow = {
  start: string;
  end: string;
  startIndex: number;
  endIndex: number;
  observations: number;
  elapsedTime: number;
  timeUnit: string;
};

export type DynamicsSeriesPoint = {
  index: number;
  observed: number;
  forecast: number | null;
  forecastLower90: number | null;
  forecastUpper90: number | null;
  observedAt: string;
  availableAt: string;
};

export type ParameterEstimate = {
  estimate: number;
  standardError: number | null;
  ciLow: number | null;
  ciHigh: number | null;
};

export type DynamicsScore = {
  negativeLogLikelihood: number;
  logLikelihood: number;
  rmse: number;
  mae: number;
  coverage90: number;
  intervalScore90: number;
  observations: number;
};

export type DynamicsTournamentEntry = {
  theory: string;
  role: "challenger" | "baseline";
  complexity: string;
  parameters: number;
  score: DynamicsScore;
  stability: number | null;
};

export type DynamicsExperiment = {
  schemaVersion: string;
  artifactHash: string;
  theory: string;
  equation: string;
  observable: string;
  experiment: {
    id: string;
    name: string;
    observable: string;
    evidenceScope: string;
    seed: number;
    marketClaimEligible: boolean;
  };
  world: {
    worldHash: string;
    asOf: string;
    timeUnit: string;
    pointInTimeEnforced: boolean;
    observations: number;
    source: string;
    revision: string;
  };
  hypothesis: { question: string; mapping: string; target: string };
  parameters: { theta: number; mu: number; sigma: number; halfLife: number };
  parameterUncertainty: Record<string, ParameterEstimate>;
  identifiability: { identified: boolean; optimizerConverged: boolean; criterion: string };
  trainWindow: DynamicsWindow;
  holdoutWindow: DynamicsWindow;
  holdoutScore: DynamicsScore;
  tournament: DynamicsTournamentEntry[];
  comparison: {
    bestBaseline: string;
    deltaBaseline: number;
    winner: string;
    explanation: string;
  };
  structuralStability: {
    stable: boolean;
    score: number;
    candidateSplits: number;
    thetaRelativeGap: number | null;
    muShiftStationarySigma: number | null;
  };
  hypothesisLedger: {
    hypothesesConsidered: number;
    selectionProcedure: string;
    selectionTimestamp: string;
    selectionMetric: string;
    holdoutUntouched: boolean;
    multiplicityAdjustment: string | null;
  };
  series: DynamicsSeriesPoint[];
  falsification: Array<{
    code: string;
    status: DynamicsCheckStatus;
    message: string;
    critical: boolean;
    details: Record<string, unknown>;
  }>;
  scientificVerdict: DynamicsVerdict;
  predictiveVerdict: DynamicsVerdict;
  economicVerdict: DynamicsVerdict;
  finalMarketClaim: DynamicsVerdict;
  marketClaimEligible: boolean;
  decisionSummary: string;
};

export type DynamicsCertification = {
  schemaVersion: string;
  suiteId: string;
  runHash: string;
  frozen: boolean;
  headline: {
    theoryFalseAcceptRate: number;
    falseAccepts: number;
    negativeControls: number;
    trueAcceptRate: number;
    trueAccepts: number;
    positiveControls: number;
    abstentionRate: number;
    abstentions: number;
    totalControls: number;
    falseRejectRate: number;
    falseRejects: number;
  };
  tasks: Array<{
    id: string;
    label: string;
    expected: "ACCEPT" | "REJECT";
    scientificVerdict: DynamicsVerdict;
    predictiveVerdict: DynamicsVerdict;
    theoryAccepted: boolean;
    correct: boolean;
    killedBy: string[];
    decisionSummary: string;
  }>;
};

export type StatArbExperiment = {
  schemaVersion: string;
  artifactHash: string;
  freeze: {
    milestone: string;
    frozen: boolean;
    contentAddressing: string;
    discoveryRunId: string;
    pitWorldHash: string;
  };
  candidateCompression: {
    hypothesesScreened: number;
    multipleTestingSurvivors: number;
    scientificPredictiveSurvivors: number;
    economicSurvivors: number;
    notation: string;
  };
  searchSurvivalRate: {
    economicallyCertifiedHypotheses: number;
    hypothesesScreened: number;
    value: number;
    fraction: string;
  };
  world: {
    worldHash: string;
    asOf: string;
    source: string;
    revision: string;
    priceTransform: string;
  };
  discoveryLedger: {
    discoveryRunId: string;
    searchUniverse: string[];
    eligibleSecurities: number;
    candidatePairs: number;
    pairsScreened: number;
    cointegratedCandidates: number;
    ouCandidates: number;
    ouFitsCompleted: number;
    certified: number;
    economicSurvivors: number;
    selectionTimestamp: string;
    selectionMetric: string;
    cointegrationTest: string;
    correctionMethod: string;
    correctionLevel: number;
    screenWindow: DynamicsWindow;
    hedgeRatioWindow: DynamicsWindow;
    holdoutWindow: DynamicsWindow;
  };
  screeningLedger: Array<{
    pairId: string;
    statistic: number;
    pValue: number;
    adjustedPValue: number;
    selected: boolean;
  }>;
  pairArtifacts: Array<{
    pairId: string;
    dependent: string;
    independent: string;
    certified: boolean;
    cointegration: {
      statistic: number;
      pValue: number;
      adjustedPValue: number;
      correction: string;
    };
    hedgeRatio: {
      intercept: number;
      beta: number;
      frozenBeforeHoldout: boolean;
    };
    ou: {
      theta: number;
      halfLife: number | null;
      scientificVerdict: DynamicsVerdict;
      predictiveVerdict: DynamicsVerdict;
      economicVerdict: DynamicsVerdict;
      finalMarketClaim: DynamicsVerdict;
      decisionSummary: string;
      baselineEdge: number;
    };
    executionReality: Array<{ stage: string; status: DynamicsCheckStatus }>;
  }>;
  selectionVerdict: DynamicsVerdict;
  economicVerdict: DynamicsVerdict;
  decisionSummary: string;
};

export type DynamicsPowerMap = {
  schemaVersion: string;
  mapId: string;
  runHash: string;
  frozen: boolean;
  axes: string[];
  method: string;
  repetitionsPerCell: number;
  cells: Array<{
    id: string;
    theta: number;
    sigma: number;
    observations: number;
    deltaTime: number;
    measurementNoise: number;
    breakMagnitude: number;
    halfLife: number;
    expected: "ACCEPT" | "REJECT";
    acceptanceProbability: number;
    rejectionProbability: number;
    abstentionProbability: number;
    correctCertificationProbability: number;
  }>;
};

export type DynamicsLabPayload = {
  experiment: DynamicsExperiment;
  certification: DynamicsCertification;
  statArb: StatArbExperiment;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Dynamics projection rejected: ${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Dynamics projection rejected: ${label}.`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Dynamics projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : numberValue(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Dynamics projection rejected: ${label}.`);
  return value;
}

function verdictValue(value: unknown, label: string): DynamicsVerdict {
  const verdict = stringValue(value, label) as DynamicsVerdict;
  if (!["ACCEPT", "REJECT", "ABSTAIN"].includes(verdict)) {
    throw new Error(`Dynamics projection rejected: ${label} is not a verdict.`);
  }
  return verdict;
}

function adaptWindow(value: unknown, label: string): DynamicsWindow {
  const window = record(value, label);
  return {
    start: stringValue(window.start, `${label}.start`),
    end: stringValue(window.end, `${label}.end`),
    startIndex: numberValue(window.start_index, `${label}.start_index`),
    endIndex: numberValue(window.end_index, `${label}.end_index`),
    observations: numberValue(window.observations, `${label}.observations`),
    elapsedTime: numberValue(window.elapsed_time, `${label}.elapsed_time`),
    timeUnit: stringValue(window.time_unit, `${label}.time_unit`),
  };
}

function adaptScore(value: unknown, label: string): DynamicsScore {
  const score = record(value, label);
  return {
    negativeLogLikelihood: numberValue(
      score.negative_log_likelihood,
      `${label}.negative_log_likelihood`,
    ),
    logLikelihood: numberValue(score.log_likelihood, `${label}.log_likelihood`),
    rmse: numberValue(score.rmse, `${label}.rmse`),
    mae: numberValue(score.mae, `${label}.mae`),
    coverage90: numberValue(score.coverage_90, `${label}.coverage_90`),
    intervalScore90: numberValue(score.interval_score_90, `${label}.interval_score_90`),
    observations: numberValue(score.observations, `${label}.observations`),
  };
}

function adaptParameter(value: unknown, label: string): ParameterEstimate {
  const parameter = record(value, label);
  return {
    estimate: numberValue(parameter.estimate, `${label}.estimate`),
    standardError: nullableNumber(parameter.standard_error, `${label}.standard_error`),
    ciLow: nullableNumber(parameter.ci_low, `${label}.ci_low`),
    ciHigh: nullableNumber(parameter.ci_high, `${label}.ci_high`),
  };
}

export function adaptDynamicsExperiment(value: unknown): DynamicsExperiment {
  const root = record(value, "root");
  const experiment = record(root.experiment, "experiment");
  const world = record(root.world, "world");
  const hypothesis = record(root.hypothesis, "hypothesis");
  const parameters = record(root.parameters, "parameters");
  const uncertainty = record(root.parameter_uncertainty, "parameter_uncertainty");
  const identifiability = record(root.identifiability, "identifiability");
  const comparison = record(root.comparison, "comparison");
  const stability = record(root.structural_stability, "structural_stability");
  const ledger = record(root.hypothesis_ledger, "hypothesis_ledger");
  if (!Array.isArray(root.series) || !Array.isArray(root.baseline_scores)) {
    throw new Error("Dynamics projection rejected: score arrays are missing.");
  }
  if (!Array.isArray(root.falsification_checks)) {
    throw new Error("Dynamics projection rejected: falsification_checks is missing.");
  }

  const holdoutScore = adaptScore(root.holdout_score, "holdout_score");
  const stabilityScore = numberValue(stability.score, "structural_stability.score");
  const tournament: DynamicsTournamentEntry[] = [
    {
      theory: "Ornstein–Uhlenbeck",
      role: "challenger",
      complexity: "CONTINUOUS-TIME",
      parameters: 3,
      score: holdoutScore,
      stability: stabilityScore,
    },
    ...root.baseline_scores.map((item, index): DynamicsTournamentEntry => {
      const entry = record(item, `baseline_scores[${index}]`);
      return {
        theory: stringValue(entry.theory, `baseline_scores[${index}].theory`),
        role: "baseline",
        complexity: stringValue(entry.complexity, `baseline_scores[${index}].complexity`),
        parameters: numberValue(entry.parameters, `baseline_scores[${index}].parameters`),
        score: adaptScore(entry.score, `baseline_scores[${index}].score`),
        stability: null,
      };
    }),
  ];

  const parameterUncertainty = Object.fromEntries(
    Object.entries(uncertainty).map(([name, item]) => [
      name,
      adaptParameter(item, `parameter_uncertainty.${name}`),
    ]),
  );

  return {
    schemaVersion: stringValue(root.schema_version, "schema_version"),
    artifactHash: stringValue(root.artifact_hash, "artifact_hash"),
    theory: stringValue(root.theory, "theory"),
    equation: stringValue(root.equation, "equation"),
    observable: stringValue(root.observable, "observable"),
    experiment: {
      id: stringValue(experiment.id, "experiment.id"),
      name: stringValue(experiment.name, "experiment.name"),
      observable: stringValue(experiment.observable, "experiment.observable"),
      evidenceScope: stringValue(experiment.evidence_scope, "experiment.evidence_scope"),
      seed: numberValue(experiment.seed, "experiment.seed"),
      marketClaimEligible: booleanValue(
        experiment.market_claim_eligible,
        "experiment.market_claim_eligible",
      ),
    },
    world: {
      worldHash: stringValue(world.world_hash, "world.world_hash"),
      asOf: stringValue(world.as_of, "world.as_of"),
      timeUnit: stringValue(world.time_unit, "world.time_unit"),
      pointInTimeEnforced: booleanValue(
        world.point_in_time_enforced,
        "world.point_in_time_enforced",
      ),
      observations: numberValue(world.observations, "world.observations"),
      source: stringValue(world.source, "world.source"),
      revision: stringValue(world.revision, "world.revision"),
    },
    hypothesis: {
      question: stringValue(hypothesis.question, "hypothesis.question"),
      mapping: stringValue(hypothesis.mapping, "hypothesis.mapping"),
      target: stringValue(hypothesis.target, "hypothesis.target"),
    },
    parameters: {
      theta: numberValue(parameters.theta, "parameters.theta"),
      mu: numberValue(parameters.mu, "parameters.mu"),
      sigma: numberValue(parameters.sigma, "parameters.sigma"),
      halfLife: numberValue(parameters.half_life, "parameters.half_life"),
    },
    parameterUncertainty,
    identifiability: {
      identified: booleanValue(identifiability.identified, "identifiability.identified"),
      optimizerConverged: booleanValue(
        identifiability.optimizer_converged,
        "identifiability.optimizer_converged",
      ),
      criterion: stringValue(identifiability.criterion, "identifiability.criterion"),
    },
    trainWindow: adaptWindow(root.train_window, "train_window"),
    holdoutWindow: adaptWindow(root.holdout_window, "holdout_window"),
    holdoutScore,
    tournament,
    comparison: {
      bestBaseline: stringValue(comparison.best_baseline, "comparison.best_baseline"),
      deltaBaseline: numberValue(comparison.delta_baseline, "comparison.delta_baseline"),
      winner: stringValue(comparison.winner, "comparison.winner"),
      explanation: stringValue(comparison.explanation, "comparison.explanation"),
    },
    structuralStability: {
      stable: booleanValue(stability.stable, "structural_stability.stable"),
      score: stabilityScore,
      candidateSplits: numberValue(
        stability.candidate_splits,
        "structural_stability.candidate_splits",
      ),
      thetaRelativeGap: nullableNumber(
        stability.theta_relative_gap,
        "structural_stability.theta_relative_gap",
      ),
      muShiftStationarySigma: nullableNumber(
        stability.mu_shift_stationary_sigma,
        "structural_stability.mu_shift_stationary_sigma",
      ),
    },
    hypothesisLedger: {
      hypothesesConsidered: numberValue(
        ledger.hypotheses_considered,
        "hypothesis_ledger.hypotheses_considered",
      ),
      selectionProcedure: stringValue(
        ledger.selection_procedure,
        "hypothesis_ledger.selection_procedure",
      ),
      selectionTimestamp: stringValue(
        ledger.selection_timestamp,
        "hypothesis_ledger.selection_timestamp",
      ),
      selectionMetric: stringValue(ledger.selection_metric, "hypothesis_ledger.selection_metric"),
      holdoutUntouched: booleanValue(
        ledger.holdout_untouched,
        "hypothesis_ledger.holdout_untouched",
      ),
      multiplicityAdjustment:
        ledger.multiplicity_adjustment === null
          ? null
          : stringValue(
              ledger.multiplicity_adjustment,
              "hypothesis_ledger.multiplicity_adjustment",
            ),
    },
    series: root.series.map((item, index) => {
      const point = record(item, `series[${index}]`);
      return {
        index: numberValue(point.index, `series[${index}].index`),
        observed: numberValue(point.observed, `series[${index}].observed`),
        forecast: nullableNumber(point.forecast, `series[${index}].forecast`),
        forecastLower90: nullableNumber(
          point.forecast_lower_90,
          `series[${index}].forecast_lower_90`,
        ),
        forecastUpper90: nullableNumber(
          point.forecast_upper_90,
          `series[${index}].forecast_upper_90`,
        ),
        observedAt: stringValue(point.observed_at, `series[${index}].observed_at`),
        availableAt: stringValue(point.available_at, `series[${index}].available_at`),
      };
    }),
    falsification: root.falsification_checks.map((item, index) => {
      const check = record(item, `falsification_checks[${index}]`);
      const status = stringValue(
        check.status,
        `falsification_checks[${index}].status`,
      ) as DynamicsCheckStatus;
      if (!["PASS", "FAIL", "NOT_MEASURED"].includes(status)) {
        throw new Error("Dynamics projection rejected: unknown check status.");
      }
      return {
        code: stringValue(check.code, `falsification_checks[${index}].code`),
        status,
        message: stringValue(check.message, `falsification_checks[${index}].message`),
        critical: booleanValue(check.critical, `falsification_checks[${index}].critical`),
        details: record(check.details, `falsification_checks[${index}].details`),
      };
    }),
    scientificVerdict: verdictValue(root.scientific_verdict, "scientific_verdict"),
    predictiveVerdict: verdictValue(root.predictive_verdict, "predictive_verdict"),
    economicVerdict: verdictValue(root.economic_verdict, "economic_verdict"),
    finalMarketClaim: verdictValue(root.final_market_claim, "final_market_claim"),
    marketClaimEligible: booleanValue(root.market_claim_eligible, "market_claim_eligible"),
    decisionSummary: stringValue(root.decision_summary, "decision_summary"),
  };
}

export function adaptDynamicsCertification(value: unknown): DynamicsCertification {
  const root = record(value, "certification");
  const headline = record(root.headline, "certification.headline");
  if (!Array.isArray(root.tasks)) {
    throw new Error("Dynamics projection rejected: certification.tasks is missing.");
  }
  return {
    schemaVersion: stringValue(root.schema_version, "certification.schema_version"),
    suiteId: stringValue(root.suite_id, "certification.suite_id"),
    runHash: stringValue(root.run_hash, "certification.run_hash"),
    frozen: booleanValue(root.frozen, "certification.frozen"),
    headline: {
      theoryFalseAcceptRate: numberValue(
        headline.theory_false_accept_rate,
        "certification.headline.theory_false_accept_rate",
      ),
      falseAccepts: numberValue(headline.false_accepts, "certification.headline.false_accepts"),
      negativeControls: numberValue(
        headline.negative_controls,
        "certification.headline.negative_controls",
      ),
      trueAcceptRate: numberValue(
        headline.theory_true_accept_rate,
        "certification.headline.theory_true_accept_rate",
      ),
      trueAccepts: numberValue(headline.true_accepts, "certification.headline.true_accepts"),
      positiveControls: numberValue(
        headline.positive_controls,
        "certification.headline.positive_controls",
      ),
      abstentionRate: numberValue(
        headline.theory_abstention_rate,
        "certification.headline.theory_abstention_rate",
      ),
      abstentions: numberValue(headline.abstentions, "certification.headline.abstentions"),
      totalControls: numberValue(headline.total_controls, "certification.headline.total_controls"),
      falseRejectRate: numberValue(
        headline.theory_false_reject_rate,
        "certification.headline.theory_false_reject_rate",
      ),
      falseRejects: numberValue(headline.false_rejects, "certification.headline.false_rejects"),
    },
    tasks: root.tasks.map((item, index) => {
      const task = record(item, `certification.tasks[${index}]`);
      if (!Array.isArray(task.killed_by)) {
        throw new Error(`Dynamics projection rejected: certification.tasks[${index}].killed_by.`);
      }
      return {
        id: stringValue(task.id, `certification.tasks[${index}].id`),
        label: stringValue(task.label, `certification.tasks[${index}].label`),
        expected: stringValue(task.expected, `certification.tasks[${index}].expected`) as
          "ACCEPT" | "REJECT",
        scientificVerdict: verdictValue(
          task.scientific_verdict,
          `certification.tasks[${index}].scientific_verdict`,
        ),
        predictiveVerdict: verdictValue(
          task.predictive_verdict,
          `certification.tasks[${index}].predictive_verdict`,
        ),
        theoryAccepted: booleanValue(
          task.theory_accepted,
          `certification.tasks[${index}].theory_accepted`,
        ),
        correct: booleanValue(task.correct, `certification.tasks[${index}].correct`),
        killedBy: task.killed_by.map((code, codeIndex) =>
          stringValue(code, `certification.tasks[${index}].killed_by[${codeIndex}]`),
        ),
        decisionSummary: stringValue(
          task.decision_summary,
          `certification.tasks[${index}].decision_summary`,
        ),
      };
    }),
  };
}

export function adaptStatArbExperiment(value: unknown): StatArbExperiment {
  const root = record(value, "stat_arb");
  const world = record(root.world, "stat_arb.world");
  const ledger = record(root.discovery_ledger, "stat_arb.discovery_ledger");
  const freeze = record(root.freeze, "stat_arb.freeze");
  const compression = record(root.candidate_compression, "stat_arb.candidate_compression");
  const survival = record(root.search_survival_rate, "stat_arb.search_survival_rate");
  if (!Array.isArray(ledger.search_universe)) {
    throw new Error("Dynamics projection rejected: discovery search_universe is missing.");
  }
  if (!Array.isArray(root.screening_ledger) || !Array.isArray(root.pair_artifacts)) {
    throw new Error("Dynamics projection rejected: discovery evidence arrays are missing.");
  }
  return {
    schemaVersion: stringValue(root.schema_version, "stat_arb.schema_version"),
    artifactHash: stringValue(root.artifact_hash, "stat_arb.artifact_hash"),
    freeze: {
      milestone: stringValue(freeze.milestone, "stat_arb.freeze.milestone"),
      frozen: booleanValue(freeze.frozen, "stat_arb.freeze.frozen"),
      contentAddressing: stringValue(
        freeze.content_addressing,
        "stat_arb.freeze.content_addressing",
      ),
      discoveryRunId: stringValue(freeze.discovery_run_id, "stat_arb.freeze.discovery_run_id"),
      pitWorldHash: stringValue(freeze.pit_world_hash, "stat_arb.freeze.pit_world_hash"),
    },
    candidateCompression: {
      hypothesesScreened: numberValue(
        compression.hypotheses_screened,
        "stat_arb.candidate_compression.hypotheses_screened",
      ),
      multipleTestingSurvivors: numberValue(
        compression.multiple_testing_survivors,
        "stat_arb.candidate_compression.multiple_testing_survivors",
      ),
      scientificPredictiveSurvivors: numberValue(
        compression.scientific_predictive_survivors,
        "stat_arb.candidate_compression.scientific_predictive_survivors",
      ),
      economicSurvivors: numberValue(
        compression.economic_survivors,
        "stat_arb.candidate_compression.economic_survivors",
      ),
      notation: stringValue(compression.notation, "stat_arb.candidate_compression.notation"),
    },
    searchSurvivalRate: {
      economicallyCertifiedHypotheses: numberValue(
        survival.economically_certified_hypotheses,
        "stat_arb.search_survival_rate.economically_certified_hypotheses",
      ),
      hypothesesScreened: numberValue(
        survival.hypotheses_screened,
        "stat_arb.search_survival_rate.hypotheses_screened",
      ),
      value: numberValue(survival.value, "stat_arb.search_survival_rate.value"),
      fraction: stringValue(survival.fraction, "stat_arb.search_survival_rate.fraction"),
    },
    world: {
      worldHash: stringValue(world.world_hash, "stat_arb.world.world_hash"),
      asOf: stringValue(world.as_of, "stat_arb.world.as_of"),
      source: stringValue(world.source, "stat_arb.world.source"),
      revision: stringValue(world.revision, "stat_arb.world.revision"),
      priceTransform: stringValue(world.price_transform, "stat_arb.world.price_transform"),
    },
    discoveryLedger: {
      discoveryRunId: stringValue(
        ledger.discovery_run_id,
        "stat_arb.discovery_ledger.discovery_run_id",
      ),
      searchUniverse: ledger.search_universe.map((item, index) =>
        stringValue(item, `stat_arb.discovery_ledger.search_universe[${index}]`),
      ),
      eligibleSecurities: numberValue(
        ledger.eligible_securities,
        "stat_arb.discovery_ledger.eligible_securities",
      ),
      candidatePairs: numberValue(
        ledger.candidate_pairs,
        "stat_arb.discovery_ledger.candidate_pairs",
      ),
      pairsScreened: numberValue(ledger.pairs_screened, "stat_arb.discovery_ledger.pairs_screened"),
      cointegratedCandidates: numberValue(
        ledger.cointegrated_candidates,
        "stat_arb.discovery_ledger.cointegrated_candidates",
      ),
      ouCandidates: numberValue(ledger.ou_candidates, "stat_arb.discovery_ledger.ou_candidates"),
      ouFitsCompleted: numberValue(
        ledger.ou_fits_completed,
        "stat_arb.discovery_ledger.ou_fits_completed",
      ),
      certified: numberValue(ledger.certified, "stat_arb.discovery_ledger.certified"),
      economicSurvivors: numberValue(
        ledger.economic_survivors,
        "stat_arb.discovery_ledger.economic_survivors",
      ),
      selectionTimestamp: stringValue(
        ledger.selection_timestamp,
        "stat_arb.discovery_ledger.selection_timestamp",
      ),
      selectionMetric: stringValue(
        ledger.selection_metric,
        "stat_arb.discovery_ledger.selection_metric",
      ),
      cointegrationTest: stringValue(
        ledger.cointegration_test,
        "stat_arb.discovery_ledger.cointegration_test",
      ),
      correctionMethod: stringValue(
        ledger.correction_method,
        "stat_arb.discovery_ledger.correction_method",
      ),
      correctionLevel: numberValue(
        ledger.correction_level,
        "stat_arb.discovery_ledger.correction_level",
      ),
      screenWindow: adaptWindow(ledger.screen_window, "stat_arb.discovery_ledger.screen_window"),
      hedgeRatioWindow: adaptWindow(
        ledger.hedge_ratio_window,
        "stat_arb.discovery_ledger.hedge_ratio_window",
      ),
      holdoutWindow: adaptWindow(ledger.holdout_window, "stat_arb.discovery_ledger.holdout_window"),
    },
    screeningLedger: root.screening_ledger.map((item, index) => {
      const screen = record(item, `stat_arb.screening_ledger[${index}]`);
      return {
        pairId: stringValue(screen.pair_id, `stat_arb.screening_ledger[${index}].pair_id`),
        statistic: numberValue(
          screen.engle_granger_statistic,
          `stat_arb.screening_ledger[${index}].engle_granger_statistic`,
        ),
        pValue: numberValue(screen.p_value, `stat_arb.screening_ledger[${index}].p_value`),
        adjustedPValue: numberValue(
          screen.adjusted_p_value,
          `stat_arb.screening_ledger[${index}].adjusted_p_value`,
        ),
        selected: booleanValue(screen.selected, `stat_arb.screening_ledger[${index}].selected`),
      };
    }),
    pairArtifacts: root.pair_artifacts.map((item, index) => {
      const pair = record(item, `stat_arb.pair_artifacts[${index}]`);
      const cointegration = record(
        pair.cointegration,
        `stat_arb.pair_artifacts[${index}].cointegration`,
      );
      const hedgeRatio = record(pair.hedge_ratio, `stat_arb.pair_artifacts[${index}].hedge_ratio`);
      const ou = record(pair.ou_artifact, `stat_arb.pair_artifacts[${index}].ou_artifact`);
      const parameters = record(
        ou.parameters,
        `stat_arb.pair_artifacts[${index}].ou_artifact.parameters`,
      );
      const comparison = record(
        ou.comparison,
        `stat_arb.pair_artifacts[${index}].ou_artifact.comparison`,
      );
      if (!Array.isArray(pair.execution_reality)) {
        throw new Error(`Dynamics projection rejected: pair ${index} execution reality.`);
      }
      return {
        pairId: stringValue(pair.pair_id, `stat_arb.pair_artifacts[${index}].pair_id`),
        dependent: stringValue(pair.dependent, `stat_arb.pair_artifacts[${index}].dependent`),
        independent: stringValue(pair.independent, `stat_arb.pair_artifacts[${index}].independent`),
        certified: booleanValue(pair.certified, `stat_arb.pair_artifacts[${index}].certified`),
        cointegration: {
          statistic: numberValue(
            cointegration.statistic,
            `stat_arb.pair_artifacts[${index}].cointegration.statistic`,
          ),
          pValue: numberValue(
            cointegration.p_value,
            `stat_arb.pair_artifacts[${index}].cointegration.p_value`,
          ),
          adjustedPValue: numberValue(
            cointegration.adjusted_p_value,
            `stat_arb.pair_artifacts[${index}].cointegration.adjusted_p_value`,
          ),
          correction: stringValue(
            cointegration.correction,
            `stat_arb.pair_artifacts[${index}].cointegration.correction`,
          ),
        },
        hedgeRatio: {
          intercept: numberValue(
            hedgeRatio.intercept,
            `stat_arb.pair_artifacts[${index}].hedge_ratio.intercept`,
          ),
          beta: numberValue(hedgeRatio.beta, `stat_arb.pair_artifacts[${index}].hedge_ratio.beta`),
          frozenBeforeHoldout: booleanValue(
            hedgeRatio.frozen_before_holdout,
            `stat_arb.pair_artifacts[${index}].hedge_ratio.frozen_before_holdout`,
          ),
        },
        ou: {
          theta: numberValue(parameters.theta, `stat_arb.pair_artifacts[${index}].ou.theta`),
          halfLife: nullableNumber(
            parameters.half_life,
            `stat_arb.pair_artifacts[${index}].ou.half_life`,
          ),
          scientificVerdict: verdictValue(
            ou.scientific_verdict,
            `stat_arb.pair_artifacts[${index}].ou.scientific_verdict`,
          ),
          predictiveVerdict: verdictValue(
            ou.predictive_verdict,
            `stat_arb.pair_artifacts[${index}].ou.predictive_verdict`,
          ),
          economicVerdict: verdictValue(
            ou.economic_verdict,
            `stat_arb.pair_artifacts[${index}].ou.economic_verdict`,
          ),
          finalMarketClaim: verdictValue(
            ou.final_market_claim,
            `stat_arb.pair_artifacts[${index}].ou.final_market_claim`,
          ),
          decisionSummary: stringValue(
            ou.decision_summary,
            `stat_arb.pair_artifacts[${index}].ou.decision_summary`,
          ),
          baselineEdge: numberValue(
            comparison.delta_baseline,
            `stat_arb.pair_artifacts[${index}].ou.comparison.delta_baseline`,
          ),
        },
        executionReality: pair.execution_reality.map((stage, stageIndex) => {
          const stageRecord = record(
            stage,
            `stat_arb.pair_artifacts[${index}].execution_reality[${stageIndex}]`,
          );
          return {
            stage: stringValue(
              stageRecord.stage,
              `stat_arb.pair_artifacts[${index}].execution_reality[${stageIndex}].stage`,
            ),
            status: stringValue(
              stageRecord.status,
              `stat_arb.pair_artifacts[${index}].execution_reality[${stageIndex}].status`,
            ) as DynamicsCheckStatus,
          };
        }),
      };
    }),
    selectionVerdict: verdictValue(root.selection_verdict, "stat_arb.selection_verdict"),
    economicVerdict: verdictValue(root.economic_verdict, "stat_arb.economic_verdict"),
    decisionSummary: stringValue(root.decision_summary, "stat_arb.decision_summary"),
  };
}

export function adaptDynamicsPowerMap(value: unknown): DynamicsPowerMap {
  const root = record(value, "power_map");
  if (!Array.isArray(root.axes) || !Array.isArray(root.cells)) {
    throw new Error("Dynamics projection rejected: power-map arrays are missing.");
  }
  return {
    schemaVersion: stringValue(root.schema_version, "power_map.schema_version"),
    mapId: stringValue(root.map_id, "power_map.map_id"),
    runHash: stringValue(root.run_hash, "power_map.run_hash"),
    frozen: booleanValue(root.frozen, "power_map.frozen"),
    axes: root.axes.map((axis, index) => stringValue(axis, `power_map.axes[${index}]`)),
    method: stringValue(root.method, "power_map.method"),
    repetitionsPerCell: numberValue(root.repetitions_per_cell, "power_map.repetitions_per_cell"),
    cells: root.cells.map((item, index) => {
      const cell = record(item, `power_map.cells[${index}]`);
      return {
        id: stringValue(cell.id, `power_map.cells[${index}].id`),
        theta: numberValue(cell.theta, `power_map.cells[${index}].theta`),
        sigma: numberValue(cell.sigma, `power_map.cells[${index}].sigma`),
        observations: numberValue(cell.observations, `power_map.cells[${index}].observations`),
        deltaTime: numberValue(cell.delta_time, `power_map.cells[${index}].delta_time`),
        measurementNoise: numberValue(
          cell.measurement_noise,
          `power_map.cells[${index}].measurement_noise`,
        ),
        breakMagnitude: numberValue(
          cell.break_magnitude,
          `power_map.cells[${index}].break_magnitude`,
        ),
        halfLife: numberValue(cell.half_life, `power_map.cells[${index}].half_life`),
        expected: stringValue(cell.expected, `power_map.cells[${index}].expected`) as
          "ACCEPT" | "REJECT",
        acceptanceProbability: numberValue(
          cell.acceptance_probability,
          `power_map.cells[${index}].acceptance_probability`,
        ),
        rejectionProbability: numberValue(
          cell.rejection_probability,
          `power_map.cells[${index}].rejection_probability`,
        ),
        abstentionProbability: numberValue(
          cell.abstention_probability,
          `power_map.cells[${index}].abstention_probability`,
        ),
        correctCertificationProbability: numberValue(
          cell.correct_certification_probability,
          `power_map.cells[${index}].correct_certification_probability`,
        ),
      };
    }),
  };
}

export async function fetchOUPowerMap(): Promise<DynamicsPowerMap> {
  return adaptDynamicsPowerMap(await api<unknown>("/dynamics/power/ou?repetitions=6"));
}

export async function fetchDynamicsLabPayload(): Promise<DynamicsLabPayload> {
  const [experiment, certification, statArb] = await Promise.all([
    api<unknown>("/dynamics/experiments/reference-ou"),
    api<unknown>("/dynamics/certification/ou"),
    api<unknown>("/dynamics/experiments/reference-stat-arb"),
  ]);
  return {
    experiment: adaptDynamicsExperiment(experiment),
    certification: adaptDynamicsCertification(certification),
    statArb: adaptStatArbExperiment(statArb),
  };
}
