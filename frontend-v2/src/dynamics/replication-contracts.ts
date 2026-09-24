import { api } from "@/lib/api";

export type ReplicationClassification =
  "CAPABILITY_SUPPORTED" | "LIMITATION_REPLICATED" | "UNRESOLVED";

export type ReplicationMetric = {
  metric: string;
  numerator: number;
  denominator: number;
  estimate: number | null;
  wilson95: [number, number] | null;
  definition: string;
  classification: ReplicationClassification;
  classificationReason: string;
  gate: { comparator: ">=" | "<="; threshold: number } | null;
  confirmation: {
    numerator: number;
    denominator: number;
    estimate: number | null;
    wilson95: [number, number] | null;
  };
  absoluteDelta: number | null;
  uncertaintyInterpretation: string;
};

export type DecisionPattern = {
  pattern: string;
  count: number;
  fraction: number | null;
};

export type WaterfallStage = {
  count: number;
  total: number;
  rate: number | null;
};

export type SindyRoleDiagnostics = {
  worlds: number;
  bootstrapRepetitions: number;
  trueTermRecall: number | null;
  structuralPrecision: number | null;
  falseTermSelectionRate: number | null;
  exactSupportRate: number | null;
  signCorrectness: number | null;
  frequencySeparation: number | null;
  coefficientRelativeError: {
    mean: number;
    median: number;
    q05: number;
    q95: number;
  } | null;
};

export type EvidenceCompleteReplication = {
  artifactHash: string;
  fileSha256: string;
  projectionHash: string;
  milestone: string;
  readOnly: true;
  programStatus: string;
  classificationCounts: Record<string, number>;
  execution: {
    plannedWorlds: number;
    executedWorlds: number;
    admittedWorlds: number;
    developmentWorlds: number;
    tuningEvents: number;
    stoppedEarly: boolean;
    rootBootstraps: number;
  };
  metrics: ReplicationMetric[];
  topologyWaterfall: Record<string, WaterfallStage>;
  classificationErrors: Record<string, DecisionPattern[]>;
  diffusionPatterns: Record<string, DecisionPattern[]>;
  topologyPatterns: Record<string, DecisionPattern[]>;
  sindyAggregate: {
    trueTermInclusionFrequency: number | null;
    falseTermInclusionFrequency: number | null;
    frequencySeparation: number | null;
  };
  sindyByRole: Record<string, SindyRoleDiagnostics>;
  failureEntropy: Record<
    string,
    {
      observations: number;
      patterns: number;
      entropyBits: number | null;
      normalizedEntropy: number | null;
    }
  >;
  frozenThresholds: Record<string, number>;
  parentSeals: Array<{ milestone: string; artifactHash: string; fileSha256: string }>;
  marketClaim: "ABSTAIN";
  marketInterpretation: string;
  rawWorldEvidenceExposed: false;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return value;
}

function interval(value: unknown, label: string): [number, number] | null {
  if (value === null) return null;
  const values = array(value, label);
  if (values.length !== 2) {
    throw new Error(`D0.3.4 projection rejected: ${label}.`);
  }
  return [number(values[0], `${label}.low`), number(values[1], `${label}.high`)];
}

function classification(value: unknown): ReplicationClassification {
  const result = text(value, "metric.classification");
  if (
    result !== "CAPABILITY_SUPPORTED" &&
    result !== "LIMITATION_REPLICATED" &&
    result !== "UNRESOLVED"
  ) {
    throw new Error("D0.3.4 projection rejected: metric.classification.");
  }
  return result;
}

function adaptGate(value: unknown): ReplicationMetric["gate"] {
  if (value === null) return null;
  const gate = object(value, "metric.gate");
  const comparator = text(gate.comparator, "metric.gate.comparator");
  if (comparator !== ">=" && comparator !== "<=") {
    throw new Error("D0.3.4 projection rejected: metric.gate.comparator.");
  }
  return { comparator, threshold: number(gate.threshold, "metric.gate.threshold") };
}

