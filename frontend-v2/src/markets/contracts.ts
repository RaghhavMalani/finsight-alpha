/**
 * Contracts for the Markets endpoints. Each adapter checks the fields its screen reads and
 * throws on anything else, so a changed backend shape shows as "unavailable" instead of as
 * wrong numbers. The derivations at the bottom only rearrange numbers the API returned.
 *
 * Imported by scripts/verify-markets.mjs under plain Node, so it uses relative `.ts` imports
 * and no path aliases.
 */

export class MarketsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketsContractError";
  }
}

type Json = Record<string, unknown>;
type Num = number | null;

function obj(value: unknown, label: string): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new MarketsContractError(`${label} must be an object.`);
  return value as Json;
}
function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new MarketsContractError(`${label} must be an array.`);
  return value;
}
function str(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new MarketsContractError(`${label} must be a non-empty string.`);
  return value;
}
function optStr(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : str(value, label);
}
function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new MarketsContractError(`${label} must be a finite number.`);
  return value;
}
/** The backend maps every non-finite float to null, so null is a legal "no value". */
function numOrNull(value: unknown, label: string): Num {
  return value === null ? null : num(value, label);
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new MarketsContractError(`${label} must be boolean.`);
  return value;
}
function nums(value: unknown, label: string): number[] {
  return arr(value, label).map((x, i) => num(x, `${label}[${i}]`));
}
function numsOrNull(value: unknown, label: string): Num[] {
  return arr(value, label).map((x, i) => numOrNull(x, `${label}[${i}]`));
}
function strs(value: unknown, label: string): string[] {
  return arr(value, label).map((x, i) => str(x, `${label}[${i}]`));
}
function pick<K extends string>(value: unknown, keys: readonly K[], label: string) {
  const o = obj(value, label);
  return Object.fromEntries(keys.map((k) => [k, numOrNull(o[k], `${label}.${k}`)])) as Record<
    K,
    Num
  >;
}
function sameLength(label: string, ...lists: unknown[][]) {
  if (lists.some((l) => l.length !== lists[0].length))
    throw new MarketsContractError(`${label} series have different lengths.`);
}

// ---------------------------------------------------------------- tickers

export const TICKER_PATTERN = /^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/;
export function normalizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  return TICKER_PATTERN.test(t) ? t : null;
}

export const BAR_RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y"] as const;
export type BarRange = (typeof BAR_RANGES)[number];
export function parseBarRange(value: unknown): BarRange {
  return BAR_RANGES.includes(value as BarRange) ? (value as BarRange) : "1D";
}
export const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "RELIANCE.NS"];
export function parseWatchlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_WATCHLIST];
  return [
    ...new Set(
      value
        .flatMap((v) => (typeof v === "string" ? [normalizeTicker(v)] : []))
        .filter((v): v is string => v != null),
    ),
  ].slice(0, 30);
}
/** Static routes take precedence even when the symbol differs only in case. */
export function overviewTarget(ticker: string) {
  return ["OPTIONS", "RISK", "BACKTEST", "FUNDAMENTALS", "RESEARCH"].includes(ticker.toUpperCase())
    ? { to: "/markets" as const, search: { ticker } }
    : { to: "/markets/$ticker" as const, params: { ticker }, search: {} };
}

// ---------------------------------------------------------------- overview

