import { Fragment, useMemo } from "react";
import { analyzeRegime, REGIME_META, REGIME_KINDS, type RegimeKind } from "@/lib/regimes";
import { viridis, fmtPct } from "@/lib/market";

export function MLRegimes({ symbol }: { symbol: string }) {
  const a = useMemo(() => analyzeRegime(symbol, 252), [symbol]);
  const meta = REGIME_META[a.current.kind];
  const insight =
    a.transitionRisk > 0.85
      ? `Regime age (${a.age}d) exceeds median stay — transition risk elevated within 2 weeks.`
      : a.transitionRisk > 0.55
      ? `Regime maturing. Watch for signals of transition; expected remaining ~${a.expectedRemaining}d.`
      : `Regime young — median stay in ${meta.short} is ${a.medianStay[a.current.kind]}d.`;

  return (
    <div className="grid h-full gap-2 overflow-hidden p-2" style={{ gridTemplateRows: "auto 1fr auto" }}>
      {/* current + ribbon */}
      <div className="grid grid-cols-[280px_1fr] gap-2">
        <CurrentCard a={a} meta={meta} />
        <RibbonChart a={a} />
      </div>

      <div className="grid grid-cols-[1.1fr_1fr] gap-2 overflow-hidden">
        <TransitionMatrix a={a} />
        <ExpectedDurations a={a} />
      </div>

      <div className="mono-caps flex flex-wrap items-center gap-3 border-l-2 border-primary bg-primary/5 px-3 py-2 text-[10px]">
        <span className="shrink-0 text-primary">HSMM INSIGHT ·</span>
        <span className="min-w-0 flex-1 text-foreground">{insight}</span>
      </div>
    </div>
  );
}

