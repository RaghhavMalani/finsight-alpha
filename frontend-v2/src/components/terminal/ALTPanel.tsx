import { useMemo, useState } from "react";
import { altSignals, type AltSignal } from "@/lib/altdata";
import { ExternalContextStrip } from "@/components/terminal/ExternalContextStrip";

const KIND_COLOR: Record<AltSignal["kind"], string> = {
  SHIPPING: "#45B9D3",
  WEATHER: "#B58BF0",
  EV: "#F0A929",
  CARD: "#42C98B",
  SATELLITE: "#F06464",
  WEB: "#E7EAEC",
};

export function ALTPanel({ onOpenSymbol }: { onOpenSymbol?: (sym: string) => void }) {
  const signals = useMemo(() => altSignals(), []);
  // Signature moment: hero card is the highest-|corr| signal.
  const [hero, ...rest] = useMemo(() => {
    const sorted = [...signals].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    return sorted;
  }, [signals]);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ExternalContextStrip />
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-3">
        {hero && (
          <div className="lg:col-span-2 lg:row-span-2">
            <AltCard s={hero} onOpen={onOpenSymbol} hero />
          </div>
        )}
        {rest.map((s) => <AltCard key={s.kind} s={s} onOpen={onOpenSymbol} />)}
      </div>
    </div>
  );
}

function AltCard({ s, onOpen, hero }: { s: AltSignal; onOpen?: (sym: string) => void; hero?: boolean }) {
  const [showBT, setShowBT] = useState(false);
  const color = KIND_COLOR[s.kind];
  return (
    <div className={`flex h-full flex-col border bg-panel ${hero ? "border-primary/40 shadow-[0_0_24px_-8px_rgba(240,169,41,0.35)]" : "border-divider"}`}>
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2" style={{ background: color }} />
          <span style={{ color }}>{s.kind}</span>
          <span className="text-foreground">{s.title}</span>
          {hero && <span className="mono-caps ml-2 border border-primary/50 bg-primary/10 px-1.5 py-0 text-[8px] text-primary">TOP SIGNAL</span>}
        </span>
        <button onClick={() => setShowBT((v) => !v)} className={`interactive border px-1.5 py-0.5 text-[8px] ${showBT ? "border-primary text-primary" : "border-border text-faint"}`}>
          BACKTESTED · {(s.hitRate * 100).toFixed(0)}%
        </button>
      </div>
      <div className={hero ? "flex-1" : ""}>
        <SignalChart s={s} color={color} hero={hero} />
      </div>
      <div className="mono-caps grid grid-cols-4 gap-2 border-t border-divider px-3 py-2 text-[9px]">
        <button onClick={() => onOpen?.(s.ticker)} className="interactive flex items-center gap-1 border border-border bg-raised px-1.5 py-1 text-primary hover:border-primary">
          <span className="text-faint">→</span>{s.ticker}
        </button>
        <div className="border border-divider bg-raised px-1.5 py-1">
          <div className="text-faint">CORR</div>
          <div className={`font-mono text-[11px] tabular-nums ${s.correlation >= 0 ? "text-up" : "text-down"}`}>
            {s.correlation >= 0 ? "+" : ""}{s.correlation.toFixed(2)}
          </div>
        </div>
        <div className="border border-divider bg-raised px-1.5 py-1">
          <div className="text-faint">LEAD</div>
          <div className="font-mono text-[11px] tabular-nums text-foreground">{s.leadWeeks}w</div>
        </div>
        <div className="border border-divider bg-raised px-1.5 py-1">
          <div className="text-faint">Δ8w</div>
          <div className={`font-mono text-[11px] tabular-nums ${s.changePct >= 0 ? "text-up" : "text-down"}`}>
            {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(1)}%
          </div>
        </div>
      </div>
      <div className="border-t border-divider px-3 py-2 font-serif text-[12px] leading-snug text-foreground">
        {s.thesis}
      </div>
      {showBT && (
        <div className="mono-caps border-t border-primary/40 bg-primary/5 px-3 py-2 text-[9px]">
          <div className="flex items-center justify-between text-primary">
            <span>BACKTEST · SIGNAL → {s.ticker}</span>
            <span className="text-foreground">HIT {(s.hitRate * 100).toFixed(0)}%</span>
          </div>
          <div className="mt-1 text-muted-foreground leading-snug">
            Since 2018 · {s.leadWeeks}w lag · corr {s.correlation.toFixed(2)} · signal fires when Z&gt;+1 (or &lt;-1) · median forward return {(s.correlation * 3.5).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

function SignalChart({ s, color, hero }: { s: AltSignal; color: string; hero?: boolean }) {
  const H = hero ? 260 : 130, W = 400, PAD = 10;
  const iw = W - PAD * 2, ih = H - PAD * 2;
  const vs = s.series.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const overlay = s.overlayTicker?.series ?? [];
  const oMin = overlay.length ? Math.min(...overlay.map((p) => p.v)) : 0;
  const oMax = overlay.length ? Math.max(...overlay.map((p) => p.v)) : 1;
  const xAt = (i: number, n: number) => PAD + (i / (n - 1)) * iw;
  const yAt = (v: number) => PAD + ih - ((v - min) / (max - min || 1)) * ih;
  const yAtO = (v: number) => PAD + ih - ((v - oMin) / (oMax - oMin || 1)) * ih;
  const pts = s.series.map((p, i) => `${xAt(i, s.series.length)},${yAt(p.v)}`).join(" ");
  const optsO = overlay.map((p, i) => `${xAt(i, overlay.length)},${yAtO(p.v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={hero ? "h-64 w-full" : "h-32 w-full"} preserveAspectRatio="none">
      {overlay.length > 0 && hero && <polygon points={`${PAD},${H-PAD} ${optsO} ${W-PAD},${H-PAD}`} fill="#636C74" opacity={0.05} />}
      {overlay.length > 0 && <polyline points={optsO} fill="none" stroke="#636C74" strokeWidth={0.7} vectorEffect="non-scaling-stroke" opacity={0.6} strokeDasharray="3 3" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      <text x={PAD + 4} y={PAD + 10} fontSize={9} fill={color} fontFamily="ui-monospace,monospace">{s.callout}</text>
      {overlay.length > 0 && (
        <text x={W - PAD - 4} y={PAD + 10} fontSize={8} fill="#636C74" textAnchor="end" fontFamily="ui-monospace,monospace">
          ─ ─ {s.overlayTicker?.sym}
        </text>
      )}
    </svg>
  );
}

