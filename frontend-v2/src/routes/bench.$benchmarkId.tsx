import { createFileRoute } from "@tanstack/react-router";
import { BenchDetail } from "@/forge/bench/BenchDetail";

export const Route = createFileRoute("/bench/$benchmarkId")({
  head: () => ({
    meta: [{ title: "Baseline Detail — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    model: typeof search.model === "string" && search.model.length > 0 ? search.model : undefined,
  }),
  component: BenchRoute,
});

function BenchRoute() {
  const { benchmarkId } = Route.useParams();
  const { model } = Route.useSearch();
  return <BenchDetail benchmarkId={benchmarkId} selectedModel={model} />;
}
