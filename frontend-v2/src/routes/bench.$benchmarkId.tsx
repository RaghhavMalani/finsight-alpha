import { createFileRoute } from "@tanstack/react-router";
import { BenchDetail } from "@/forge2/bench/BenchDetail";
import { BENCH_METRICS, type BenchMetricKey } from "@/forge2/bench/bench-model";

const METRICS = new Set<string>(BENCH_METRICS.map((m) => m.key));

export const Route = createFileRoute("/bench/$benchmarkId")({
  head: () => ({
    meta: [{ title: "Baseline Detail — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { model?: string; metric?: BenchMetricKey } => ({
    model: typeof search.model === "string" && search.model.length > 0 ? search.model : undefined,
    metric:
      typeof search.metric === "string" && METRICS.has(search.metric)
        ? (search.metric as BenchMetricKey)
        : undefined,
  }),
  component: BenchRoute,
});

function BenchRoute() {
  const { benchmarkId } = Route.useParams();
  const { model, metric } = Route.useSearch();
  return (
    <BenchDetail benchmarkId={benchmarkId} selectedModel={model} metric={metric ?? "verified"} />
  );
}
