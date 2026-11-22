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
import { FACTOR_SERIES, factorSeries } from "@/replay/factor-series";
import { SourceCredit } from "@/replay/SourceCredit";
import { Num, ProvenanceProvider, Stamp } from "@/visual/Num";
import { num as numOf, ref, replayOrigin, svgProv } from "@/visual/origins";
import type { Origin } from "@/visual/Num";
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

const FIELD: Record<View, string> = {
  "Relative performance": "relative_performance",
  Drawdown: "drawdown",
  "Realized volatility": "realized_volatility",
  "HMM regimes": "relative_performance",
};

function WeeklyChart({
  series,
  view,
  at,
}: {
  series: MarketReplay;
  view: View;
  at: (ptr: string, formula?: string) => Origin;
}) {
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
        {[0, 0.5, 1].map((p) => {
          // The ticks are the series' own minimum, midpoint and maximum, so each names its rule.
          const field = FIELD[view];
          const scale = view === "Drawdown" || view === "Realized volatility" ? " × 100" : "";
          const rule =
            p === 0
              ? `min of /weeks/*/${field}${scale}`
              : p === 1
                ? `max of /weeks/*/${field}${scale}`
                : `midpoint of min and max of /weeks/*/${field}${scale}`;
          const label = `${num(lo + p * spread, 1)}${view === "Drawdown" || view === "Realized volatility" ? "%" : ""}`;
          const prov = svgProv(at(`/weeks/*/${field}`, rule), `${view} axis`, label);
          return (
            <g key={p}>
              <line
                x1="60"
                x2="730"
                y1={y(lo + p * spread)}
                y2={y(lo + p * spread)}
                stroke="#262b31"
              />
              <text x="48" y={y(lo + p * spread) + 4} textAnchor="end" {...prov.attrs}>
                <title>{prov.title}</title>
                {label}
              </text>
            </g>
          );
        })}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#f0a929" strokeWidth="2" />
        ))}
        {[
          [60, "start", 0],
          [730, "end", rows.length - 1],
        ].map(([x, anchor, i]) => {
          const prov = svgProv(at(`/weeks/${i}/week`), "Week", rows[i as number].week);
          return (
            <text key={i} x={x} y="258" textAnchor={anchor as "start" | "end"} {...prov.attrs}>
              <title>{prov.title}</title>
              {rows[i as number].week}
            </text>
          );
        })}
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
  const factor = factorSeries(ticker);
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
  const weeks = series.data?.weeks ?? [];
  const last = weeks.at(-1);
  const lastAt = weeks.length - 1;
  const watching = watchlist.includes(ticker);
  // Every number below is read from the checked artifact (or the manifest) and names it.
  const at = (ptr: string, formula?: string) =>
    replayOrigin(entry, ptr, formula ? { formula } : {});
  const manifestAt = (ptr: string) =>
    replayOrigin({ url: "/replay-manifest.json", sha256: null, as_of: manifest.data?.as_of }, ptr, {
      note: "The checked Replay manifest is the root of the Replay check; it names the artifact digests.",
    });
  const V = (ptr: string, v: number | null | undefined, display: string, label: string) => (
    <Num n={numOf(at(ptr), v)} display={display} label={label} className="vx-inherit" />
  );
  const D = (ptr: string, v: string | null | undefined, display: string, label: string) => (
    <Stamp s={ref(at(ptr), v)} display={display} label={label} className="vx-inherit" />
  );
  return (
    <ProvenanceProvider>
      <nav className="mk-replay-views" aria-label="Public market factors">
        <span className="mk-note">Public research · market factor, not a ticker</span>
        {FACTOR_SERIES.map((s) => (
          <Link
            key={s.id}
            {...overviewTarget(s.id)}
            aria-current={s.id === ticker ? "page" : undefined}
          >
            {s.name} · {s.source}
          </Link>
        ))}
      </nav>
      <Panel
        title={factor ? `${factor.name} · market factor, not a ticker` : (asset?.name ?? ticker)}
        meta={
          <Chip>Replay · {entry?.scope === "TEST_ONLY" ? "TEST_ONLY" : "derived results"}</Chip>
        }
      >
        <div className="mk-replay-identity">
          <span>
            {asset
              ? `${asset.exchange} · ${asset.code} · ${asset.currency}`
              : factor
                ? `${factor.country} · market excess returns (Rm-Rf) · dimensionless`
                : "Listing metadata unavailable"}
          </span>
          <span>
            {asset
              ? `Regular cash session ${asset.session}`
              : factor
                ? "Daily research release · fixed revised vintage"
                : "Session unavailable"}
          </span>
          <span>
            {entry?.as_of || manifest.data?.as_of ? (
              <Stamp
                s={ref(
                  manifestAt(entry?.as_of ? `/artifacts/market:${ticker}/as_of` : "/as_of"),
                  entry?.as_of ?? manifest.data?.as_of,
                )}
                display={stamp(entry?.as_of ?? manifest.data?.as_of)}
                label="Artifact as of"
                className="vx-inherit"
              />
            ) : (
              stamp(null)
            )}
          </span>
        </div>
        {series.data?.method.hmm?.source_coverage && (
          <p className="mk-line">
            {D(
              "/method/hmm/source_coverage/market_start",
              series.data.method.hmm.source_coverage.market_start,
              series.data.method.hmm.source_coverage.market_start,
              "Coverage start",
            )}
            –
            {D(
              "/method/hmm/source_coverage/market_end",
              series.data.method.hmm.source_coverage.market_end,
              series.data.method.hmm.source_coverage.market_end,
              "Coverage end",
            )}{" "}
            ·{" "}
            {V(
              "/method/hmm/source_coverage/observations",
              series.data.method.hmm.source_coverage.observations,
              series.data.method.hmm.source_coverage.observations.toLocaleString(),
              "Daily returns",
            )}{" "}
            daily returns · captured{" "}
            {D(
              "/method/hmm/source_coverage/latest_availability",
              series.data.method.hmm.source_coverage.latest_availability,
              stamp(series.data.method.hmm.source_coverage.latest_availability),
              "Latest availability",
            )}
          </p>
        )}
        {factor && entry && (
          // Attribution and citation prose from the manifest licence (sealed SourceCredit).
          <div className="px-5 py-3" data-num-exempt="copy">
            <SourceCredit licence={entry.licence} />
          </div>
        )}
        <div className="mk-replay-kpis">
          <div>
            <span>Relative performance</span>
            <b>
              {last
                ? V(
                    `/weeks/${lastAt}/relative_performance`,
                    last.relative_performance,
                    num(last.relative_performance),
                    "Relative performance",
                  )
                : "Unavailable"}
            </b>
            <small data-num-exempt="copy">First admitted week = 100</small>
          </div>
          <div>
            <span>Drawdown</span>
            <b>
              {last
                ? V(`/weeks/${lastAt}/drawdown`, last.drawdown, pct(last.drawdown), "Drawdown")
                : "Unavailable"}
            </b>
            <small>Daily peak, sampled weekly</small>
          </div>
          <div>
            <span>Realized volatility</span>
            <b>
              {last?.realized_volatility != null
                ? V(
                    `/weeks/${lastAt}/realized_volatility`,
                    last.realized_volatility,
                    pct(last.realized_volatility),
                    "Realized volatility",
                  )
                : "Unavailable"}
            </b>
            <small data-num-exempt="copy">20 sessions · annualized</small>
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
            <WeeklyChart series={series.data} view={view} at={at} />
          ) : (
            <div className="mk-replay-unavailable" role="status">
              <b>{view} unavailable</b>
              <p>{reason}</p>
              <p>
                Ticker-level views stay Live-only. Open the US or India market factor above for
                checked public weekly research.
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
        <Panel
          title="Watchlist"
          meta={
            <Chip>
              <span data-num-exempt="input">{watchlist.length} instruments</span>
            </Chip>
          }
        >
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
        <p className="mk-line" data-num-exempt="copy">
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
                {series.data.weeks.slice(-52).map((w, k, shown) => {
                  const i = weeks.length - shown.length + k;
                  return (
                    <tr key={w.week}>
                      <td>{D(`/weeks/${i}/week`, w.week, w.week, "Week")}</td>
                      <td>
                        {V(
                          `/weeks/${i}/relative_performance`,
                          w.relative_performance,
                          num(w.relative_performance),
                          `Relative performance ${w.week}`,
                        )}
                      </td>
                      <td>
                        {V(
                          `/weeks/${i}/drawdown`,
                          w.drawdown,
                          pct(w.drawdown),
                          `Drawdown ${w.week}`,
                        )}
                      </td>
                      <td>
                        {w.realized_volatility == null
                          ? pct(null)
                          : V(
                              `/weeks/${i}/realized_volatility`,
                              w.realized_volatility,
                              pct(w.realized_volatility),
                              `Realized volatility ${w.week}`,
                            )}
                      </td>
                      <td>{w.regime ?? "Unavailable"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mk-line">
            <span data-num-exempt="copy">Latest 52 weeks shown.</span>{" "}
            <Num
              n={numOf(at("/weeks", "count of /weeks"), series.data.weeks.length)}
              display={series.data.weeks.length.toLocaleString()}
              label="Weeks in artifact"
              className="vx-inherit"
            />{" "}
            weeks in the checked full-history artifact.
          </p>
        </Panel>
      )}
    </ProvenanceProvider>
  );
}