export type Candle = { t: string; o: number; h: number; l: number; c: number; v: Num };
export type Bars = {
  ticker: string;
  range: BarRange;
  interval: string;
  intraday: boolean;
  source: string;
  adjusted: string;
  timezone: string | null;
  fetched_at: string | null;
  bars: Candle[];
};
const ZONED_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
function validTime(t: string, intraday: boolean) {
  return (
    (intraday ? ZONED_TIME.test(t) : /^\d{4}-\d{2}-\d{2}$/.test(t)) &&
    Number.isFinite(Date.parse(t))
  );
}
export function adaptBars(value: unknown, expected: { ticker: string; range: BarRange }): Bars {
  const o = obj(value, "Bars");
  const ticker = str(o.ticker, "ticker"),
    range = str(o.range, "range");
  if (ticker !== expected.ticker || range !== expected.range)
    throw new MarketsContractError("Bars belong to a different ticker or range.");
  const intraday = bool(o.intraday, "intraday"),
    interval = str(o.interval, "interval");
  const requiredInterval =
    range === "1D" ? "5m" : range === "5D" ? "30m" : range === "5Y" ? "1wk" : "1d";
  if (intraday !== ["1D", "5D"].includes(range) || interval !== requiredInterval)
    throw new MarketsContractError("Bars have an unexpected interval.");
  const timezone = optStr(o.timezone, "timezone");
  if (intraday && !timezone)
    throw new MarketsContractError("Intraday bars need an exchange timezone.");
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new MarketsContractError("Unknown exchange timezone.");
    }
  }
  const bars = arr(o.bars, "bars").map((value, i): Candle => {
    const b = obj(value, `bars[${i}]`),
      t = str(b.t, "bar.t");
    if (!validTime(t, intraday))
      throw new MarketsContractError("Bar time is invalid or has no UTC offset.");
    const candle = {
      t,
      o: num(b.o, "bar.o"),
      h: num(b.h, "bar.h"),
      l: num(b.l, "bar.l"),
      c: num(b.c, "bar.c"),
      v: numOrNull(b.v, "bar.v"),
    };
    if (
      candle.h < Math.max(candle.o, candle.c) ||
      candle.l > Math.min(candle.o, candle.c) ||
      (candle.v != null && candle.v < 0)
    )
      throw new MarketsContractError("Candle prices or volume are inconsistent.");
    return candle;
  });
  if (!bars.length || bars.some((b, i) => i > 0 && Date.parse(b.t) <= Date.parse(bars[i - 1].t)))
    throw new MarketsContractError("Bars must be non-empty and strictly ordered by time.");
  const adjusted = str(o.adjusted, "adjusted");
  if (adjusted !== "splits_and_dividends")
    throw new MarketsContractError("Unknown price adjustment.");
  return {
    ticker,
    range: range as BarRange,
    interval,
    intraday,
    timezone,
    adjusted,
    source: str(o.source, "source"),
    fetched_at: optStr(o.fetched_at, "fetched_at"),
    bars,
  };
}

export type MarketQuote = {
  ticker: string;
  last: number;
  change_pct: Num;
  open: Num;
  high: Num;
  low: Num;
  prev_close: Num;
  volume: Num;
  quote_ts: string | null;
  source: string;
  live: boolean;
};
export function adaptQuotes(
  value: unknown,
  requested: readonly string[],
): Record<string, MarketQuote | null> {
  const o = obj(value, "Tape");
  bool(o.live, "live");
  const result: Record<string, MarketQuote | null> = Object.fromEntries(
    requested.map((t) => [t, null]),
  );
  for (const value of arr(o.items, "items")) {
    const q = obj(value, "Quote"),
      ticker = str(q.ticker, "ticker");
    let ts: string | null = null;
    if (typeof q.quote_ts === "number") {
      const epoch = num(q.quote_ts, "quote_ts");
      if (!Number.isFinite(new Date(epoch * 1000).getTime()))
        throw new MarketsContractError("Invalid quote timestamp.");
      ts = new Date(epoch * 1000).toISOString();
    } else {
      ts = optStr(q.quote_ts, "quote_ts");
      if (ts && !Number.isFinite(Date.parse(ts)))
        throw new MarketsContractError("Invalid quote timestamp.");
    }
    const quote = {
      ticker,
      last: num(q.last, "last"),
      change_pct: numOrNull(q.change_pct, "change_pct"),
      open: numOrNull(q.open, "open"),
      high: numOrNull(q.high, "high"),
      low: numOrNull(q.low, "low"),
      prev_close: numOrNull(q.prev_close, "prev_close"),
      volume: numOrNull(q.volume, "volume"),
      quote_ts: ts,
      source: str(q.source, "source"),
      live: bool(q.live, "quote.live"),
    };
    if (quote.live && (!ts || !ZONED_TIME.test(ts)))
      throw new MarketsContractError("Live quote needs a zoned timestamp.");
    if (requested.includes(ticker)) {
      if (result[ticker]) throw new MarketsContractError("Duplicate quote.");
      result[ticker] = quote;
    }
  }
  return result;
}
export type SearchItem = {
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  type: string;
};
export function adaptSearch(value: unknown): SearchItem[] {
  return arr(obj(value, "Search").items, "items").map((value) => {
    const o = obj(value, "Search item"),
      symbol = str(o.symbol, "symbol");
    if (!normalizeTicker(symbol)) throw new MarketsContractError("Invalid search symbol.");
    return {
      symbol,
      name: str(o.name, "name"),
      exchange: str(o.exchange, "exchange"),
      market: str(o.market, "market"),
      type: str(o.type, "type"),
    };
  });
}

// ---------------------------------------------------------------- options

