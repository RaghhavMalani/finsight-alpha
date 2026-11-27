import { createFileRoute } from "@tanstack/react-router";
import { RunObserver } from "@/forge2/runs/RunObserver";

type Tab = "action" | "turns" | "checks";
const TABS = new Set(["action", "turns", "checks"]);

function stepParam(value: unknown): number | undefined {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined;
}

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [{ title: "Run Observer — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  // `step` is the selected action's recorded sequence (U4). `node` is its pre-U4 name: the frozen
  // v1 UI (src/forge) still links with it, so it stays accepted and is read when `step` is absent.
  validateSearch: (search: Record<string, unknown>): { step?: number; node?: number; tab: Tab } => {
    const step = stepParam(search.step);
    const node = stepParam(search.node);
    return {
      ...(step !== undefined ? { step } : {}),
      ...(step === undefined && node !== undefined ? { node } : {}),
      tab: typeof search.tab === "string" && TABS.has(search.tab) ? (search.tab as Tab) : "action",
    };
  },
  component: RunRoute,
});

function RunRoute() {
  const { runId } = Route.useParams();
  const { step, node, tab } = Route.useSearch();
  return <RunObserver runId={runId} step={step ?? node ?? 1} tab={tab} />;
}
