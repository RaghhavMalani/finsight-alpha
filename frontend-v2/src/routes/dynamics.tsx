import { createFileRoute } from "@tanstack/react-router";
import { DynamicsNavigator } from "@/dynamics/DynamicsNavigator";

export const Route = createFileRoute("/dynamics")({
  head: () => ({
    meta: [
      { title: "Dynamics Lab — FinSight Forge" },
      {
        name: "description",
        content:
          "A milestone-indexed research console for falsifiable stochastic and event-process experiments.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DynamicsNavigator,
});
