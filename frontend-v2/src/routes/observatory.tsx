import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { normalizeTicker } from "@/markets/contracts";
const ObservatoryPage = lazy(() => import("@/components/observatory/ObservatoryPage"));
export const Route = createFileRoute("/observatory")({
  // Tickers are declared by the replay manifest; the page rejects any it does not list.
  validateSearch: (search: Record<string, unknown>) => ({
    scene:
      search.scene === "signal" || search.scene === "neural"
        ? (search.scene as "signal" | "neural")
        : ("hmm" as const),
    ticker: normalizeTicker(String(search.ticker ?? "")) ?? "SPY",
  }),
  head: () => ({
    meta: [
      { title: "Model Observatory — FinSight" },
      {
        name: "description",
        content: "PIT-bounded HMM optimization and signal-model validation traces.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 font-mono text-faint">LOADING OBSERVATORY</div>}>
      <ObservatoryPage />
    </Suspense>
  ),
});
