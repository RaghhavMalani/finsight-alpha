import { api } from "@/lib/api";

export type SourceLineage = {
  provider: string;
  source_url: string;
  snapshot_id: string;
  content_hash: string;
  request_fingerprint: string;
  retrieved_at: string;
  vintage_date?: string | null;
  cached: boolean;
  warning?: string | null;
};

export type IntelligenceIssue = { source: string; message: string };

export type MandiRecord = {
  state?: string | null;
  district?: string | null;
  market?: string | null;
  commodity?: string | null;
  variety?: string | null;
  grade?: string | null;
  arrival_date?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  modal_price?: number | null;
};

export type AgricultureOverview = {
  product: "agriculture-intelligence";
  status: "healthy" | "degraded" | "unavailable";
  generated_at: string;
  query: Record<string, string | number | null>;
  mandi: null | {
    resource_id: string;
    record_count: number;
    latest_arrival_date?: string | null;
    freshness_days?: number | null;
    market_count: number;
    district_count: number;
    modal_price_median?: number | null;
    modal_price_low?: number | null;
    modal_price_high?: number | null;
    field_completeness: number;
    records: MandiRecord[];
  };
  weather: null | {
    timezone?: string | null;
    total_precipitation_mm: number;
    maximum_temperature_c?: number | null;
    alerts: Array<{ type: string; severity: string; value: number; unit: string }>;
    forecast_days: Array<{
      date: string;
      temperature_max_c?: number | null;
      temperature_min_c?: number | null;
      precipitation_mm?: number | null;
      precipitation_probability_pct?: number | null;
    }>;
    method: string;
  };
  confidence: {
    score: number;
    coverage: string;
    cached_sources: number;
    freshness: number;
    method: string;
  };
  lineage: SourceLineage[];
  issues: IntelligenceIssue[];
};

export type CountryIndicator = {
  id: string;
  series_id: string;
  label: string;
  frequency: string;
  unit: string;
  latest_date?: string | null;
  latest_value?: number | null;
  previous_value?: number | null;
  change?: number | null;
  observation_count: number;
  realtime_start: string;
  realtime_end: string;
};

export type CountryPulse = {
  product: "trade-country-growth-pulse";
  status: "healthy" | "degraded" | "unavailable";
  generated_at: string;
  country: {
    code: string;
    name: string;
    wto_reporter_code: string;
    comtrade_reporter_code: number;
  };
  as_of: string;
  vintage_mode: true;
  vintage_scope: string;
  indicators: CountryIndicator[];
  wto_monthly_trade: Array<{
    id: string;
    indicator_code: string;
    label: string;
    latest_period?: string | null;
    latest_value?: number | null;
    unit?: string | null;
    change_pct?: number | null;
    comparison: string;
    points: Array<{ period: string; value: number; unit?: string | null }>;
  }>;
  commodity_trade: null | {
    period: number;
    commodity_code: string;
    flow: string;
    record_count: number;
    primary_value_usd?: number | null;
    records: Array<Record<string, unknown>>;
  };
  alerts: Array<{ type: string; severity: string; value: number }>;
  confidence: {
    score: number;
    coverage: string;
    cached_sources: number;
    freshness: number;
    method: string;
  };
  lineage: SourceLineage[];
  issues: IntelligenceIssue[];
};

export async function fetchAgricultureOverview(input: {
  state: string;
  commodity: string;
  latitude: number;
  longitude: number;
  district?: string;
  market?: string;
}): Promise<AgricultureOverview> {
  const params = new URLSearchParams({
    state: input.state,
    commodity: input.commodity,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    limit: "100",
  });
  if (input.district) params.set("district", input.district);
  if (input.market) params.set("market", input.market);
  return api<AgricultureOverview>(`/intelligence/agriculture/overview?${params}`);
}

export async function fetchCountryPulse(input: {
  country: "IND" | "USA";
  asOf: string;
  tradeYear: number;
  commodityCode: string;
}): Promise<CountryPulse> {
  const params = new URLSearchParams({
    as_of: input.asOf,
    trade_year: String(input.tradeYear),
    commodity_code: input.commodityCode,
  });
  return api<CountryPulse>(`/intelligence/country/${input.country}/pulse?${params}`);
}