function adaptMetric(value: unknown): ReplicationMetric {
  const row = object(value, "metric");
  const confirmation = object(row.d0_3_3_confirmation, "metric.confirmation");
  return {
    metric: text(row.metric, "metric.metric"),
    numerator: number(row.numerator, "metric.numerator"),
    denominator: number(row.denominator, "metric.denominator"),
    estimate: nullableNumber(row.estimate, "metric.estimate"),
    wilson95: interval(row.wilson95, "metric.wilson95"),
    definition: text(row.definition, "metric.definition"),
    classification: classification(row.classification),
    classificationReason: text(row.classification_reason, "metric.classification_reason"),
    gate: adaptGate(row.gate),
    confirmation: {
      numerator: number(confirmation.numerator, "metric.confirmation.numerator"),
      denominator: number(confirmation.denominator, "metric.confirmation.denominator"),
      estimate: nullableNumber(confirmation.estimate, "metric.confirmation.estimate"),
      wilson95: interval(confirmation.wilson95, "metric.confirmation.wilson95"),
    },
    absoluteDelta: nullableNumber(row.absolute_delta, "metric.absolute_delta"),
    uncertaintyInterpretation: text(
      row.uncertainty_interpretation,
      "metric.uncertainty_interpretation",
    ),
  };
}

function adaptPatterns(value: unknown, label: string): DecisionPattern[] {
  return array(value, label).map((item) => {
    const row = object(item, label);
    return {
      pattern: text(row.pattern, `${label}.pattern`),
      count: number(row.count, `${label}.count`),
      fraction: nullableNumber(row.fraction, `${label}.fraction`),
    };
  });
}

function adaptPatternGroups(value: unknown, label: string): Record<string, DecisionPattern[]> {
  const groups = object(value, label);
  return Object.fromEntries(
    Object.entries(groups).map(([name, rows]) => [name, adaptPatterns(rows, `${label}.${name}`)]),
  );
}

function adaptWaterfall(value: unknown): Record<string, WaterfallStage> {
  const stages = object(value, "topology_waterfall");
  return Object.fromEntries(
    Object.entries(stages).map(([name, item]) => {
      const row = object(item, `topology_waterfall.${name}`);
      return [
        name,
        {
          count: number(row.count, `topology_waterfall.${name}.count`),
          total: number(row.total, `topology_waterfall.${name}.total`),
          rate: nullableNumber(row.rate, `topology_waterfall.${name}.rate`),
        },
      ];
    }),
  );
}

function adaptSindyRole(value: unknown, label: string): SindyRoleDiagnostics {
  const row = object(value, label);
  const error = row.coefficient_relative_error;
  return {
    worlds: number(row.worlds, `${label}.worlds`),
    bootstrapRepetitions: number(row.bootstrap_repetitions, `${label}.bootstrap_repetitions`),
    trueTermRecall: nullableNumber(row.true_term_recall, `${label}.true_term_recall`),
    structuralPrecision: nullableNumber(row.structural_precision, `${label}.structural_precision`),
    falseTermSelectionRate: nullableNumber(
      row.false_term_selection_rate,
      `${label}.false_term_selection_rate`,
    ),
    exactSupportRate: nullableNumber(row.exact_support_rate, `${label}.exact_support_rate`),
    signCorrectness: nullableNumber(
      row.true_term_sign_correctness,
      `${label}.true_term_sign_correctness`,
    ),
    frequencySeparation: nullableNumber(
      row.true_false_frequency_separation,
      `${label}.true_false_frequency_separation`,
    ),
    coefficientRelativeError:
      error === null
        ? null
        : (() => {
            const values = object(error, `${label}.coefficient_relative_error`);
            return {
              mean: number(values.mean, `${label}.error.mean`),
              median: number(values.median, `${label}.error.median`),
              q05: number(values.q05, `${label}.error.q05`),
              q95: number(values.q95, `${label}.error.q95`),
            };
          })(),
  };
}

