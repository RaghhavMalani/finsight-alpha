import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/markets/ui";

const RiskScreen = lazy(() => import("@/markets/RiskScreen"));

export const Route = createFileRoute("/markets/risk")({
  head: () => ({ meta: [{ title: "Risk · Markets — FinSight" }] }),
  component: () => (
    <Suspense fallback={<Loading label="Risk" />}>
      <RiskScreen />
    </Suspense>
  ),
});
