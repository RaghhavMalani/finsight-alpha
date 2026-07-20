import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt, fmtPct } from "@/lib/market";
import { Odometer } from "./Odometer";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";

export function PnlRibbon({
  instruments,
  onInspect,
  expanded,
}: {
  instruments: Record<string, Instrument>;
  onInspect?: () => void;
  expanded?: boolean;
}) {
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  useEffect(() => subscribeDemoBook(setPositions), []);

  const pnlSeriesRef = useRef<number[]>([]);
  const dayHiRef = useRef<number>(-Infinity);
  const dayLoRef = useRef<number>(Infinity);
  const [, forceTick] = useState(0);

  const { sessionPnl, sessionPct, notional, unrealized } = useMemo(() => {
    let notional = 0,
      sessionPnl = 0,
      unrealized = 0,
      prevNotional = 0;
    for (const pos of positions) {
      const inst = instruments[pos.symbol];
      if (!inst) continue;
      notional += inst.price * pos.qty;
      prevNotional += inst.prevClose * pos.qty;
      sessionPnl += (inst.price - inst.prevClose) * pos.qty;
      unrealized += (inst.price - pos.entry) * pos.qty;
    }
    const sessionPct = prevNotional !== 0 ? (sessionPnl / Math.abs(prevNotional)) * 100 : 0;
    return { sessionPnl, sessionPct, notional, unrealized };
  }, [instruments, positions]);

  useEffect(() => {
    if (positions.length === 0) return;
    const arr = pnlSeriesRef.current;
    arr.push(sessionPnl);
    if (arr.length > 90) arr.shift();
    if (sessionPnl > dayHiRef.current) dayHiRef.current = sessionPnl;
    if (sessionPnl < dayLoRef.current) dayLoRef.current = sessionPnl;
    forceTick((n) => n + 1);
  }, [sessionPnl, positions.length]);

  const up = sessionPnl >= 0;
  const color = up ? "text-up" : "text-down";
  const glow = up
    ? "shadow-[0_0_18px_-4px_rgba(66,201,139,0.55)]"
    : "shadow-[0_0_18px_-4px_rgba(240,100,100,0.55)]";

  const series = pnlSeriesRef.current;
  const sMin = series.length ? Math.min(...series) : 0;
  const sMax = series.length ? Math.max(...series) : 1;
  const sparkPts =
    series.length > 1
      ? series
          .map((v, i) => {
            const x = (i / (series.length - 1)) * 240;
            const y = 18 - ((v - sMin) / (sMax - sMin || 1)) * 16 - 1;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";

  const rangeHi = dayHiRef.current === -Infinity ? sessionPnl : dayHiRef.current;
  const rangeLo = dayLoRef.current === Infinity ? sessionPnl : dayLoRef.current;
  const rangeSpan = Math.max(1, rangeHi - rangeLo);
  const rangePos = Math.max(0, Math.min(1, (sessionPnl - rangeLo) / rangeSpan));

  if (positions.length === 0) {
    return (
      <button
        data-tour="pnl"
        onClick={onInspect}
        className="group relative w-full border border-divider bg-raised px-3 py-2 text-left transition hover:border-primary"
      >
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="mono-caps block text-[9px] text-foreground">DEMO BOOK · EMPTY</span>
            <span className="mono-caps mt-0.5 block text-[8px] text-faint">
              ACTIVATE P&amp;L · VAR · STRESS · DISCOVER
            </span>
          </span>
          <span className="mono-caps shrink-0 border border-primary/40 px-2 py-1 text-[8px] text-primary">
            BUILD BOOK →
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      data-tour="pnl"
      onClick={onInspect}
      className={`group relative w-full border ${expanded ? "border-primary" : "border-divider"} bg-raised px-3 py-2 text-left transition ${glow} hover:border-primary`}
      title="Inspect or edit your simulated book"
    >
      <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
        <span>SESSION P&amp;L · DEMO BOOK</span>
        <span className="tabular-nums">{fmt(Math.abs(notional) / 1000, 1)}k NOTIONAL</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <div className={`font-mono text-xl tabular-nums ${color}`}>
          <span className="mr-1">{up ? "▲" : "▼"}</span>
          <Odometer value={Math.abs(sessionPnl)} digits={0} prefix={up ? "+$" : "-$"} />
        </div>
        <div className={`mono-caps text-[10px] tabular-nums ${color}`}>{fmtPct(sessionPct)}</div>
      </div>

      <svg viewBox="0 0 240 18" preserveAspectRatio="none" className="mt-1 h-3 w-full">
        <line
          x1="0"
          x2="240"
          y1={sessionPnl >= 0 ? 16 : 2}
          y2={sessionPnl >= 0 ? 16 : 2}
          stroke="#232830"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
        {sparkPts && (
          <polyline
            points={sparkPts}
            fill="none"
            stroke={up ? "#42C98B" : "#F06464"}
            strokeOpacity="0.55"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="mono-caps mt-1.5 flex items-center gap-2 text-[9px] text-faint tabular-nums">
        <span className={rangeLo < 0 ? "text-down" : "text-foreground"}>
          {rangeLo >= 0 ? "+" : "−"}${fmt(Math.abs(rangeLo), 0)}
        </span>
        <div className="relative h-[3px] flex-1 bg-background">
          <div className="absolute inset-y-0 left-0 w-full bg-border/60" />
          <div
            className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${up ? "bg-up" : "bg-down"}`}
            style={{
              left: `calc(${rangePos * 100}% - 4px)`,
              transition: "left 400ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
        <span className={rangeHi >= 0 ? "text-up" : "text-foreground"}>
          {rangeHi >= 0 ? "+" : "−"}${fmt(Math.abs(rangeHi), 0)}
        </span>
      </div>

      <div className="mono-caps mt-1.5 flex items-center justify-between text-[9px] text-primary/80">
        <span>DEMO BOOK · {positions.length} POSITIONS</span>
        <span className="opacity-70">{expanded ? "▲ CLOSE" : "▼ INSPECT"}</span>
      </div>

      <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-primary opacity-0 group-hover:opacity-60 transition" />

      <span className="sr-only">
        Unrealized {unrealized >= 0 ? "+" : "-"}${fmt(Math.abs(unrealized), 0)}
      </span>
    </button>
  );
}
