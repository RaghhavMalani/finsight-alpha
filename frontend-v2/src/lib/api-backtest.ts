import { api, type Backtest } from "@/lib/api";
import type { Condition, Strategy } from "@/lib/strategies";

type ApiCondition = {
  type: string;
  period?: number;
  value?: number;
  fast?: number;
  slow?: number;
};

function toApiCondition(condition: Condition): ApiCondition | null {
  const { left, op, right } = condition;

  if (left.kind === "RSI" && right.kind === "CONST") {
    if (op === "<" || op === "<=")
      return { type: "rsi_below", period: left.period, value: right.value };
    if (op === ">" || op === ">=")
      return { type: "rsi_above", period: left.period, value: right.value };
  }

  if (left.kind === "MOMENTUM" && right.kind === "CONST") {
    const threshold = Math.abs(right.value) >= 1 ? right.value / 100 : right.value;
    if (op === ">" || op === ">=")
      return { type: "momentum_above", period: left.period, value: threshold };
    if (op === "<" || op === "<=")
      return { type: "momentum_below", period: left.period, value: threshold };
  }

  if (left.kind === "SMA" && right.kind === "SMA") {
    if (op === "CROSS_UP" || op === ">" || op === ">=") {
      return { type: "sma_fast_above_slow", fast: left.period, slow: right.period };
    }
    if (op === "CROSS_DN" || op === "<" || op === "<=") {
      return { type: "sma_fast_below_slow", fast: left.period, slow: right.period };
    }
  }

  if (left.kind === "PRICE" && right.kind === "SMA") {
    if (op === "CROSS_UP" || op === ">" || op === ">=")
      return { type: "price_above_sma", period: right.period };
    if (op === "CROSS_DN" || op === "<" || op === "<=")
      return { type: "price_below_sma", period: right.period };
  }

  return null;
}

export async function runApiBacktest(strategy: Strategy, ticker: string): Promise<Backtest> {
  const entry = strategy.entry
    .map(toApiCondition)
    .filter((item): item is ApiCondition => item !== null);
  const exit = strategy.exit
    .map(toApiCondition)
    .filter((item): item is ApiCondition => item !== null);

  if (!entry.length || !exit.length) {
    throw new Error("This strategy uses a rule that the server backtest does not support yet.");
  }

  return api<Backtest>("/strategy/run", {
    method: "POST",
    body: JSON.stringify({
      ticker,
      entry,
      exit,
      entry_mode: "all",
      exit_mode: "any",
      cost_bps: 5,
      oos_split: 0.7,
    }),
  });
}
