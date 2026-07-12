export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8000"
    : "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload.detail === "string" ? payload.detail : response.statusText;
    throw new ApiError(detail || "API request failed", response.status);
  }
  return payload as T;
}

export type User = { id: number; email: string };

export type TapeItem = {
  ticker: string;
  last: number;
  change_pct: number;
  live: boolean;
};

export type Quote = {
  ticker: string;
  name: string;
  last: number;
  prev: number;
  change_pct: number;
  rsi: number | null;
  vol_last: number | null;
  metrics: Record<string, number | null>;
  periods: Record<string, number | null>;
  range52: { high: number; low: number; pos: number | null };
  series: Array<{
    date: string;
    close: number | null;
    sma50: number | null;
    sma200: number | null;
    drawdown: number | null;
    vol: number | null;
  }>;
};

export type NewsPayload = {
  ticker: string;
  aggregate?: { label?: string; score?: number };
  overall_score?: number;
  overall_label?: string;
  counts?: Record<string, number>;
  items?: Array<Record<string, unknown>>;
  headlines?: Array<Record<string, unknown>>;
};

export type Weather = {
  city: string;
  region?: string;
  country?: string;
  temperature_c: number;
  apparent_c: number;
  precipitation_mm: number;
  wind_kph: number;
  condition: string;
  operational_risk: "normal" | "elevated";
  observed_at?: string;
  source: string;
};

export type Datasets = {
  configured: boolean;
  root: string;
  count: number;
  message: string;
  datasets: Array<{
    name: string;
    format: string;
    size_mb: number;
    updated_at: string;
    relative_path: string;
  }>;
};

export type Providers = Record<
  string,
  { configured: boolean; provider?: string; purpose?: string }
>;

export type RiskDashboard = {
  ticker: string;
  last?: number;
  volatility?: number;
  var?: Record<string, number | null>;
  stress?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type Backtest = {
  ticker: string;
  dates: string[];
  equity: Array<number | null>;
  benchmark: Array<number | null>;
  stats: Record<string, number | null>;
  buy_hold: Record<string, number | null>;
  in_sample: Record<string, number | null>;
  out_of_sample: Record<string, number | null>;
  n_trades: number;
};
