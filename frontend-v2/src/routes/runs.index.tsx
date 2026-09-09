import { createFileRoute } from "@tanstack/react-router";
import { RunIndex } from "@/forge/runs/RunIndex";

const VERDICTS = new Set(["ACCEPT", "REJECT", "ABSTAIN"]);
const VERIFICATION = new Set(["verified", "failed"]);

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
    task: typeof search.task === "string" && search.task.length > 0 ? search.task : undefined,
    taskClass:
      typeof search.taskClass === "string" && search.taskClass.length > 0
        ? search.taskClass
        : undefined,
    seed:
      typeof search.seed === "number" && Number.isInteger(search.seed) ? search.seed : undefined,
    verified:
      typeof search.verified === "string" && VERIFICATION.has(search.verified)
        ? (search.verified as "verified" | "failed")
        : undefined,
  }),
  component: RunsRoute,
});

function RunsRoute() {
  const search = Route.useSearch();
  return <RunIndex {...search} />;
}
