import { createFileRoute } from "@tanstack/react-router";
import { RealityLadder, type RealityMetric, type RealityView } from "@/forge/reality/RealityLadder";

const METRICS = new Set<RealityMetric>(["sharpe", "return", "maxDrawdown", "turnover", "fees"]);
const VIEWS = new Set<RealityView>(["2d", "3d"]);

type RealitySearch = {
  checkpoint?: string;
  metric: RealityMetric;
  view?: RealityView;
};

export const Route = createFileRoute("/reality/$artifactId")({
  head: () => ({
    meta: [{ title: "Reality Terrain — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): RealitySearch => ({
    checkpoint:
      typeof search.checkpoint === "string" && search.checkpoint.length > 0
        ? search.checkpoint
        : undefined,
    metric:
      typeof search.metric === "string" && METRICS.has(search.metric as RealityMetric)
        ? (search.metric as RealityMetric)
        : ("sharpe" as const),
    view:
      typeof search.view === "string" && VIEWS.has(search.view as RealityView)
        ? (search.view as RealityView)
        : undefined,
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
      view={view ?? "2d"}
    />
  );
}
