import { createFileRoute } from "@tanstack/react-router";
import { RealityLadder, type RealityView } from "@/forge2/reality/RealityLadder";
import { REALITY_METRICS, type RealityMetric } from "@/forge2/reality/ladder-model";

const METRICS = new Set<string>(REALITY_METRICS.map((m) => m.key));

export const Route = createFileRoute("/reality/$artifactId")({
  head: () => ({
    meta: [{ title: "Reality Ladder — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  // `view` (U4) is optional so the frozen v1 UI's links, which do not name it, still type-check.
  validateSearch: (
    search: Record<string, unknown>,
  ): { checkpoint?: string; metric: RealityMetric; view?: RealityView } => ({
    checkpoint:
      typeof search.checkpoint === "string" && search.checkpoint.length > 0
        ? search.checkpoint
        : undefined,
    metric:
      typeof search.metric === "string" && METRICS.has(search.metric)
        ? (search.metric as RealityMetric)
        : "sharpe",
    view: search.view === "table" ? "table" : undefined,
  }),
  component: RealityRoute,
});

function RealityRoute() {
  const { artifactId } = Route.useParams();
  const { checkpoint, metric, view } = Route.useSearch();
  return (
    <RealityLadder
      artifactId={artifactId}
      checkpointId={checkpoint}
      metric={metric}
      view={view ?? "chart"}
    />
  );
}
