// Forge v2 (U4): Bench metric tabs and the observed-relation sentence. New in v2; no v1 counterpart.
// The sentence is computed from the baseline artifact's model summaries, never written by hand.
// scripts/verify-forge2.mjs recomputes it from the raw artifact with its own code.
import type { BaselineModel, ResearchMetric } from "@/forge/contracts/observer";

export type BenchMetricKey =
  "verified" | "falseAlpha" | "criticalFail" | "costPerFinding" | "latency" | "toolEngine";

export type BenchField = Readonly<{
  /** Lower-case name used inside the sentence. */
  name: string;
  /** Column header. */
  header: string;
  get: (model: BaselineModel) => ResearchMetric;
  /** Which way is better, when the suite defines one. Tool and engine use has no better side. */
  better: "higher" | "lower" | null;
}>;

export type BenchMetric = Readonly<{
  key: BenchMetricKey;
  tab: string;
  fields: readonly BenchField[];
}>;

const F = {
  verified: {
    name: "verified research",
    header: "Verified",
    get: (m: BaselineModel) => m.verifiedResearch,
    better: "higher",
  },
  falseAlpha: {
    name: "false alpha",
    header: "False α",
    get: (m: BaselineModel) => m.falseAlpha,
    better: "lower",
  },
  criticalFail: {
    name: "critical failures",
    header: "Critical fail",
    get: (m: BaselineModel) => m.criticalFailures,
    better: "lower",
  },
  costPerFinding: {
    name: "cost per verified finding",
    header: "Cost / finding",
    get: (m: BaselineModel) => m.costPerVerifiedFinding,
    better: "lower",
  },
  latency: {
    name: "mean latency",
    header: "Latency",
    get: (m: BaselineModel) => m.latency,
    better: "lower",
  },
  toolCalls: {
    name: "mean tool calls",
    header: "Tool calls",
    get: (m: BaselineModel) => m.toolCalls,
    better: null,
  },
  engineRuns: {
    name: "mean engine runs",
    header: "Engine runs",
    get: (m: BaselineModel) => m.engineRuns,
    better: null,
  },
} as const satisfies Record<string, BenchField>;

export const BENCH_FIELDS: readonly BenchField[] = Object.values(F);

export const BENCH_METRICS: readonly BenchMetric[] = [
  { key: "verified", tab: "Verified research", fields: [F.verified] },
  { key: "falseAlpha", tab: "False α", fields: [F.falseAlpha] },
  { key: "criticalFail", tab: "Critical fail", fields: [F.criticalFail] },
  { key: "costPerFinding", tab: "Cost / finding", fields: [F.costPerFinding] },
  { key: "latency", tab: "Latency", fields: [F.latency] },
  { key: "toolEngine", tab: "Tool / engine use", fields: [F.toolCalls, F.engineRuns] },
];

export function benchMetric(key: BenchMetricKey): BenchMetric {
  return BENCH_METRICS.find((m) => m.key === key) ?? BENCH_METRICS[0];
}

/**
 * The value as displayed (rounded to the metric's precision). Ties and order are judged on it, so
 * the printed numbers never contradict the sentence (review nit).
 */
const shown = (metric: ResearchMetric) => Number(metric.value.toFixed(metric.precision));

/** One piece of the sentence: prose, or a model's value for a field (rendered with its origin). */
export type RelationPart =
  Readonly<{ text: string }> | Readonly<{ model: BaselineModel; field: BenchField }>;

