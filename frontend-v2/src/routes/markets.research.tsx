import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/markets/ui";

const ResearchScreen = lazy(() => import("@/markets/ResearchScreen"));

export const Route = createFileRoute("/markets/research")({
  head: () => ({ meta: [{ title: "Research · Markets — FinSight" }] }),
  component: () => (
    <Suspense fallback={<Loading label="Research" />}>
      <ResearchScreen />
    </Suspense>
  ),
});
