import type {
  EpistemicType,
  Provenance,
  RealityDetail,
  RealityMetricId,
  ResearchMetric,
} from "@/forge/contracts/observer";

export const REALITY_METRICS: readonly RealityMetricId[] = [
  "sharpe",
  "return",
  "maxDrawdown",
  "turnover",
  "fees",
];

export const REALITY_STAGE_IDS = [
  "L1_VECTORBT",
  "L2_NAUTILUS",
  "L3_FEES_SLIPPAGE",
  "L3_LATENCY",
  "L4_COUNTERFACTUAL_STRESS",
] as const;

const STAGE_LABELS: Readonly<Record<(typeof REALITY_STAGE_IDS)[number], string>> = {
  L1_VECTORBT: "SCREEN",
  L2_NAUTILUS: "EVENT",
  L3_FEES_SLIPPAGE: "COSTS",
  L3_LATENCY: "LATENCY",
  L4_COUNTERFACTUAL_STRESS: "STRESS",
};

export const REALITY_METRIC_LABELS: Readonly<Record<RealityMetricId, string>> = {
  sharpe: "Sharpe",
  return: "Return",
  maxDrawdown: "Drawdown",
  turnover: "Turnover",
  fees: "Fees",
};

export type RealityTerrainStage = Readonly<{
  index: number;
  id: (typeof REALITY_STAGE_IDS)[number];
  label: string;
  checkpointLabel: string;
  realityLevel: string;
  engine: string;
  certificationLevel: string | null;
  certificationHash: string | null;
  value: ResearchMetric;
  deltaFromPrior: ResearchMetric | null;
  cumulativeDecay: ResearchMetric;
  alphaSurvival: ResearchMetric;
  slippage: ResearchMetric;
  latencyCost: ResearchMetric;
  runtime: ResearchMetric;
}>;

export type RealityTerrainRidge = Readonly<{
  id: string;
  label: string;
  seeds: ResearchMetric | null;
  values: readonly ResearchMetric[];
  alphaSurvival: ResearchMetric;
}>;

export type RealityTerrainViewModel = Readonly<{
  artifactId: string;
  artifactHash: string;
  sourceSchemaVersion: string;
  metric: RealityMetricId;
  metricLabel: string;
  stages: readonly RealityTerrainStage[];
  aggregateRidge: RealityTerrainRidge;
  ridges: readonly RealityTerrainRidge[];
  alphaSurvival: ResearchMetric;
  largestDegradation: RealityDetail["largestDegradation"];
  finding: string;
  decompositionConvention: string;
  certificationArtifactHash: string | null;
  certificationSchemaVersion: string | null;
  systemReleaseEligible: boolean | null;
  minValue: number;
  maxValue: number;
}>;

function derivedProvenance(
  current: ResearchMetric,
  fieldPath: string,
  method: string,
  epistemicType?: EpistemicType,
): Provenance {
  return {
    ...current.provenance,
    epistemicType: epistemicType ?? current.provenance.epistemicType,
    fieldPath,
    method,
  };
}

function differenceMetric(
  id: string,
  label: string,
  current: ResearchMetric,
  baseline: ResearchMetric,
  method: string,
): ResearchMetric {
  return {
    id,
    label,
    value: current.value - baseline.value,
    unit: current.unit,
    precision: current.precision,
    provenance: derivedProvenance(
      current,
      `${current.provenance.fieldPath} − ${baseline.provenance.fieldPath}`,
      method,
    ),
  };
}

function survivalMetric(current: ResearchMetric, baseline: ResearchMetric): ResearchMetric {
  return {
    id: `${current.id}-survival`,
    label: "Alpha survival",
    value: baseline.value === 0 ? 0 : (current.value / baseline.value) * 100,
    unit: "PERCENT",
    precision: 1,
    provenance: derivedProvenance(
      current,
      `${current.provenance.fieldPath} ÷ ${baseline.provenance.fieldPath}`,
      "RATIO_TO_VECTORBT_SCREEN",
    ),
  };
}

function sharpeDecompositionForStage(
  reality: RealityDetail,
  stageId: (typeof REALITY_STAGE_IDS)[number],
): ResearchMetric | null {
  if (stageId === "L2_NAUTILUS") return reality.decomposition.modelSemanticDecay;
  if (stageId === "L3_FEES_SLIPPAGE") return reality.decomposition.feeDecay;
  if (stageId === "L3_LATENCY") return reality.decomposition.latencyDecay;
  if (stageId === "L4_COUNTERFACTUAL_STRESS") return reality.decomposition.stressDecay;
  return null;
}