const GREEKS = [
  "delta",
  "gamma",
  "vega",
  "vega_per_1pct",
  "theta",
  "theta_per_day",
  "rho",
  "rho_per_1pct",
] as const;
export type OptionPrice = {
  option_type: "call" | "put";
  price: number;
  models: {
    black_scholes: Num;
    binomial: Num;
    binomial_american: Num;
    monte_carlo: Num;
    monte_carlo_stderr: Num;
  };
  greeks: Record<(typeof GREEKS)[number], Num>;
  inputs: { S: number; K: number; T: number; r: number; sigma: number; q: number };
  sensitivity: { spot: number[]; price: Num[]; delta: Num[] };
};
export function adaptOptionPrice(value: unknown): OptionPrice {
  const o = obj(value, "Option price");
  const type = str(o.option_type, "option_type");
  if (type !== "call" && type !== "put")
    throw new MarketsContractError("option_type must be call or put.");
  const inputs = obj(o.inputs, "inputs");
  const sens = obj(o.sensitivity, "sensitivity");
  const sensitivity = {
    spot: nums(sens.spot, "sensitivity.spot"),
    price: numsOrNull(sens.price, "sensitivity.price"),
    delta: numsOrNull(sens.delta, "sensitivity.delta"),
  };
  sameLength("sensitivity", sensitivity.spot, sensitivity.price, sensitivity.delta);
  const models = obj(o.models, "models");
  return {
    option_type: type,
    price: num(o.price, "price"),
    models: {
      black_scholes: numOrNull(models.black_scholes, "models.black_scholes"),
      // The backend drops the comparison models if one of them fails; absent means not run.
      binomial: numOrNull(models.binomial ?? null, "models.binomial"),
      binomial_american: numOrNull(models.binomial_american ?? null, "models.binomial_american"),
      monte_carlo: numOrNull(models.monte_carlo ?? null, "models.monte_carlo"),
      monte_carlo_stderr: numOrNull(models.monte_carlo_stderr ?? null, "models.mc_stderr"),
    },
    greeks: pick(o.greeks, GREEKS, "greeks"),
    inputs: {
      S: num(inputs.S, "inputs.S"),
      K: num(inputs.K, "inputs.K"),
      T: num(inputs.T, "inputs.T"),
      r: num(inputs.r, "inputs.r"),
      sigma: num(inputs.sigma, "inputs.sigma"),
      q: num(inputs.q, "inputs.q"),
    },
    sensitivity,
  };
}

/** Put-call parity residual C − P − (S·e^(−qT) − K·e^(−rT)); zero for European BS prices. */
export function parityGap(call: OptionPrice, put: OptionPrice): number {
  const { S, K, T, r, q } = call.inputs;
  return call.price - put.price - (S * Math.exp(-q * T) - K * Math.exp(-r * T));
}

export type StrategyLeg = {
  type: "call" | "put" | "stock";
  side: "long" | "short";
  strike: number;
  qty: number;
};
const NET_GREEKS = ["delta", "gamma", "vega", "theta", "rho"] as const;
export type StrategyResult = {
  net_premium: Num;
  net_greeks: Record<(typeof NET_GREEKS)[number], Num>;
  spot_grid: number[];
  payoff: number[];
  max_profit: Num;
  max_loss: Num;
  breakevens: number[];
  hedges: string[];
};
export function adaptStrategy(value: unknown): StrategyResult {
  const o = obj(value, "Strategy");
  const spot_grid = nums(o.spot_grid, "spot_grid");
  const payoff = nums(o.payoff, "payoff");
  sameLength("payoff", spot_grid, payoff);
  return {
    net_premium: numOrNull(o.net_premium, "net_premium"),
    net_greeks: pick(o.net_greeks, NET_GREEKS, "net_greeks"),
    spot_grid,
    payoff,
    max_profit: numOrNull(o.max_profit, "max_profit"),
    max_loss: numOrNull(o.max_loss, "max_loss"),
    breakevens: nums(o.breakevens, "breakevens"),
    hedges: strs(o.hedges, "hedges"),
  };
}

const THEO_LEG = ["price", "delta", "gamma", "vega", "theta", "rho", "iv"] as const;
export type TheoLeg = Record<(typeof THEO_LEG)[number], Num>;
export type TheoreticalChain = {
  ticker: string;
  spot: number;
  sigma: Num;
  atm: number;
  expiries: { days: number; T: number; rows: { strike: number; call: TheoLeg; put: TheoLeg }[] }[];
};
export function adaptTheoreticalChain(value: unknown): TheoreticalChain {
  const o = obj(value, "Theoretical chain");
  return {
    ticker: str(o.ticker, "ticker"),
    spot: num(o.spot, "spot"),
    sigma: numOrNull(o.sigma, "sigma"),
    atm: num(o.atm, "atm"),
    expiries: arr(o.expiries, "expiries").map((e, i) => {
      const x = obj(e, `expiries[${i}]`);
      return {
        days: num(x.days, "days"),
        T: num(x.T, "T"),
        rows: arr(x.rows, "rows").map((r, j) => {
          const row = obj(r, `rows[${j}]`);
          return {
            strike: num(row.strike, "strike"),
            call: pick(row.call, THEO_LEG, "call"),
            put: pick(row.put, THEO_LEG, "put"),
          };
        }),
      };
    }),
  };
}

