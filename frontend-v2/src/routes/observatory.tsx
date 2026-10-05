import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
const ObservatoryPage = lazy(() => import("@/components/observatory/ObservatoryPage"));
export const Route = createFileRoute("/observatory")({
  validateSearch: (search: Record<string, unknown>) => ({
    scene: search.scene === "signal" ? ("signal" as const) : ("hmm" as const),
    ticker: ["SPY", "QQQ", "IWM"].includes(String(search.ticker))
      ? (String(search.ticker) as "SPY" | "QQQ" | "IWM")
      : ("SPY" as const),
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