function CurrentCard({ a, meta }: { a: ReturnType<typeof analyzeRegime>; meta: typeof REGIME_META[RegimeKind] }) {
  const pctAge = Math.min(1, a.age / (a.medianStay[a.current.kind] * 1.5));
  return (
    <div className="border border-divider bg-panel p-3">
      <div className="mono-caps text-[9px] text-faint">CURRENT REGIME</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="h-3 w-3 shrink-0" style={{ background: meta.color }} />
        <span className="mono-caps text-[14px] text-foreground">{meta.label}</span>
      </div>
      <div className="mono-caps mt-2 text-[9px] text-faint">DAY {a.age} OF {a.medianStay[a.current.kind]}d MEDIAN STAY</div>
      <div className="mt-1 h-1 bg-background">
        <div className="h-full transition-all" style={{ width: `${pctAge * 100}%`, background: meta.color }} />
      </div>
      <div className="mono-caps mt-3 grid grid-cols-2 gap-2 text-[9px]">
        <div className="border border-divider bg-raised px-2 py-1.5">
          <div className="text-faint">EXP. REMAINING</div>
          <div className="font-mono text-[13px] tabular-nums text-foreground">{a.expectedRemaining}d</div>
        </div>
        <div className="border border-divider bg-raised px-2 py-1.5">
          <div className="text-faint">TRANSITION RISK</div>
          <div className={`font-mono text-[13px] tabular-nums ${a.transitionRisk > 0.8 ? "text-down" : a.transitionRisk > 0.5 ? "text-primary" : "text-up"}`}>
            {(a.transitionRisk * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function RibbonChart({ a }: { a: ReturnType<typeof analyzeRegime> }) {
  const n = a.bars.length;
  const min = Math.min(...a.bars.map((b) => b.p));
  const max = Math.max(...a.bars.map((b) => b.p));
  const W = 1000, H = 220, PAD = 20, RIBBON = 14;
  const iw = W - PAD * 2, ih = H - PAD * 2 - RIBBON;
  const xAt = (i: number) => PAD + (i / (n - 1)) * iw;
  const yAt = (v: number) => PAD + ih - ((v - min) / (max - min || 1)) * ih;
  const pts = a.bars.map((b, i) => `${xAt(i)},${yAt(b.p)}`).join(" ");
  return (
    <div className="border border-divider bg-panel overflow-hidden">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">REGIME RIBBON · 1Y · {a.spans.length} REGIMES</span>
        <span className="flex gap-2 text-[8px]">
          {REGIME_KINDS.map((k) => (
            <span key={k} className="flex items-center gap-1 text-faint">
              <span className="inline-block h-2 w-3" style={{ background: REGIME_META[k].color }} />
              {REGIME_META[k].short}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        {/* ribbon bands */}
        {a.spans.map((s, i) => (
          <rect key={i} x={xAt(s.start)} y={PAD + ih + 2} width={Math.max(1, xAt(s.end) - xAt(s.start))} height={RIBBON}
            fill={REGIME_META[s.kind].color} opacity={0.85} />
        ))}
        {/* price */}
        <polyline points={pts} fill="none" stroke="#E7EAEC" strokeWidth={0.9} vectorEffect="non-scaling-stroke" opacity={0.85} />
        {/* current marker */}
        <line x1={xAt(n - 1)} x2={xAt(n - 1)} y1={PAD} y2={PAD + ih + RIBBON + 2} stroke="#F0A929" strokeDasharray="2 3" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function TransitionMatrix({ a }: { a: ReturnType<typeof analyzeRegime> }) {
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">TRANSITION PROBABILITY · P(row → col)</span>
        <span className="text-faint" title="Empirical HSMM transition matrix, viridis-shaded">ⓘ</span>
      </div>
      <div className="p-3">
        <div className="grid" style={{ gridTemplateColumns: "70px repeat(4, 1fr)" }}>
          <span></span>
          {REGIME_KINDS.map((k) => (
            <span key={k} className="mono-caps text-center text-[8px] text-faint">{REGIME_META[k].short}</span>
          ))}
          {REGIME_KINDS.map((row, i) => (
            <Fragment key={row}>
              <span className="mono-caps flex items-center gap-1 text-[8px] text-faint">
                <span className="inline-block h-2 w-2" style={{ background: REGIME_META[row].color }} />
                {REGIME_META[row].short}
              </span>
              {REGIME_KINDS.map((col, j) => {
                const v = a.transitionMatrix[i][j];
                return (
                  <div key={col} className="mono-caps m-[1px] flex items-center justify-center py-2 text-[10px]"
                    style={{ background: viridis(Math.min(1, v * 1.6)), color: v > 0.35 ? "#0B0C0D" : "#E7EAEC" }}
                    title={`P(${REGIME_META[row].short} → ${REGIME_META[col].short}) = ${(v * 100).toFixed(0)}%`}>
                    {(v * 100).toFixed(0)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpectedDurations({ a }: { a: ReturnType<typeof analyzeRegime> }) {
  const max = Math.max(...Object.values(a.medianStay));
  return (
    <div className="border border-divider bg-panel">
      <div className="mono-caps border-b border-divider px-3 py-1.5 text-[10px] text-primary">MEDIAN STAY · BY REGIME</div>
      <div className="space-y-2 p-3">
        {REGIME_KINDS.map((k) => {
          const v = a.medianStay[k];
          const isCurrent = k === a.current.kind;
          return (
            <div key={k} className="grid items-center gap-2" style={{ gridTemplateColumns: "110px 1fr 50px" }}>
              <span className={`mono-caps text-[10px] ${isCurrent ? "text-foreground" : "text-faint"}`}>
                {isCurrent ? "▸ " : "  "}{REGIME_META[k].label}
              </span>
              <div className="h-3 bg-background">
                <div className="h-full transition-all" style={{ width: `${(v / max) * 100}%`, background: REGIME_META[k].color, opacity: isCurrent ? 1 : 0.5 }} />
              </div>
              <span className="text-right font-mono text-[10px] tabular-nums text-foreground">{v}d</span>
            </div>
          );
        })}
        <div className="mono-caps mt-3 border-t border-divider pt-2 text-[9px] text-faint">
          Elapsed in current regime: <span className="text-foreground">{a.age}d</span>
          {" · "}Expected remaining: <span className="text-foreground">~{a.expectedRemaining}d</span>
          {" · "}Δ from median: <span className={a.age > a.medianStay[a.current.kind] ? "text-down" : "text-up"}>
            {fmtPct((a.age / a.medianStay[a.current.kind] - 1))}
          </span>
        </div>
      </div>
    </div>
  );
}

