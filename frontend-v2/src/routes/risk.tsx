import { createFileRoute } from "@tanstack/react-router";
import { RiskShell } from "@/risk-manager/RiskShell";
import { RiskWorkspace } from "@/risk-manager/RiskWorkspace";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk Manager — FinSight" },
      {
        name: "description",
        content: "Retained risk evidence, typed issues and sealed sweep receipts.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskRoute,
});
function RiskRoute() {
  return (
    <RiskShell>
      <RiskWorkspace />
    </RiskShell>
  );
}
