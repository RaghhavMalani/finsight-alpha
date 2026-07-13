import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type NullableNumber = number | null | undefined;
type CurrentRegime = {
  current_regime?: string | number | null;
  current_regime_probability?: string | number | null;
  current_regime_duration?: string | number | null;
  current_regime_risk_level?: string | number | null;
  regime_confidence_quality?: string | number | null;
  regime_stability?: string | number | null;
  recent_switches_20d?: string | number | null;
  latest_date?: string | number | null;
};

type RegimePayload = {
  ticker: string;
  model: string;
  n_states: number;
  timeline: Array<{ date: string; close: NullableNumber; state: number | null; label: string }>;
  labels: Record<string, string>;
  current: CurrentRegime;
  transition_matrix: { states: string[]; matrix: Array<Array<number | null>> };
  durations: Array<Record<string, unknown>>;
  performance: Array<{
    regime_label?: string;
    count?: NullableNumber;
    average_daily_return?: NullableNumber;
    annualized_return?: NullableNumber;
    annualized_volatility?: NullableNumber;
    sharpe_like_ratio?: NullableNumber;
    max_drawdown?: NullableNumber;
    positive_day_rate?: NullableNumber;
  }>;
};

const PALETTE = ["#42C98B", "#F0A929", "#5CA9E6", "#F06464", "#A98CF0", "#A7B0B7"];

function asNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: string | number | null | undefined) {
  return value == null || value === "" ? "—" : String(value);
}

