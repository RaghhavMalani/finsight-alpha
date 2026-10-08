import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useParams,
  useRouterState,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { normalizeTicker, overviewTarget, parseBarRange } from "@/markets/contracts";
import TickerSearch from "@/markets/TickerSearch";
import "@/markets/markets.css";
import { useDataMode } from "@/replay/mode";
import { lookupInstrument } from "@/markets/instruments";

const MARKET_TABS = [
  { key: "1", to: "/markets", label: "Overview" },
  { key: "2", to: "/markets/options", label: "Options" },
  { key: "3", to: "/markets/risk", label: "Risk" },
  { key: "4", to: "/markets/backtest", label: "Backtest" },
  { key: "5", to: "/markets/fundamentals", label: "Fundamentals" },
  { key: "6", to: "/markets/research", label: "Research" },
] as const;

export const Route = createFileRoute("/markets")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    ticker: normalizeTicker(String(search.ticker ?? "")) ?? "US-MKT",
    view: search.view === "graph" ? "graph" : undefined,
    range:
      search.range === undefined || parseBarRange(search.range) === "1D"
        ? undefined
        : parseBarRange(search.range),
  }),
  head: () => ({
    meta: [
      { title: "Markets — FinSight" },
      {
        name: "description",
        content:
          "Quotes, candlesticks, watchlists, options, risk, backtests and filings research for US and India tickers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MarketsLayout,
});

function MarketsLayout() {
  const mode = useDataMode();
  const search = Route.useSearch();
  const params = useParams({ strict: false });
  const ticker = normalizeTicker(params.ticker ?? "") ?? search.ticker;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overview = !MARKET_TABS.slice(1).some((tab) => pathname.toLowerCase() === tab.to);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const tab = MARKET_TABS.find((t) => t.key === event.key);
      if (tab)
        void navigate(
          tab.to === "/markets" ? overviewTarget(ticker) : { to: tab.to, search: { ticker } },
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, ticker]);

  const pick = (next: string) => {
    if (overview) void navigate(overviewTarget(next));
    else void navigate({ to: ".", search: { ticker: next } });
  };

  return (
    <ForgeShell>
      <div className="mk">
        <header className="mk-head">
          <div>
            <p className="mk-eyebrow">Markets · quant desk</p>
            <h1>{ticker}</h1>
            <p className="mk-lede">
              {mode === "replay"
                ? "Weekly relative performance, drawdown, realized volatility and checked regime evidence. Public series require publication permission; raw prices stay local."
                : "Quotes, candles and local research with source and timestamp. Nothing is filled in when a source is down."}
            </p>
          </div>
          <TickerSearch key={ticker} ticker={ticker} onPick={pick} />
        </header>
        <nav className="mk-tabs" aria-label="Markets sections">
          {MARKET_TABS.map((tab) => (
            <Link
              key={tab.to}
              {...(tab.to === "/markets"
                ? overviewTarget(ticker)
                : { to: tab.to, search: { ticker } })}
              aria-current={
                (tab.to === "/markets" ? overview : pathname.toLowerCase() === tab.to)
                  ? "page"
                  : undefined
              }
            >
              <kbd>{tab.key}</kbd>
              {tab.label}
            </Link>
          ))}
        </nav>
        {mode === "replay" && !overview ? (
          <p className="mk-line" role="status">
            {MARKET_TABS.find((tab) => tab.to === pathname)?.label} Replay unavailable: no
            publication-licensed derived artifact is installed.
            {pathname === "/markets/fundamentals" && lookupInstrument(ticker)?.market === "INDIA"
              ? " Point-in-time Indian fundamentals coverage is limited."
              : ""}{" "}
            Use configured local Live for available sources.
          </p>
        ) : (
          <Outlet />
        )}
      </div>
    </ForgeShell>
  );
}
