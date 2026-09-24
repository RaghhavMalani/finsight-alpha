import { createFileRoute } from "@tanstack/react-router";
import { RunObserver } from "@/forge/runs/RunObserver";

const TABS = new Set(["action", "turns", "checks"]);

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [{ title: "Run Observer — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    node:
      typeof search.node === "number" && Number.isInteger(search.node) && search.node >= 0
        ? search.node
        : 1,
    tab:
      typeof search.tab === "string" && TABS.has(search.tab)
        ? (search.tab as "action" | "turns" | "checks")
        : ("action" as const),
  }),
  component: RunRoute,
});

function RunRoute() {
  const { runId } = Route.useParams();
  const { node, tab } = Route.useSearch();
  return <RunObserver runId={runId} node={node} tab={tab} />;
}
