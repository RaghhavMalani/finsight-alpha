import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  adaptBacktest,
  adaptFactors,
  adaptFundamentals,
  adaptMarketChain,
  adaptMonteCarlo,
  adaptOptionPrice,
  adaptPortfolio,
  adaptResearchAnswer,
  adaptResearchIndex,
  adaptRiskDashboard,
  adaptStrategy,
  adaptTheoreticalChain,
  adaptVolSurface,
  type BacktestStrategy,
  type StrategyLeg,
} from "./contracts";

const enc = encodeURIComponent;
const qs = (params: Record<string, string | number | boolean | null | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();

/** Retry once on network or 5xx errors; a 4xx answer won't change on retry. */
function retry(count: number, error: unknown) {
  return count < 1 && !(error instanceof ApiError && error.status < 500);
}
const common = { retry, staleTime: 60_000, refetchOnWindowFocus: false } as const;

function post<T>(path: string, body: unknown, adapt: (v: unknown) => T) {
  return api<unknown>(path, { method: "POST", body: JSON.stringify(body) }).then(adapt);
}

// ---------------------------------------------------------------- options

export function useMarketChain(ticker: string, days: number) {
  return useQuery({
    ...common,
    queryKey: ["markets", "market-chain", ticker, days],
    queryFn: () =>
      api<unknown>(`/options/market-chain/${enc(ticker)}?${qs({ target_days: days })}`).then(
        adaptMarketChain,
      ),
  });
}

export type PricerInput = {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  q: number;
  type: "call" | "put";
};
export function useOptionPrice(input: PricerInput | null) {
  return useQuery({
    ...common,
    queryKey: ["markets", "option-price", input],
    enabled: input != null,
    queryFn: () => api<unknown>(`/options/price?${qs(input!)}`).then(adaptOptionPrice),
  });
}

export type StrategyInput = {
  S: number;
  sigma: number;
  T: number;
  r: number;
  q: number;
  legs: StrategyLeg[];
};
export function useStrategy(input: StrategyInput | null) {
  return useQuery({
    ...common,
    queryKey: ["markets", "strategy", input],
    enabled: input != null && input.legs.length > 0,
    queryFn: () => post("/options/strategy", input, adaptStrategy),
  });
}

export function useVolSurface(ticker: string, enabled: boolean) {
  return useQuery({
    ...common,
    queryKey: ["markets", "vol-surface", ticker],
    enabled,
    queryFn: () => api<unknown>(`/vol/surface/${enc(ticker)}`).then(adaptVolSurface),
  });
}

export function useTheoreticalChain(ticker: string, enabled: boolean) {
  return useQuery({
    ...common,
    queryKey: ["markets", "theoretical-chain", ticker],
    enabled,
    queryFn: () => api<unknown>(`/options/chain/${enc(ticker)}`).then(adaptTheoreticalChain),
  });
}

// ---------------------------------------------------------------- risk

export function useRiskDashboard(ticker: string) {
  return useQuery({
    ...common,
    queryKey: ["markets", "risk-dashboard", ticker],
    queryFn: () => api<unknown>(`/risk/dashboard/${enc(ticker)}`).then(adaptRiskDashboard),
  });
}

export type MonteCarloInput = { horizon_days: number; n: number; conf: number; seed: number };
export function useMonteCarlo(ticker: string, input: MonteCarloInput) {
  return useQuery({
    ...common,
    queryKey: ["markets", "montecarlo", ticker, input],
    queryFn: () =>
      api<unknown>(`/risk/montecarlo/${enc(ticker)}?${qs(input)}`).then(adaptMonteCarlo),
  });
}

export function useFactors(ticker: string) {
  return useQuery({
    ...common,
    queryKey: ["markets", "factors", ticker],
    queryFn: () => api<unknown>(`/factors/${enc(ticker)}`).then(adaptFactors),
  });
}

export type Holding = { ticker: string; weight: number };
export function usePortfolio(holdings: Holding[] | null) {
  return useQuery({
    ...common,
    queryKey: ["markets", "portfolio", holdings],
    enabled: holdings != null && holdings.length > 0,
    queryFn: () => post("/portfolio/risk", { holdings, confidence: 0.95 }, adaptPortfolio),
  });
}

// ---------------------------------------------------------------- backtest

export type BacktestInput = {
  strategy: BacktestStrategy;
  fast: number;
  slow: number;
  rsi_period: number;
  rsi_low: number;
  rsi_high: number;
};
export function useBacktest(ticker: string, input: BacktestInput) {
  return useQuery({
    ...common,
    queryKey: ["markets", "backtest", ticker, input],
    queryFn: () => api<unknown>(`/backtest/${enc(ticker)}?${qs(input)}`).then(adaptBacktest),
  });
}

// ---------------------------------------------------------------- fundamentals

export function useFundamentals(ticker: string, asOf: string) {
  return useQuery({
    ...common,
    queryKey: ["markets", "fundamentals", ticker, asOf],
    queryFn: () =>
      api<unknown>(`/fundamentals/${enc(ticker)}?${qs({ as_of: asOf })}`).then(adaptFundamentals),
  });
}

// ---------------------------------------------------------------- research

export function useResearchIndex() {
  return useMutation({
    mutationFn: (ticker: string) =>
      post(`/research/fetch/${enc(ticker)}`, undefined, adaptResearchIndex),
  });
}

export function useResearchAsk() {
  return useMutation({
    mutationFn: ({ ticker, question }: { ticker: string; question: string }) =>
      api<unknown>(`/research/ask?${qs({ q: question, ticker })}`).then(adaptResearchAnswer),
  });
}