export type MarketLeg = {
  contract_symbol: string;
  last: Num;
  bid: Num;
  ask: Num;
  iv: Num;
  delta: Num;
  volume: number;
  open_interest: number;
  in_the_money: boolean;
  last_trade: string | null;
};
function marketLeg(value: unknown, label: string): MarketLeg {
  const o = obj(value, label);
  return {
    contract_symbol: typeof o.contract_symbol === "string" ? o.contract_symbol : "",
    last: numOrNull(o.last, `${label}.last`),
    bid: numOrNull(o.bid, `${label}.bid`),
    ask: numOrNull(o.ask, `${label}.ask`),
    iv: numOrNull(o.iv, `${label}.iv`),
    delta: numOrNull(o.delta, `${label}.delta`),
    volume: num(o.volume, `${label}.volume`),
    open_interest: num(o.open_interest, `${label}.open_interest`),
    in_the_money: bool(o.in_the_money, `${label}.in_the_money`),
    last_trade: optStr(o.last_trade, `${label}.last_trade`),
  };
}
export type MarketChain = {
  ticker: string;
  source: string;
  quote_status: string;
  as_of: string;
  spot: number;
  expiry: string;
  days: number;
  rows: { strike: number; call: MarketLeg; put: MarketLeg }[];
};
export function adaptMarketChain(value: unknown): MarketChain {
  const o = obj(value, "Market chain");
  const rows = arr(o.rows, "rows").map((r, i) => {
    const row = obj(r, `rows[${i}]`);
    return {
      strike: num(row.strike, "strike"),
      call: marketLeg(row.call, `rows[${i}].call`),
      put: marketLeg(row.put, `rows[${i}].put`),
    };
  });
  if (!rows.length) throw new MarketsContractError("The chain has no strikes.");
  return {
    ticker: str(o.ticker, "ticker"),
    source: str(o.source, "source"),
    quote_status: str(o.quote_status, "quote_status"),
    as_of: str(o.as_of, "as_of"),
    spot: num(o.spot, "spot"),
    expiry: str(o.expiry, "expiry"),
    days: num(o.days, "days"),
    rows,
  };
}

/** Mid of a two-sided quote, or null when the quote is one-sided or crossed. */
export function mid(leg: Pick<MarketLeg, "bid" | "ask">): Num {
  const { bid, ask } = leg;
  return bid != null && ask != null && bid > 0 && ask >= bid ? (bid + ask) / 2 : null;
}

/** The listed strike nearest spot, and the mean of its call and put implied vols. */
export function atmQuote(chain: MarketChain): { strike: number; iv: Num } {
  const row = chain.rows.reduce((best, r) =>
    Math.abs(r.strike - chain.spot) < Math.abs(best.strike - chain.spot) ? r : best,
  );
  // Below 1% is Yahoo's no-market placeholder (the route drops it too), never a quoted vol.
  const ivs = [row.call.iv, row.put.iv].filter((v): v is number => v != null && v >= 0.01);
  return { strike: row.strike, iv: ivs.length ? ivs.reduce((a, b) => a + b) / ivs.length : null };
}

/** Strikes with a two-sided quote on either leg; zero outside market hours on Yahoo. */
export function twoSidedCount(chain: MarketChain): number {
  return chain.rows.filter((r) => mid(r.call) != null || mid(r.put) != null).length;
}

export type VolSurface = {
  ticker: string;
  source: string;
  spot: number;
  strikes: number[];
  maturities: number[];
  iv: number[][];
  n_points: number;
};
export function adaptVolSurface(value: unknown): VolSurface {
  const o = obj(value, "Vol surface");
  const source = str(o.source, "source");
  // The route withholds the synthetic demo surface unless asked; refuse it here as well.
  if (source === "synthetic")
    throw new MarketsContractError("Synthetic surface withheld: no live option chain.");
  const strikes = nums(o.strikes, "strikes");
  const maturities = nums(o.maturities, "maturities");
  const iv = arr(o.iv, "iv").map((row, i) => nums(row, `iv[${i}]`));
  if (iv.length !== maturities.length || iv.some((row) => row.length !== strikes.length))
    throw new MarketsContractError("IV grid does not match its axes.");
  return {
    ticker: str(o.ticker, "ticker"),
    source,
    spot: num(o.spot, "spot"),
    strikes,
    maturities,
    iv,
    n_points: num(o.n_points, "n_points"),
  };
}

