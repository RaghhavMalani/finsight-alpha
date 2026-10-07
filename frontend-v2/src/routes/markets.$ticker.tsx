import { lazy, Suspense } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { normalizeTicker, parseBarRange } from "@/markets/contracts";
import { Loading } from "@/markets/ui";

const OverviewScreen = lazy(() => import("@/markets/OverviewScreen"));
export const Route = createFileRoute("/markets/$ticker")({
  beforeLoad: ({ params, search }) => {
    const ticker = normalizeTicker(params.ticker);
    if (ticker && ticker !== params.ticker)
      throw redirect({
        to: "/markets/$ticker",
        params: { ticker },
        search: { range: search.range },
      });
  },
  head: () => ({ meta: [{ title: "Overview · Markets — FinSight" }] }),
  component: Overview,
});
function Overview() {
  const { ticker: raw } = Route.useParams(),
    search = Route.useSearch(),
    navigate = useNavigate();
  const ticker = normalizeTicker(raw);
  if (!ticker)
    return (
      <p className="mk-line" role="alert">
        Invalid ticker. Use 1–20 letters, digits or . ^ = -
      </p>
    );
  return (
    <Suspense fallback={<Loading label="Overview" />}>
      <OverviewScreen
        ticker={ticker}
        range={parseBarRange(search.range)}
        onRange={(range) =>
          void navigate({
            to: "/markets/$ticker",
            params: { ticker },
            search: { range: range === "1D" ? undefined : range },
          })
        }
      />
    </Suspense>
  );
}
