import { useMemo } from "react";
import { forecastFor, HORIZONS, HORIZON_LABEL } from "@/lib/forecast";
import { fmt, fmtPct } from "@/lib/market";

export function MLForecast({ symbol }: { symbol: string }) {
  const f = useMemo(() => forecastFor(symbol), [symbol]);
  const last = f.history[f.history.length - 1];
  const points = HORIZONS.map((h) => {
    const idx = Math.min(f.forecast.length - 1, h - 1);
    const p = f.forecast[idx];
    return { h, p: p.p, lo: p.lo!, hi: p.hi!, delta: (p.p - last.p) / last.p };
  });

  return (
    <div className="grid h-full gap-2 overflow-hidden p-2" style={{ gridTemplateRows: "auto 1fr auto" }}>
      {/* horizon cards */}
      <div className="grid grid-cols-3 gap-2">
        {points.map((pt) => (
          <div key={pt.h} className="border border-divider bg-panel p-3">
            <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
              <span>{HORIZON_LABEL[pt.h]} POINT FORECAST</span>
              <span className={pt.delta >= 0 ? "text-up" : "text-down"}>{fmtPct(pt.delta)}</span>
            </div>
            <div className="mt-1 font-mono text-2xl tabular-nums text-foreground">{fmt(pt.p)}</div>
            <div className="mono-caps mt-1 text-[9px] text-faint">
              95% band <span className="text-foreground">{fmt(pt.lo)} – {fmt(pt.hi)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-2 overflow-hidden">
        <ForecastChart f={f} />
        <AttentionPanel f={f} />
      </div>

      <AccuracyStrip f={f} />
    </div>
  );
}

function ForecastChart({ f }: { f: ReturnType<typeof forecastFor> }) {
  const H = 240, W = 1000, PAD = 24;
  const iw = W - PAD * 2, ih = H - PAD * 2;
  const all = [...f.history.map((p) => p.p), ...f.forecast.map((p) => p.hi ?? p.p), ...f.forecast.map((p) => p.lo ?? p.p)];
  const min = Math.min(...all) * 0.995;
  const max = Math.max(...all) * 1.005;
  const nAll = f.history.length + f.forecast.length;
  const xAt = (i: number) => PAD + (i / (nAll - 1)) * iw;
  const yAt = (v: number) => PAD + ih - ((v - min) / (max - min)) * ih;
  const hi = f.forecast.map((p, i) => `${xAt(f.history.length + i)},${yAt(p.hi!)}`).join(" ");
  const lo = f.forecast.map((p, i) => `${xAt(f.history.length + i)},${yAt(p.lo!)}`).reverse().join(" ");
  const histPts = f.history.map((p, i) => `${xAt(i)},${yAt(p.p)}`).join(" ");
  const fcPts = f.forecast.map((p, i) => `${xAt(f.history.length + i)},${yAt(p.p)}`).join(" ");
  const nowX = xAt(f.history.length - 1);
  return (
    <div className="border border-divider bg-panel overflow-hidden">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">TFT FORECAST · 90D CONTEXT · 21D AHEAD</span>
        <span className="text-faint">95% uncertainty cone</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        {/* uncertainty */}
        <polygon points={`${hi} ${lo}`} fill="#F0A929" opacity={0.14} />
        {/* history */}
        <polyline points={histPts} fill="none" stroke="#E7EAEC" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {/* forecast median */}
        <polyline points={fcPts} fill="none" stroke="#F0A929" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {/* now line */}
        <line x1={nowX} x2={nowX} y1={PAD} y2={PAD + ih} stroke="#F0A929" strokeDasharray="2 4" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
        <text x={nowX + 3} y={PAD + 10} fontSize={9} fill="#F0A929" fontFamily="ui-monospace,monospace">NOW</text>
      </svg>
    </div>
  );
}

function AttentionPanel({ f }: { f: ReturnType<typeof forecastFor> }) {
  return (
    <div className="border border-divider bg-panel overflow-hidden">
      <div className="mono-caps border-b border-divider px-3 py-1.5 text-[10px] text-primary">ATTENTION · MODEL FOCUS</div>
      <div className="space-y-2 p-3">
        {f.attention.map((a) => (
          <div key={a.name} className="grid items-center gap-2" style={{ gridTemplateColumns: "115px 1fr 40px" }}>
            <span className="mono-caps text-[10px] text-muted-foreground">{a.name}</span>
            <div className="h-3 bg-background">
              <div className="h-full bg-primary/80 transition-all" style={{ width: `${a.weight * 300}%` }} />
            </div>
            <span className="text-right font-mono text-[10px] tabular-nums text-foreground">{(a.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
        <div className="mono-caps mt-3 border-t border-divider pt-2 text-[9px] text-faint leading-snug">
          Temporal-fusion attention over historical inputs. Weights re-derive per ticker.
        </div>
      </div>
    </div>
  );
}

function AccuracyStrip({ f }: { f: ReturnType<typeof forecastFor> }) {
  return (
    <div className="mono-caps grid grid-cols-3 gap-2 border border-divider bg-panel px-3 py-2 text-[10px]">
      <span className="text-primary">BACKTEST ACCURACY</span>
      <div className="col-span-2 grid grid-cols-3 gap-3">
        {f.accuracy.map((a) => (
          <div key={a.h} className="flex items-baseline gap-2">
            <span className="text-faint">{HORIZON_LABEL[a.h]}</span>
            <span className="text-foreground">MAPE <span className="tabular-nums">{a.mape.toFixed(2)}%</span></span>
            <span className="text-faint">·</span>
            <span className={a.dirAcc >= 0.55 ? "text-up" : "text-foreground"}>DIR <span className="tabular-nums">{(a.dirAcc * 100).toFixed(0)}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