function pct(value: NullableNumber, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-divider bg-raised px-3 py-2">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-[13px] tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function RegimeChart({ data, colors }: { data: RegimePayload; colors: Map<number, string> }) {
  const points = data.timeline.filter((point): point is typeof point & { close: number } => point.close != null && Number.isFinite(point.close));
  if (points.length < 2) {
    return <div className="p-4 text-[10px] text-faint">No regime timeline returned.</div>;
  }

  const width = 1000;
  const height = 230;
  const pad = 22;
  const ribbonHeight = 16;
  const plotHeight = height - pad * 2 - ribbonHeight;
  const prices = points.map((point) => point.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - min) / (max - min || 1)) * plotHeight;
  const line = points.map((point, index) => `${x(index)},${y(point.close)}`).join(" ");

  const spans: Array<{ start: number; end: number; state: number | null }> = [];
  points.forEach((point, index) => {
    const previous = spans[spans.length - 1];
    if (!previous || previous.state !== point.state) spans.push({ start: index, end: index, state: point.state });
    else previous.end = index;
  });

  return (
    <div className="overflow-hidden border border-divider bg-panel">
      <div className="mono-caps flex flex-wrap items-center gap-3 border-b border-divider px-3 py-1.5 text-[9px]">
        <span className="text-primary">REGIME TIMELINE · {points.length} OBSERVATIONS</span>
        <span className="ml-auto text-faint">{points[0].date} → {points[points.length - 1].date}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" preserveAspectRatio="none" aria-label="Historical price with detected regime ribbon">
        {spans.map((span, index) => (
          <rect
            key={`${span.start}-${index}`}
            x={x(span.start)}
            y={pad + plotHeight + 4}
            width={Math.max(1, x(span.end) - x(span.start) + width / points.length)}
            height={ribbonHeight}
            fill={span.state == null ? "#636C74" : colors.get(span.state) ?? "#636C74"}
            opacity="0.9"
          />
        ))}
        <polyline points={line} fill="none" stroke="#E7EAEC" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function MLRegimesLive({ symbol }: { symbol: string }) {
  const query = useQuery({
    queryKey: ["regime-live", symbol],
    queryFn: () => api<RegimePayload>(`/regime/${encodeURIComponent(symbol)}?model=hmm&n_states=4`),
    staleTime: 30 * 60_000,
    retry: 0,
  });

  const colors = useMemo(() => {
    const map = new Map<number, string>();
    query.data?.transition_matrix.states.forEach((state, index) => {
      const parsed = Number(state);
      if (Number.isFinite(parsed)) map.set(parsed, PALETTE[index % PALETTE.length]);
    });
    query.data?.timeline.forEach((point) => {
      if (point.state != null && !map.has(point.state)) map.set(point.state, PALETTE[map.size % PALETTE.length]);
    });
    return map;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border border-divider bg-panel p-5 text-center">
          <div className="mono-caps text-[11px] text-primary">FITTING HMM REGIMES · {symbol}</div>
          <div className="mt-2 max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Fetching historical prices and fitting the backend hidden-state model. Results are cached for 30 minutes.
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    const message = query.error instanceof Error ? query.error.message : "The regime endpoint did not return a result.";
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg border border-down/50 bg-down/5 p-5">
          <div className="mono-caps text-[11px] text-down">REAL REGIME MODEL UNAVAILABLE</div>
          <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{message}</div>
          <div className="mt-2 text-[10px] text-faint">No deterministic client-side regime is substituted.</div>
          <button className="mono-caps interactive mt-4 border border-border px-3 py-1 text-[9px] text-primary" onClick={() => query.refetch()}>
            RETRY MODEL RUN
          </button>
        </div>
      </div>
    );
  }

  const data = query.data;
  const probability = asNumber(data.current.current_regime_probability);
  const duration = asNumber(data.current.current_regime_duration);
  const switches = asNumber(data.current.recent_switches_20d);
  const risk = text(data.current.current_regime_risk_level);
  const riskTone = /high|elevated/i.test(risk) ? "text-down" : /low/i.test(risk) ? "text-up" : "text-primary";

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mono-caps mb-3 flex flex-wrap items-center gap-2 text-[9px] text-faint">
        <span className="text-primary">REAL REGIME OUTPUT · {data.ticker}</span>
        <span>MODEL {data.model.toUpperCase()}</span>
        <span>{data.n_states} STATES</span>
        <span>YFINANCE HISTORY</span>
        <span className="ml-auto">LATEST {text(data.current.latest_date)}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
        <div className="border border-divider bg-panel p-4">
          <div className="mono-caps text-[9px] text-faint">CURRENT DETECTED REGIME</div>
          <div className="mt-2 font-mono text-xl text-foreground">{text(data.current.current_regime)}</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="PROBABILITY" value={pct(probability)} />
            <Metric label="DURATION" value={duration == null ? "—" : `${duration.toFixed(0)}D`} />
            <Metric label="RISK LEVEL" value={risk} tone={riskTone} />
            <Metric label="STABILITY" value={text(data.current.regime_stability)} />
            <Metric label="CONFIDENCE" value={text(data.current.regime_confidence_quality)} />
            <Metric label="20D SWITCHES" value={switches == null ? "—" : switches.toFixed(0)} />
          </div>
        </div>
        <RegimeChart data={data} colors={colors} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border border-divider bg-panel p-3">
        {Object.entries(data.labels).map(([state, label], index) => {
          const parsed = Number(state);
          return (
            <span key={state} className="mono-caps flex items-center gap-1.5 border border-divider px-2 py-1 text-[9px] text-muted-foreground">
              <span className="inline-block h-2 w-3" style={{ background: colors.get(parsed) ?? PALETTE[index % PALETTE.length] }} />
              STATE {state} · {label}
            </span>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.25fr]">
        <div className="overflow-x-auto border border-divider bg-panel">
          <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">EMPIRICAL TRANSITION MATRIX · P(ROW → COL)</div>
          {data.transition_matrix.states.length === 0 ? (
            <div className="p-4 text-[10px] text-faint">No transition matrix returned.</div>
          ) : (
            <div className="p-3">
              <div className="grid" style={{ gridTemplateColumns: `90px repeat(${data.transition_matrix.states.length}, minmax(54px, 1fr))` }}>
                <span />
                {data.transition_matrix.states.map((state) => <span key={state} className="mono-caps px-1 py-1 text-center text-[8px] text-faint">S{state}</span>)}
                {data.transition_matrix.states.map((row, rowIndex) => (
                  <Fragment key={row}>
                    <span className="mono-caps flex items-center text-[8px] text-faint">STATE {row}</span>
                    {data.transition_matrix.states.map((column, columnIndex) => {
                      const value = data.transition_matrix.matrix[rowIndex]?.[columnIndex] ?? null;
                      const alpha = value == null ? 0 : Math.max(0.08, Math.min(0.95, value));
                      return (
                        <div key={column} className="m-px px-1 py-2 text-center font-mono text-[9px] tabular-nums text-foreground" style={{ background: `rgba(240,169,41,${alpha})` }}>
                          {pct(value, 0)}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-divider bg-panel">
          <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">OBSERVED PERFORMANCE BY REGIME</div>
          <table className="w-full min-w-[650px] text-left">
            <thead className="mono-caps text-[8px] text-faint">
              <tr>{["REGIME", "DAYS", "ANN. RETURN", "ANN. VOL", "SHARPE-LIKE", "MAX DD", "POS. DAYS"].map((label) => <th key={label} className="px-2 py-2 font-normal">{label}</th>)}</tr>
            </thead>
            <tbody className="font-mono text-[9px] tabular-nums">
              {data.performance.map((row, index) => (
                <tr key={`${row.regime_label ?? "regime"}-${index}`} className="border-t border-divider">
                  <td className="px-2 py-2 text-foreground">{row.regime_label ?? "—"}</td>
                  <td className="px-2 py-2">{row.count == null ? "—" : row.count.toFixed(0)}</td>
                  <td className="px-2 py-2">{pct(row.annualized_return)}</td>
                  <td className="px-2 py-2">{pct(row.annualized_volatility)}</td>
                  <td className="px-2 py-2">{row.sharpe_like_ratio == null ? "—" : row.sharpe_like_ratio.toFixed(2)}</td>
                  <td className="px-2 py-2 text-down">{pct(row.max_drawdown)}</td>
                  <td className="px-2 py-2">{pct(row.positive_day_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mono-caps mt-3 border-l-2 border-primary bg-primary/5 px-3 py-2 text-[9px] text-muted-foreground">
        RESEARCH OUTPUT · STATES ARE FIT FROM HISTORICAL PRICE FEATURES AND CAN CHANGE WHEN THE MODEL IS REFIT
      </div>
    </div>
  );
}