// ---------------------------------------------------------------- risk

type Series = { dates: string[]; values: Num[] };
function series(value: unknown, label: string, key = "values"): Series {
  const o = obj(value, label);
  const out = { dates: strs(o.dates, `${label}.dates`), values: numsOrNull(o[key], label) };
  sameLength(label, out.dates, out.values);
  return out;
}
const HEADLINE = [
  "last",
  "ann_vol",
  "ewma_vol",
  "sharpe",
  "sortino",
  "max_drawdown",
  "calmar",
  "beta",
  "corr_benchmark",
  "skew",
  "kurtosis",
  "hit_rate",
  "worst_day",
  "best_day",
  "downside_dev",
] as const;
const VAR_METHODS = ["historical", "parametric", "cornish_fisher", "monte_carlo"] as const;
export type VarMethod = (typeof VAR_METHODS)[number];
export type RiskDashboard = {
  ticker: string;
  benchmark: string;
  benchmark_available: boolean;
  notional: number;
  as_of: string;
  n_days: number;
  headline: Record<(typeof HEADLINE)[number], Num>;
  var_table: ({ confidence: number; var_10d: Num; dollar_var_1d: Num } & Record<
    VarMethod,
    { var: Num; cvar: Num }
  >)[];
  price: Series;
  drawdown: Series;
  rolling_vol: { dates: string[]; v20: Num[]; v60: Num[]; ewma: Num[] };
  return_hist: { centers: Num[]; counts: number[] };
  drawdown_episodes: {
    peak: string;
    trough: string;
    depth: Num;
    length_days: number;
    recovery_days: number | null;
    recovered: boolean;
  }[];
  worst_windows: { window: string; worst_return: Num; dollar: Num }[];
  stress_tests: {
    scenario: string;
    window: string;
    shock: string;
    est_return: Num;
    est_dollar: Num;
  }[];
};
export function adaptRiskDashboard(value: unknown): RiskDashboard {
  const o = obj(value, "Risk dashboard");
  const rv = obj(o.rolling_vol, "rolling_vol");
  const rolling_vol = {
    dates: strs(rv.dates, "rolling_vol.dates"),
    v20: numsOrNull(rv.v20, "rolling_vol.v20"),
    v60: numsOrNull(rv.v60, "rolling_vol.v60"),
    ewma: numsOrNull(rv.ewma, "rolling_vol.ewma"),
  };
  sameLength("rolling_vol", rolling_vol.dates, rolling_vol.v20, rolling_vol.v60, rolling_vol.ewma);
  const hist = obj(o.return_hist, "return_hist");
  const return_hist = {
    centers: numsOrNull(hist.centers, "return_hist.centers"),
    counts: nums(hist.counts, "return_hist.counts"),
  };
  sameLength("return_hist", return_hist.centers, return_hist.counts);
  return {
    ticker: str(o.ticker, "ticker"),
    benchmark: str(o.benchmark, "benchmark"),
    benchmark_available: bool(o.benchmark_available, "benchmark_available"),
    notional: num(o.notional, "notional"),
    as_of: str(o.as_of, "as_of"),
    n_days: num(o.n_days, "n_days"),
    headline: pick(o.headline, HEADLINE, "headline"),
    var_table: arr(o.var_table, "var_table").map((r, i) => {
      const row = obj(r, `var_table[${i}]`);
      const methods = Object.fromEntries(
        VAR_METHODS.map((m) => [m, pick(row[m], ["var", "cvar"] as const, `var_table.${m}`)]),
      ) as Record<VarMethod, { var: Num; cvar: Num }>;
      return {
        confidence: num(row.confidence, "confidence"),
        var_10d: numOrNull(row.var_10d, "var_10d"),
        dollar_var_1d: numOrNull(row.dollar_var_1d, "dollar_var_1d"),
        ...methods,
      };
    }),
    price: series(o.price, "price"),
    drawdown: series(o.drawdown, "drawdown"),
    rolling_vol,
    return_hist,
    drawdown_episodes: arr(o.drawdown_episodes, "drawdown_episodes").map((e, i) => {
      const x = obj(e, `drawdown_episodes[${i}]`);
      return {
        peak: str(x.peak, "peak"),
        trough: str(x.trough, "trough"),
        depth: numOrNull(x.depth, "depth"),
        length_days: num(x.length_days, "length_days"),
        recovery_days: numOrNull(x.recovery_days, "recovery_days"),
        recovered: bool(x.recovered, "recovered"),
      };
    }),
    worst_windows: arr(o.worst_windows, "worst_windows").map((w, i) => {
      const x = obj(w, `worst_windows[${i}]`);
      return {
        window: str(x.window, "window"),
        worst_return: numOrNull(x.worst_return, "worst_return"),
        dollar: numOrNull(x.dollar, "dollar"),
      };
    }),
    stress_tests: arr(o.stress_tests, "stress_tests").map((s, i) => {
      const x = obj(s, `stress_tests[${i}]`);
      return {
        scenario: str(x.scenario, "scenario"),
        window: str(x.window, "window"),
        shock: str(x.shock, "shock"),
        est_return: numOrNull(x.est_return, "est_return"),
        est_dollar: numOrNull(x.est_dollar, "est_dollar"),
      };
    }),
  };
}

