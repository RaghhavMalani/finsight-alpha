// Forge v2 (U4 review S5): a compact metric value. New in v2; no v1 counterpart.
// The value itself (a <Num>) opens its origin, so no per-value "provenance" row is drawn, and the
// epistemic class is stated once per card with <ClassChips> instead of a chip on every value.
import type { ReactNode } from "react";
import { EpistemicBadge } from "@/epistemic/EpistemicValue";
import type { ResearchMetric } from "@/forge/contracts/observer";

export function MetricCell({
  metric,
  value,
  label = metric.label,
  className = "",
}: {
  metric: ResearchMetric;
  value: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`f2-metric ${className}`} data-class={metric.provenance.epistemicType}>
      <div className="f2-metric-label">{label}</div>
      <output className="f2-metric-value">{value}</output>
    </div>
  );
}

/** The distinct epistemic classes of a card's values, each named once. */
export function ClassChips({ metrics }: { metrics: readonly ResearchMetric[] }) {
  const types = [...new Set(metrics.map((m) => m.provenance.epistemicType))];
  return (
    <span className="f2-chips">
      {types.map((t) => (
        <EpistemicBadge key={t} type={t} />
      ))}
    </span>
  );
}
