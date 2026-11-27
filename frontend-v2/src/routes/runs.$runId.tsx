import { createFileRoute } from "@tanstack/react-router";
import { RunObserver } from "@/forge2/runs/RunObserver";

type Tab = "action" | "turns" | "checks";
const TABS = new Set(["action", "turns", "checks"]);

/** A recorded sequence is a non-negative integer; anything else is not a step. */
function stepParam(value: unknown): number | undefined {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined;
}

export const Route = createFileRoute("/runs/$runId")({
  head: () => ({
    meta: [{ title: "Run Observer — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  // `step` is the selected action's recorded sequence (U4). `node` is its pre-U4 name: the frozen
  // v1 UI (src/forge) still links with it, so it is read when `step` is absent or not an integer
  // (`?step=abc&node=3` selects 3). An unparseable `step` is kept as `badStep` so the page can say
  // it was not used.
  validateSearch: (
    search: Record<string, unknown>,
  ): { step?: number; node?: number; badStep?: string; tab: Tab } => {
    const step = stepParam(search.step);
    const node = stepParam(search.node);
    // The router validates its own output again, so a `badStep` already found is carried through.
    const bad =
      search.step !== undefined && step === undefined
        ? String(search.step)
        : typeof search.badStep === "string"
          ? search.badStep
          : undefined;
    // Every key is returned, even when undefined: the router keeps a raw key the validator omits,
    // which let an unparseable `step` ("abc") through and hid `node` (review MUST 3).
    return {
      step,
      node: step === undefined ? node : undefined,
      badStep: bad !== undefined && node === undefined ? bad : undefined,
      tab: typeof search.tab === "string" && TABS.has(search.tab) ? (search.tab as Tab) : "action",
    };
  },
  component: RunRoute,
});

function RunRoute() {
  const { runId } = Route.useParams();
  const { step, node, badStep, tab } = Route.useSearch();
  const chosen = step ?? node;
  return (
    <RunObserver
      runId={runId}
      step={chosen ?? 1}
      requested={badStep ?? (chosen === undefined ? undefined : String(chosen))}
      tab={tab}
    />
  );
}
