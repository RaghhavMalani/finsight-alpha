import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import {
  fetchAgricultureOverview,
  fetchCountryPulse,
  type AgricultureOverview,
  type CountryPulse,
  type IntelligenceIssue,
  type SourceLineage,
} from "@/lib/intelligence";

type Workspace = "AGRICULTURE" | "COUNTRY";

const REGIONS = {
  Maharashtra: { latitude: 18.5204, longitude: 73.8567 },
  Karnataka: { latitude: 12.9716, longitude: 77.5946 },
  Punjab: { latitude: 30.901, longitude: 75.8573 },
  "Uttar Pradesh": { latitude: 26.8467, longitude: 80.9462 },
} as const;

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("en-US", {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
});

export function IntelligencePanel() {
  const [workspace, setWorkspace] = useState<Workspace>("AGRICULTURE");
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mono-caps flex shrink-0 items-center justify-between border-b border-divider bg-panel px-3 py-2 text-[9px]">
        <div className="flex gap-1">
          {(["AGRICULTURE", "COUNTRY"] as Workspace[]).map((item) => (
            <button
              key={item}
              onClick={() => setWorkspace(item)}
              className={`interactive border px-3 py-1 ${
                workspace === item
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item === "COUNTRY" ? "TRADE + COUNTRY" : item}
            </button>
          ))}
        </div>
        <span className="text-faint">IMMUTABLE SOURCES · VINTAGE-AWARE</span>
      </div>
      {workspace === "AGRICULTURE" ? <AgricultureWorkspace /> : <CountryWorkspace />}
    </div>
  );
}

function AgricultureWorkspace() {
  const [state, setState] = useState<keyof typeof REGIONS>("Maharashtra");
  const [commodity, setCommodity] = useState("Onion");
  const [data, setData] = useState<AgricultureOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchAgricultureOverview({
          state,
          commodity,
          ...REGIONS[state],
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agriculture intelligence request failed.");
    } finally {
      setLoading(false);
    }
  }, [commodity, state]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <form
        onSubmit={submit}
        className="mono-caps flex flex-wrap items-end gap-2 border border-divider bg-raised p-2 text-[9px]"
      >
        <Field label="REGION">
          <select
            value={state}
            onChange={(event) => setState(event.target.value as keyof typeof REGIONS)}
            className="h-7 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          >
            {Object.keys(REGIONS).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="COMMODITY">
          <select
            value={commodity}
            onChange={(event) => setCommodity(event.target.value)}
            className="h-7 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          >
            {["Onion", "Tomato", "Potato", "Wheat", "Rice"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="interactive h-7 border border-primary bg-primary/10 px-3 text-primary disabled:opacity-50"
        >
          {loading ? "INGESTING…" : "REFRESH SOURCES"}
        </button>
        {data && <Status status={data.status} confidence={data.confidence.score} />}
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {data && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Metric label="LATEST MANDI" value={data.mandi?.latest_arrival_date ?? "—"} />
            <Metric
              label="MEDIAN MODAL"
              value={
                data.mandi?.modal_price_median != null
                  ? `₹${number.format(data.mandi.modal_price_median)}`
                  : "—"
              }
              note="provider-reported unit"
            />
            <Metric
              label="MARKETS"
              value={data.mandi?.market_count ?? "—"}
              note={`${data.mandi?.district_count ?? 0} districts`}
            />
            <Metric
              label="7D RAIN"
              value={
                data.weather ? `${number.format(data.weather.total_precipitation_mm)} mm` : "—"
              }
            />
            <Metric
              label="MAX TEMP"
              value={
                data.weather?.maximum_temperature_c != null
                  ? `${number.format(data.weather.maximum_temperature_c)}°C`
                  : "—"
              }
            />
          </div>

          <AlertRow
            alerts={data.weather?.alerts ?? []}
            empty="No threshold weather alerts in the seven-day forecast."
          />

          <section className="mt-2 min-h-48 border border-divider bg-panel">
            <SectionHeader
              title="MANDI OBSERVATIONS"
              meta={`${data.mandi?.record_count ?? 0} records · ${Math.round((data.mandi?.field_completeness ?? 0) * 100)}% complete`}
            />
            <div className="max-h-72 overflow-auto">
              <table className="w-full border-collapse font-mono text-[10px]">
                <thead className="sticky top-0 bg-raised text-faint">
                  <tr>
                    {["DATE", "MARKET", "DISTRICT", "VARIETY", "MIN", "MAX", "MODAL"].map(
                      (label) => (
                        <th
                          key={label}
                          className="border-b border-divider px-2 py-1 text-left font-normal"
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(data.mandi?.records ?? []).slice(0, 100).map((record, index) => (
                    <tr
                      key={`${record.market}-${record.arrival_date}-${index}`}
                      className="border-b border-divider/50 hover:bg-raised"
                    >
                      <td className="px-2 py-1 text-muted-foreground">
                        {record.arrival_date ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-foreground">{record.market ?? "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{record.district ?? "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{record.variety ?? "—"}</td>
                      <td className="px-2 py-1 tabular-nums">{formatNumber(record.min_price)}</td>
                      <td className="px-2 py-1 tabular-nums">{formatNumber(record.max_price)}</td>
                      <td className="px-2 py-1 tabular-nums text-primary">
                        {formatNumber(record.modal_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.mandi?.records.length && (
                <EmptyState text="No matching mandi observations are available yet." />
              )}
            </div>
          </section>
          <Issues issues={data.issues} />
          <LineagePanel lineage={data.lineage} />
        </>
      )}
    </div>
  );
}

function CountryWorkspace() {
  const [country, setCountry] = useState<"IND" | "USA">("IND");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [tradeYear, setTradeYear] = useState(() => new Date().getUTCFullYear() - 2);
  const [commodityCode, setCommodityCode] = useState("10");
  const [data, setData] = useState<CountryPulse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCountryPulse({ country, asOf, tradeYear, commodityCode }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Country pulse request failed.");
    } finally {
      setLoading(false);
    }
  }, [asOf, commodityCode, country, tradeYear]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <form
        onSubmit={submit}
        className="mono-caps flex flex-wrap items-end gap-2 border border-divider bg-raised p-2 text-[9px]"
      >
        <Field label="ECONOMY">
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value as "IND" | "USA")}
            className="h-7 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          >
            <option value="IND">India</option>
            <option value="USA">United States</option>
          </select>
        </Field>
        <Field label="KNOWN AS OF">
          <input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            className="h-7 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          />
        </Field>
        <Field label="TRADE YEAR">
          <input
            type="number"
            min="2000"
            max="2100"
            value={tradeYear}
            onChange={(event) => setTradeYear(Number(event.target.value))}
            className="h-7 w-20 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          />
        </Field>
        <Field label="HS PRODUCT">
          <select
            value={commodityCode}
            onChange={(event) => setCommodityCode(event.target.value)}
            className="h-7 border border-border bg-panel px-2 text-foreground outline-none focus:border-primary"
          >
            <option value="10">10 · Cereals</option>
            <option value="12">12 · Oil seeds</option>
            <option value="27">27 · Mineral fuels</option>
            <option value="84">84 · Machinery</option>
            <option value="85">85 · Electrical equipment</option>
          </select>
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="interactive h-7 border border-primary bg-primary/10 px-3 text-primary disabled:opacity-50"
        >
          {loading ? "RECONSTRUCTING…" : "RUN PULSE"}
        </button>
        {data && <Status status={data.status} confidence={data.confidence.score} />}
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {data && (
        <>
          <div className="mono-caps mt-2 flex items-center justify-between border border-primary/30 bg-primary/5 px-3 py-2 text-[9px]">
            <span className="text-primary">FRED/ALFRED VINTAGE LOCK · {data.as_of}</span>
            <span className="text-muted-foreground">
              WTO + Comtrade use current releases for the selected periods
            </span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            {data.indicators.map((indicator) => (
              <Metric
                key={indicator.id}
                label={indicator.label.toUpperCase()}
                value={
                  indicator.latest_value != null
                    ? `${number.format(indicator.latest_value)} ${indicator.unit}`
                    : "—"
                }
                note={`${indicator.latest_date ?? "no observation"} · ${indicator.series_id} · Δ ${formatSigned(indicator.change)}`}
              />
            ))}
          </div>
          <AlertRow
            alerts={data.alerts}
            empty="No configured contraction or inflation thresholds triggered."
          />

          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <section className="border border-divider bg-panel">
              <SectionHeader title="WTO MONTHLY TRADE" meta="official timeseries" />
              <div className="grid grid-cols-2 gap-px bg-divider">
                {data.wto_monthly_trade.map((series) => (
                  <div key={series.id} className="bg-panel p-3">
                    <div className="mono-caps text-[9px] text-faint">
                      {series.id} · {series.indicator_code}
                    </div>
                    <div className="mt-1 font-mono text-xl tabular-nums text-foreground">
                      {series.latest_value != null ? number.format(series.latest_value) : "—"}
                    </div>
                    <div className="mono-caps mt-1 text-[9px] text-muted-foreground">
                      {series.unit ?? "provider unit"} · {series.latest_period ?? "—"}
                    </div>
                    <div
                      className={`mono-caps mt-2 text-[10px] ${(series.change_pct ?? 0) >= 0 ? "text-up" : "text-down"}`}
                    >
                      {formatSigned(series.change_pct)}% · {series.comparison}
                    </div>
                  </div>
                ))}
              </div>
              {!data.wto_monthly_trade.length && (
                <EmptyState text="WTO series unavailable for this vintage." />
              )}
            </section>
            <section className="border border-divider bg-panel">
              <SectionHeader
                title="UN COMTRADE PRODUCT FLOW"
                meta={`HS ${data.commodity_trade?.commodity_code ?? commodityCode}`}
              />
              <div className="p-3">
                <div className="mono-caps text-[9px] text-faint">
                  ANNUAL EXPORT VALUE · {data.commodity_trade?.period ?? tradeYear}
                </div>
                <div className="mt-1 font-mono text-2xl tabular-nums text-primary">
                  {data.commodity_trade?.primary_value_usd != null
                    ? compactUsd.format(data.commodity_trade.primary_value_usd)
                    : "—"}
                </div>
                <div className="mono-caps mt-2 text-[9px] text-muted-foreground">
                  {data.country.name} → selected partner · {data.commodity_trade?.record_count ?? 0}{" "}
                  normalized records
                </div>
                <div className="mt-3 border-l-2 border-info pl-2 font-serif text-[12px] leading-snug text-foreground">
                  WTO supplies the monthly macro trade pulse; Comtrade supplies the product-level
                  annual flow. They retain separate reporter-code systems in lineage.
                </div>
              </div>
            </section>
          </div>
          <Issues issues={data.issues} />
          <LineagePanel lineage={data.lineage} />
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-faint">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Status({ status, confidence }: { status: string; confidence: number }) {
  const color =
    status === "healthy"
      ? "text-up border-up/50"
      : status === "degraded"
        ? "text-primary border-primary/50"
        : "text-down border-down/50";
  return (
    <span className={`ml-auto border px-2 py-1 ${color}`}>
      {status.toUpperCase()} · CONF {confidence}
    </span>
  );
}

function Metric({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="border border-divider bg-panel p-3">
      <div className="mono-caps text-[9px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums text-foreground">{value}</div>
      {note && <div className="mono-caps mt-1 text-[8px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mono-caps flex items-center justify-between border-b border-divider bg-raised px-3 py-1.5 text-[9px]">
      <span className="text-foreground">{title}</span>
      <span className="text-faint">{meta}</span>
    </div>
  );
}

function AlertRow({
  alerts,
  empty,
}: {
  alerts: Array<{ type: string; severity: string; value: number; unit?: string }>;
  empty: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {alerts.map((alert, index) => (
        <div
          key={`${alert.type}-${index}`}
          className={`mono-caps border px-2 py-1 text-[9px] ${alert.severity === "high" ? "border-down/60 bg-down/5 text-down" : "border-primary/60 bg-primary/5 text-primary"}`}
        >
          {alert.type.replaceAll("-", " ")} · {number.format(alert.value)} {alert.unit ?? ""}
        </div>
      ))}
      {!alerts.length && (
        <div className="mono-caps border border-up/40 bg-up/5 px-2 py-1 text-[9px] text-up">
          {empty}
        </div>
      )}
    </div>
  );
}

function Issues({ issues }: { issues: IntelligenceIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="mt-2 border border-primary/40 bg-primary/5 p-2">
      <div className="mono-caps text-[9px] text-primary">PARTIAL COVERAGE</div>
      {issues.map((issue) => (
        <div
          key={`${issue.source}-${issue.message}`}
          className="mt-1 font-mono text-[9px] text-muted-foreground"
        >
          {issue.source} · {issue.message}
        </div>
      ))}
    </div>
  );
}

function LineagePanel({ lineage }: { lineage: SourceLineage[] }) {
  return (
    <section className="mt-2 border border-divider bg-panel">
      <SectionHeader title="SOURCE LINEAGE" meta={`${lineage.length} immutable versions`} />
      <div className="grid gap-px bg-divider lg:grid-cols-2">
        {lineage.map((source) => {
          const providerSlug = source.provider
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const href = `${API_BASE}/intelligence/snapshots/${providerSlug}/${source.snapshot_id}`;
          return (
            <a
              key={`${source.provider}-${source.request_fingerprint}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="interactive bg-panel p-2 hover:bg-raised"
            >
              <div className="mono-caps flex items-center justify-between text-[9px]">
                <span className="text-info">{source.provider}</span>
                <span className={source.cached ? "text-primary" : "text-up"}>
                  {source.cached ? "SNAPSHOT" : "LIVE"}
                </span>
              </div>
              <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                SHA {source.snapshot_id.slice(0, 12)} ·{" "}
                {new Date(source.retrieved_at).toLocaleString()}
              </div>
              <div className="mono-caps mt-1 text-[8px] text-faint">
                {source.vintage_date ? `VINTAGE ${source.vintage_date}` : "CURRENT RELEASE"} · OPEN
                RAW VERSION ↗
              </div>
            </a>
          );
        })}
      </div>
      {!lineage.length && <EmptyState text="No immutable source version is available yet." />}
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-2 border border-down/50 bg-down/5 p-3 font-mono text-[10px] text-down">
      {message}
      <button onClick={onRetry} className="interactive ml-3 border border-down/50 px-2 py-0.5">
        RETRY
      </button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="mono-caps p-4 text-center text-[9px] text-faint">{text}</div>;
}

function formatNumber(value?: number | null) {
  return value == null ? "—" : number.format(value);
}

function formatSigned(value?: number | null) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${number.format(value)}`;
}