const QUANTILES = ["p5", "p25", "p50", "p75", "p95"] as const;
export type MonteCarlo = {
  snapshot_id: string;
  ticker: string;
  source: string;
  observed_at: string | null;
  model_version: string;
  quality: { status: string; flags: string[] };
  assumptions: string[];
  calibration: { observations: number; mu_annual: number; sigma_annual: number };
  S0: number;
  horizon_days: number;
  seed: number;
  summary: Record<
    | (typeof QUANTILES)[number]
    | "expected_final_price"
    | "expected_shortfall_price"
    | "probability_of_loss"
    | "expected_return",
    Num
  > & { num_simulations: number };
  risk: {
    confidence_level: Num;
    historical_var: Num;
    historical_cvar: Num;
    parametric_var: Num;
    parametric_cvar: Num;
    monte_carlo_var: Num;
    monte_carlo_cvar: Num;
  };
  fan: { days: number[] } & Record<(typeof QUANTILES)[number], number[]>;
  convergence: { relative_terminal_mean_stderr: number; terminal_mean_stderr: number };
};
export function adaptMonteCarlo(value: unknown): MonteCarlo {
  const o = obj(value, "Monte Carlo study");
  const quality = obj(o.quality, "quality");
  const cal = obj(o.calibration, "calibration");
  const summary = obj(o.summary, "summary");
  const fan = obj(o.fan, "fan");
  const days = nums(fan.days, "fan.days");
  const bands = Object.fromEntries(QUANTILES.map((q) => [q, nums(fan[q], `fan.${q}`)])) as Record<
    (typeof QUANTILES)[number],
    number[]
  >;
  sameLength("fan", days, ...Object.values(bands));
  const conv = obj(o.convergence, "convergence");
  return {
    snapshot_id: str(o.snapshot_id, "snapshot_id"),
    ticker: str(o.ticker, "ticker"),
    source: str(o.source, "source"),
    observed_at: optStr(o.observed_at, "observed_at"),
    model_version: str(o.model_version, "model_version"),
    quality: { status: str(quality.status, "quality.status"), flags: strs(quality.flags, "flags") },
    assumptions: strs(o.assumptions, "assumptions"),
    calibration: {
      observations: num(cal.observations, "calibration.observations"),
      mu_annual: num(cal.mu_annual, "calibration.mu_annual"),
      sigma_annual: num(cal.sigma_annual, "calibration.sigma_annual"),
    },
    S0: num(o.S0, "S0"),
    horizon_days: num(o.horizon_days, "horizon_days"),
    seed: num(o.seed, "seed"),
    summary: {
      ...pick(
        summary,
        [
          ...QUANTILES,
          "expected_final_price",
          "expected_shortfall_price",
          "probability_of_loss",
          "expected_return",
        ] as const,
        "summary",
      ),
      num_simulations: num(summary.num_simulations, "summary.num_simulations"),
    },
    risk: pick(
      o.risk,
      [
        "confidence_level",
        "historical_var",
        "historical_cvar",
        "parametric_var",
        "parametric_cvar",
        "monte_carlo_var",
        "monte_carlo_cvar",
      ] as const,
      "risk",
    ),
    fan: { days, ...bands },
    convergence: {
      relative_terminal_mean_stderr: num(conv.relative_terminal_mean_stderr, "convergence.rel"),
      terminal_mean_stderr: num(conv.terminal_mean_stderr, "convergence.stderr"),
    },
  };
}