export function adaptEvidenceCompleteReplication(value: unknown): EvidenceCompleteReplication {
  const root = object(value, "root");
  if (
    text(root.schema_version, "schema_version") !==
    "dynamics-evidence-complete-replication-projection/0.3.4"
  ) {
    throw new Error("D0.3.4 projection rejected: schema_version.");
  }
  if (!bool(root.read_only, "read_only") || bool(root.raw_world_evidence_exposed, "raw evidence")) {
    throw new Error("D0.3.4 projection rejected: read-only boundary.");
  }
  const program = object(root.program_result, "program_result");
  const execution = object(root.execution, "execution");
  const decomposition = object(root.decision_decomposition, "decision_decomposition");
  const sindy = object(root.sindy_diagnostics, "sindy_diagnostics");
  const sindyAggregate = object(sindy.aggregate, "sindy.aggregate");
  const sindyByRole = object(sindy.by_role, "sindy.by_role");
  const entropy = object(
    object(root.failure_entropy, "failure_entropy").by_error_class,
    "failure_entropy.by_error_class",
  );
  const instrument = object(root.frozen_instrument, "frozen_instrument");
  const market = object(root.real_market_claim, "real_market_claim");
  if (
    bool(root.market_claim_eligible, "market_claim_eligible") ||
    text(market.market_claim, "market_claim") !== "ABSTAIN" ||
    bool(market.rerun_performed, "market.rerun_performed")
  ) {
    throw new Error("D0.3.4 projection rejected: market boundary.");
  }
  return {
    artifactHash: text(root.source_artifact_hash, "source_artifact_hash"),
    fileSha256: text(root.source_file_sha256, "source_file_sha256"),
    projectionHash: text(root.projection_hash, "projection_hash"),
    milestone: text(root.milestone, "milestone"),
    readOnly: true,
    programStatus: text(program.status, "program_result.status"),
    classificationCounts: Object.fromEntries(
      Object.entries(object(program.classification_counts, "classification_counts")).map(
        ([name, count]) => [name, number(count, `classification_counts.${name}`)],
      ),
    ),
    execution: {
      plannedWorlds: number(execution.planned_worlds, "execution.planned_worlds"),
      executedWorlds: number(execution.executed_worlds, "execution.executed_worlds"),
      admittedWorlds: number(execution.admitted_worlds, "execution.admitted_worlds"),
      developmentWorlds: number(execution.development_worlds, "execution.development_worlds"),
      tuningEvents: number(execution.tuning_events, "execution.tuning_events"),
      stoppedEarly: bool(execution.stopped_early, "execution.stopped_early"),
      rootBootstraps: number(
        execution.root_bootstraps_per_topology_world,
        "execution.root_bootstraps",
      ),
    },
    metrics: array(root.metrics, "metrics").map(adaptMetric),
    topologyWaterfall: adaptWaterfall(decomposition.topology_waterfall),
    classificationErrors: adaptPatternGroups(
      decomposition.classification_errors,
      "classification_errors",
    ),
    diffusionPatterns: adaptPatternGroups(
      decomposition.diffusion_conjunction_patterns,
      "diffusion_patterns",
    ),
    topologyPatterns: adaptPatternGroups(decomposition.topology_gate_patterns, "topology_patterns"),
    sindyAggregate: {
      trueTermInclusionFrequency: nullableNumber(
        sindyAggregate.true_term_inclusion_frequency,
        "sindy.aggregate.true_term",
      ),
      falseTermInclusionFrequency: nullableNumber(
        sindyAggregate.false_term_inclusion_frequency,
        "sindy.aggregate.false_term",
      ),
      frequencySeparation: nullableNumber(
        sindyAggregate.frequency_separation,
        "sindy.aggregate.separation",
      ),
    },
    sindyByRole: Object.fromEntries(
      Object.entries(sindyByRole).map(([role, item]) => [
        role,
        adaptSindyRole(item, `sindy.${role}`),
      ]),
    ),
    failureEntropy: Object.fromEntries(
      Object.entries(entropy).map(([name, item]) => {
        const row = object(item, `entropy.${name}`);
        return [
          name,
          {
            observations: number(row.observations, `entropy.${name}.observations`),
            patterns: number(row.patterns, `entropy.${name}.patterns`),
            entropyBits: nullableNumber(row.entropy_bits, `entropy.${name}.bits`),
            normalizedEntropy: nullableNumber(row.normalized_entropy, `entropy.${name}.normalized`),
          },
        ];
      }),
    ),
    frozenThresholds: Object.fromEntries(
      Object.entries(object(instrument.thresholds, "frozen_instrument.thresholds")).map(
        ([name, threshold]) => [name, number(threshold, `threshold.${name}`)],
      ),
    ),
    parentSeals: array(root.parent_seals, "parent_seals").map((item) => {
      const row = object(item, "parent_seal");
      return {
        milestone: text(row.milestone, "parent.milestone"),
        artifactHash: text(row.artifact_hash, "parent.artifact_hash"),
        fileSha256: text(row.file_sha256, "parent.file_sha256"),
      };
    }),
    marketClaim: "ABSTAIN",
    marketInterpretation: text(market.interpretation, "market.interpretation"),
    rawWorldEvidenceExposed: false,
  };
}

export async function fetchEvidenceCompleteReplication(): Promise<EvidenceCompleteReplication> {
  return adaptEvidenceCompleteReplication(
    await api<unknown>("/dynamics/certification/evidence-complete-replication"),
  );
}
