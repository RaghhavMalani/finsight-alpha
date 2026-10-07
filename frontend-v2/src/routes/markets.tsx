import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { normalizeTicker } from "@/markets/contracts";
import "@/markets/markets.css";

const MARKET_TABS = [
  { key: "1", to: "/markets/options", label: "Options" },
  { key: "2", to: "/markets/risk", label: "Risk" },
  { key: "3", to: "/markets/backtest", label: "Backtest" },
  { key: "4", to: "/markets/fundamentals", label: "Fundamentals" },
  { key: "5", to: "/markets/research", label: "Research" },
] as const;

export const Route = createFileRoute("/markets")({
  validateSearch: (search: Record<string, unknown>) => ({
    ticker: normalizeTicker(String(search.ticker ?? "")) ?? "SPY",
  }),
  head: () => ({
    meta: [
      { title: "Markets — FinSight" },
      {
        name: "description",
        content:
          "Options, risk, backtests, fundamentals as of a date, and filings research for one ticker.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MarketsLayout,
});

function MarketsLayout() {
  const { ticker } = Route.useSearch();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [draft, setDraft] = useState(ticker);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(ticker), [ticker]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const tab = MARKET_TABS.find((t) => t.key === event.key);
      if (tab) void navigate({ to: tab.to, search: { ticker } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, ticker]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeTicker(draft);
    setInvalid(next == null);
    if (next) void navigate({ to: ".", search: { ticker: next } });
  };

  return (
    <ForgeShell>
      <div className="mk">
        <header className="mk-head">
          <div>
            <p className="mk-eyebrow">Markets · quant desk</p>
            <h1>{ticker}</h1>
            <p className="mk-lede">
              Options, risk, backtests, fundamentals and filings research for one ticker. Every
              number comes from the API with its source. Nothing is filled in when a source is down.
            </p>
          </div>
          <form className="mk-ticker" onSubmit={submit} role="search">
            <label htmlFor="mk-ticker">Ticker</label>
            <input
              id="mk-ticker"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "mk-ticker-error" : undefined}
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
            />
            <button type="submit">Load</button>
            {invalid && (
              <span id="mk-ticker-error" className="mk-field-error">
                Use 1–12 letters, digits or . ^ = -
              </span>
            )}
          </form>
        </header>
        <nav className="mk-tabs" aria-label="Markets sections">
          {MARKET_TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              search={{ ticker }}
              aria-current={pathname.startsWith(tab.to) ? "page" : undefined}
            >
              <kbd>{tab.key}</kbd>
              {tab.label}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </ForgeShell>
  );
}
