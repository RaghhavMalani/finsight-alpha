import { api } from "@/lib/api";

export type HawkesDecision = "DETECT" | "REJECT" | "ABSTAIN";
export type HawkesVerdict = "ACCEPT" | "REJECT" | "ABSTAIN";

export type HawkesMetric = {
  metric: string;
  numerator: number;
  denominator: number;
  estimate: number | null;
  wilson95: [number, number] | null;
  definition: string;
};

export type HawkesFalsification = {
  code: string;
  status: "PASS" | "FAIL";
  critical: boolean;
  value: number | null;
  threshold: number;
  baseline?: string;
};

export type HawkesEdge = {
  source: number;
  target: number;
  branchingContribution: number;
};

export type HawkesWorld = {
  id: string;
  label: string;
  role: string;
  seed: number;
  dimension: number;
  channels: string[];
  horizon: number;
  trainEnd: number;
  eventTimes: number[][];
  eventCounts: number[];
  generator: string;
  worldHash: string;
  notes: string;
  truth: {
    processClass: string;
    expectedDecision: string;
    baseline: number[];
    alpha: number[][];
    beta: number[][];
    branchingMatrix: number[][];
    spectralRadius: number;
    edges: HawkesEdge[];
  };
  fit: {
    baseline: number[];
    alpha: number[][];
    beta: number[][];
    branchingMatrix: number[][];
    spectralRadius: number;
    trainLogLikelihood: number;
    oosLogLikelihood: number;
    optimizer: {
      success: boolean;
      method: string;
      iterations: number;
      functionEvaluations: number;
      objective: number;
    };
    identifiability: {
      identifiable: boolean;
      eventCount: number;
      parameters: number;
      eventsPerParameter: number;
      inverseHessianCondition: number | null;
    };
    uncertainty: {
      method: string;
      repetitions: number;
      lower: number[][];
      upper: number[][];
      edgeSupport: number[][];
      spectralRadiusCI95: [number, number];
    };
  };
  baselines: Array<{
    model: string;
    trainLogLikelihood: number;
    oosLogLikelihood: number;
  }>;
  diagnostics: {
    bestBaseline: string;
    oosLogLikelihoodGain: number;
    oosGainPerEvent: number;
    testEvents: number;
    coincidenceRate: number;
    transformedIntervals: number[];
    timeRescaling: {
      count: number;
      mean: number | null;
      variance: number | null;
      ksStatistic: number | null;
      ksPvalue: number | null;
      lag1Autocorrelation: number | null;
      calibrated: boolean;
    };
    falsificationRegister: HawkesFalsification[];
  };
  decision: HawkesDecision;
  verdicts: {
    processFit: HawkesVerdict;
    predictiveValue: HawkesVerdict;
    economicValue: "NOT_TESTED";
    causalInterpretation: "NOT_ESTABLISHED";
  };
  causalClaimEligible: false;
  marketClaimEligible: false;
};

