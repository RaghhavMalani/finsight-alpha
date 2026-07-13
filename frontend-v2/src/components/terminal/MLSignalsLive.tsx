import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type NullableNumber = number | null | undefined;

type SignalPayload = {
  ticker: string;
  benchmark: string;
  horizon_days: number;
  n_rows: number;
  n_features: number;
  signal: {
    label: string | null;
    allowed: boolean;
    strength: string | null;
    confidence_band: string | null;
    validation_quality: string | null;
    prob_up: NullableNumber;
    explanation: string | null;
  };
  validation: {
    best_model: string | null;
    roc_auc: NullableNumber;
    model_edge: NullableNumber;
    brier_score: NullableNumber;
    baseline_accuracy: NullableNumber;
  };
  model_scorecard: Array<{
    model_name?: string;
    accuracy?: NullableNumber;
    precision?: NullableNumber;
    recall?: NullableNumber;
    f1_score?: NullableNumber;
    roc_auc?: NullableNumber;
    brier_score?: NullableNumber;
    model_edge?: NullableNumber;
  }>;
  top_features: Array<{ feature?: string; importance?: NullableNumber }>;
  market_context: {
    trend_regime: string;
    volatility_regime: string;
    realized_vol_20: NullableNumber;
    drawdown_from_52w_high: NullableNumber;
    rolling_beta_60: NullableNumber;
  };
  prob_timeline: { dates: string[]; prob_up: NullableNumber[] };
};

