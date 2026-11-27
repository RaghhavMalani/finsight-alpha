// Forge v2 successor of frontend-v2/src/forge/shared/forge-prov.tsx.
// Kept separate because v1 is frozen phase evidence (scripts/research_archive.py SHARED_PATHS).
import type { ResearchMetric } from "@/forge/contracts/observer";
import { useRouteProv } from "@/visual/route-origin";

/**
 * Provenance helpers for a Forge observer projection read through `api(route)` (see
 * useRouteOrigin): Replay values name the checked artifact and its manifest SHA-256.
 */
export function useForgeProv(route: string) {
  const p = useRouteProv(route);
  /** A metric adapted from the projection: its own pointer; percentages are the file value × 100. */
  const M = (m: ResearchMetric, label: string = m.label, display: string = formatMetric(m)) =>
    p.N(
      m.provenance.fieldPath,
      m.value,
      label,
      display,
      m.unit === "PERCENT" ? { formula: `${m.provenance.fieldPath} × 100` } : {},
    );
  return { ...p, M };
}

export type ForgeProv = ReturnType<typeof useForgeProv>;

export function formatMetric(metric: ResearchMetric) {
  const n = metric.value.toLocaleString("en-US", {
    minimumFractionDigits: metric.precision,
    maximumFractionDigits: metric.precision,
  });
  return metric.unit === "PERCENT"
    ? n + "%"
    : metric.unit === "USD"
      ? "$" + n
      : metric.unit === "SECONDS"
        ? n + "s"
        : n;
}
