import type { Backtest } from "@/lib/api";
import type { BacktestResult } from "@/lib/backtest";

function number(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function timestamp(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function stats(
  source: Record<string, number | null>,
  tradesFallback: number,
): BacktestResult["stats"] {
  return {
    cagr: number(source.cagr),
    sharpe: number(source.sharpe),
    sortino: number(source.sortino),
    maxDD: number(source.max_drawdown),
    winRate: number(source.win_rate),
    profitFactor: number(source.profit_factor),
    trades: number(source.trades) || tradesFallback,
    exposure: number(source.exposure),
  };
}

/** Adapt the authoritative API payload to the existing chart view model. */
export function serverBacktestView(source: Backtest, strategyName: string): BacktestResult {
  const aligned = source.dates
    .map((day, index) => ({
      day,
      equity: source.equity[index],
      benchmark: source.benchmark[index],
    }))
    .filter(
      (point): point is { day: string; equity: number; benchmark: number } =>
        typeof point.equity === "number" && typeof point.benchmark === "number",
    );
  const equity = aligned.map((point) => point.equity);
  const benchmark = aligned.map((point) => point.benchmark);
  let peak = equity[0] ?? 1;
  const drawdown = equity.map((value) => {
    peak = Math.max(peak, value);
    return value / Math.max(peak, Number.EPSILON) - 1;
  });
  const bars = source.ohlc
    .filter((bar): bar is typeof bar & { close: number } => typeof bar.close === "number")
    .map((bar) => ({ t: timestamp(bar.time), p: bar.close }));
  const trades = source.trades.map((trade) => ({
    entryT: timestamp(trade.entry_date),
    exitT: timestamp(trade.exit_date),
    entryPx: trade.entry,
    exitPx: trade.exit,
    pnlPct: number(trade.return) * 100,
    win: number(trade.return) > 0,
  }));
  const splitIndex = source.split_date
    ? aligned.findIndex((point) => point.day >= source.split_date!)
    : -1;

  return {
    ticker: source.ticker,
    strategy: strategyName,
    bars,
    equity,
    benchmark,
    drawdown,
    trades,
    stats: stats(source.stats, source.n_trades),
    monthlyReturns: source.monthly
      .filter((month) => typeof month.ret === "number")
      .map((month) => {
        const [year, oneBasedMonth] = month.month.split("-").map(Number);
        return { year, month: oneBasedMonth - 1, ret: number(month.ret) };
      }),
    oosStats: stats(source.out_of_sample, 0),
    oosStartIdx: splitIndex >= 0 ? splitIndex : Math.floor(aligned.length * 0.7),
  };
}
