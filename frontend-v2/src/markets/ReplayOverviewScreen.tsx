import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { loadReplayManifest, readReplayArtifact } from "@/replay/client";
import { validateMarketReplay, type MarketReplay, type MarketWeek } from "@/replay/contracts";
import { lookupInstrument } from "./instruments";
import { overviewTarget } from "./contracts";
import { pct, num, stamp } from "./format";
import { Chip, Loading, Panel } from "./ui";
import { toggleWatchlist, useWatchlist } from "./watchlist";
import "./replay.css";

const VIEWS = ["Relative performance", "Drawdown", "Realized volatility", "HMM regimes"] as const;
type View = (typeof VIEWS)[number];
const regimeColors: Record<string, string> = {
  "Low-Vol Bullish": "#42c98b",
  "Stress / Selloff": "#f06464",
  Recovery: "#5ca9e6",
  "Sideways / Choppy": "#f0a929",
};
function value(w: MarketWeek, view: View) {
  return view === "Drawdown"
    ? w.drawdown * 100
    : view === "Realized volatility"
      ? w.realized_volatility === null
        ? null
        : w.realized_volatility * 100
      : w.relative_performance;
}

function WeeklyChart({ series, view }: { series: MarketReplay; view: View }) {
  const rows = series.weeks;
  const points = rows.map((w, i) => ({ i, value: value(w, view) }));
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (!values.length)
    return (
      <p className="mk-line">
        Realized volatility unavailable: fewer than 20 admitted daily returns.
      </p>
    );
  const lo = Math.min(...values),
    hi = Math.max(...values),
    spread = hi - lo || 1;
  const x = (i: number) => 60 + (i / Math.max(1, rows.length - 1)) * 670;
  const y = (v: number) => 224 - ((v - lo) / spread) * 180;
  const segments: string[] = [];
  let current = "";
  for (const p of points) {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? " L" : "M"}${x(p.i)},${y(p.value)}`;
  }
  if (current) segments.push(current);
  return (
    <>
      <svg
        viewBox="0 0 760 270"
        role="img"
        aria-label={`${series.ticker}: weekly ${view.toLowerCase()}, derived results without absolute prices`}
        className="mk-replay-chart"
      >
        {rows.map((w, i) =>
          w.regime ? (
            <rect
              key={w.week}
              x={x(i)}
              y={30}
              width={670 / Math.max(1, rows.length - 1)}
              height={202}
              fill={regimeColors[w.regime] ?? "#a3abb2"}
              opacity={view === "HMM regimes" ? 0.3 : 0.1}
            />
          ) : null,
        )}
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line
              x1="60"
              x2="730"
              y1={y(lo + p * spread)}
              y2={y(lo + p * spread)}
              stroke="#262b31"
            />
            <text x="48" y={y(lo + p * spread) + 4} textAnchor="end">
              {num(lo + p * spread, 1)}
              {view === "Drawdown" || view === "Realized volatility" ? "%" : ""}
            </text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#f0a929" strokeWidth="2" />
        ))}
        <text x="60" y="258">
          {rows[0].week}
        </text>
        <text x="730" y="258" textAnchor="end">
          {rows.at(-1)!.week}
        </text>
      </svg>
      <div className="mk-replay-legend">
        {[...new Set(rows.flatMap((w) => (w.regime ? [w.regime] : [])))].map((regime) => (
          <span key={regime}>
            <i style={{ background: regimeColors[regime] ?? "#a3abb2" }} />
            {regime}
          </span>
        ))}
      </div>
      {view === "HMM regimes" && !rows.some((w) => w.regime) && (
        <p className="mk-line">
          HMM shading unavailable: no checked fit is attached to these weeks.
        </p>
      )}
      <p className="mk-line">{series.method.regime_semantics}</p>
    </>
  );
}

export default function ReplayOverviewScreen({ ticker }: { ticker: string }) {
  const asset = lookupInstrument(ticker);
  const watchlist = useWatchlist();
  const [view, setView] = useState<View>("Relative performance");
  const manifest = useQuery({
    queryKey: ["replay", "manifest"],
    queryFn: loadReplayManifest,
    staleTime: Infinity,
    retry: false,
  });
  const entry = manifest.data?.artifacts[`market:${ticker}`];
  const series = useQuery({
    queryKey: ["replay", "market", ticker, entry?.sha256],
    enabled: entry?.status === "AVAILABLE",
    retry: false,
    staleTime: Infinity,
    queryFn: async () =>
      validateMarketReplay(await readReplayArtifact(`market:${ticker}`), ticker, entry!.as_of),
  });
  const reason =
    manifest.error?.message ??
    series.error?.message ??
    entry?.reason ??
    "No publication-licensed derived series is installed for this instrument.";
  const last = series.data?.weeks.at(-1);
  const watching = watchlist.includes(ticker);
  return (
    <>
      <Panel
        title={asset?.name ?? ticker}
        meta={
          <Chip>Replay · {entry?.scope === "TEST_ONLY" ? "TEST_ONLY" : "derived results"}</Chip>
        }
      >
        <div className="mk-replay-identity">
          <span>
            {asset
              ? `${asset.exchange} · ${asset.code} · ${asset.currency}`
              : "Listing metadata unavailable"}
          </span>
          <span>{asset ? `Regular cash session ${asset.session}` : "Session unavailable"}</span>
          <span>{stamp(entry?.as_of ?? manifest.data?.as_of)}</span>
        </div>
        <div className="mk-replay-kpis">
          <div>
            <span>Relative performance</span>
            <b>{last ? num(last.relative_performance) : "Unavailable"}</b>
            <small>First admitted week = 100</small>
          </div>
          <div>
            <span>Drawdown</span>
            <b>{last ? pct(last.drawdown) : "Unavailable"}</b>
            <small>Daily peak, sampled weekly</small>
          </div>
          <div>
            <span>Realized volatility</span>
            <b>
              {last?.realized_volatility != null ? pct(last.realized_volatility) : "Unavailable"}
            </b>
            <small>20 sessions · annualized</small>
          </div>
          <div>
            <span>HMM regime</span>
            <b>{last?.regime ?? "Unavailable"}</b>
            <small>Checked posterior only</small>
          </div>
        </div>
        <div className="mk-controls">
          <button
            className="mk-ghost"
            type="button"
            aria-pressed={watching}
            disabled={!watching && watchlist.length >= 30}
            onClick={() => toggleWatchlist(ticker)}
          >
            {watching ? "Remove from watchlist" : "Add to watchlist"}
          </button>
          <span className="mk-note">
            Saved in this browser · Replay never requests vendor quotes
          </span>
        </div>
      </Panel>
      <div className="mk-overview-grid">
        <Panel title="Weekly market evidence" meta={<Chip>GP · relative views</Chip>}>
          <div className="mk-replay-views" role="group" aria-label="Derived Market views">
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </div>
          {manifest.isPending || (entry?.status === "AVAILABLE" && series.isPending) ? (
            <Loading label="checked market evidence" />
          ) : series.data ? (
            <WeeklyChart series={series.data} view={view} />
          ) : (
            <div className="mk-replay-unavailable" role="status">
              <b>{view} unavailable</b>
              <p>{reason}</p>
              <p>
                Absolute vendor prices stay on the local installation. This view will render checked
                weekly results when publication is permitted.
              </p>
            </div>
          )}
          <details className="mk-replay-method">
            <summary>Method and publication boundary</summary>
            <p>
              Relative performance starts at 100 on the first admitted weekly observation. Drawdown
              uses admitted daily peaks. Realized volatility uses the sample standard deviation of
              20 daily log returns, annualized with 252 sessions. Weekly sampling reduces detail; no
              absolute price level is published.
            </p>
            <p>
              Each visible regime must come from a checked HMM fit. Fit posteriors do not establish
              contemporaneous historical knowledge or tradable alpha.
            </p>
            <p>
              {entry
                ? `Source: ${entry.sources.join(", ")} · Licence: ${entry.licence.status} · ${entry.licence.dataset_key}`
                : "Source and publication licence unavailable."}
            </p>
            {entry?.sha256 && <p className="font-mono break-all">SHA-256 {entry.sha256}</p>}
          </details>
        </Panel>
        <Panel title="Watchlist" meta={<Chip>{watchlist.length} instruments</Chip>}>
          <div className="mk-replay-watchlist">
            {watchlist.map((symbol) => {
              const i = lookupInstrument(symbol),
                e = manifest.data?.artifacts[`market:${symbol}`];
              return (
                <div key={symbol}>
                  <Link {...overviewTarget(symbol)}>
                    <b>{i?.symbol ?? symbol}</b>
                    <span>{i ? `${i.code} · ${i.currency}` : "Metadata unavailable"}</span>
                  </Link>
                  <span>
                    {e?.status === "AVAILABLE" ? "Checked weekly results" : "Series unavailable"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mk-line">
            US and India instruments share one desk. Unavailable data stays labelled.
          </p>
        </Panel>
      </div>
      <Panel title="India VIX" meta={<Chip>NSE · volatility index</Chip>}>
        <p className="mk-line">
          {manifest.data?.artifacts["market:india-vix"]?.reason ??
            "No publication-licensed India VIX summary is installed."}
        </p>
        <p className="mk-line">
          NSE regular cash session: 09:15–15:30 IST. Holidays and special sessions follow the
          exchange calendar. Local Live shows a sourced, timestamped index level when available.
        </p>
      </Panel>
      {series.data && (
        <Panel title="Weekly observations">
          <div className="mk-table-wrap">
            <table className="mk-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Relative performance</th>
                  <th>Drawdown</th>
                  <th>Realized volatility</th>
                  <th>HMM regime</th>
                </tr>
              </thead>
              <tbody>
                {series.data.weeks.map((w) => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{num(w.relative_performance)}</td>
                    <td>{pct(w.drawdown)}</td>
                    <td>{pct(w.realized_volatility)}</td>
                    <td>{w.regime ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
