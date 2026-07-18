import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import {
  fetchStockIntelligence,
  type IntelligenceIssue,
  type SourceLineage,
  type StockIntelligence,
} from "@/lib/intelligence";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("en-US", {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
});

export function StockIntelligencePanel({ activeSymbol }: { activeSymbol: string }) {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [tradeYear, setTradeYear] = useState(() => new Date().getUTCFullYear() - 2);
  const [data, setData] = useState<StockIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStockIntelligence({
        ticker: activeSymbol,
        asOf,
        tradeYear,
      });
      if (requestId.current === currentRequest) setData(result);
    } catch (cause) {
      if (requestId.current === currentRequest) {
        setError(cause instanceof Error ? cause.message : "Stock intelligence request failed.");
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [activeSymbol, asOf, tradeYear]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mono-caps flex shrink-0 flex-wrap items-center gap-2 border-b border-divider bg-panel px-3 py-2 text-[9px]">
        <span className="border border-primary bg-primary/10 px-2 py-1 text-primary">
          {activeSymbol} · STOCK INTELLIGENCE
        </span>
        {data && (
          <>
            <span className="text-foreground">{data.company}</span>
            <span className="text-muted-foreground">{data.industry}</span>
            <span className="ml-auto border border-info/40 px-2 py-1 text-info">
              {data.country.name} · AUTO FROM TICKER
            </span>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <form
          onSubmit={submit}
          className="mono-caps flex flex-wrap items-end gap-2 border border-divider bg-raised p-2 text-[9px]"
        >
          <Field label="SELECTED SECURITY">
            <div className="flex h-7 items-center border border-primary/50 bg-panel px-2 text-primary">
              {activeSymbol}
            </div>
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
          <button
            type="submit"
            disabled={loading}
            className="interactive h-7 border border-primary bg-primary/10 px-3 text-primary disabled:opacity-50"
          >
            {loading ? "RECONSTRUCTING…" : "REFRESH EVIDENCE"}
          </button>
          {data && <Status status={data.status} confidence={data.confidence.score} />}
        </form>

        {error && <ErrorState message={error} onRetry={load} />}
        {data && (
          <>
            <div className="mt-2 border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="mono-caps text-[9px] text-primary">
                WHY THIS EVIDENCE IS RELEVANT TO {data.ticker}
              </div>
              <div className="mt-1 font-serif text-[12px] leading-snug text-foreground">
                {data.focus}
              </div>
              <div className="mono-caps mt-1 text-[8px] text-faint">
                INDUSTRY AND SUPPLY-CHAIN PROXIES · NOT COMPANY REVENUE OR A RETURN FORECAST
              </div>
            </div>

            <div className="mono-caps mt-2 flex flex-wrap items-center justify-between gap-2 border border-info/30 bg-info/5 px-3 py-2 text-[9px]">
              <span className="text-info">FRED/ALFRED VINTAGE LOCK · {data.as_of}</span>
              <span className="text-muted-foreground">{data.vintage_scope}</span>
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

            <section className="mt-2 border border-divider bg-panel">
              <SectionHeader
                title="STOCK-RELEVANT GOODS TRADE"
                meta={
                  data.trade_product
                    ? `HS ${data.trade_product.hs_code} · ${data.trade_product.year}`
                    : "NO GOODS PROXY REGISTERED"
                }
              />
              {data.trade_product ? (
                <div className="grid gap-px bg-divider md:grid-cols-2">
                  {(["exports", "imports"] as const).map((flowName) => {
                    const flow = data.trade_product?.flows.find((item) => item.flow === flowName);
                    return (
                      <div key={flowName} className="bg-panel p-3">
                        <div className="mono-caps text-[9px] text-faint">
                          {data.country.name.toUpperCase()} {flowName.toUpperCase()} ·{" "}
                          {data.trade_product?.label}
                        </div>
                        <div className="mt-1 font-mono text-2xl tabular-nums text-primary">
                          {flow?.primary_value_usd != null
                            ? compactUsd.format(flow.primary_value_usd)
                            : "—"}
                        </div>
                        <div className="mono-caps mt-1 text-[8px] text-muted-foreground">
                          HS {data.trade_product?.hs_code} · {flow?.record_count ?? 0} normalized
                          records
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="This ticker uses industry-demand series only; no defensible goods-trade proxy is registered." />
              )}
            </section>

            <section className="mt-2 border border-divider bg-panel">
              <SectionHeader title="SIGNAL DEFINITIONS" meta="REGISTERED PROFILE" />
              <div className="grid gap-px bg-divider lg:grid-cols-3">
                {data.feature_definitions.map((feature) => (
                  <div key={feature.id} className="bg-panel p-2">
                    <div className="mono-caps text-[9px] text-info">{feature.id}</div>
                    <div className="mt-1 font-serif text-[11px] leading-snug text-muted-foreground">
                      {feature.definition}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Issues issues={data.issues} />
            <LineagePanel lineage={data.lineage} />
          </>
        )}
      </div>
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

function formatSigned(value?: number | null) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${number.format(value)}`;
}
