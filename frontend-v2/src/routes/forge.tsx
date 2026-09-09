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
  }),
  component: ForgeRoute,
});

function ForgeRoute() {
  const { run } = Route.useSearch();
  return (
    <ForgeShell>
      <CommandCenter selectedRunId={run} />
    </ForgeShell>
  );
}
