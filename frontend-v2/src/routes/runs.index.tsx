import { createFileRoute } from "@tanstack/react-router";
import { RunIndex } from "@/forge/runs/RunIndex";

const VERDICTS = new Set(["ACCEPT", "REJECT", "ABSTAIN"]);

export const Route = createFileRoute("/runs/")({
  head: () => ({
    meta: [{ title: "Runs — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    model: typeof search.model === "string" && search.model.length > 0 ? search.model : undefined,
    verdict:
      typeof search.verdict === "string" && VERDICTS.has(search.verdict)
        ? search.verdict
        : undefined,
  }),
  component: RunsRoute,
});

function RunsRoute() {
  const search = Route.useSearch();
  return <RunIndex model={search.model} verdict={search.verdict} />;
}