function pct(value: NullableNumber, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function num(value: NullableNumber, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-divider bg-raised px-3 py-2">
      <div className="mono-caps text-[9px] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-base tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function ProbabilityChart({ payload }: { payload: SignalPayload }) {
  const points = payload.prob_timeline.prob_up
    .map((value, index) => ({ value, date: payload.prob_timeline.dates[index] }))
    .filter((point): point is { value: number; date: string } => point.value != null && Number.isFinite(point.value));

  if (points.length < 2) {
    return <div className="mono-caps p-4 text-[10px] text-faint">NO OUT-OF-SAMPLE PROBABILITY TIMELINE RETURNED</div>;
  }

  const width = 900;
  const height = 180;
  const pad = 18;
  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - value) * (height - pad * 2);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");

  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex justify-between border-b border-divider px-3 py-1.5 text-[9px]">
        <span className="text-primary">OUT-OF-SAMPLE P(UP)</span>
        <span className="text-faint">{points[0].date} → {points[points.length - 1].date}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none" aria-label="Out-of-sample probability of an upward move">
        <line x1={pad} x2={width - pad} y1={y(0.5)} y2={y(0.5)} stroke="#636C74" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <polyline points={polyline} fill="none" stroke="#F0A929" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function MLSignalsLive({ symbol }: { symbol: string }) {
  const query = useQuery({
    queryKey: ["ml-signal-live", symbol],
    queryFn: () => api<SignalPayload>(`/ml/signal/${encodeURIComponent(symbol)}?benchmark=SPY&horizon=1`),
    staleTime: 30 * 60_000,
    retry: 0,
  });

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border border-divider bg-panel p-5 text-center">
          <div className="mono-caps text-[11px] text-primary">TRAINING AND VALIDATING · {symbol}</div>
          <div className="mt-2 max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Fetching market history, engineering features, and running the backend model suite. The first request can take longer; results are cached for 30 minutes.
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    const message = query.error instanceof Error ? query.error.message : "The ML endpoint did not return a result.";
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg border border-down/50 bg-down/5 p-5">
          <div className="mono-caps text-[11px] text-down">REAL ML SIGNAL UNAVAILABLE</div>
          <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{message}</div>
          <div className="mt-2 text-[10px] text-faint">No canned signal is substituted.</div>
          <button className="mono-caps interactive mt-4 border border-border px-3 py-1 text-[9px] text-primary" onClick={() => query.refetch()}>
            RETRY MODEL RUN
          </button>
        </div>
      </div>
    );
  }

  const data = query.data;
  const probability = data.signal.prob_up;
  const bullish = probability != null && probability >= 0.5;
  const tone = !data.signal.allowed ? "text-muted-foreground" : bullish ? "text-up" : "text-down";
  const maxImportance = Math.max(0.000001, ...data.top_features.map((item) => Math.abs(item.importance ?? 0)));

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mono-caps mb-3 flex flex-wrap items-center gap-2 text-[9px] text-faint">
        <span className="text-primary">REAL MODEL OUTPUT · {data.ticker}</span>
        <span>YFINANCE HISTORY</span>
        <span>{data.n_rows.toLocaleString()} ROWS</span>
        <span>{data.n_features} FEATURES</span>
        <span>{data.horizon_days}D HORIZON</span>
        <span className="ml-auto">BENCHMARK {data.benchmark}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
        <div className="border border-divider bg-panel p-4">
          <div className="mono-caps text-[9px] text-faint">GATED SIGNAL</div>
          <div className={`mt-2 font-mono text-2xl tabular-nums ${tone}`}>
            {data.signal.allowed ? data.signal.label ?? "SIGNAL" : "NO RELIABLE SIGNAL"}
          </div>
          <div className="mt-1 font-mono text-lg tabular-nums text-foreground">
            P(UP) {pct(probability)}
          </div>
          <div className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {data.signal.explanation ?? "The backend returned no explanation."}
          </div>
          <div className="mono-caps mt-4 flex flex-wrap gap-2 text-[9px]">
            <span className="border border-divider px-2 py-1 text-foreground">STRENGTH {data.signal.strength ?? "—"}</span>
            <span className="border border-divider px-2 py-1 text-foreground">CONFIDENCE {data.signal.confidence_band ?? "—"}</span>
            <span className="border border-divider px-2 py-1 text-foreground">VALIDATION {data.signal.validation_quality ?? "—"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="BEST MODEL" value={data.validation.best_model ?? "—"} />
          <Metric label="ROC AUC" value={pct(data.validation.roc_auc)} tone={(data.validation.roc_auc ?? 0) >= 0.55 ? "text-up" : "text-foreground"} />
          <Metric label="MODEL EDGE" value={pct(data.validation.model_edge)} tone={(data.validation.model_edge ?? 0) > 0 ? "text-up" : "text-down"} />
          <Metric label="BRIER SCORE" value={num(data.validation.brier_score, 3)} />
          <Metric label="BASELINE ACC." value={pct(data.validation.baseline_accuracy)} />
          <Metric label="SIGNAL ALLOWED" value={data.signal.allowed ? "YES" : "NO"} tone={data.signal.allowed ? "text-up" : "text-muted-foreground"} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_1fr]">
        <ProbabilityChart payload={data} />

        <div className="border border-divider bg-panel">
          <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">MARKET CONTEXT · LATEST OBSERVATION</div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Metric label="TREND REGIME" value={data.market_context.trend_regime} />
            <Metric label="VOL REGIME" value={data.market_context.volatility_regime} />
            <Metric label="REALIZED VOL 20D" value={pct(data.market_context.realized_vol_20)} />
            <Metric label="52W DRAWDOWN" value={pct(data.market_context.drawdown_from_52w_high)} tone="text-down" />
            <Metric label="ROLLING BETA 60D" value={num(data.market_context.rolling_beta_60)} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.4fr]">
        <div className="border border-divider bg-panel">
          <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">MODEL FEATURE IMPORTANCE</div>
          <div className="space-y-2 p-3">
            {data.top_features.length === 0 && <div className="text-[10px] text-faint">No feature importance returned.</div>}
            {data.top_features.map((item, index) => {
              const importance = item.importance ?? 0;
              return (
                <div key={`${item.feature ?? "feature"}-${index}`} className="grid grid-cols-[140px_1fr_60px] items-center gap-2">
                  <span className="truncate font-mono text-[9px] text-muted-foreground" title={item.feature}>{item.feature ?? "unnamed"}</span>
                  <div className="h-2 bg-background">
                    <div className={`h-full ${importance >= 0 ? "bg-primary" : "bg-down"}`} style={{ width: `${Math.max(1, Math.abs(importance) / maxImportance * 100)}%` }} />
                  </div>
                  <span className="text-right font-mono text-[9px] tabular-nums text-foreground">{importance.toFixed(4)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto border border-divider bg-panel">
          <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">VALIDATION SCORECARD</div>
          <table className="w-full min-w-[620px] text-left">
            <thead className="mono-caps text-[8px] text-faint">
              <tr>{["MODEL", "ACC.", "PREC.", "RECALL", "F1", "ROC AUC", "BRIER", "EDGE"].map((label) => <th key={label} className="px-2 py-2 font-normal">{label}</th>)}</tr>
            </thead>
            <tbody className="font-mono text-[9px] tabular-nums">
              {data.model_scorecard.map((row, index) => (
                <tr key={`${row.model_name ?? "model"}-${index}`} className="border-t border-divider">
                  <td className="px-2 py-2 text-foreground">{row.model_name ?? "—"}</td>
                  <td className="px-2 py-2">{pct(row.accuracy)}</td>
                  <td className="px-2 py-2">{pct(row.precision)}</td>
                  <td className="px-2 py-2">{pct(row.recall)}</td>
                  <td className="px-2 py-2">{pct(row.f1_score)}</td>
                  <td className="px-2 py-2">{pct(row.roc_auc)}</td>
                  <td className="px-2 py-2">{num(row.brier_score, 3)}</td>
                  <td className="px-2 py-2">{pct(row.model_edge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mono-caps mt-3 border-l-2 border-primary bg-primary/5 px-3 py-2 text-[9px] text-muted-foreground">
        RESEARCH OUTPUT · VALIDATION METRICS ARE REPORTED BY THE BACKEND MODEL SUITE · NOT AN EXECUTABLE TRADE RECOMMENDATION
      </div>
    </div>
  );
}
