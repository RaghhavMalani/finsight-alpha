// Real external data sources for the ALT screen — all free, key-less, CORS-enabled.
// Every fetcher returns null on any failure so callers can fall back to sim.
//   WEATHER — Open-Meteo forecast API (temperature → heating-degree-day proxy)
//   TRADE   — World Bank indicators API (US merchandise exports, annual)
//   CRYPTO  — CoinGecko simple price (BTC-USD live spot)
// Kaggle-style extracts are bundled statically in ./kaggle-extracts.ts.

export type LivePoint = { t: number; v: number };
export type LiveSource = "LIVE" | "KAGGLE" | "SIM";

const TTL = 5 * 60_000; // 5-minute cache
const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  try {
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/** Open-Meteo: past 14 days + 7-day forecast of daily mean temp for Chicago
 *  (proxy for US heating demand). Returns heating-degree-days: max(0, 18°C − mean). */
export async function fetchWeatherHDD(): Promise<LivePoint[] | null> {
  return cached("weather", async () => {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=41.88&longitude=-87.63" +
      "&daily=temperature_2m_mean&past_days=14&forecast_days=7&timezone=UTC";
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as {
      daily?: { time?: string[]; temperature_2m_mean?: number[] };
    };
    const times = j.daily?.time ?? [];
    const temps = j.daily?.temperature_2m_mean ?? [];
    if (!times.length || times.length !== temps.length) throw new Error("shape");
    return times.map((d, i) => ({
      t: new Date(d).getTime(),
      v: Math.max(0, 18 - temps[i]), // HDD, °C basis
    }));
  });
}

/** World Bank: US merchandise exports (current US$), annual, last ~15 years. */
export async function fetchTradeExports(): Promise<LivePoint[] | null> {
  return cached("trade", async () => {
    const url =
      "https://api.worldbank.org/v2/country/USA/indicator/TX.VAL.MRCH.CD.WT?format=json&per_page=20";
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as [unknown, Array<{ date: string; value: number | null }>];
    const rows = (j?.[1] ?? []).filter((r) => r.value != null);
    if (!rows.length) throw new Error("empty");
    return rows
      .map((r) => ({ t: new Date(`${r.date}-12-31`).getTime(), v: (r.value as number) / 1e9 })) // $B
      .sort((a, b) => a.t - b.t);
  });
}

/** CoinGecko: live BTC spot in USD. */
export async function fetchBtcSpot(): Promise<number | null> {
  return cached("btc", async () => {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    );
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { bitcoin?: { usd?: number } };
    const v = j.bitcoin?.usd;
    if (typeof v !== "number") throw new Error("shape");
    return v;
  });
}
