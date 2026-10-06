import { useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HeatGrid, LineChart } from "./charts";
import { atmQuote, type MarketChain, type StrategyLeg } from "./contracts";
import { int, money, num, pct, stamp } from "./format";
import {
  useMarketChain,
  useOptionPrice,
  useStrategy,
  useTheoreticalChain,
  useVolSurface,
  type PricerInput,
} from "./queries";
import { Chip, Kpis, Loading, Note, Panel, Unavailable } from "./ui";

const EXPIRY_TARGETS = [7, 30, 60, 90, 180];
const CYAN = "var(--glow-cyan)",
  AMBER = "var(--primary)";

export default function OptionsScreen() {
  const { ticker } = useSearch({ from: "/markets" });
  const [days, setDays] = useState(30);
  const chain = useMarketChain(ticker, days);
  return (
    <div className="mk-grid">
      <ChainPanel ticker={ticker} days={days} setDays={setDays} chain={chain} />
      <PricerAndStrategy key={ticker} chain={chain.data ?? null} />
      <SurfacePanel ticker={ticker} />
      <TheoreticalPanel ticker={ticker} />
    </div>
  );
}

function ChainPanel({
  ticker,
  days,
  setDays,
  chain,
}: {
  ticker: string;
  days: number;
  setDays: (d: number) => void;
  chain: ReturnType<typeof useMarketChain>;
}) {
  const data = chain.data;
  const atm = data ? atmQuote(data).strike : null;
  return (
    <Panel
      title={`Option chain · ${ticker}`}
      className="mk-span"
      meta={
        data && (
          <>
            <Chip title="Quotes come straight from Yahoo Finance; no model fills gaps">
              {data.source}
            </Chip>
            <Chip tone="warn" title={data.quote_status}>
              Delayed or real-time per exchange
            </Chip>
            <Chip>Fetched {stamp(data.as_of)}</Chip>
          </>
        )
      }
    >
      <div className="mk-controls">
        <span className="mk-label" id="mk-expiry">
          Expiry nearest
        </span>
        <div className="mk-seg" role="radiogroup" aria-labelledby="mk-expiry">
          {EXPIRY_TARGETS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === days}
              onClick={() => setDays(d)}
            >
              {d} d
            </button>
          ))}
        </div>
        {data && (
          <span className="mk-num">
            {data.expiry} · {data.days} days · spot {money(data.spot)}
          </span>
        )}
      </div>
      {chain.isPending ? (
        <Loading label="the option chain" />
      ) : chain.isError ? (
        <Unavailable what="Option chain" error={chain.error} retry={() => void chain.refetch()} />
      ) : (
        <ChainTable data={chain.data} atm={atm} />
      )}
      <Note>
        Δ is Black-Scholes delta at each contract's own implied vol, r 5% and no dividend (assumed).
        The highlighted row is the strike nearest spot.
      </Note>
    </Panel>
  );
}