/** "A", "A and B", "A, B and C". */
function names(models: readonly BaselineModel[]): string {
  const n = models.map((m) => m.label);
  return n.length < 2 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** Models with their values listed: "A (v)", "A (v) and B (v)". */
function listed(models: readonly BaselineModel[], field: BenchField): RelationPart[] {
  const out: RelationPart[] = [];
  models.forEach((m, i) => {
    if (i > 0) out.push({ text: i === models.length - 1 ? " and " : ", " });
    out.push({ text: `${m.label} (` }, { model: m, field }, { text: ")" });
  });
  return out;
}

function directional(models: readonly BaselineModel[], field: BenchField): RelationPart[] {
  const v = (m: BaselineModel) => shown(field.get(m));
  const higher = field.better === "higher";
  const best = higher ? Math.max(...models.map(v)) : Math.min(...models.map(v));
  const leaders = models.filter((m) => v(m) === best);
  // Others, nearest the best first; equal values keep artifact order (a stable sort).
  const others = models
    .filter((m) => v(m) !== best)
    .slice()
    .sort((a, b) => (higher ? v(b) - v(a) : v(a) - v(b)));
  const parts: RelationPart[] = [];
  if (!others.length) {
    parts.push(
      { text: `All ${models.length} models tie on ${field.name} (` },
      { model: leaders[0], field },
      { text: ")." },
    );
    return parts;
  }
  if (leaders.length > 1)
    parts.push(
      { text: `${names(leaders)} tie on ${field.name} (` },
      { model: leaders[0], field },
      { text: "); " },
    );
  else
    parts.push(
      { text: `${leaders[0].label} has the ${higher ? "highest" : "lowest"} ${field.name} (` },
      { model: leaders[0], field },
      { text: "); " },
    );
  parts.push(...listed(others, field), {
    text: ` ${others.length > 1 ? "are" : "is"} ${higher ? "lower" : "higher"}.`,
  });
  return parts;
}

function range(models: readonly BaselineModel[], field: BenchField): RelationPart[] {
  const v = (m: BaselineModel) => shown(field.get(m));
  const min = Math.min(...models.map(v));
  const max = Math.max(...models.map(v));
  const lo = models.filter((m) => v(m) === min);
  const hi = models.filter((m) => v(m) === max);
  if (min === max)
    return [
      { text: `All ${models.length} models record the same ${field.name} (` },
      { model: lo[0], field },
      { text: ")." },
    ];
  const cap = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  return [
    { text: `${cap} range from ` },
    { model: lo[0], field },
    { text: ` (${names(lo)}) to ` },
    { model: hi[0], field },
    { text: ` (${names(hi)}).` },
  ];
}

/**
 * Among models tied for the best verified research, name who is strictly lowest on cost per
 * verified finding and on latency (the wireframe's tie-break). Says nothing when no one is.
 */
function tieBreak(models: readonly BaselineModel[]): RelationPart[] {
  const best = Math.max(...models.map((m) => shown(m.verifiedResearch)));
  const tied = models.filter((m) => shown(m.verifiedResearch) === best);
  if (tied.length < 2) return [];
  const lowest = (field: BenchField) => {
    const min = Math.min(...tied.map((m) => shown(field.get(m))));
    const at = tied.filter((m) => shown(field.get(m)) === min);
    return at.length === 1 ? at[0] : null;
  };
  const word = tied.length === 2 ? "lower" : "lowest";
  const cost = lowest(F.costPerFinding);
  const lat = lowest(F.latency);
  if (cost && lat && cost === lat)
    return [
      { text: ` Of the tied models, ${cost.label} has the ${word} ${F.costPerFinding.name} (` },
      { model: cost, field: F.costPerFinding },
      { text: `) and the ${word} ${F.latency.name} (` },
      { model: lat, field: F.latency },
      { text: ")." },
    ];
  const out: RelationPart[] = [];
  for (const [m, field] of [
    [cost, F.costPerFinding],
    [lat, F.latency],
  ] as const)
    if (m)
      out.push(
        { text: ` Of the tied models, ${m.label} has the ${word} ${field.name} (` },
        { model: m, field },
        { text: ")." },
      );
  return out;
}

/** The observed relation for a metric tab, as prose and values in reading order. */
export function observedRelation(
  models: readonly BaselineModel[],
  metric: BenchMetric,
): RelationPart[] {
  if (models.length < 2) return [{ text: "A relation needs at least two models in the suite." }];
  const parts: RelationPart[] = [];
  metric.fields.forEach((field, i) => {
    if (i > 0) parts.push({ text: " " });
    parts.push(...(field.better ? directional(models, field) : range(models, field)));
  });
  if (metric.key === "verified") parts.push(...tieBreak(models));
  return parts;
}

/** The display string of a metric, as the table and the sentence print it. */
export function formatBenchValue(metric: ResearchMetric): string {
  const n = metric.value.toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  return metric.unit === "PERCENT"
    ? `${n}%`
    : metric.unit === "USD"
      ? `$${n}`
      : metric.unit === "SECONDS"
        ? `${n}s`
        : n;
}
