import { lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseBarRange } from "@/markets/contracts";
import { Loading } from "@/markets/ui";

const OverviewScreen = lazy(() => import("@/markets/OverviewScreen"));

export const Route = createFileRoute("/markets/")({
  head: () => ({ meta: [{ title: "Overview · Markets — FinSight" }] }),
  component: Overview,
});

function Overview() {
  const search = Route.useSearch(),
    navigate = useNavigate();
  return (
    <Suspense fallback={<Loading label="Overview" />}>
      <OverviewScreen
        ticker={search.ticker}
        range={parseBarRange(search.range)}
        onRange={(range) =>
          void navigate({
            to: "/markets",
            search: { ticker: search.ticker, range: range === "1D" ? undefined : range },
          })
        }
      />
    </Suspense>
  );
}
