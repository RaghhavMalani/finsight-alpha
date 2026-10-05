import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import type { MarketRegimeArtifact, SeasonCell } from "@/dynamics/market-regime-contracts";
import { RegimeLandscape } from "@/dynamics/RegimeLandscape";
import { marketRegimeQuery, marketRegimeCatalogQuery } from "@/dynamics/query";
import { LoadingState, StatusMark, UnavailableState } from "@/forge/shared/SurfacePrimitives";

const num = (n: number | null | undefined, digits = 3) =>
  n == null ? "UNAVAILABLE" : n.toFixed(digits);
const pct = (n: number | null | undefined) =>
  n == null ? "UNAVAILABLE" : (n * 100).toFixed(1) + "%";
const words = (value: string) => value.replaceAll("_", " ");

export function MarketRegimeLab() {
  const [world, setWorld] = useState("demo-full");
  const [asOf, setAsOf] = useState<string | undefined>();
  const catalog = useQuery(marketRegimeCatalogQuery);
  const query = useQuery(marketRegimeQuery(world, asOf));
  const artifact = query.data;
  return (
    <article
      className="min-w-0 border border-[#25313A] bg-[#080C0F] text-[#DBE2E7]"
      aria-labelledby="regime-lab-title"
    >
      <header className="border-b border-[#25313A] px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#8E9AA3]">
              D0.4.2 / integrated research analytics
            </p>
            <h2 id="regime-lab-title" className="mt-2 text-2xl font-semibold tracking-tight">
              Market Regime Intelligence
            </h2>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#8E9AA3]">
              Volatility, seasonality, factors, momentum and event pressure in one inspectable
              state. Product analytics, not a new market certification.
            </p>
          </div>
          <StatusMark status="ABSTAIN" label="EXPERIMENTAL / NO ALPHA CLAIM" />
        </div>
        <div className="mt-4 grid gap-3 font-mono text-[10px] text-[#A9B5BE] sm:grid-cols-2">
          <label className="grid gap-2">
            Input world
            <select
              aria-label="Regime input world"
              value={world}
              onChange={(e) => {
                setWorld(e.target.value);
                setAsOf(undefined);
              }}
              className="min-w-0 border border-[#37454F] bg-[#11191E] px-2 py-2 text-[#DAE1E5]"
            >
              {(
                catalog.data?.worlds ?? [
                  { id: "demo-full", label: "Full synthetic integration demo", available: true },
                  {
                    id: "demo-sparse",
                    label: "Sparse demo / missing-data control",
                    available: true,
                  },
                ]
              ).map((w) => (
                <option key={w.id} value={w.id} disabled={!w.available}>
                  {w.label}
                  {w.available ? "" : " / UNAVAILABLE"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            Point-in-time snapshot
            <select
              aria-label="Point-in-time regime snapshot"
              value={asOf ?? ""}
              onChange={(e) => setAsOf(e.target.value || undefined)}
              className="min-w-0 border border-[#37454F] bg-[#11191E] px-2 py-2 text-[#DAE1E5]"
            >
              <option value="">Latest published dataset snapshot</option>
              {artifact?.timeline.slice(1).map((p) => (
                <option key={p.observed_at} value={p.available_at}>
                  {p.observed_at.slice(0, 10)} / {words(p.regime)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-[#85939D]">
          Local PIT mode requires a versioned dataset with explicit observation/publication times.
          No provider downloads or missing-data fabrication occur here.
        </p>
        {catalog.error ? (
          <p className="mt-2 text-[10px] text-[#DAAA78]">
            Input catalog unavailable: {catalog.error.message}
          </p>
        ) : null}
      </header>
      {query.isPending ? (
        <LoadingState label="Point-in-time regime computation" />
      ) : query.error || !artifact ? (
        <UnavailableState
          title="Regime evidence unavailable / failed closed"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <RegimeDashboard key={artifact.artifact_hash} artifact={artifact} />
      )}
    </article>
  );
}

function RegimeDashboard({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const current = a.current;
  const vectorLabels = {
    V: "Volatility stress",
    L: "Liquidity stress",
    M: "Momentum / trend",
    H: "Event excitation",
    F: "Factor exposure",
    S: "Macro stress",
    C: "Correlation magnitude",
  };
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <section
        className={
          "border px-4 py-3 " +
          (a.world.scope === "SYNTHETIC_DEMO"
            ? "border-[#66512B] bg-[#19150C]"
            : "border-[#36575E] bg-[#0D191C]")
        }
      >
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-mono text-[11px] font-semibold tracking-wide text-[#D9BD83]">
            {a.world.scope === "SYNTHETIC_DEMO"
              ? "SYNTHETIC DEMO / NOT MARKET HISTORY"
              : "USER-SUPPLIED PIT DATA / NOT LIVE CERTIFICATION"}
          </h3>
          <span className="font-mono text-[10px] text-[#A3B0B8]">
            {a.world.ticker} / {a.world.observations} published sessions
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-[#A7A18F]">
          {a.world.source}. {a.world.calendar_note}.
        </p>
        <p className="mt-1 break-all font-mono text-[9px] text-[#9AABAF]">
          AS OF {a.world.as_of} / trading-time display {a.world.timezone}
        </p>
      </section>
      <section aria-labelledby="regime-now" className="border border-[#25313A] bg-[#0B1115]">
        <header className="flex flex-wrap justify-between gap-2 border-b border-[#25313A] px-4 py-3">
          <h3
            id="regime-now"
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#CDD6DC]"
          >
            Regime now / {words(current.regime)}
          </h3>
          <span className="font-mono text-[9px] text-[#A0ADB6]">
            STATE VECTOR {current.vector_complete ? "COMPLETE" : "PARTIAL / MISSING INPUTS"}
          </span>
        </header>
        <dl className="grid grid-cols-2 gap-px bg-[#25313A] lg:grid-cols-4">
          {Object.entries(vectorLabels).map(([key, label]) => (
            <Metric
              key={key}
              label={label}
              value={num(current.vector[key as keyof typeof current.vector])}
            />
          ))}
          <Metric
            label={"Fracture / " + words(current.fracture.state)}
            value={num(current.fracture.score)}
            accent
          />
        </dl>
      </section>
      <RegimeLandscape artifact={a} />
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <VolatilityPanel artifact={a} />
        <SeasonalityPanel artifact={a} />
      </div>
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <FactorPanel artifact={a} />
        <MomentumPanel artifact={a} />
      </div>
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <EventMacroPanel artifact={a} />
        <FracturePanel artifact={a} />
      </div>
      <section className="border border-[#25313A] px-4 py-4">
        <details>
          <summary className="cursor-pointer font-mono text-[10px] text-[#BFCBD3]">
            Evidence ledger / input identity / method boundaries
          </summary>
          <dl className="mt-4 space-y-2 break-all font-mono text-[9px] text-[#8B9CA7]">
            <Pair label="Input address" value={a.world.input_hash} />
            <Pair label="Projection address" value={a.artifact_hash} />
            <Pair
              label="Revision / price basis"
              value={a.world.revision + " / " + a.world.price_basis}
            />
            <Pair label="Market / causal claim eligible" value="FALSE / FALSE" />
          </dl>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-[10px] leading-5 text-[#8B9CA7]">
            {a.limitations.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <pre className="mt-3 max-h-48 overflow-auto border border-[#26333C] p-3 text-[9px] text-[#9BAEB9]">
            {JSON.stringify(a.policy, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  );
}

function Panel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="min-w-0 border border-[#25313A] bg-[#0A1014]" aria-labelledby={id}>
      <header className="border-b border-[#25313A] px-4 py-3">
        <p className="font-mono text-[8px] uppercase tracking-[.14em] text-[#8E9FA9]">{kicker}</p>
        <h3 id={id} className="mt-1 text-sm font-semibold text-[#DAE2E7]">
          {title}
        </h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 bg-[#0B1115] px-3 py-3">
      <dt className="font-mono text-[8px] uppercase tracking-wider text-[#8F9CA5]">{label}</dt>
      <dd
        className={
          "mt-2 break-words font-mono text-lg tabular-nums " +
          (accent ? "text-[#E6BE73]" : "text-[#D3DDE3]")
        }
      >
        {value}
      </dd>
    </div>
  );
}
function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-[#8D9DA7]">{label}</dt>
      <dd className="text-[#CED9E0]">{value}</dd>
    </div>
  );
}

function LineChart({
  series,
  label,
  unit,
}: {
  series: Array<{ name: string; color: string; values: Array<number | null | undefined> }>;
  label: string;
  unit: string;
}) {
  const data = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!data.length)
    return (
      <p className="py-6 font-mono text-[10px] text-[#9AABAF]">
        CHART UNAVAILABLE / no aligned observations
      </p>
    );
  const lo = Math.min(...data),
    hi = Math.max(...data),
    span = Math.max(1e-7, hi - lo);
  const size = Math.max(...series.map((s) => s.values.length));
  return (
    <div>
      <svg viewBox="0 0 600 170" className="w-full" role="img" aria-label={label}>
        <line x1="35" y1="145" x2="585" y2="145" stroke="#34444E" />
        <line x1="35" y1="15" x2="35" y2="145" stroke="#34444E" />
        <text x="40" y="12" fill="#9DB0BA" fontSize="9" fontFamily="monospace">
          {unit} / {num(lo)} — {num(hi)}
        </text>
        {series.map((s) => {
          let d = "",
            active = false;
          s.values.forEach((v, i) => {
            if (v == null) {
              active = false;
              return;
            }
            const x = 35 + (i / Math.max(1, size - 1)) * 550,
              y = 145 - ((v - lo) / span) * 120;
            d += (active ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1) + " ";
            active = true;
          });
          return <path key={s.name} d={d} stroke={s.color} strokeWidth="1.6" fill="none" />;
        })}
      </svg>
      <div className="flex flex-wrap gap-4 font-mono text-[9px]">
        {series.map((s) => (
          <span key={s.name} style={{ color: s.color }}>
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function VolatilityPanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const vol = a.current.volatility;
  const c = vol.components;
  return (
    <Panel
      title="Volatility Clustering Detector"
      kicker={"Observable dependence / " + words(vol.state)}
    >
      <LineChart
        label="PIT realized and EWMA volatility over the last 120 sessions"
        unit="Annualized decimal vol"
        series={[
          {
            name: "REALIZED 20",
            color: "#71B6B9",
            values: a.volatility_history.map((p) => p.components.realized_vol),
          },
          {
            name: "EWMA .94",
            color: "#DCB46A",
            values: a.volatility_history.map((p) => p.components.ewma_vol),
          },
        ]}
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 font-mono text-[9px]">
        <Pair label="Realized / 5 sessions" value={pct(c.rv_5)} />
        <Pair label="20 / 60 sessions" value={pct(c.rv_20) + " / " + pct(c.rv_60)} />
        <Pair
          label="Rolling variance"
          value={c.rolling_variance == null ? "UNAVAILABLE" : c.rolling_variance.toExponential(3)}
        />
        <Pair label="Vol of vol" value={num(c.vol_of_vol)} />
        <Pair label="AC / absolute returns" value={num(c.abs_return_ac)} />
        <Pair label="AC / squared returns" value={num(c.squared_return_ac)} />
        <Pair label="Persistence" value={pct(c.persistence)} />
        <Pair label="Shock / break ratio" value={num(c.shock_score) + " / " + num(c.break_ratio)} />
        <Pair label="Cluster score" value={num(vol.cluster_score)} />
        <Pair label="Window sufficiency" value={pct(vol.confidence)} />
      </dl>
      <div className="mt-3 border-t border-[#26323B] pt-3 font-mono text-[9px] text-[#8C9CA6]">
        {Object.entries(vol.cluster_contributions ?? {}).map(([name, value]) => (
          <p key={name}>
            {words(name)} / {num(value)}
          </p>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-5 text-[#83959F]">
        VOL CLUSTER requires persistent absolute/squared-return dependence, not just a large candle.
        Sufficiency is not a calibrated probability.
      </p>
    </Panel>
  );
}

function FactorPanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const f = a.current.factors;
  return (
    <Panel title="Factor Neutrality Check" kicker={"Prior-only regression / " + f.status}>
      <p className="mb-3 font-mono text-[9px] text-[#A0AFB8]">
        Aligned training n={f.n} / κ={num(f.condition, 1)} / α={num(f.alpha, 5)}
      </p>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Factor loadings table"
      >
        <table className="w-full min-w-[570px] font-mono text-[9px] text-[#BAC6CE]">
          <caption className="sr-only">
            Rolling factor exposures and approximate HAC uncertainty
          </caption>
          <thead>
            <tr className="border-b border-[#35414A] text-[#8FA0AA]">
              {["Factor", "β", "SE", "t", "Exposure z", "Stability", "Status"].map((name) => (
                <th key={name} className="px-2 py-2 text-left font-normal">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((row) => (
              <tr key={row.factor} className="border-b border-[#202B33]">
                <th className="px-2 py-2 text-left">{row.factor}</th>
                <td className="px-2">{num(row.beta)}</td>
                <td className="px-2">{num(row.standard_error)}</td>
                <td className="px-2">{num(row.t_stat)}</td>
                <td className="px-2">{num(row.exposure_z)}</td>
                <td className="px-2">{num(row.stability)}</td>
                <td
                  className={
                    "px-2 " + (row.status === "EXPOSED" ? "text-[#E1B874]" : "text-[#9AAFBA]")
                  }
                >
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3 font-mono text-[9px] text-[#9EB0B9]">
        <summary className="cursor-pointer">Rolling loading histories</summary>
        {f.rows.map((row) => (
          <p key={row.factor} className="mt-2 break-words">
            {row.factor} /{" "}
            {row.rolling_beta.length
              ? row.rolling_beta.map((v) => num(v, 2)).join(" · ")
              : "UNAVAILABLE"}
          </p>
        ))}
      </details>
      <h4 className="mb-2 mt-5 font-mono text-[10px] text-[#BDCDD5]">
        Raw vs factor-explained vs residual / unit-notional attribution
      </h4>
      <LineChart
        label="Cumulative arithmetic strategy, factor-explained and residual returns"
        unit="Additive decimal return"
        series={[
          { name: "RAW", color: "#B5D2E0", values: a.factor_pnl.map((p) => p.raw) },
          {
            name: "FACTOR EXPLAINED",
            color: "#D7B975",
            values: a.factor_pnl.map((p) => p.explained),
          },
          { name: "RESIDUAL", color: "#66B9A9", values: a.factor_pnl.map((p) => p.residual) },
        ]}
      />
      <p className="mt-3 text-[10px] leading-5 text-[#8597A2]">
        {f.covariance_method}. Neutrality tolerance is ±0.10 beta; missing or collinear factors
        remain UNIDENTIFIABLE.
      </p>
      <p className="mt-2 text-[9px] leading-5 text-[#8597A2]">{a.factor_pnl_note}</p>
    </Panel>
  );
}

function SeasonalityPanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const season = a.seasonality;
  const [metric, setMetric] = useState("realized_vol");
  const [selectedKey, setSelectedKey] = useState("");
  const key = (c: SeasonCell) => c.weekday + "/" + c.bucket;
  const cells = new Map(season.cells.map((c) => [key(c), c]));
  const selected = cells.get(selectedKey) ?? season.cells[0];
  const selectedMetric = selected?.metrics[metric];
  const buckets = [...new Set(season.cells.map((c) => c.bucket))].sort();
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => season.cells.some((c) => c.weekday === d));
  const labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return (
    <Panel title="Intraday Seasonality Map" kicker="Prior-session / weekday × local bucket">
      <label className="mb-3 grid gap-2 font-mono text-[9px] text-[#A0B0BA]">
        Seasonality measure
        <select
          aria-label="Seasonality measure"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="w-full border border-[#33434D] bg-[#11191E] p-2"
        >
          {season.metrics.map((m) => (
            <option key={m} value={m}>
              {words(m).toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      {season.cells.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-separate border-spacing-1 font-mono text-[8px]">
            <caption className="mb-2 text-left text-[#8B9EA8]">
              Color = historical same-bucket percentile / gray = unavailable
            </caption>
            <thead>
              <tr>
                <th className="text-left text-[#8A9BA5]">DAY</th>
                {buckets.map((b) => (
                  <th key={b} className="font-normal text-[#8A9BA5]">
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekdays.map((day) => (
                <tr key={day}>
                  <th className="text-left text-[#A4B5BF]">{labels[day]}</th>
                  {buckets.map((bucket) => {
                    const cell = cells.get(day + "/" + bucket);
                    const m = cell?.metrics[metric];
                    const p = m?.status === "AVAILABLE" ? m.percentile : null;
                    const color =
                      p == null
                        ? "#1E272D"
                        : "hsl(" +
                          (185 - p * 145).toFixed(0) +
                          " 38% " +
                          (20 + p * 18).toFixed(0) +
                          "%)";
                    return (
                      <td key={bucket}>
                        <button
                          type="button"
                          disabled={!cell}
                          aria-label={
                            labels[day] +
                            " " +
                            bucket +
                            " " +
                            words(metric) +
                            " " +
                            (p == null ? "unavailable" : pct(p) + " percentile")
                          }
                          onClick={() => cell && setSelectedKey(key(cell))}
                          className={
                            "relative h-9 w-full min-w-7 border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E3C079] " +
                            (selected && key(selected) === day + "/" + bucket
                              ? "border-[#E3C079]"
                              : "border-transparent")
                          }
                          style={{ backgroundColor: color }}
                          title={m ? "n=" + m.observations + " / z=" + num(m.z) : "No cell"}
                        >
                          <span className="sr-only">{p == null ? "UNAVAILABLE" : pct(p)}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 font-mono text-[10px] text-[#9AADAF]">INTRADAY DATA UNAVAILABLE</p>
      )}
      {selected && selectedMetric ? (
        <div className="mt-3 border border-[#2A3943] p-3">
          <h4 className="font-mono text-[10px] text-[#D0DEE6]">
            {labels[selected.weekday]} / {selected.bucket} / {selectedMetric.status}
          </h4>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[9px]">
            <Pair label="Observations" value={String(selectedMetric.observations)} />
            <Pair label="Current" value={num(selectedMetric.current)} />
            <Pair label="Historical mean" value={num(selectedMetric.mean)} />
            <Pair
              label="Median / MAD"
              value={num(selectedMetric.median) + " / " + num(selectedMetric.mad)}
            />
            <Pair label="Percentile" value={pct(selectedMetric.percentile)} />
            <Pair label="Robust deviation z" value={num(selectedMetric.z)} />
          </dl>
          <p className="mt-3 break-all font-mono text-[8px] leading-4 text-[#8597A2]">
            Current {selected.current_at} / baseline through{" "}
            {selected.baseline_end ?? "UNAVAILABLE"}
          </p>
        </div>
      ) : null}
      <p className="mt-3 text-[9px] leading-5 text-[#889CA7]">
        {season.baseline_rule}. {season.timezone} / {season.bucket_minutes} minute buckets.
      </p>
      <p className="mt-1 text-[9px] leading-5 text-[#889CA7]">
        {metric === "event_intensity"
          ? season.event_unit
          : metric === "realized_vol"
            ? season.vol_unit
            : "Spread in bps; volume in source units; liquidity is source supplied, not inferred order-book depth."}
      </p>
    </Panel>
  );
}

function MomentumPanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  return (
    <Panel
      title="Regime-Dependent Momentum"
      kicker="Lagged signal / conditional descriptive sample"
    >
      <dl className="grid grid-cols-2 gap-3 font-mono text-[9px]">
        {Object.entries(a.current.momentum.horizons).map(([h, value]) => (
          <Pair key={h} label={h + "-session return"} value={pct(value)} />
        ))}
      </dl>
      <p className="mt-3 font-mono text-[10px] text-[#D2BC88]">
        Weighted signal {num(a.current.momentum.signal, 4)} / weights .10 / .20 / .30 / .40
      </p>
      <div
        className="mt-4 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Conditional momentum table"
      >
        <table className="w-full min-w-[620px] font-mono text-[9px] text-[#BBCAD3]">
          <caption className="sr-only">
            Momentum sample and performance conditional on prior-session regime
          </caption>
          <thead>
            <tr className="border-b border-[#35414A] text-[#8DA0AC]">
              {[
                "Regime / status",
                "n",
                "Sample support",
                "Mean signal",
                "Mean return",
                "Hit rate",
                "Sharpe",
                "Turnover",
                "Drawdown",
              ].map((name) => (
                <th key={name} className="px-2 py-2 text-left font-normal">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.momentum_regimes.map((row) => (
              <tr key={row.regime} className="border-b border-[#223039]">
                <th className="px-2 py-3 text-left font-normal">
                  <span className="block text-[#D0DEE6]">{words(row.regime)}</span>
                  <span className="mt-1 block text-[8px] text-[#9DAEAF]">{row.status}</span>
                </th>
                <td className="px-2">{row.n}</td>
                <td className="px-2">{pct(row.confidence)}</td>
                <td className="px-2">{pct(row.mean_signal)}</td>
                <td className="px-2">{pct(row.mean_return)}</td>
                <td className="px-2">{pct(row.hit_rate)}</td>
                <td className="px-2">{num(row.sharpe, 2)}</td>
                <td className="px-2">{num(row.turnover)}</td>
                <td className="px-2">{pct(row.drawdown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-[#8DA0AA]">
        Fewer than 30 observations: hit rate, Sharpe, turnover and drawdown remain unresolved.
        Larger samples are descriptive, not validated alpha. Eligible sample support is min(n / 120,
        1), not a calibrated probability.
      </p>
      <p className="mt-2 text-[9px] leading-5 text-[#8DA0AA]">{a.momentum_regimes[0]?.note}</p>
    </Panel>
  );
}

function EventMacroPanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const e = a.current.events,
    macro = a.current.macro;
  return (
    <Panel
      title="Event & Macro Inputs"
      kicker="Partially characterized subsystem / explicit vintages"
    >
      <h4 className="font-mono text-[10px] text-[#C4D8E2]">
        Aggregate Hawkes diagnostics / {e.status}
      </h4>
      <dl className="mt-3 space-y-2 font-mono text-[9px]">
        <Pair label="Excitation pressure" value={num(e.pressure)} />
        <Pair label="Conditional intensity / hour" value={num(e.intensity_per_calendar_hour)} />
        <Pair
          label="Session event count / burst z"
          value={num(e.event_count, 0) + " / " + num(e.burst_z)}
        />
        <Pair
          label="Estimated rho / criticality"
          value={num(e.fitted_rho) + " / " + e.criticality_status}
        />
        <Pair label="Training available as of" value={e.training_as_of ?? "UNAVAILABLE"} />
        <Pair label="Causal graph / edge confidence" value="NOT TRUSTED / NOT TRUSTED" />
      </dl>
      <p className="mt-3 text-[9px] leading-5 text-[#8CA1AD]">
        {e.method}. {e.time_basis}. Calendar seasonality and boundary bias remain limitations; event
        pressure is descriptive, not causal.
      </p>
      <div className="mt-4 border-t border-[#2B3C47] pt-4">
        <h4 className="font-mono text-[10px] text-[#C4D8E2]">Macro stress / {macro.status}</h4>
        <p className="mt-2 font-mono text-[10px] text-[#DBC58D]">
          Supplied-series stress {num(macro.score)}
        </p>
        {macro.series.length ? (
          macro.series.map((row) => (
            <div key={row.series} className="mt-3 border border-[#283842] px-3 py-2">
              <h5 className="font-mono text-[9px] text-[#BECDD6]">{row.series}</h5>
              <p className="mt-1 font-mono text-[9px] text-[#90A3AE]">
                raw {num(row.value)} / z {num(row.z)} / n {row.observations}
              </p>
              <p className="mt-1 break-all text-[9px] leading-4 text-[#859BA8]">
                Observed {row.observed_at} / available {row.available_at} / {row.revision} /{" "}
                {words(row.direction)}
              </p>
            </div>
          ))
        ) : (
          <p className="mt-3 text-[10px] text-[#A8AFAD]">
            UNAVAILABLE / no PIT macro releases supplied
          </p>
        )}
      </div>
    </Panel>
  );
}

function FracturePanel({ artifact: a }: { artifact: MarketRegimeArtifact }) {
  const f = a.current.fracture;
  return (
    <Panel title="Regime Fracture Index" kicker={"Component change ledger / " + words(f.state)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-3xl text-[#E0BC75]">{num(f.score)}</p>
        <p className="font-mono text-[9px] text-[#93A9B4]">Evidence coverage {pct(f.coverage)}</p>
      </div>
      <div className="mt-5 space-y-4">
        {Object.entries(f.contributions).map(([name, value]) => (
          <div key={name}>
            <dl className="flex justify-between gap-3 font-mono text-[10px]">
              <dt className="text-[#A5B8C2]">{words(name)}</dt>
              <dd className="text-[#DBE4E9]">{num(value, 5)}</dd>
            </dl>
            <div className="mt-2 h-1.5 bg-[#1A2831]">
              <div
                className="h-full bg-[#9A7D42]"
                style={{
                  width: value == null ? "0%" : Math.min(100, value * 600).toFixed(1) + "%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[10px] leading-5 text-[#8FA4B0]">
        Equal 1/6 weights on absolute changes in volatility, correlation, liquidity, event pressure,
        exposure magnitude and macro state. Factor magnitude is an exposure proxy, not measured
        crowding.
      </p>
      <p className="mt-2 text-[9px] leading-5 text-[#8FA4B0]">
        An incomplete vector has no full fracture score. Partial contribution sum{" "}
        {num(f.available_contribution_sum, 5)} is shown only as an accounting subtotal.
      </p>
    </Panel>
  );
}
