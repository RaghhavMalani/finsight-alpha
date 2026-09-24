import { createFileRoute } from "@tanstack/react-router";
import { RealityLadder, type RealityMetric } from "@/forge/reality/RealityLadder";

const METRICS = new Set<RealityMetric>(["sharpe", "maxDrawdown", "runtime"]);

export const Route = createFileRoute("/reality/$artifactId")({
  head: () => ({
    meta: [{ title: "Reality Ladder — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    checkpoint:
      typeof search.checkpoint === "string" && search.checkpoint.length > 0
        ? search.checkpoint
        : undefined,
    metric:
      typeof search.metric === "string" && METRICS.has(search.metric as RealityMetric)
        ? (search.metric as RealityMetric)
        : ("sharpe" as const),
  }),
  component: RealityRoute,
});

function RealityRoute() {
  const { artifactId } = Route.useParams();
  const { checkpoint, metric } = Route.useSearch();
  return <RealityLadder artifactId={artifactId} checkpointId={checkpoint} metric={metric} />;
}