export type HawkesCertification = {
  artifactHash: string;
  fileSha256: string;
  milestone: "D0.4";
  scientificQuestion: string;
  programStatus: string;
  capabilityChecks: Record<string, boolean>;
  metrics: HawkesMetric[];
  worlds: HawkesWorld[];
  thresholds: Record<string, number>;
  execution: {
    worldsPlanned: number;
    worldsExecuted: number;
    developmentWorlds: number;
    trainFraction: number;
    eventTimeRepresentation: string;
    arbitraryBarDiscretization: false;
    bootstrapRepetitions: number;
  };
  theoryContract: {
    univariateIntensity: string;
    multivariateIntensity: string;
    branchingMatrix: string;
    stability: string;
    likelihood: string;
    baselineCompetition: string[];
    edgeSemantics: string;
  };
  nonlinearBoundary: {
    tag: string;
    commit: string;
    status: string;
    artifactsRegenerated: false;
  };
  causalClaimEligible: false;
  marketClaimEligible: false;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.4 artifact rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`D0.4 artifact rejected: ${label}.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`D0.4 artifact rejected: ${label}.`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.4 artifact rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`D0.4 artifact rejected: ${label}.`);
  return value;
}

function numbers(value: unknown, label: string): number[] {
  return array(value, label).map((item, index) => number(item, `${label}.${index}`));
}

function matrix(value: unknown, label: string): number[][] {
  return array(value, label).map((row, index) => numbers(row, `${label}.${index}`));
}

function interval(value: unknown, label: string): [number, number] | null {
  if (value === null) return null;
  const values = numbers(value, label);
  if (values.length !== 2) throw new Error(`D0.4 artifact rejected: ${label}.`);
  return [values[0], values[1]];
}

function decision(value: unknown): HawkesDecision {
  const result = text(value, "decision");
  if (result !== "DETECT" && result !== "REJECT" && result !== "ABSTAIN") {
    throw new Error("D0.4 artifact rejected: decision.");
  }
  return result;
}

function verdict(value: unknown, label: string): HawkesVerdict {
  const result = text(value, label);
  if (result !== "ACCEPT" && result !== "REJECT" && result !== "ABSTAIN") {
    throw new Error(`D0.4 artifact rejected: ${label}.`);
  }
  return result;
}

function adaptWorld(value: unknown): HawkesWorld {
  const row = object(value, "world record");
  const world = object(row.world, "world");
  const window = object(world.observation_window, "world.observation_window");
  const truth = object(row.truth, "truth");
  const fit = object(row.fit, "fit");
  const optimizer = object(fit.optimizer, "fit.optimizer");
  const identifiability = object(fit.identifiability, "fit.identifiability");
  const uncertainty = object(fit.parameter_uncertainty, "fit.parameter_uncertainty");
  const branchingInterval = object(
    uncertainty.branching_matrix_ci95,
    "fit.uncertainty.branching_matrix_ci95",
  );
  const diagnostics = object(row.diagnostics, "diagnostics");
  const residuals = object(diagnostics.time_rescaling, "diagnostics.time_rescaling");
  const verdicts = object(row.verdicts, "verdicts");
  const causalClaim = bool(row.causal_claim_eligible, "causal_claim_eligible");
  const marketClaim = bool(row.market_claim_eligible, "market_claim_eligible");
  if (causalClaim || marketClaim) throw new Error("D0.4 artifact rejected: claim boundary.");
  const economicValue = text(verdicts.economic_value, "verdicts.economic_value");
  const causalInterpretation = text(
    verdicts.causal_interpretation,
    "verdicts.causal_interpretation",
  );
  if (economicValue !== "NOT_TESTED" || causalInterpretation !== "NOT_ESTABLISHED") {
    throw new Error("D0.4 artifact rejected: verdict claim boundary.");
  }
  return {
    id: text(world.world_id, "world.world_id"),
    label: text(world.label, "world.label"),
    role: text(world.role, "world.role"),
    seed: number(world.seed, "world.seed"),
    dimension: number(world.dimension, "world.dimension"),
    channels: array(world.channels, "world.channels").map((item) => text(item, "channel")),
    horizon: number(window.end, "world.window.end"),
    trainEnd: number(window.train_end, "world.window.train_end"),
    eventTimes: matrix(world.event_times, "world.event_times"),
    eventCounts: numbers(world.event_counts, "world.event_counts"),
    generator: text(world.generator, "world.generator"),
    worldHash: text(world.world_hash, "world.world_hash"),
    notes: text(world.notes, "world.notes"),
    truth: {
      processClass: text(truth.process_class, "truth.process_class"),
      expectedDecision: text(truth.expected_decision, "truth.expected_decision"),
      baseline: numbers(truth.baseline, "truth.baseline"),
      alpha: matrix(truth.alpha, "truth.alpha"),
      beta: matrix(truth.beta, "truth.beta"),
      branchingMatrix: matrix(truth.branching_matrix, "truth.branching_matrix"),
      spectralRadius: number(truth.spectral_radius, "truth.spectral_radius"),
      edges: array(truth.excitation_edges, "truth.excitation_edges").map((item) => {
        const edge = object(item, "truth.edge");
        return {
          source: number(edge.source, "edge.source"),
          target: number(edge.target, "edge.target"),
          branchingContribution: number(edge.branching_contribution, "edge.contribution"),
        };
      }),
    },
    fit: {
      baseline: numbers(fit.baseline, "fit.baseline"),
      alpha: matrix(fit.alpha, "fit.alpha"),
      beta: matrix(fit.beta, "fit.beta"),
      branchingMatrix: matrix(fit.branching_matrix, "fit.branching_matrix"),
      spectralRadius: number(fit.spectral_radius, "fit.spectral_radius"),
      trainLogLikelihood: number(fit.train_log_likelihood, "fit.train_log_likelihood"),
      oosLogLikelihood: number(fit.oos_log_likelihood, "fit.oos_log_likelihood"),
      optimizer: {
        success: bool(optimizer.success, "optimizer.success"),
        method: text(optimizer.method, "optimizer.method"),
        iterations: number(optimizer.iterations, "optimizer.iterations"),
        functionEvaluations: number(
          optimizer.function_evaluations,
          "optimizer.function_evaluations",
        ),
        objective: number(optimizer.objective, "optimizer.objective"),
      },
      identifiability: {
        identifiable: bool(identifiability.identifiable, "identifiability.identifiable"),
        eventCount: number(identifiability.event_count, "identifiability.event_count"),
        parameters: number(identifiability.parameters, "identifiability.parameters"),
        eventsPerParameter: number(
          identifiability.events_per_parameter,
          "identifiability.events_per_parameter",
        ),
        inverseHessianCondition: nullableNumber(
          identifiability.inverse_hessian_condition,
          "identifiability.inverse_hessian_condition",
        ),
      },
      uncertainty: {
        method: text(uncertainty.method, "uncertainty.method"),
        repetitions: number(uncertainty.repetitions, "uncertainty.repetitions"),
        lower: matrix(branchingInterval.lower, "uncertainty.lower"),
        upper: matrix(branchingInterval.upper, "uncertainty.upper"),
        edgeSupport: matrix(uncertainty.edge_support, "uncertainty.edge_support"),
        spectralRadiusCI95: interval(
          uncertainty.spectral_radius_ci95,
          "uncertainty.spectral_radius_ci95",
        )!,
      },
    },
    baselines: array(row.baselines, "baselines").map((item) => {
      const baseline = object(item, "baseline");
      return {
        model: text(baseline.model, "baseline.model"),
        trainLogLikelihood: number(baseline.train_log_likelihood, "baseline.train"),
        oosLogLikelihood: number(baseline.oos_log_likelihood, "baseline.oos"),
      };
    }),
    diagnostics: {
      bestBaseline: text(diagnostics.best_baseline, "diagnostics.best_baseline"),
      oosLogLikelihoodGain: number(
        diagnostics.oos_log_likelihood_gain,
        "diagnostics.oos_log_likelihood_gain",
      ),
      oosGainPerEvent: number(diagnostics.oos_gain_per_event, "diagnostics.oos_gain_per_event"),
      testEvents: number(diagnostics.test_events, "diagnostics.test_events"),
      coincidenceRate: number(diagnostics.coincidence_rate, "diagnostics.coincidence_rate"),
      transformedIntervals: numbers(
        diagnostics.transformed_intervals,
        "diagnostics.transformed_intervals",
      ),
      timeRescaling: {
        count: number(residuals.count, "residuals.count"),
        mean: nullableNumber(residuals.mean, "residuals.mean"),
        variance: nullableNumber(residuals.variance, "residuals.variance"),
        ksStatistic: nullableNumber(residuals.ks_statistic, "residuals.ks_statistic"),
        ksPvalue: nullableNumber(residuals.ks_pvalue, "residuals.ks_pvalue"),
        lag1Autocorrelation: nullableNumber(
          residuals.lag1_autocorrelation,
          "residuals.lag1_autocorrelation",
        ),
        calibrated: bool(residuals.calibrated, "residuals.calibrated"),
      },
      falsificationRegister: array(
        diagnostics.falsification_register,
        "diagnostics.falsification_register",
      ).map((item) => {
        const check = object(item, "falsification check");
        const status = text(check.status, "check.status");
        if (status !== "PASS" && status !== "FAIL") {
          throw new Error("D0.4 artifact rejected: check.status.");
        }
        return {
          code: text(check.code, "check.code"),
          status,
          critical: bool(check.critical, "check.critical"),
          value: nullableNumber(check.value, "check.value"),
          threshold: number(check.threshold, "check.threshold"),
          baseline:
            check.baseline === undefined ? undefined : text(check.baseline, "check.baseline"),
        };
      }),
    },
    decision: decision(row.decision),
    verdicts: {
      processFit: verdict(verdicts.process_fit, "verdicts.process_fit"),
      predictiveValue: verdict(verdicts.predictive_value, "verdicts.predictive_value"),
      economicValue,
      causalInterpretation,
    },
    causalClaimEligible: false,
    marketClaimEligible: false,
  };
}

export function adaptHawkesCertification(value: unknown): HawkesCertification {
  const root = object(value, "root");
  if (text(root.schema_version, "schema_version") !== "dynamics-hawkes-certification/0.4") {
    throw new Error("D0.4 artifact rejected: schema_version.");
  }
  if (bool(root.causal_claim_eligible, "causal_claim_eligible")) {
    throw new Error("D0.4 artifact rejected: causal claim boundary.");
  }
  if (bool(root.market_claim_eligible, "market_claim_eligible")) {
    throw new Error("D0.4 artifact rejected: market claim boundary.");
  }
  if (text(root.milestone, "milestone") !== "D0.4") {
    throw new Error("D0.4 artifact rejected: milestone.");
  }
  const execution = object(root.execution, "execution");
  const contract = object(root.theory_contract, "theory_contract");
  const result = object(root.program_result, "program_result");
  const boundary = object(root.nonlinear_program_boundary, "nonlinear_program_boundary");
  const arbitraryBars = bool(
    execution.arbitrary_bar_discretization,
    "execution.arbitrary_bar_discretization",
  );
  const regenerated = bool(boundary.artifacts_regenerated, "boundary.artifacts_regenerated");
  if (arbitraryBars || regenerated) throw new Error("D0.4 artifact rejected: frozen boundary.");
  return {
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    fileSha256: text(root.file_sha256, "file_sha256"),
    milestone: "D0.4",
    scientificQuestion: text(root.scientific_question, "scientific_question"),
    programStatus: text(result.status, "program_result.status"),
    capabilityChecks: Object.fromEntries(
      Object.entries(object(result.capability_checks, "capability_checks")).map(([name, item]) => [
        name,
        bool(item, `capability_checks.${name}`),
      ]),
    ),
    metrics: array(root.metrics, "metrics").map((item) => {
      const metric = object(item, "metric");
      return {
        metric: text(metric.metric, "metric.metric"),
        numerator: number(metric.numerator, "metric.numerator"),
        denominator: number(metric.denominator, "metric.denominator"),
        estimate: nullableNumber(metric.estimate, "metric.estimate"),
        wilson95: interval(metric.wilson95, "metric.wilson95"),
        definition: text(metric.definition, "metric.definition"),
      };
    }),
    worlds: array(root.worlds, "worlds").map(adaptWorld),
    thresholds: Object.fromEntries(
      Object.entries(object(root.thresholds, "thresholds")).map(([name, item]) => [
        name,
        number(item, `thresholds.${name}`),
      ]),
    ),
    execution: {
      worldsPlanned: number(execution.worlds_planned, "execution.worlds_planned"),
      worldsExecuted: number(execution.worlds_executed, "execution.worlds_executed"),
      developmentWorlds: number(execution.development_worlds, "execution.development_worlds"),
      trainFraction: number(execution.train_fraction, "execution.train_fraction"),
      eventTimeRepresentation: text(
        execution.event_time_representation,
        "execution.event_time_representation",
      ),
      arbitraryBarDiscretization: false,
      bootstrapRepetitions: number(
        execution.bootstrap_repetitions,
        "execution.bootstrap_repetitions",
      ),
    },
    theoryContract: {
      univariateIntensity: text(contract.univariate_intensity, "contract.univariate_intensity"),
      multivariateIntensity: text(
        contract.multivariate_intensity,
        "contract.multivariate_intensity",
      ),
      branchingMatrix: text(contract.branching_matrix, "contract.branching_matrix"),
      stability: text(contract.stability, "contract.stability"),
      likelihood: text(contract.likelihood, "contract.likelihood"),
      baselineCompetition: array(
        contract.baseline_competition,
        "contract.baseline_competition",
      ).map((item) => text(item, "baseline competitor")),
      edgeSemantics: text(contract.edge_semantics, "contract.edge_semantics"),
    },
    nonlinearBoundary: {
      tag: text(boundary.tag, "boundary.tag"),
      commit: text(boundary.commit, "boundary.commit"),
      status: text(boundary.status, "boundary.status"),
      artifactsRegenerated: false,
    },
    causalClaimEligible: false,
    marketClaimEligible: false,
  };
}

export async function fetchHawkesCertification(): Promise<HawkesCertification> {
  return adaptHawkesCertification(
    await api<unknown>("/dynamics/certification/hawkes-event-process"),
  );
}
