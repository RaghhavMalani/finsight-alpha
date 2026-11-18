import { createFileRoute } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { CommandCenter } from "@/command/CommandCenter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command — FinSight Forge" },
      {
        name: "description",
        content:
          "Live mission control over the globe: the local live spine's events, markets, risk alerts, research suggestions and feed health, each with its source and availability time.",
      },
    ],
  }),
  component: CommandRoute,
});

function CommandRoute() {
  return (
    <ForgeShell bleed>
      <CommandCenter />
    </ForgeShell>
  );
}
