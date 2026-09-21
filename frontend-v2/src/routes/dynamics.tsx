import { createFileRoute } from "@tanstack/react-router";
import { DynamicsLab } from "@/dynamics/DynamicsLab";

export const Route = createFileRoute("/dynamics")({
  head: () => ({
    meta: [
      { title: "Dynamics Lab — FinSight Forge" },
      {
        name: "description",
        content:
          "Selection-aware statistical arbitrage with corrected discovery and sealed OU certification.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DynamicsLab,
});
