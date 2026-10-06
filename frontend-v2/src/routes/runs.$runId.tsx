import { createFileRoute } from "@tanstack/react-router";
import { RunObserver } from "@/forge/runs/RunObserver";
import type { ReplaySpeed } from "@/forge/runs/ReplayControls";

const TABS = new Set(["action", "turns", "checks"]);
const SPEEDS = new Set<ReplaySpeed>([1, 2]);

type RunSearch = {
  node: number;
  tab: "action" | "turns" | "checks";
  replay?: true;
  speed?: ReplaySpeed;
};

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [{ title: "Run Observer — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): RunSearch => ({
    node:
      typeof search.node === "number" && Number.isInteger(search.node) && search.node >= 0
        ? search.node
        : 1,
    tab:
      typeof search.tab === "string" && TABS.has(search.tab)
        ? (search.tab as "action" | "turns" | "checks")
        : ("action" as const),
    replay: search.replay === true || search.replay === "true" ? true : undefined,
    speed:
      typeof search.speed === "number" && SPEEDS.has(search.speed as ReplaySpeed)
        ? (search.speed as ReplaySpeed)
        : undefined,
  }),
  component: RunRoute,
});

function RunRoute() {
  const { runId } = Route.useParams();
  const { node, tab, replay, speed } = Route.useSearch();
  return (
    <RunObserver
      runId={runId}
      node={node}
      tab={tab}
      replayActive={Boolean(replay)}
      replaySpeed={speed ?? 1}
    />
  );
}
