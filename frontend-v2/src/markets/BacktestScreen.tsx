import { useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LineChart } from "./charts";
import { drawdownOf, type Backtest, type BacktestStats } from "./contracts";
import { int, money, num, pct } from "./format";
import { useBacktest, type BacktestInput } from "./queries";
import { Chip, Loading, Note, Panel, Unavailable } from "./ui";

const AMBER = "var(--primary)",
  CYAN = "var(--glow-cyan)";
const DEFAULT: BacktestInput = {
  strategy: "sma_cross",
  fast: 50,
  slow: 200,
  rsi_period: 14,
  rsi_low: 30,
  rsi_high: 70,
};
const LABEL = { sma_cross: "SMA cross", macd: "MACD", rsi: "RSI reversion" } as const;

export default function BacktestScreen() {
  const { ticker } = useSearch({ from: "/markets" });
  const [input, setInput] = useState(DEFAULT);
  const [draft, setDraft] = useState(DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const bt = useBacktest(ticker, input);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const d = draft;
    const bad =
      d.strategy === "sma_cross" && !(d.fast >= 2 && d.slow > d.fast && d.slow <= 400)
        ? "Fast must be at least 2 and below slow; slow at most 400."
        : d.strategy === "rsi" &&
            !(d.rsi_period >= 2 && d.rsi_period <= 50 && d.rsi_low < d.rsi_high)
          ? "RSI period must be 2–50 and the entry level below the exit level."
          : null;
    setError(bad);
    if (!bad) setInput(d);
  };
  const setNum = (k: keyof BacktestInput) => (v: string) =>
    setDraft((d) => ({ ...d, [k]: Number(v) }));

  return (
    <div className="mk-grid">
      <Panel
        title={`Backtest · ${ticker}`}
        className="mk-span"
        meta={<Chip tone="warn">Full sample · no costs</Chip>}
      >
        <form className="mk-form" onSubmit={submit}>
          <label className="mk-field">
            <span>Strategy</span>
            <select
              value={draft.strategy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, strategy: e.target.value as BacktestInput["strategy"] }))
              }
            >
              <option value="sma_cross">SMA cross (long when fast &gt; slow)</option>
              <option value="macd">MACD 12/26/9 (long when MACD &gt; signal)</option>
              <option value="rsi">RSI reversion (enter below, exit above)</option>
            </select>
          </label>
          {draft.strategy === "sma_cross" && (
            <>
              <NumField label="Fast SMA" value={draft.fast} onChange={setNum("fast")} />
              <NumField label="Slow SMA" value={draft.slow} onChange={setNum("slow")} />
            </>
          )}
          {draft.strategy === "rsi" && (
            <>
              <NumField
                label="RSI period"
                value={draft.rsi_period}
                onChange={setNum("rsi_period")}
              />
              <NumField label="Enter below" value={draft.rsi_low} onChange={setNum("rsi_low")} />
              <NumField label="Exit above" value={draft.rsi_high} onChange={setNum("rsi_high")} />
            </>
          )}
          <button type="submit" className="mk-primary">
            Run
          </button>
        </form>
        {error && (
          <p className="mk-line mk-field-error" role="alert">
            {error}
          </p>
        )}
        <Note>
          Long or flat, trading the bar after each signal. The whole history is used at once, with
          no costs, slippage or out-of-sample split, so these numbers describe the past; they are
          not evidence of edge.
        </Note>
      </Panel>
      {bt.isPending ? (
        <Panel title="Results" className="mk-span">
          <Loading label="the backtest" />
        </Panel>
      ) : bt.isError ? (
        <Panel title="Results" className="mk-span">
          <Unavailable what="Backtest" error={bt.error} retry={() => void bt.refetch()} />
        </Panel>
      ) : (
        <Results b={bt.data} />
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mk-field">
      <span>{label}</span>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const STATS: [keyof BacktestStats, string, (v: number | null) => string][] = [
  ["total_return", "Total return", (v) => pct(v, 1, true)],
  ["cagr", "CAGR", (v) => pct(v, 1, true)],
  ["vol", "Annual vol", (v) => pct(v, 1)],
  ["sharpe", "Sharpe (rf 0)", (v) => num(v)],
  ["max_drawdown", "Max drawdown", (v) => pct(v, 1)],
  ["win_rate", "Up days while invested", (v) => pct(v, 1)],
];

function Results({ b }: { b: Backtest }) {
  const name = LABEL[b.strategy];
  return (
    <>
      <Panel
        title={`${name} vs buy and hold`}
        className="mk-span"
        meta={
          <Chip>
            {b.dates[0]} → {b.dates[b.dates.length - 1]}
          </Chip>
        }
      >
        <LineChart
          label={`Growth of $1: ${name} and buy and hold`}
          x={b.dates}
          series={[
            { label: name, values: b.equity, color: AMBER },
            { label: "Buy and hold", values: b.benchmark, color: CYAN, dashed: true },
          ]}
          yFormat={(v) => money(v, 2)}
          height={240}
        />
        <LineChart
          label="Drawdown from running peak"
          x={b.dates}
          series={[
            { label: name, values: drawdownOf(b.equity), color: AMBER },
            { label: "Buy and hold", values: drawdownOf(b.benchmark), color: CYAN, dashed: true },
          ]}
          zero
          yFormat={(v) => pct(v, 0)}
          height={160}
        />
      </Panel>
      <Panel title="Statistics">
        <div className="mk-table-wrap">
          <table className="mk-table">
            <thead>
              <tr>
                <th scope="col">Statistic</th>
                <th scope="col">{name}</th>
                <th scope="col">Buy and hold</th>
              </tr>
            </thead>
            <tbody>
              {STATS.map(([k, label, f]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td>{f(b.stats.strategy[k])}</td>
                  <td>{f(b.stats.buy_hold[k])}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Position changes</th>
                <td>{int(b.n_trades)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note>
          The strategy's statistics count flat days as zero-return days, so its volatility and
          Sharpe are over the whole period, not only while invested.
        </Note>
      </Panel>
      <Panel title="Recent position changes" meta={<Chip>Last {b.trades.length}</Chip>}>
        {b.trades.length === 0 ? (
          <p className="mk-line">The strategy never changed position.</p>
        ) : (
          <div className="mk-table-wrap mk-scroll">
            <table className="mk-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Action</th>
                  <th scope="col">Signal-day close</th>
                </tr>
              </thead>
              <tbody>
                {[...b.trades].reverse().map((t) => (
                  <tr key={`${t.date}${t.type}`}>
                    <td>{t.date}</td>
                    <td className={t.type === "buy" ? "mk-up" : "mk-down"}>
                      {t.type === "buy" ? "Enter long" : "Exit to flat"}
                    </td>
                    <td>{money(t.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