export function buildRealityTerrainViewModel(
  reality: RealityDetail,
  selectedMetric: RealityMetricId,
): RealityTerrainViewModel {
  const checkpoints = new Map(reality.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const firstCheckpoint = checkpoints.get(REALITY_STAGE_IDS[0]);
  if (!firstCheckpoint) {
    throw new Error("The frozen Reality Ladder does not contain the VectorBT screen checkpoint.");
  }
  const baseline = firstCheckpoint.metrics[selectedMetric];

  const stages = REALITY_STAGE_IDS.map((id, index): RealityTerrainStage => {
    const checkpoint = checkpoints.get(id);
    if (!checkpoint) throw new Error(`The frozen Reality Ladder is missing checkpoint ${id}.`);
    const value = checkpoint.metrics[selectedMetric];
    const previous = index > 0 ? checkpoints.get(REALITY_STAGE_IDS[index - 1]) : null;
    const exactSharpeDelta =
      selectedMetric === "sharpe" ? sharpeDecompositionForStage(reality, id) : null;
    const deltaFromPrior =
      index === 0
        ? null
        : (exactSharpeDelta ??
          differenceMetric(
            `${id}-${selectedMetric}-delta`,
            `${REALITY_METRIC_LABELS[selectedMetric]} change`,
            value,
            previous?.metrics[selectedMetric] ?? baseline,
            "SIGNED_DIFFERENCE_OF_FROZEN_CHECKPOINTS",
          ));
    return {
      index,
      id,
      label: STAGE_LABELS[id],
      checkpointLabel: checkpoint.label,
      realityLevel: checkpoint.realityLevel,
      engine: checkpoint.engine,
      certificationLevel: checkpoint.certificationLevel,
      certificationHash: checkpoint.certificationHash,
      value,
      deltaFromPrior,
      cumulativeDecay: differenceMetric(
        `${id}-${selectedMetric}-cumulative`,
        "Cumulative change",
        value,
        baseline,
        "SIGNED_DIFFERENCE_FROM_VECTORBT_SCREEN",
      ),
      alphaSurvival: survivalMetric(checkpoint.metrics.sharpe, firstCheckpoint.metrics.sharpe),
      slippage: checkpoint.slippage,
      latencyCost: checkpoint.latencyCost,
      runtime: checkpoint.runtime,
    };
  });

  const aggregateRidge: RealityTerrainRidge = {
    id: "AGGREGATE",
    label: "Aggregate",
    seeds: null,
    values: stages.map((stage) => stage.value),
    alphaSurvival: reality.alphaSurvival,
  };
  const regimeRidges: readonly RealityTerrainRidge[] =
    selectedMetric === "sharpe"
      ? reality.regimes.map((regime) => ({
          id: regime.id,
          label: regime.label,
          seeds: regime.seeds,
          values: REALITY_STAGE_IDS.map((id) => regime.sharpeByCheckpoint[id]),
          alphaSurvival: regime.alphaSurvival,
        }))
      : [];
  const allValues = [...stages.map((stage) => stage.value.value)];
  for (const ridge of regimeRidges) {
    for (const value of ridge.values) allValues.push(value.value);
  }

  return {
    artifactId: reality.binding.artifactId,
    artifactHash: reality.binding.artifactHash,
    sourceSchemaVersion: reality.binding.sourceSchemaVersion,
    metric: selectedMetric,
    metricLabel: REALITY_METRIC_LABELS[selectedMetric],
    stages,
    aggregateRidge,
    ridges: regimeRidges.length > 0 ? regimeRidges : [aggregateRidge],
    alphaSurvival: reality.alphaSurvival,
    largestDegradation: reality.largestDegradation,
    finding: reality.finding,
    decompositionConvention: reality.decomposition.convention,
    certificationArtifactHash: reality.certificationArtifactHash,
    certificationSchemaVersion: reality.certificationSchemaVersion,
    systemReleaseEligible: reality.systemReleaseEligible,
    minValue: Math.min(...allValues),
    maxValue: Math.max(...allValues),
  };
}

export function formatRealityMetric(metric: ResearchMetric, signed = false): string {
  const absolute = Math.abs(metric.value).toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  const sign = signed && metric.value !== 0 ? (metric.value > 0 ? "+" : "−") : "";
  const value = signed
    ? `${sign}${absolute}`
    : metric.value.toLocaleString("en-US", {
        minimumFractionDigits: metric.precision,
        maximumFractionDigits: metric.precision,
      });
  if (metric.unit === "PERCENT") return `${value}%`;
  if (metric.unit === "USD") return `${signed && metric.value < 0 ? "−" : ""}$${absolute}`;
  if (metric.unit === "SECONDS") return `${value}s`;
  return value;
}
