import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/markets/ui";

const FundamentalsScreen = lazy(() => import("@/markets/FundamentalsScreen"));

export const Route = createFileRoute("/markets/fundamentals")({
  head: () => ({ meta: [{ title: "Fundamentals · Markets — FinSight" }] }),
  component: () => (
    <Suspense fallback={<Loading label="Fundamentals" />}>
      <FundamentalsScreen />
    </Suspense>
  ),
});
