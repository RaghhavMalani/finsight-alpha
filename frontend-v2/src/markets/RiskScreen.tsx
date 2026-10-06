import { Link, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Histogram, LineChart } from "./charts";
import { normalizeTicker, type RiskDashboard, type VarMethod } from "./contracts";
import { int, money, num, pct, stamp } from "./format";
import {
  useFactors,
  useMonteCarlo,
  usePortfolio,
  useRiskDashboard,
  type Holding,
  type MonteCarloInput,
} from "./queries";
import { BarList, Chip, Kpis, Loading, Note, Panel, Unavailable } from "./ui";

const AMBER = "var(--primary)",
  CYAN = "var(--glow-cyan)",
  VIOLET = "var(--glow-violet)",
  DOWN = "var(--down)";

export default function RiskScreen() {
  const { ticker } = useSearch({ from: "/markets" });
  const dash = useRiskDashboard(ticker);
  return (
    <div className="mk-grid">
      {dash.isPending ? (
        <Panel title={`Risk profile · ${ticker}`} className="mk-span">
          <Loading label="the risk profile" />
        </Panel>
      ) : dash.isError ? (
        <Panel title={`Risk profile · ${ticker}`} className="mk-span">
          <Unavailable what="Risk profile" error={dash.error} retry={() => void dash.refetch()} />
        </Panel>
      ) : (
        <Dashboard d={dash.data} />
      )}
      <MonteCarloPanel ticker={ticker} />
      <FactorsPanel ticker={ticker} />
      <PortfolioPanel key={ticker} ticker={ticker} />
      <p className="mk-line mk-span">
        Positions and hedges live in the <Link to="/risk">paper-book desk</Link>, which values the
        book only at quoted marks.
      </p>
    </div>
  );
}

const METHODS: [VarMethod, string][] = [
  ["historical", "Historical"],
  ["parametric", "Parametric (Gaussian)"],
  ["cornish_fisher", "Cornish-Fisher"],
  ["monte_carlo", "Monte Carlo (Gaussian)"],
];

