import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  notFound,
  useNavigate,
  useRouterState,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { TerminalShell, useInvestigation, requestSearch } from "@/app/terminal/TerminalShell";
import {
  serializeInvestigationContext,
  safeParseInvestigationContext,
  subjectTicker,
  type InvestigationContext,
} from "@/app/terminal/context";
import { isTextField } from "@/app/workspaces";
import { normalizeTicker, parseBarRange, type BarRange } from "@/markets/contracts";
import TickerSearch from "@/markets/TickerSearch";
import { Loading } from "@/markets/ui";
import "@/markets/markets.css";
import { localLiveAllowed, useDataMode } from "@/replay/mode";
import { lookupInstrument } from "@/markets/instruments";
import { factorSeries } from "@/replay/factor-series";

const ReplayOverviewScreen = lazy(() => import("@/markets/ReplayOverviewScreen")),
  OverviewScreen = lazy(() => import("@/markets/OverviewScreen"));
const MARKET_TABS = [
  { key: "1", to: "/markets", label: "Overview" },
  { key: "2", to: "/markets/options", label: "Options" },
  { key: "3", to: "/markets/risk", label: "Risk" },
  { key: "4", to: "/markets/backtest", label: "Backtest" },
  { key: "5", to: "/markets/fundamentals", label: "Fundamentals" },
  { key: "6", to: "/markets/research", label: "Research" },
] as const;
// Existing child screens retain their typed legacy fields. The wrapper gates their runtime use.
type MarketsSearch = Record<string, unknown> & { ticker: string; range?: BarRange; view?: "graph" };
export const Route = createFileRoute("/markets")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) =>
    ({ ...search }) as unknown as MarketsSearch,
  beforeLoad: ({ location, search }) => {
    const checked = safeParseInvestigationContext("market", requestSearch() ?? location.searchStr),
      part = /^\/markets\/([^/]+)$/.exec(location.pathname)?.[1],
      tickerPath = !!part && !MARKET_TABS.some((tab) => tab.to === location.pathname);
    if (!checked.ok) {
      // An invalid ticker-path document cannot reach the child's normalizing redirect.
      if (tickerPath) throw notFound();
      return;
    }
    if (!tickerPath || !part) return;
    let raw: string;
    try {
      raw = decodeURIComponent(part);
    } catch {
      return;
    }
    const ticker = normalizeTicker(raw);
    // Preserve the complete query before the unchanged child route can normalize a lowercase path.
    if (ticker && ticker !== raw)
      throw redirect({ to: "/markets/$ticker", params: { ticker }, search });
  },
  head: () => ({
    meta: [
      { title: "Markets - FinSight" },
      {
        name: "description",
        content:
          "Checked US and India market-factor Replay, reference identities, and configured local Live market tools.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  notFoundComponent: () => (
    <TerminalShell>
      <p role="alert">The Market URL has no valid investigation context.</p>
    </TerminalShell>
  ),
  errorComponent: () => (
    <TerminalShell>
      <p role="alert">The Market URL has no valid investigation context.</p>
    </TerminalShell>
  ),
  component: () => (
    <TerminalShell>
      <MarketsWorkspace />
    </TerminalShell>
  ),
});
function MarketsWorkspace() {
  const mode = useDataMode(),
    { context, navigationContext, updateContext, updateView } = useInvestigation(),
    search = Route.useSearch(),
    navigate = useNavigate(),
    pathname = useRouterState({ select: (state) => state.location.pathname }),
    overview = !MARKET_TABS.slice(1).some((tab) => pathname.toLowerCase() === tab.to),
    requestedTicker = subjectTicker(context.subject),
    anchorTicker =
      context.anchor?.artifactId === "market:US-MKT"
        ? "US-MKT"
        : context.anchor?.artifactId === "market:IN-MKT"
          ? "IN-MKT"
          : undefined,
    ticker = requestedTicker ?? anchorTicker ?? (context.market === "INDIA" ? "IN-MKT" : "US-MKT"),
    factor = factorSeries(ticker),
    selectionError =
      context.anchor && (!anchorTicker || context.anchor.artifactId !== `market:${ticker}`)
        ? "The requested artifact does not own this Market selection. Its exact anchor was preserved; no latest market series was substituted."
        : anchorTicker &&
            context.market &&
            (factor?.id === "IN-MKT" ? "INDIA" : "US") !== context.market
          ? "The exact Market anchor and requested country disagree."
          : null;
  const [pickError, setPickError] = useState<string | null>(null);
  const selectedContext = useMemo<InvestigationContext>(() => {
    if (navigationContext.subject || selectionError || !factor) return navigationContext;
    return {
      ...navigationContext,
      market: factor.id === "IN-MKT" ? "INDIA" : "US",
      subject: { kind: "market-factor", id: factor.id },
    };
  }, [navigationContext, selectionError, factor]);
  const tabSearch = useMemo(
    () => serializeInvestigationContext(selectedContext),
    [selectedContext],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        isTextField(event.target) ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.isComposing ||
        event.repeat
      )
        return;
      const tab = MARKET_TABS.find((candidate) => candidate.key === event.key);
      if (tab) {
        event.preventDefault();
        void navigate({ to: tab.to, search: tabSearch as never });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, tabSearch]);
  const pick = (next: string) => {
    const listing = lookupInstrument(next),
      nextFactor = factorSeries(next);
    if (!listing && !nextFactor) {
      setPickError(
        "Choose a recorded listing or supply an explicit verified venue through the command line.",
      );
      return;
    }
    setPickError(null);
    updateContext(
      {
        ...context,
        market: nextFactor ? (nextFactor.id === "IN-MKT" ? "INDIA" : "US") : listing!.market,
        subject: nextFactor
          ? { kind: "market-factor", id: nextFactor.id }
          : {
              kind: "reference-listing",
              providerSymbol: listing!.providerSymbol,
              venue: listing!.code,
            },
        anchor: undefined,
        compare: undefined,
        observationDate: undefined,
        view: { workspace: "market" },
      },
      "push",
    );
  };
  const chooseAggregate = (id: "US-MKT" | "IN-MKT") =>
    updateContext(
      {
        ...context,
        market: id === "IN-MKT" ? "INDIA" : "US",
        subject: { kind: "market-factor", id },
        anchor: undefined,
        compare: undefined,
        observationDate: undefined,
        view: { workspace: "market" },
      },
      "push",
    );
  const liveChildHasIdentity =
    typeof search.ticker === "string" && normalizeTicker(search.ticker) === ticker;
  return (
    <div className="mk">
      <header className="mk-head">
        <div>
          <p className="mk-eyebrow">Markets / quant desk</p>
          <h1>{ticker}</h1>
          <p className="mk-lede">
            {mode === "replay"
              ? "Weekly relative performance, drawdown, realized volatility and checked regime evidence. Reference listings do not imply public series coverage."
              : "Configured local Live market tools with source and timestamp. Unavailable sources remain labelled."}
          </p>
          {!context.subject && !context.anchor && (
            <p className="mk-line" role="status">
              {context.market === "INDIA"
                ? "India country filter: IN-MKT aggregate view."
                : "Default aggregate view: US-MKT."}{" "}
              Market factor, not a security or a quoted price.
            </p>
          )}
        </div>
        <TickerSearch key={ticker} ticker={ticker} onPick={pick} />
      </header>
      {pickError && (
        <p className="mk-line" role="alert">
          {pickError}
        </p>
      )}
      <nav className="mk-tabs" aria-label="Markets sections">
        {MARKET_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            search={tabSearch as never}
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
      {selectionError ? (
        <section className="mk-line" role="alert">
          <h2>Market selection unavailable</h2>
          <p>{selectionError}</p>
          <button type="button" onClick={() => chooseAggregate("US-MKT")}>
            Choose US aggregate
          </button>{" "}
          <button type="button" onClick={() => chooseAggregate("IN-MKT")}>
            Choose India aggregate
          </button>
        </section>
      ) : mode === "replay" && !overview ? (
        <p className="mk-line" role="status">
          {MARKET_TABS.find((tab) => tab.to === pathname)?.label} Replay unavailable: no
          publication-licensed derived artifact is installed.
          {pathname === "/markets/fundamentals" && lookupInstrument(ticker)?.market === "INDIA"
            ? " Point-in-time Indian fundamentals coverage is limited."
            : ""}{" "}
          Use configured local Live for available sources.
        </p>
      ) : overview ? (
        <Suspense fallback={<Loading label="checked market view" />}>
          {mode === "replay" ? (
            <ReplayOverviewScreen ticker={ticker} />
          ) : localLiveAllowed() ? (
            <OverviewScreen
              ticker={ticker}
              range={parseBarRange(
                context.view.workspace === "market" ? context.view.range : undefined,
              )}
              onRange={(range) => updateView({ range }, "push")}
            />
          ) : (
            <p className="mk-line" role="alert">
              Configured local Live is unavailable on this host.
            </p>
          )}
        </Suspense>
      ) : mode === "live" && localLiveAllowed() && liveChildHasIdentity ? (
        <Outlet />
      ) : (
        <p className="mk-line" role="alert">
          Choose an explicit recorded listing before opening configured local market tools.
        </p>
      )}
    </div>
  );
}
