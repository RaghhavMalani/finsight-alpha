import { createFileRoute } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { CommandCenter } from "@/forge/command-center/CommandCenter";

export const Route = createFileRoute("/forge")({
  head: () => ({
    meta: [
      { title: "Command Center — FinSight Forge" },
      { name: "description", content: "Read-only Forge research evidence command center." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    run: typeof search.run === "string" && search.run.length > 0 ? search.run : undefined,
    node:
      typeof search.node === "number" && Number.isInteger(search.node) && search.node >= 1
        ? search.node
        : 1,
  }),
  component: ForgeRoute,
});

function ForgeRoute() {
  const { run, node } = Route.useSearch();
  return (
    <ForgeShell>
      <CommandCenter selectedRunId={run} selectedNodeSequence={node} />
    </ForgeShell>
  );
}