export type Factors = {
  ticker: string;
  alpha_annual: Num;
  r2: Num;
  n_days: number;
  exposures: { factor: string; beta: Num }[];
};
export function adaptFactors(value: unknown): Factors {
  const o = obj(value, "Factor exposures");
  return {
    ticker: str(o.ticker, "ticker"),
    alpha_annual: numOrNull(o.alpha_annual, "alpha_annual"),
    r2: numOrNull(o.r2, "r2"),
    n_days: num(o.n_days, "n_days"),
    exposures: arr(o.exposures, "exposures").map((e, i) => {
      const x = obj(e, `exposures[${i}]`);
      return { factor: str(x.factor, "factor"), beta: numOrNull(x.beta, "beta") };
    }),
  };
}

const PORTFOLIO_METRICS = [
  "annual_return",
  "annual_vol",
  "sharpe",
  "cumulative_return",
  "max_drawdown",
  "var95",
  "cvar95",
  "parametric_var",
] as const;
export type Portfolio = {
  tickers: string[];
  n_days: number;
  metrics: Record<(typeof PORTFOLIO_METRICS)[number], Num>;
  contributions: { ticker: string; weight: Num; vol_contribution: Num; pct_contribution: Num }[];
  correlation: { tickers: string[]; matrix: Num[][] };
};
export function adaptPortfolio(value: unknown): Portfolio {
  const o = obj(value, "Portfolio risk");
  const corr = obj(o.correlation, "correlation");
  const tickers = strs(corr.tickers, "correlation.tickers");
  const matrix = arr(corr.matrix, "correlation.matrix").map((r, i) =>
    numsOrNull(r, `correlation.matrix[${i}]`),
  );
  if (matrix.length !== tickers.length || matrix.some((r) => r.length !== tickers.length))
    throw new MarketsContractError("Correlation matrix does not match its tickers.");
  return {
    tickers: strs(o.tickers, "tickers"),
    n_days: num(o.n_days, "n_days"),
    metrics: pick(o.metrics, PORTFOLIO_METRICS, "metrics"),
    contributions: arr(o.contributions, "contributions").map((c, i) => {
      const x = obj(c, `contributions[${i}]`);
      return {
        ticker: str(x.ticker, "ticker"),
        ...pick(x, ["weight", "vol_contribution", "pct_contribution"] as const, "contribution"),
      };
    }),
    correlation: { tickers, matrix },
  };
}

// ---------------------------------------------------------------- backtest

const BT_STATS = ["total_return", "cagr", "vol", "sharpe", "max_drawdown", "win_rate"] as const;
export type BacktestStats = Record<(typeof BT_STATS)[number], Num>;
export type BacktestStrategy = "sma_cross" | "macd" | "rsi";
export type Backtest = {
  ticker: string;
  strategy: BacktestStrategy;
  params: Record<string, number>;
  dates: string[];
  equity: Num[];
  benchmark: Num[];
  n_trades: number;
  trades: { date: string; type: "buy" | "sell"; price: Num }[];
  stats: { strategy: BacktestStats; buy_hold: BacktestStats };
};
function btStats(value: unknown, label: string): BacktestStats {
  // An empty object means no returns at all; every stat is then unavailable.
  const o = obj(value, label);
  return pick(
    Object.keys(o).length ? o : Object.fromEntries(BT_STATS.map((k) => [k, null])),
    BT_STATS,
    label,
  );
}
export function adaptBacktest(value: unknown): Backtest {
  const o = obj(value, "Backtest");
  const strategy = str(o.strategy, "strategy");
  if (strategy !== "sma_cross" && strategy !== "macd" && strategy !== "rsi")
    throw new MarketsContractError(`Unknown strategy ${strategy}.`);
  const dates = strs(o.dates, "dates");
  const equity = numsOrNull(o.equity, "equity");
  const benchmark = numsOrNull(o.benchmark, "benchmark");
  sameLength("backtest", dates, equity, benchmark);
  const params = obj(o.params, "params");
  const stats = obj(o.stats, "stats");
  return {
    ticker: str(o.ticker, "ticker"),
    strategy,
    params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, num(v, k)])),
    dates,
    equity,
    benchmark,
    n_trades: num(o.n_trades, "n_trades"),
    trades: arr(o.trades, "trades").map((t, i) => {
      const x = obj(t, `trades[${i}]`);
      const type = str(x.type, "type");
      if (type !== "buy" && type !== "sell") throw new MarketsContractError("Unknown trade type.");
      return { date: str(x.date, "date"), type, price: numOrNull(x.price, "price") };
    }),
    stats: {
      strategy: btStats(stats.strategy, "stats.strategy"),
      buy_hold: btStats(stats.buy_hold, "stats.buy_hold"),
    },
  };
}

