import { api } from "@/lib/api";

export type AutopsyRate = {
  value: number;
  numerator: number;
  denominator: number;
  marginToGate: number | null;
  wilson95: [number, number] | null;
};

export type AutopsyMetric = {
  metric: string;
  direction: "higher" | "lower";
  gate: number | null;
  development: AutopsyRate;
  confirmation: AutopsyRate;
  worsening: number;
};

export type AutopsyStage = {
  stage: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  raw: AutopsyRate | null;
  sequential: AutopsyRate | null;
  attrition: number | null;
  reason: string | null;
};

export type AutopsyWorld = {
  cellId: string;
  family: "double_well" | "state_diffusion";
  stages: Record<string, boolean | null>;
  path: Record<string, number | string>;
};

export type AutopsyFlag = {
  code: string;
  active: boolean;
  reason: string;
  affectedWorlds: string[];
  evidenceCount: number;
};

export type ThresholdSensitivity = {
  gate: string;
  frozenThreshold: number;
  descriptiveBand: number;
  developmentMedianMargin: number | null;
  confirmationMedianMargin: number | null;
  developmentNear: [number, number];
  confirmationNear: [number, number];
};

export type GeneralizationAutopsyArtifact = {
  artifactHash: string;
  milestone: string;
  noRetuning: boolean;
  d033Result: string;
  decision: string;
  metricTable: AutopsyMetric[];
  waterfalls: {
    doubleWell: { development: AutopsyStage[]; confirmation: AutopsyStage[] };
    stateDiffusion: { development: AutopsyStage[]; confirmation: AutopsyStage[] };
  };
  pathSummary: {
    doubleWell: Record<string, { development: number | null; confirmation: number | null }>;
    stateDiffusion: Record<string, { development: number | null; confirmation: number | null }>;
  };
  confirmationWorlds: AutopsyWorld[];
  flags: AutopsyFlag[];
  thresholds: ThresholdSensitivity[];
  parentSeals: Array<{
    milestone: string;
    artifactHash: string;
    fileSha256: string;
    sourceSha256: string | null;
  }>;
  sourceSha256: string;
  marketClaimEligible: false;
  marketInterpretation: string;
  sindyStatus: string;
  sindyReason: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`D0.3.3.1 projection rejected: ${label}.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`D0.3.3.1 projection rejected: ${label}.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`D0.3.3.1 projection rejected: ${label}.`);
  }
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`D0.3.3.1 projection rejected: ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  return value === null ? null : number(value, label);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`D0.3.3.1 projection rejected: ${label}.`);
  }
  return value;
}

function adaptRate(value: unknown, label: string): AutopsyRate {
  const row = object(value, label);
  const rawInterval = row.wilson_95;
  let wilson95: [number, number] | null = null;
  if (rawInterval !== null) {
    const interval = array(rawInterval, `${label}.wilson_95`);
    wilson95 = [
      number(interval[0], `${label}.wilson_95.low`),
      number(interval[1], `${label}.wilson_95.high`),
    ];
  }
  return {
    value: number(row.value, `${label}.value`),
    numerator: number(row.numerator, `${label}.numerator`),
    denominator: number(row.denominator, `${label}.denominator`),
    marginToGate: nullableNumber(row.margin_to_gate, `${label}.margin_to_gate`),
    wilson95,
  };
}

function adaptMetric(value: unknown): AutopsyMetric {
  const row = object(value, "metric");
  const direction = text(row.direction, "metric.direction");
  if (direction !== "higher" && direction !== "lower") {
    throw new Error("D0.3.3.1 projection rejected: metric.direction.");
  }
  return {
    metric: text(row.metric, "metric.metric"),
    direction,
    gate: nullableNumber(row.gate, "metric.gate"),
    development: adaptRate(row.development, "metric.development"),
    confirmation: adaptRate(row.confirmation, "metric.confirmation"),
    worsening: number(
      row.signed_generalization_worsening,
      "metric.signed_generalization_worsening",
    ),
  };
}

function adaptStageRate(value: unknown, label: string): AutopsyRate | null {
  if (value === null) return null;
  const rate = object(value, label);
  return {
    value: number(rate.value, label + ".value"),
    numerator: number(rate.numerator, label + ".numerator"),
    denominator: number(rate.denominator, label + ".denominator"),
    marginToGate: null,
    wilson95: null,
  };
}

function adaptStage(value: unknown): AutopsyStage {
  const row = object(value, "stage");
  const status = text(row.status, "stage.status");
  if (status !== "AVAILABLE" && status !== "UNAVAILABLE") {
    throw new Error("D0.3.3.1 projection rejected: stage.status.");
  }
  return {
    stage: text(row.stage, "stage.stage"),
    status,
    raw: adaptStageRate(row.raw, "stage.raw"),
    sequential: adaptStageRate(row.sequential, "stage.sequential"),
    attrition: nullableNumber(row.attrition_from_prior, "stage.attrition"),
    reason: row.reason === undefined ? null : text(row.reason, "stage.reason"),
  };
}

function adaptWaterfall(value: unknown, label: string) {
  const section = object(value, label);
  const summaries = object(section.summaries, `${label}.summaries`);
  const development = object(summaries.development, `${label}.development`);
  const confirmation = object(summaries.confirmation, `${label}.confirmation`);
  return {
    development: array(development.stages, `${label}.development.stages`).map(adaptStage),
    confirmation: array(confirmation.stages, `${label}.confirmation.stages`).map(adaptStage),
  };
}

function medianFields(value: unknown, label: string): Record<string, number | null> {
  const summary = object(value, label);
  return Object.fromEntries(
    Object.entries(summary).map(([key, item]) => [
      key,
      nullableNumber(object(item, `${label}.${key}`).median, `${label}.${key}.median`),
    ]),
  );
}

function adaptPathSummary(value: unknown, label: string) {
  const section = object(value, label);
  const summaries = object(section.summaries, `${label}.summaries`);
  const development = medianFields(summaries.development, `${label}.development`);
  const confirmation = medianFields(summaries.confirmation, `${label}.confirmation`);
  return Object.fromEntries(
    Object.keys(development).map((key) => [
      key,
      { development: development[key] ?? null, confirmation: confirmation[key] ?? null },
    ]),
  );
}

function primitivePath(value: unknown): Record<string, number | string> {
  const row = object(value, "path record");
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, item]) => typeof item === "number" || typeof item === "string")
      .map(([key, item]) => [key, item as number | string]),
  );
}

function adaptWorlds(waterfalls: Record<string, unknown>, paths: Record<string, unknown>) {
  return (
    [
      ["double_well", "double_well"],
      ["state_diffusion", "state_diffusion"],
    ] as const
  ).flatMap(([waterfallKey, family]) => {
    const waterfall = object(waterfalls[waterfallKey], `waterfalls.${waterfallKey}`);
    const pathSection = object(paths[waterfallKey], `paths.${waterfallKey}`);
    const pathById = new Map(
      array(pathSection.world_records, `paths.${waterfallKey}.world_records`).map((item) => {
        const row = object(item, "path row");
        return [text(row.cell_id, "path.cell_id"), primitivePath(row)] as const;
      }),
    );
    return array(waterfall.world_records, `waterfalls.${waterfallKey}.world_records`)
      .map((item) => {
        const row = object(item, "waterfall world");
        const split = text(row.split, "waterfall world.split");
        const stages = object(row.stages, "waterfall world.stages");
        return {
          split,
          world: {
            cellId: text(row.cell_id, "waterfall world.cell_id"),
            family,
            stages: Object.fromEntries(
              Object.entries(stages).map(([key, item]) => [
                key,
                item === null ? null : bool(item, `stage.${key}`),
              ]),
            ),
            path: pathById.get(text(row.cell_id, "waterfall world.cell_id")) ?? {},
          },
        };
      })
      .filter((row) => row.split === "confirmation")
      .map((row) => row.world);
  });
}

export function adaptGeneralizationAutopsy(value: unknown): GeneralizationAutopsyArtifact {
  const root = object(value, "root");
  if (text(root.schema_version, "schema_version") !== "dynamics-generalization-autopsy/0.3.3.1") {
    throw new Error("D0.3.3.1 projection rejected: schema_version.");
  }
  const boundaries = object(root.boundaries, "boundaries");
  const conclusion = object(root.scientific_conclusion, "scientific_conclusion");
  const waterfalls = object(root.causal_waterfalls, "causal_waterfalls");
  const paths = object(root.path_information, "path_information");
  const thresholds = object(
    object(root.threshold_sensitivity, "threshold_sensitivity").summaries,
    "threshold_sensitivity.summaries",
  );
  const market = object(root.real_market_claim, "real_market_claim");
  const sindy = object(root.sindy_structure_stability, "sindy_structure_stability");
  const marketClaimEligible = bool(root.marketClaimEligible, "marketClaimEligible");
  if (
    bool(root.market_claim_eligible, "market_claim_eligible") ||
    marketClaimEligible ||
    !bool(boundaries.no_retuning, "boundaries.no_retuning")
  ) {
    throw new Error("D0.3.3.1 projection rejected: claim or retuning boundary.");
  }
  return {
    artifactHash: text(root.artifact_hash, "artifact_hash"),
    milestone: text(root.milestone, "milestone"),
    noRetuning: true,
    d033Result: text(conclusion.d0_3_3_result, "conclusion.d0_3_3_result"),
    decision: text(conclusion.next_milestone_decision, "conclusion.next_milestone_decision"),
    metricTable: array(root.metric_table, "metric_table").map(adaptMetric),
    waterfalls: {
      doubleWell: adaptWaterfall(waterfalls.double_well, "waterfalls.double_well"),
      stateDiffusion: adaptWaterfall(waterfalls.state_diffusion, "waterfalls.state_diffusion"),
    },
    pathSummary: {
      doubleWell: adaptPathSummary(paths.double_well, "paths.double_well"),
      stateDiffusion: adaptPathSummary(paths.state_diffusion, "paths.state_diffusion"),
    },
    confirmationWorlds: adaptWorlds(waterfalls, paths),
    flags: array(root.diagnostic_flags, "diagnostic_flags").map((item) => {
      const row = object(item, "flag");
      return {
        code: text(row.code, "flag.code"),
        active: bool(row.active, "flag.active"),
        reason: text(row.reason, "flag.reason"),
        affectedWorlds: array(row.affected_worlds, "flag.affected_worlds").map((world) =>
          text(world, "flag.world"),
        ),
        evidenceCount: array(row.evidence, "flag.evidence").length,
      };
    }),
    thresholds: Object.entries(thresholds).map(([gate, item]) => {
      const splits = object(item, `threshold.${gate}`);
      const development = object(splits.development, `threshold.${gate}.development`);
      const confirmation = object(splits.confirmation, `threshold.${gate}.confirmation`);
      return {
        gate,
        frozenThreshold: number(development.frozen_threshold, `threshold.${gate}.value`),
        descriptiveBand: number(development.descriptive_band, `threshold.${gate}.band`),
        developmentMedianMargin: nullableNumber(
          development.median_margin,
          `threshold.${gate}.development.margin`,
        ),
        confirmationMedianMargin: nullableNumber(
          confirmation.median_margin,
          `threshold.${gate}.confirmation.margin`,
        ),
        developmentNear: [
          number(development.near_boundary_numerator, `threshold.${gate}.development.near`),
          number(development.near_boundary_denominator, `threshold.${gate}.development.total`),
        ],
        confirmationNear: [
          number(confirmation.near_boundary_numerator, `threshold.${gate}.confirmation.near`),
          number(confirmation.near_boundary_denominator, `threshold.${gate}.confirmation.total`),
        ],
      };
    }),
    parentSeals: array(root.parent_seals, "parent_seals").map((item) => {
      const row = object(item, "parent seal");
      return {
        milestone: text(row.milestone, "parent.milestone"),
        artifactHash: text(row.artifact_hash, "parent.artifact_hash"),
        fileSha256: text(row.file_sha256, "parent.file_sha256"),
        sourceSha256:
          row.source_sha256 === undefined ? null : text(row.source_sha256, "parent.source_sha256"),
      };
    }),
    sourceSha256: text(
      object(root.generation, "generation").source_sha256,
      "generation.source_sha256",
    ),
    marketClaimEligible: false,
    marketInterpretation: text(market.interpretation, "market.interpretation"),
    sindyStatus: text(sindy.status, "sindy.status"),
    sindyReason: text(sindy.reason, "sindy.reason"),
  };
}

export async function fetchGeneralizationAutopsy(): Promise<GeneralizationAutopsyArtifact> {
  return adaptGeneralizationAutopsy(
    await api<unknown>("/dynamics/certification/generalization-autopsy"),
  );
}