function Dashboard({ d }: { d: RiskDashboard }) {
  const h = d.headline;
  const v95 = d.var_table.find((r) => r.confidence === 0.95);
  const v99 = d.var_table.find((r) => r.confidence === 0.99);
  return (
    <>
      <Panel
        title={`Risk profile · ${d.ticker}`}
        className="mk-span"
        meta={
          <>
            <Chip>Daily closes through {d.as_of}</Chip>
            <Chip>{int(d.n_days)} returns</Chip>
            <Chip tone={d.benchmark_available ? "plain" : "warn"}>
              Benchmark {d.benchmark}
              {d.benchmark_available ? "" : " unavailable"}
            </Chip>
          </>
        }
      >
        <Kpis
          items={[
            { label: "Last close", value: money(h.last) },
            { label: "Annual vol", value: pct(h.ann_vol, 1) },
            { label: "EWMA vol (λ 0.94)", value: pct(h.ewma_vol, 1) },
            { label: "Max drawdown", value: pct(h.max_drawdown, 1), tone: "down" },
            { label: "Sharpe", value: num(h.sharpe) },
            { label: "Sortino", value: num(h.sortino) },
            { label: `Beta vs ${d.benchmark} (120d)`, value: num(h.beta) },
            { label: "Skew", value: num(h.skew) },
            { label: "Excess kurtosis", value: num(h.kurtosis) },
            { label: "Up days", value: pct(h.hit_rate, 1) },
          ]}
        />
      </Panel>

      <Panel title="Value at risk · one day" meta={<Chip>Loss as a fraction of value</Chip>}>
        <div className="mk-table-wrap">
          <table className="mk-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">VaR 95</th>
                <th scope="col">CVaR 95</th>
                <th scope="col">VaR 99</th>
                <th scope="col">CVaR 99</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{pct(v95?.[key].var)}</td>
                  <td>{pct(v95?.[key].cvar)}</td>
                  <td>{pct(v99?.[key].var)}</td>
                  <td>{pct(v99?.[key].cvar)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">10-day (Gaussian, √t)</th>
                <td>{pct(v95?.var_10d)}</td>
                <td>—</td>
                <td>{pct(v99?.var_10d)}</td>
                <td>—</td>
              </tr>
              <tr>
                <th scope="row">Historical, on {money(d.notional, 0)}</th>
                <td>{money(v95?.dollar_var_1d, 0)}</td>
                <td>—</td>
                <td>{money(v99?.dollar_var_1d, 0)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note>
          Historical uses the {int(d.n_days)} observed daily returns. Parametric and Monte Carlo
          assume Gaussian returns with the sample mean and standard deviation; Cornish-Fisher
          adjusts the quantile for skew and kurtosis. CVaR is the mean loss beyond VaR. A dash means
          the method does not produce that number.
        </Note>
      </Panel>

      <Panel title="Daily return distribution">
        <Histogram
          label={`Distribution of ${d.ticker} daily returns`}
          centers={d.return_hist.centers}
          counts={d.return_hist.counts}
          markers={[
            ...(v95?.historical.var != null ? [{ at: -v95.historical.var, label: "VaR 95" }] : []),
            ...(v99?.historical.var != null ? [{ at: -v99.historical.var, label: "VaR 99" }] : []),
          ]}
          xFormat={(v) => pct(v, 1)}
        />
        <Note>Bars left of the VaR 95 line are the historical tail.</Note>
      </Panel>

      <Panel title="Price and drawdown" className="mk-span">
        <div className="mk-pair">
          <LineChart
            label={`${d.ticker} close`}
            x={d.price.dates}
            series={[{ label: "Close", values: d.price.values, color: AMBER }]}
            yFormat={(v) => num(v, 0)}
          />
          <LineChart
            label={`${d.ticker} drawdown from running peak`}
            x={d.drawdown.dates}
            series={[{ label: "Drawdown", values: d.drawdown.values, color: DOWN }]}
            zero
            yFormat={(v) => pct(v, 0)}
          />
        </div>
      </Panel>

      <Panel title="Rolling volatility · annualized" className="mk-span">
        <LineChart
          label={`${d.ticker} rolling volatility`}
          x={d.rolling_vol.dates}
          series={[
            { label: "20-day", values: d.rolling_vol.v20, color: AMBER },
            { label: "60-day", values: d.rolling_vol.v60, color: CYAN },
            { label: "EWMA", values: d.rolling_vol.ewma, color: VIOLET, dashed: true },
          ]}
          yFormat={(v) => pct(v, 0)}
        />
      </Panel>

      <Panel title="Stress scenarios" meta={<Chip tone="warn">Estimates, not replays</Chip>}>
        <div className="mk-table-wrap">
          <table className="mk-table">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Shock</th>
                <th scope="col">Est. return</th>
                <th scope="col">On {money(d.notional, 0)}</th>
              </tr>
            </thead>
            <tbody>
              {d.stress_tests.map((s) => (
                <tr key={s.scenario}>
                  <th scope="row">
                    {s.scenario} <small>{s.window}</small>
                  </th>
                  <td>{s.shock}</td>
                  <td className="mk-down">{pct(s.est_return, 1)}</td>
                  <td>{money(s.est_dollar, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          Each estimate is the ticker's beta times the index move in that episode (the vol spike is
          −3σ of its own daily returns). It is not the ticker's actual return in the episode.
        </Note>
      </Panel>

      <Panel title="Worst windows and drawdown episodes">
        <div className="mk-table-wrap">
          <table className="mk-table">
            <thead>
              <tr>
                <th scope="col">Window</th>
                <th scope="col">Worst return</th>
                <th scope="col">On {money(d.notional, 0)}</th>
              </tr>
            </thead>
            <tbody>
              {d.worst_windows.map((w) => (
                <tr key={w.window}>
                  <th scope="row">{w.window}</th>
                  <td className="mk-down">{pct(w.worst_return, 1)}</td>
                  <td>{money(w.dollar, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mk-table">
            <thead>
              <tr>
                <th scope="col">Peak</th>
                <th scope="col">Trough</th>
                <th scope="col">Depth</th>
                <th scope="col">Recovery</th>
              </tr>
            </thead>
            <tbody>
              {d.drawdown_episodes.map((e) => (
                <tr key={e.peak}>
                  <td>{e.peak}</td>
                  <td>{e.trough}</td>
                  <td className="mk-down">{pct(e.depth, 1)}</td>
                  <td>{e.recovered ? `${e.recovery_days} d` : "not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Monte Carlo

const MC_DEFAULT: MonteCarloInput = { horizon_days: 63, n: 10_000, conf: 0.95, seed: 42 };

function MonteCarloPanel({ ticker }: { ticker: string }) {
  const [input, setInput] = useState(MC_DEFAULT);
  const [draft, setDraft] = useState({ h: "63", n: "10000", c: "95", seed: "42" });
  const [error, setError] = useState<string | null>(null);
  const mc = useMonteCarlo(ticker, input);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = {
      horizon_days: Math.round(Number(draft.h)),
      n: Math.round(Number(draft.n)),
      conf: Number(draft.c) / 100,
      seed: Math.round(Number(draft.seed)),
    };
    const bad = !(next.horizon_days >= 5 && next.horizon_days <= 756)
      ? "Horizon must be 5–756 trading days."
      : !(next.n >= 200 && next.n <= 50_000)
        ? "Paths must be 200–50,000."
        : !(next.conf > 0.5 && next.conf < 1)
          ? "Confidence must be between 50% and 100%."
          : !(next.seed >= 0)
            ? "Seed must be a non-negative integer."
            : null;
    setError(bad);
    if (!bad) setInput(next);
  };
  const m = mc.data;
  return (
    <Panel
      title={`Monte Carlo · ${ticker}`}
      className="mk-span"
      meta={
        m && (
          <>
            <Chip>{m.model_version}</Chip>
            <Chip tone="warn" title={m.quality.flags.join(", ")}>
              Quality {m.quality.status.toLowerCase()}: {m.quality.flags.length} flags
            </Chip>
            <Chip title={m.snapshot_id}>Snapshot {m.snapshot_id.slice(0, 10)}</Chip>
          </>
        )
      }
    >
      <form className="mk-form" onSubmit={submit}>
        {(
          [
            ["h", "Horizon (days)"],
            ["n", "Paths"],
            ["c", "Confidence %"],
            ["seed", "Seed"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="mk-field">
            <span>{label}</span>
            <input
              inputMode="numeric"
              value={draft[k]}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            />
          </label>
        ))}
        <button type="submit" className="mk-primary">
          Simulate
        </button>
      </form>
      {error && (
        <p className="mk-line mk-field-error" role="alert">
          {error}
        </p>
      )}
      {mc.isPending ? (
        <Loading label="the simulation" />
      ) : mc.isError ? (
        <Unavailable what="Monte Carlo" error={mc.error} retry={() => void mc.refetch()} />
      ) : (
        m && (
          <>
            <LineChart
              label={`Simulated ${m.ticker} price paths, percentiles by day`}
              x={m.fan.days}
              band={{ lo: m.fan.p5, hi: m.fan.p95, color: AMBER, label: "p5–p95" }}
              series={[
                { label: "p25", values: m.fan.p25, color: CYAN, dashed: true },
                { label: "Median", values: m.fan.p50, color: AMBER },
                { label: "p75", values: m.fan.p75, color: CYAN, dashed: true },
              ]}
              yFormat={(v) => num(v, 0)}
              xFormat={(v) => `day ${v}`}
              height={240}
            />
            <Kpis
              items={[
                { label: "Start (last close)", value: money(m.S0) },
                { label: "Median at horizon", value: money(m.summary.p50) },
                { label: "5th percentile", value: money(m.summary.p5) },
                { label: "95th percentile", value: money(m.summary.p95) },
                { label: "P(below start)", value: pct(m.summary.probability_of_loss, 1) },
                {
                  label: `VaR ${pct(m.risk.confidence_level, 0)} · ${m.horizon_days} d`,
                  value: pct(m.risk.monte_carlo_var, 1),
                  tone: "down",
                },
                {
                  label: `CVaR ${pct(m.risk.confidence_level, 0)} · ${m.horizon_days} d`,
                  value: pct(m.risk.monte_carlo_cvar, 1),
                  tone: "down",
                },
                {
                  label: "Historical VaR · 1 d",
                  value: pct(m.risk.historical_var, 2),
                  hint: "From observed daily returns, for scale; not the same horizon",
                },
              ]}
            />
            <Note>
              {int(m.summary.num_simulations)} paths, seed {m.seed}. Calibrated on{" "}
              {int(m.calibration.observations)} daily log returns from {m.source} through{" "}
              {stamp(m.observed_at)}: μ {pct(m.calibration.mu_annual, 1)}, σ{" "}
              {pct(m.calibration.sigma_annual, 1)} a year. Mean terminal price is within ±
              {pct(m.convergence.relative_terminal_mean_stderr, 2)} (one standard error).{" "}
              {m.assumptions.join(" ")} Flags: {m.quality.flags.join(", ")}.
            </Note>
          </>
        )
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- factors

const FACTOR_ETFS = ["SPY", "IWM", "IWD", "MTUM", "QUAL", "USMV"];

function FactorsPanel({ ticker }: { ticker: string }) {
  const f = useFactors(ticker);
  return (
    <Panel title={`Factor exposures · ${ticker}`} meta={<Chip>ETF proxies</Chip>}>
      {f.isPending ? (
        <Loading label="factor exposures" />
      ) : f.isError ? (
        <Unavailable what="Factor exposures" error={f.error} retry={() => void f.refetch()} />
      ) : (
        <>
          <BarList
            rows={f.data.exposures.map((e) => ({ label: e.factor, value: e.beta }))}
            format={(v) => num(v, 2)}
          />
          <Kpis
            items={[
              { label: "Alpha (annualized)", value: pct(f.data.alpha_annual, 1, true) },
              { label: "R²", value: num(f.data.r2, 2) },
              { label: "Days", value: int(f.data.n_days) },
            ]}
          />
          {FACTOR_ETFS.includes(ticker) && (
            <p className="mk-line mk-caution">
              <b>{ticker} is one of the factor proxies,</b> so it explains itself: its own beta is 1
              and R² is 1 by construction.
            </p>
          )}
          <Note>
            Multivariate OLS of daily returns on SPY, IWM, IWD, MTUM, QUAL and USMV over about 540
            calendar days. The ETFs overlap, so betas are proxies and can trade off against each
            other; alpha has no confidence interval here and is not evidence of skill.
          </Note>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- portfolio

type Row = { ticker: string; weight: string };

function PortfolioPanel({ ticker }: { ticker: string }) {
  const [rows, setRows] = useState<Row[]>([
    { ticker, weight: "100" },
    { ticker: "", weight: "" },
  ]);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = usePortfolio(holdings);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const filled = rows.filter((r) => r.ticker.trim() || r.weight.trim());
    const parsed = filled.map((r) => ({
      ticker: normalizeTicker(r.ticker),
      weight: Number(r.weight) / 100,
    }));
    const bad = parsed.find((h) => !h.ticker || !(h.weight > 0));
    if (!parsed.length || bad) {
      setError("Each row needs a ticker and a positive weight.");
      return;
    }
    setError(null);
    setHoldings(parsed as Holding[]);
  };
  const data = p.data;
  return (
    <Panel title="Portfolio risk" meta={<Chip>Weights renormalized to 100%</Chip>}>
      <form className="mk-legs" onSubmit={submit}>
        {rows.map((r, i) => (
          <div key={i} className="mk-leg">
            <input
              aria-label={`Holding ${i + 1} ticker`}
              placeholder="Ticker"
              value={r.ticker}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ticker: e.target.value } : x)))
              }
            />
            <input
              aria-label={`Holding ${i + 1} weight percent`}
              placeholder="Weight %"
              inputMode="decimal"
              value={r.weight}
              onChange={(e) =>
                setRows((rs) => rs.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))
              }
            />
            <button
              type="button"
              className="mk-ghost"
              aria-label={`Remove holding ${i + 1}`}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <div className="mk-controls">
          <button
            type="button"
            className="mk-ghost"
            onClick={() => setRows((rs) => [...rs, { ticker: "", weight: "" }])}
          >
            Add holding
          </button>
          <button type="submit" className="mk-primary">
            Analyze
          </button>
        </div>
      </form>
      {error && (
        <p className="mk-line mk-field-error" role="alert">
          {error}
        </p>
      )}
      {holdings && p.isPending && <Loading label="portfolio risk" />}
      {p.isError && <Unavailable what="Portfolio risk" error={p.error} />}
      {data && (
        <>
          {data.tickers.length < (holdings?.length ?? 0) && (
            <p className="mk-line mk-unavailable">
              No price history for{" "}
              {holdings
                ?.map((h) => h.ticker)
                .filter((t) => !data.tickers.includes(t))
                .join(", ")}
              ; left out and weights renormalized.
            </p>
          )}
          <Kpis
            items={[
              { label: "Annual return", value: pct(data.metrics.annual_return, 1, true) },
              { label: "Annual vol", value: pct(data.metrics.annual_vol, 1) },
              { label: "Sharpe (rf 0)", value: num(data.metrics.sharpe) },
              { label: "Max drawdown", value: pct(data.metrics.max_drawdown, 1), tone: "down" },
              { label: "VaR 95 · 1 d", value: pct(data.metrics.var95), tone: "down" },
              { label: "CVaR 95 · 1 d", value: pct(data.metrics.cvar95), tone: "down" },
            ]}
          />
          <p className="mk-label">Share of portfolio volatility</p>
          <BarList
            rows={data.contributions.map((c) => ({ label: c.ticker, value: c.pct_contribution }))}
            format={(v) => pct(v, 1)}
          />
          {data.correlation.tickers.length > 1 && (
            <div className="mk-table-wrap">
              <table className="mk-table mk-corr">
                <caption className="mk-label">Daily return correlation</caption>
                <thead>
                  <tr>
                    <th scope="col" />
                    {data.correlation.tickers.map((t) => (
                      <th key={t} scope="col">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.correlation.matrix.map((row, i) => (
                    <tr key={data.correlation.tickers[i]}>
                      <th scope="row">{data.correlation.tickers[i]}</th>
                      {row.map((v, j) => (
                        <td
                          key={j}
                          style={{
                            background:
                              v == null
                                ? undefined
                                : `color-mix(in srgb, ${v >= 0 ? "var(--glow-cyan)" : "var(--glow-magenta)"} ${Math.round(Math.abs(v) * 40)}%, transparent)`,
                          }}
                        >
                          {num(v, 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Note>
            {int(data.n_days)} overlapping trading days. Historical 1-day VaR and CVaR of the
            weighted daily return; contributions are each holding's share of portfolio volatility.
          </Note>
        </>
      )}
    </Panel>
  );
}