/** Peak-to-date drawdown of an equity curve; gaps stay gaps. */
export function drawdownOf(values: Num[]): Num[] {
  let peak = -Infinity;
  return values.map((v) => {
    if (v == null) return null;
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

// ---------------------------------------------------------------- fundamentals

export const LINE_ITEMS = [
  ["revenue", "Revenue"],
  ["gross_profit", "Gross profit"],
  ["operating_income", "Operating income"],
  ["net_income", "Net income"],
  ["operating_cash_flow", "Operating cash flow"],
  ["eps_diluted", "EPS (diluted)"],
  ["assets", "Total assets"],
  ["current_assets", "Current assets"],
  ["liabilities", "Total liabilities"],
  ["current_liabilities", "Current liabilities"],
  ["equity", "Shareholders' equity"],
  ["cash", "Cash & equivalents"],
] as const;
export type LineItem = (typeof LINE_ITEMS)[number][0];
export type FactPoint = {
  year: number;
  val: number;
  end: string;
  filed: string | null;
  accn: string | null;
  form: string | null;
};
const RATIOS = [
  "gross_margin",
  "operating_margin",
  "net_margin",
  "roe",
  "roa",
  "current_ratio",
  "debt_to_equity",
] as const;
export type Fundamentals = {
  ticker: string;
  name: string | null;
  as_of: string | null;
  latest_year: number | null;
  latest_filed: string | null;
  ratios: Record<(typeof RATIOS)[number], Num>;
  revenue_growth: Num;
  history: Record<LineItem, FactPoint[]>;
};
export function adaptFundamentals(value: unknown): Fundamentals {
  const o = obj(value, "Fundamentals");
  const history = obj(o.history, "history");
  return {
    ticker: str(o.ticker, "ticker"),
    name: optStr(o.name, "name"),
    as_of: optStr(o.as_of, "as_of"),
    latest_year: numOrNull(o.latest_year ?? null, "latest_year"),
    latest_filed: optStr(o.latest_filed, "latest_filed"),
    ratios: pick(o.ratios, RATIOS, "ratios"),
    revenue_growth: numOrNull(o.revenue_growth, "revenue_growth"),
    history: Object.fromEntries(
      LINE_ITEMS.map(([key]) => [
        key,
        arr(history[key] ?? [], `history.${key}`).map((p, i) => {
          const x = obj(p, `history.${key}[${i}]`);
          return {
            year: num(x.year, "year"),
            val: num(x.val, "val"),
            end: str(x.end, "end"),
            filed: optStr(x.filed, "filed"),
            accn: optStr(x.accn, "accn"),
            form: optStr(x.form, "form"),
          };
        }),
      ]),
    ) as Record<LineItem, FactPoint[]>,
  };
}

/** Fiscal years present in any line item, newest first, capped for the table. */
export function fiscalYears(f: Fundamentals, limit = 6): number[] {
  const years = new Set<number>();
  for (const points of Object.values(f.history)) for (const p of points) years.add(p.year);
  return [...years].sort((a, b) => b - a).slice(0, limit);
}

// ---------------------------------------------------------------- research

export type ResearchIndex = { ticker: string; files: string[]; chunks: number };
export function adaptResearchIndex(value: unknown): ResearchIndex {
  const o = obj(value, "Research index");
  return {
    ticker: str(o.ticker, "ticker"),
    files: strs(o.files, "files"),
    chunks: num(o.chunks, "chunks"),
  };
}
export type ResearchAnswer = {
  answer: string;
  grounded: boolean;
  provider: string | null;
  citations: { n: number; source_file: string; page: string; text: string }[];
};
export function adaptResearchAnswer(value: unknown): ResearchAnswer {
  const o = obj(value, "Research answer");
  if (typeof o.answer !== "string") throw new MarketsContractError("answer must be a string.");
  return {
    answer: o.answer,
    grounded: bool(o.grounded, "grounded"),
    provider: optStr(o.provider, "provider"),
    citations: arr(o.citations, "citations").map((c, i) => {
      const x = obj(c, `citations[${i}]`);
      const page = x.page_number;
      return {
        n: num(x.n, "n"),
        source_file: str(x.source_file, "source_file"),
        page: typeof page === "number" || typeof page === "string" ? String(page) : "N/A",
        text: typeof x.text === "string" ? x.text : "",
      };
    }),
  };
}
