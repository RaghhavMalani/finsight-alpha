import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/markets/ui";

const BacktestScreen = lazy(() => import("@/markets/BacktestScreen"));

export const Route = createFileRoute("/markets/backtest")({
  head: () => ({ meta: [{ title: "Backtest · Markets — FinSight" }] }),
  component: () => (
    <Suspense fallback={<Loading label="Backtest" />}>
      <BacktestScreen />
    </Suspense>
  ),
});