function ChainTable({ data, atm }: { data: MarketChain; atm: number | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  // Open the long chain at the money: centre the strike nearest spot in the scroller.
  useEffect(() => {
    const box = wrap.current,
      row = box?.querySelector<HTMLElement>("tr.mk-atm");
    if (box && row) box.scrollTop = row.offsetTop - box.clientHeight / 2;
  }, [data]);
  return (
    <div className="mk-table-wrap mk-scroll mk-chain-wrap" ref={wrap}>
      <table className="mk-table mk-chain">
        <caption className="sr-only">
          Calls and puts for {data.expiry}; in-the-money cells are shaded
        </caption>
        <thead>
          <tr>
            <th colSpan={6} scope="colgroup">
              Calls
            </th>
            <th rowSpan={2} scope="col">
              Strike
            </th>
            <th colSpan={6} scope="colgroup">
              Puts
            </th>
          </tr>
          <tr>
            {["Bid", "Ask", "Last", "IV", "Δ", "OI"].map((h) => (
              <th key={`c${h}`} scope="col">
                {h}
              </th>
            ))}
            {["Bid", "Ask", "Last", "IV", "Δ", "OI"].map((h) => (
              <th key={`p${h}`} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.strike} className={r.strike === atm ? "mk-atm" : undefined}>
              {legCells(r.call)}
              <th scope="row" className="mk-strike">
                {num(r.strike)}
              </th>
              {legCells(r.put)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function legCells(leg: MarketChain["rows"][number]["call"]) {
  const cls = leg.in_the_money ? "mk-itm" : undefined;
  return (
    <>
      <td className={cls}>{num(leg.bid)}</td>
      <td className={cls}>{num(leg.ask)}</td>
      <td className={cls}>{num(leg.last)}</td>
      <td className={cls}>{pct(leg.iv, 1)}</td>
      <td className={cls}>{num(leg.delta)}</td>
      <td className={cls}>{int(leg.open_interest)}</td>
    </>
  );
}

// ---------------------------------------------------------------- pricer + strategy

type Draft = Record<"S" | "K" | "days" | "sigma" | "r" | "q", string> & { type: "call" | "put" };
const BLANK: Draft = { S: "", K: "", days: "", sigma: "", r: "5", q: "0", type: "call" };

function parseDraft(d: Draft): PricerInput | string {
  const S = Number(d.S),
    K = Number(d.K),
    days = Number(d.days),
    sigma = Number(d.sigma) / 100,
    r = Number(d.r) / 100,
    q = Number(d.q) / 100;
  if (!(S > 0)) return "Spot must be a positive number.";
  if (!(K > 0)) return "Strike must be a positive number.";
  if (!(days >= 1 && days <= 3650)) return "Days to expiry must be between 1 and 3650.";
  if (!(sigma > 0 && sigma < 5)) return "Volatility must be between 0% and 500%.";
  if (![r, q].every(Number.isFinite)) return "Rates must be numbers.";
  return { S, K, T: days / 365, r, q, sigma, type: d.type };
}

function PricerAndStrategy({ chain }: { chain: MarketChain | null }) {
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [touched, setTouched] = useState(false);
  const [input, setInput] = useState<PricerInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill once from the quoted chain: spot, the ATM strike, its IV and the expiry.
  useEffect(() => {
    if (!chain || touched) return;
    const atm = atmQuote(chain);
    const next: Draft = {
      ...BLANK,
      S: chain.spot.toFixed(2),
      K: String(atm.strike),
      days: String(chain.days),
      sigma: atm.iv ? (atm.iv * 100).toFixed(1) : "",
    };
    setDraft(next);
    const parsed = parseDraft(next);
    setInput(typeof parsed === "string" ? null : parsed);
  }, [chain, touched]);

  const set = (k: keyof Draft, v: string) => {
    setTouched(true);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseDraft(draft);
    setError(typeof parsed === "string" ? parsed : null);
    if (typeof parsed !== "string") setInput(parsed);
  };
  const priced = useOptionPrice(input);
  const p = priced.data;

  return (
    <>
      <Panel
        title="Black-Scholes pricer"
        meta={<Chip title="Model output from the inputs below">Model, not a quote</Chip>}
      >
        <form className="mk-form" onSubmit={submit}>
          <Field label="Spot" value={draft.S} onChange={(v) => set("S", v)} />
          <Field label="Strike" value={draft.K} onChange={(v) => set("K", v)} />
          <Field label="Days" value={draft.days} onChange={(v) => set("days", v)} />
          <Field label="Vol %" value={draft.sigma} onChange={(v) => set("sigma", v)} />
          <Field label="Rate %" value={draft.r} onChange={(v) => set("r", v)} />
          <Field label="Div. yield %" value={draft.q} onChange={(v) => set("q", v)} />
          <label className="mk-field">
            <span>Type</span>
            <select
              value={draft.type}
              onChange={(e) => set("type", e.target.value as "call" | "put")}
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>
          <button type="submit" className="mk-primary">
            Price
          </button>
        </form>
        {error && (
          <p className="mk-line mk-field-error" role="alert">
            {error}
          </p>
        )}
        {!chain && !touched && !input && (
          <p className="mk-line">
            Enter spot, strike, days and vol to price. They fill in from the chain when it loads.
          </p>
        )}
        {input && priced.isPending && <Loading label="the price" />}
        {priced.isError && <Unavailable what="Pricer" error={priced.error} />}
        {p && (
          <>
            <Kpis
              items={[
                { label: "Black-Scholes", value: money(p.price, 4) },
                { label: "CRR binomial (Eur.)", value: money(p.models.binomial, 4) },
                { label: "CRR binomial (Amer.)", value: money(p.models.binomial_american, 4) },
                {
                  label: "Monte Carlo",
                  value:
                    p.models.monte_carlo == null
                      ? "—"
                      : `${money(p.models.monte_carlo, 4)} ± ${num(p.models.monte_carlo_stderr, 4)}`,
                  hint: "100,000 GBM terminal prices, seed 7; ± one standard error",
                },
              ]}
            />
            <Kpis
              items={[
                { label: "Delta", value: num(p.greeks.delta, 4) },
                { label: "Gamma", value: num(p.greeks.gamma, 4) },
                { label: "Vega / 1 vol pt", value: num(p.greeks.vega_per_1pct, 4) },
                { label: "Theta / day", value: num(p.greeks.theta_per_day, 4) },
                { label: "Rho / 1%", value: num(p.greeks.rho_per_1pct, 4) },
              ]}
            />
            <div className="mk-pair">
              <LineChart
                label={`${p.option_type} price against spot`}
                x={p.sensitivity.spot}
                series={[{ label: "Price", values: p.sensitivity.price, color: AMBER }]}
                markers={[
                  { at: p.inputs.S, label: "spot" },
                  { at: p.inputs.K, label: "K" },
                ]}
                yFormat={(v) => num(v, 1)}
                xFormat={(v) => num(Number(v), 0)}
                height={180}
              />
              <LineChart
                label={`${p.option_type} delta against spot`}
                x={p.sensitivity.spot}
                series={[{ label: "Delta", values: p.sensitivity.delta, color: CYAN }]}
                markers={[{ at: p.inputs.S, label: "spot" }]}
                zero
                yFormat={(v) => num(v, 2)}
                xFormat={(v) => num(Number(v), 0)}
                height={180}
              />
            </div>
          </>
        )}
        <Note>
          European Black-Scholes with continuous dividend yield. The binomial tree uses 400 steps;
          the American column allows early exercise. Rate and yield are inputs, not market data.
        </Note>
      </Panel>
      <StrategyPanel pricer={input} strikes={chain?.rows.map((r) => r.strike) ?? []} />
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mk-field">
      <span>{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Listed strikes nearest spot and nearest ±3% of it, so presets use strikes that trade. */
function nearStrikes(strikes: number[], spot: number) {
  const nearest = (target: number) =>
    strikes.length
      ? strikes.reduce((best, k) => (Math.abs(k - target) < Math.abs(best - target) ? k : best))
      : Math.round(target);
  return { atm: nearest(spot), up: nearest(spot * 1.03), down: nearest(spot * 0.97) };
}

function StrategyPanel({ pricer, strikes }: { pricer: PricerInput | null; strikes: number[] }) {
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [run, setRun] = useState<StrategyLeg[] | null>(null);
  const request =
    pricer && run?.length
      ? { S: pricer.S, sigma: pricer.sigma, T: pricer.T, r: pricer.r, q: pricer.q, legs: run }
      : null;
  const result = useStrategy(request);
  const s = result.data;

  const preset = (name: string) => {
    if (!pricer) return;
    const { atm, up, down } = nearStrikes(strikes, pricer.S);
    const leg = (type: StrategyLeg["type"], side: StrategyLeg["side"], strike: number) => ({
      type,
      side,
      strike,
      qty: 1,
    });
    const next: Record<string, StrategyLeg[]> = {
      "Long call": [leg("call", "long", atm)],
      "Bull call spread": [leg("call", "long", atm), leg("call", "short", up)],
      Straddle: [leg("call", "long", atm), leg("put", "long", atm)],
      "Protective put": [leg("stock", "long", 0), leg("put", "long", down)],
    };
    setLegs(next[name]);
    setRun(next[name]);
  };
  const update = (i: number, patch: Partial<StrategyLeg>) =>
    setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Panel
      title="Strategy payoff at expiry"
      meta={<Chip>Uses the pricer's spot, vol, days and rates</Chip>}
    >
      {!pricer ? (
        <p className="mk-line">Price an option first; strategies use the same inputs.</p>
      ) : (
        <>
          <div className="mk-controls">
            {["Long call", "Bull call spread", "Straddle", "Protective put"].map((n) => (
              <button key={n} type="button" className="mk-ghost" onClick={() => preset(n)}>
                {n}
              </button>
            ))}
          </div>
          {legs.length > 0 && (
            <form
              className="mk-legs"
              onSubmit={(e) => {
                e.preventDefault();
                setRun(legs.filter((l) => l.qty > 0 && (l.type === "stock" || l.strike > 0)));
              }}
            >
              {legs.map((l, i) => (
                <div key={i} className="mk-leg">
                  <select
                    aria-label={`Leg ${i + 1} side`}
                    value={l.side}
                    onChange={(e) => update(i, { side: e.target.value as StrategyLeg["side"] })}
                  >
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                  <input
                    aria-label={`Leg ${i + 1} quantity`}
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => update(i, { qty: Number(e.target.value) || 0 })}
                  />
                  <select
                    aria-label={`Leg ${i + 1} instrument`}
                    value={l.type}
                    onChange={(e) => update(i, { type: e.target.value as StrategyLeg["type"] })}
                  >
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                    <option value="stock">Stock</option>
                  </select>
                  {l.type !== "stock" && (
                    <input
                      aria-label={`Leg ${i + 1} strike`}
                      inputMode="decimal"
                      value={l.strike}
                      onChange={(e) => update(i, { strike: Number(e.target.value) || 0 })}
                    />
                  )}
                  <button
                    type="button"
                    className="mk-ghost"
                    aria-label={`Remove leg ${i + 1}`}
                    onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="mk-controls">
                <button
                  type="button"
                  className="mk-ghost"
                  onClick={() =>
                    setLegs((ls) => [
                      ...ls,
                      {
                        type: "call",
                        side: "long",
                        strike: nearStrikes(strikes, pricer.S).atm,
                        qty: 1,
                      },
                    ])
                  }
                >
                  Add leg
                </button>
                <button type="submit" className="mk-primary">
                  Evaluate
                </button>
              </div>
            </form>
          )}
          {legs.length === 0 && <p className="mk-line">Pick a preset to start, then edit legs.</p>}
          {request && result.isPending && <Loading label="the payoff" />}
          {result.isError && <Unavailable what="Strategy" error={result.error} />}
          {s && (
            <>
              <LineChart
                label="Payoff at expiry against spot"
                x={s.spot_grid}
                series={[{ label: "P&L at expiry", values: s.payoff, color: AMBER }]}
                markers={[
                  { at: pricer.S, label: "spot" },
                  ...s.breakevens.map((b) => ({ at: b, label: `BE ${num(b)}` })),
                ]}
                zero
                yFormat={(v) => num(v, 1)}
                xFormat={(v) => num(Number(v), 0)}
                height={200}
              />
              <Kpis
                items={[
                  {
                    label: (s.net_premium ?? 0) >= 0 ? "Net debit" : "Net credit",
                    value: money(s.net_premium == null ? null : Math.abs(s.net_premium)),
                  },
                  { label: "Max profit*", value: money(s.max_profit) },
                  { label: "Max loss*", value: money(s.max_loss) },
                  { label: "Net delta", value: num(s.net_greeks.delta, 3) },
                  { label: "Net vega", value: num(s.net_greeks.vega, 3) },
                  { label: "Net theta / day", value: num(s.net_greeks.theta, 3) },
                ]}
              />
              <Note>
                *Over spot 60%–140% of today's at expiry, per unit. Rule-based notes from the net
                Greeks: {s.hedges.join(" ")}
              </Note>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- surface + theoretical

function SurfacePanel({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState(false);
  const surface = useVolSurface(ticker, open);
  const s = surface.data;
  return (
    <Panel
      title="Implied-vol surface"
      className="mk-span"
      meta={
        s && (
          <>
            <Chip>Yahoo quotes</Chip>
            <Chip title="IVs are solved from bid/ask mids (last trade when one-sided) and interpolated onto the grid">
              {int(s.n_points)} solved quotes · interpolated grid
            </Chip>
          </>
        )
      }
    >
      {!open ? (
        <div className="mk-controls">
          <button type="button" className="mk-ghost" onClick={() => setOpen(true)}>
            Load surface
          </button>
          <span className="mk-label">
            Pulls up to eight expiries from Yahoo; takes a few seconds.
          </span>
        </div>
      ) : surface.isPending ? (
        <Loading label="the surface" />
      ) : surface.isError ? (
        <Unavailable
          what="Vol surface"
          error={surface.error}
          retry={() => void surface.refetch()}
        />
      ) : (
        s && (
          <HeatGrid
            label={`Implied volatility by strike and maturity for ${s.ticker}`}
            rows={s.maturities.map((t) => t * 365)}
            cols={s.strikes}
            values={s.iv}
            rowFormat={(d) => `${Math.round(d)} d`}
            colFormat={(k) => num(k, 0)}
            valueFormat={(v) => `${v.toFixed(1)}%`}
            rowTitle="Maturity"
            colTitle="Strike"
          />
        )
      )}
    </Panel>
  );
}

function TheoreticalPanel({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const chain = useTheoreticalChain(ticker, open);
  const c = chain.data;
  const expiry = c?.expiries[Math.min(idx, (c?.expiries.length ?? 1) - 1)];
  return (
    <Panel
      title="Theoretical chain"
      className="mk-span"
      meta={
        c && (
          <Chip tone="warn" title="Not market quotes">
            Black-Scholes at realized σ {pct(c.sigma, 1)}
          </Chip>
        )
      }
    >
      {!open ? (
        <div className="mk-controls">
          <button type="button" className="mk-ghost" onClick={() => setOpen(true)}>
            Show theoretical chain
          </button>
          <span className="mk-label">
            Model prices at the ticker's annualized realized volatility, for comparison with quotes.
          </span>
        </div>
      ) : chain.isPending ? (
        <Loading label="the theoretical chain" />
      ) : chain.isError ? (
        <Unavailable
          what="Theoretical chain"
          error={chain.error}
          retry={() => void chain.refetch()}
        />
      ) : (
        c && (
          <>
            <div className="mk-controls">
              <div className="mk-seg" role="radiogroup" aria-label="Theoretical expiry">
                {c.expiries.map((e, i) => (
                  <button
                    key={e.days}
                    type="button"
                    role="radio"
                    aria-checked={i === idx}
                    onClick={() => setIdx(i)}
                  >
                    {e.days} d
                  </button>
                ))}
              </div>
              <span className="mk-num">last close {money(c.spot)}</span>
            </div>
            <div className="mk-table-wrap">
              <table className="mk-table">
                <thead>
                  <tr>
                    {["Call", "Δ", "Γ", "Vega", "Θ/day", "Strike", "Put", "Δ", "Θ/day"].map(
                      (h, i) => (
                        <th key={i} scope="col">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {expiry?.rows.map((r) => (
                    <tr key={r.strike} className={r.strike === c.atm ? "mk-atm" : undefined}>
                      <td>{num(r.call.price)}</td>
                      <td>{num(r.call.delta, 3)}</td>
                      <td>{num(r.call.gamma, 4)}</td>
                      <td>{num(r.call.vega, 3)}</td>
                      <td>{num(r.call.theta, 3)}</td>
                      <th scope="row" className="mk-strike">
                        {num(r.strike)}
                      </th>
                      <td>{num(r.put.price)}</td>
                      <td>{num(r.put.delta, 3)}</td>
                      <td>{num(r.put.theta, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </Panel>
  );
}
