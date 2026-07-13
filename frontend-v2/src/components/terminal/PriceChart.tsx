import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Instrument, fmt, fmtPct, bucketCandles, type Tick } from "@/lib/market";
import { api, type Quote } from "@/lib/api";

type Series = "LINE" | "AREA" | "CANDLES";
type TF = "1D" | "1W" | "1M" | "1Y";
type DrawKind = "trend" | "fib" | null;
type Draw = { kind: "trend" | "fib"; x1: number; y1: number; x2: number; y2: number };

const drawStore: Map<string, Draw[]> = new Map();

function snapshotTicks(instrument: Instrument): Tick[] {
  const now = Date.now();
  return [
    { t: now - 6.5 * 60 * 60 * 1000, p: instrument.open },
    { t: now, p: instrument.price },
  ];
}

function quoteTicks(quote: Quote | undefined, days: number): Tick[] {
  if (!quote) return [];
  return quote.series
    .filter((row): row is typeof row & { close: number } => Number.isFinite(row.close))
    .map((row) => ({ t: new Date(`${row.date}T16:00:00Z`).getTime(), p: row.close }))
    .filter((row) => Number.isFinite(row.t))
    .slice(-days);
}

export function PriceChart({
  instrument,
  compareTo,
  replayFrac,
  showVolume = true,
  showVwap: initShowVwap = true,
  showHiLo = true,
  onAddCompare,
  expectedMovePct,
}: {
  instrument: Instrument;
  compareTo?: Instrument | null;
  replayFrac?: number | null;
  showVolume?: boolean;
  showVwap?: boolean;
  showHiLo?: boolean;
  onAddCompare?: () => void;
  expectedMovePct?: number | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [showVwap, setShowVwap] = useState(initShowVwap);
  const [series, setSeries] = useState<Series>("LINE");
  const [tf, setTf] = useState<TF>("1D");
  const [logScale, setLogScale] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawKind>(null);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [drawTick, setDrawTick] = useState(0);
  const key = `${instrument.symbol}|${tf}`;
  const drawings = drawStore.get(key) ?? [];

  useEffect(() => { setMounted(true); }, []);
  const quote = useQuery({
    queryKey: ["quote-history", instrument.symbol],
    queryFn: () => api<Quote>(`/quote/${encodeURIComponent(instrument.symbol)}`),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const compareQuote = useQuery({
    queryKey: ["quote-history", compareTo?.symbol],
    queryFn: () => api<Quote>(`/quote/${encodeURIComponent(compareTo!.symbol)}`),
    enabled: Boolean(compareTo),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const historicalSource = quote.data ? "YFINANCE" : quote.isError ? "UNAVAILABLE" : "LOADING";


  // The API currently provides session snapshots plus real daily history.
  const baseTicks: Tick[] = useMemo(() => {
    if (tf === "1D") return snapshotTicks(instrument);
    const days = tf === "1W" ? 7 : tf === "1M" ? 30 : 252;
    const real = quoteTicks(quote.data, days);
    return real.length >= 2 ? real : snapshotTicks(instrument);
  }, [tf, instrument, quote.data]);

  const history = useMemo(() => {
    if (tf !== "1D" || replayFrac == null) return baseTicks;
    const n = Math.max(2, Math.min(baseTicks.length, Math.round(baseTicks.length * replayFrac)));
    return baseTicks.slice(0, n);
  }, [baseTicks, replayFrac, tf]);

  const cmpHistory = useMemo(() => {
    if (!compareTo) return null;
    if (tf === "1D") return snapshotTicks(compareTo);
    const days = tf === "1W" ? 7 : tf === "1M" ? 30 : 252;
    const real = quoteTicks(compareQuote.data, days);
    return real.length >= 2 ? real : snapshotTicks(compareTo);
  }, [compareTo, compareQuote.data, tf]);

  const isCompare = !!(compareTo && cmpHistory);

  const view = useMemo(() => {
    const transform = (p: number) => (logScale ? Math.log(p) : p);
    if (isCompare && cmpHistory) {
      const aPrev = instrument.prevClose;
      const bPrev = compareTo!.prevClose;
      const aPct = history.map((t) => ((t.p - aPrev) / aPrev) * 100);
      const bPct = cmpHistory.map((t) => ((t.p - bPrev) / bPrev) * 100);
      const all = [...aPct, ...bPct];
      const min = Math.min(...all, -0.1);
      const max = Math.max(...all, 0.1);
      const pad = (max - min) * 0.1;
      return { mode: "compare" as const, min: min - pad, max: max + pad, aPct, bPct, transform: (v: number) => v };
    }
    const prices = history.map((h) => transform(h.p));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { mode: "price" as const, min, max, transform };
  }, [history, cmpHistory, isCompare, compareTo, instrument.prevClose, logScale]);

  const yScale = (v: number) => 260 - ((v - view.min) / (view.max - view.min || 1)) * 240 - 10;
  const yPrice = (p: number) => yScale(view.mode === "price" ? view.transform(p) : p);

  const priceCoords = useMemo(() => {
    if (view.mode === "compare") {
      return view.aPct.map((v, i) => ({ x: (i / (view.aPct.length - 1)) * 1000, y: yScale(v), p: history[i].p, t: history[i].t }));
    }
    return history.map((x, i) => ({ x: (i / (history.length - 1)) * 1000, y: yPrice(x.p), p: x.p, t: x.t }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, view]);

  const cmpCoords = useMemo(() => {
    if (view.mode !== "compare" || !cmpHistory) return null;
    return view.bPct.map((v, i) => ({ x: (i / (view.bPct.length - 1)) * 1000, y: yScale(v), p: cmpHistory[i].p }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmpHistory, view]);

  const pts = priceCoords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPts = `0,260 ${pts} 1000,260`;
  const cmpPts = cmpCoords ? cmpCoords.map((c) => `${c.x},${c.y}`).join(" ") : "";

  // Candles
  const candles = useMemo(() => {
    if (series !== "CANDLES") return [];
    const target = tf === "1D" ? 78 : history.length; // 5-min bars ~ 78/day
    return bucketCandles(history, target);
  }, [series, history, tf]);

  const price = history[history.length - 1]?.p ?? instrument.price;
  const first = instrument.prevClose;
  const change = price - first;
  const changePct = (change / first) * 100;
  const up = changePct >= 0;

  const maxVol = useMemo(() => Math.max(...history.map((h) => h.v || 0), 1), [history]);
  const volBars = showVolume && !isCompare
    ? history.map((h, i) => {
        const x = (i / (history.length - 1)) * 1000;
        const vh = ((h.v || 0) / maxVol) * 36;
        return { x, y: 300 - vh, h: vh, up: i > 0 ? h.p >= history[i - 1].p : true };
      })
    : [];

  const hiY = view.mode === "price" ? yPrice(instrument.sessionHigh) : null;
  const loY = view.mode === "price" ? yPrice(instrument.sessionLow) : null;
  const vwapY = view.mode === "price" && tf === "1D" && instrument.vwapSource !== "UNAVAILABLE" ? yPrice(instrument.vwap) : null;

  const hoverStats = useMemo(() => {
    if (hover == null || !priceCoords[hover]) return null;
    const i = hover;
    const win = history.slice(Math.max(0, i - 3), i + 1);
    const O = win[0].p, C = history[i].p;
    const H = Math.max(...win.map((x) => x.p));
    const L = Math.min(...win.map((x) => x.p));
    const chg = ((C - first) / first) * 100;
    const d = new Date(history[i].t);
    const time = tf === "1D"
      ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : `${d.getMonth() + 1}/${d.getDate()}`;
    return { O, H, L, C, chg, time };
  }, [hover, history, priceCoords, first, tf]);

  function svgPoint(e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 300,
    };
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!priceCoords.length) return;
    const p = svgPoint(e);
    if (!p) return;
    const idx = Math.max(0, Math.min(priceCoords.length - 1, Math.round((p.x / 1000) * (priceCoords.length - 1))));
    setHover(idx);
  }

  function onClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!drawMode) return;
    const p = svgPoint(e);
    if (!p) return;
    if (!pending) { setPending(p); return; }
    const arr = drawStore.get(key) ?? [];
    arr.push({ kind: drawMode, x1: pending.x, y1: pending.y, x2: p.x, y2: p.y });
    drawStore.set(key, arr);
    setPending(null);
    setDrawTick((n) => n + 1);
  }

  function clearDrawings() { drawStore.set(key, []); setPending(null); setDrawTick((n) => n + 1); }

  const hoverPt = hover != null ? priceCoords[hover] : null;

  const relPerf = useMemo(() => {
    if (!isCompare || !cmpHistory || !compareTo) return null;
    const aRet = ((history[history.length - 1].p - instrument.prevClose) / instrument.prevClose) * 100;
    const bRet = ((cmpHistory[cmpHistory.length - 1].p - compareTo.prevClose) / compareTo.prevClose) * 100;
    return aRet - bRet;
  }, [isCompare, compareTo, cmpHistory, history, instrument.prevClose]);

  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 1.0];

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-end justify-between p-4">
        <div>
          <div className="mono-caps text-[10px] text-muted-foreground">
            {instrument.name}
            <span className="ml-2 text-primary">· {tf === "1D" ? instrument.dataSource : historicalSource} · {tf === "1D" ? "SESSION SNAPSHOT" : "DAILY CLOSES"}</span>
            {compareTo && <span className="ml-2 text-info">· vs {compareTo.symbol}</span>}
          </div>
          <div className="mt-1 flex items-baseline gap-4 font-mono text-4xl tabular-nums text-foreground">
            {fmt(price)}
            <span className={`text-base ${up ? "text-up" : "text-down"}`}>
              {up ? "▲" : "▼"} {fmt(Math.abs(change))} · {fmtPct(changePct)}
            </span>
          </div>
        </div>
        <div className="mono-caps flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="tabular-nums text-right"><div className="text-faint">OPEN</div><div className="font-mono text-foreground">{fmt(instrument.open)}</div></div>
          <div className="tabular-nums text-right"><div className="text-faint">HIGH</div><div className="font-mono text-foreground">{fmt(instrument.sessionHigh)}</div></div>
          <div className="tabular-nums text-right"><div className="text-faint">LOW</div><div className="font-mono text-foreground">{fmt(instrument.sessionLow)}</div></div>
          <div className="tabular-nums text-right"><div className="text-faint">VWAP</div><div className="font-mono text-foreground">{instrument.vwapSource === "UNAVAILABLE" ? "—" : fmt(instrument.vwap)}</div></div>
          <div className="tabular-nums text-right"><div className="text-faint">VOL</div><div className="font-mono text-foreground">{instrument.volume > 0 ? `${(instrument.volume / 1_000_000).toFixed(1)}M` : "—"}</div></div>
          {compareTo && relPerf !== null && (
            <div className="border-l border-divider pl-3 tabular-nums text-right">
              <div className="text-faint">RELATIVE</div>
              <div className={`font-mono ${relPerf >= 0 ? "text-up" : "text-down"}`}>{fmtPct(relPerf)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mono-caps flex flex-wrap items-center gap-1 border-y border-divider bg-panel/60 px-3 py-1.5 text-[9px]">
        <div className="flex items-center gap-1 pr-2">
          {(["LINE", "AREA"] as Series[]).map((s) => (
            <button key={s} onClick={() => setSeries(s)} className={`border px-1.5 py-0.5 transition ${series === s ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-l border-divider pl-2 pr-2">
          {(["1D", "1W", "1M", "1Y"] as TF[]).map((t) => (
            <button key={t} onClick={() => setTf(t)} className={`border px-1.5 py-0.5 transition ${tf === t ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>{t}</button>
          ))}
        </div>
        <button onClick={() => setLogScale((v) => !v)} className={`border px-1.5 py-0.5 transition ${logScale ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`} title="Logarithmic scale">LOG</button>
        <button disabled={instrument.vwapSource === "UNAVAILABLE"} onClick={() => setShowVwap((v) => !v)} className={`border px-1.5 py-0.5 transition ${instrument.vwapSource === "UNAVAILABLE" ? "cursor-not-allowed border-border text-faint/40" : showVwap ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`} title={instrument.vwapSource === "UNAVAILABLE" ? "VWAP is not supplied by the current quote feed" : undefined}>VWAP</button>
        <div className="flex items-center gap-1 border-l border-divider pl-2">
          <button onClick={() => { setDrawMode(drawMode === "trend" ? null : "trend"); setPending(null); }} className={`border px-1.5 py-0.5 transition ${drawMode === "trend" ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>TREND</button>
          <button onClick={() => { setDrawMode(drawMode === "fib" ? null : "fib"); setPending(null); }} className={`border px-1.5 py-0.5 transition ${drawMode === "fib" ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>FIB</button>
          {drawings.length > 0 && <button onClick={clearDrawings} className="border border-border px-1.5 py-0.5 text-faint hover:text-down">✕ CLR</button>}
        </div>
        {onAddCompare && !compareTo && (
          <button onClick={onAddCompare} className="ml-auto border border-border px-1.5 py-0.5 text-faint hover:border-primary hover:text-primary" title="Compare vs…">+ CMP</button>
        )}
        {drawMode && <span className="ml-2 text-primary">{pending ? "Click second point…" : "Click first point…"}</span>}
      </div>

      <div className="relative flex-1 px-2 pb-2">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 300"
          className={`h-full w-full ${drawMode ? "cursor-crosshair" : ""}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
        >
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? "#F0A929" : "#F06464"} stopOpacity="0.30" />
              <stop offset="100%" stopColor={up ? "#F0A929" : "#F06464"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <line key={t} x1="0" x2="1000" y1={260 * t} y2={260 * t} stroke="#171B1F" strokeWidth={1} />
          ))}
          {showHiLo && view.mode === "price" && hiY != null && (
            <>
              <line x1="0" x2="1000" y1={hiY} y2={hiY} stroke="#42C98B" strokeOpacity={0.35} strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x="8" y={hiY - 2} className="mono-caps" fontSize="9" fill="#42C98B" opacity="0.7">H {fmt(instrument.sessionHigh)}</text>
            </>
          )}
          {showHiLo && view.mode === "price" && loY != null && (
            <>
              <line x1="0" x2="1000" y1={loY} y2={loY} stroke="#F06464" strokeOpacity={0.35} strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x="8" y={loY - 2} className="mono-caps" fontSize="9" fill="#F06464" opacity="0.7">L {fmt(instrument.sessionLow)}</text>
            </>
          )}
          {showVwap && view.mode === "price" && vwapY != null && (
            <>
              <line x1="0" x2="1000" y1={vwapY} y2={vwapY} stroke="#3B8BFF" strokeOpacity={0.55} strokeDasharray="2 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x="992" textAnchor="end" y={vwapY - 2} className="mono-caps" fontSize="9" fill="#3B8BFF" opacity="0.8">VWAP {fmt(instrument.vwap)}</text>
            </>
          )}
          {expectedMovePct != null && view.mode === "price" && (() => {
            const upP = instrument.price * (1 + expectedMovePct / 100);
            const dnP = instrument.price * (1 - expectedMovePct / 100);
            const yU = yPrice(upP), yD = yPrice(dnP);
            const yMid = yPrice(instrument.price);
            return (
              <g>
                <defs>
                  <linearGradient id="emCone" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F0A929" stopOpacity="0" />
                    <stop offset="100%" stopColor="#F0A929" stopOpacity="0.18" />
                  </linearGradient>
                </defs>
                <polygon points={`0,${yMid} 1000,${yU} 1000,${yD}`} fill="url(#emCone)" />
                <line x1="0" x2="1000" y1={yU} y2={yU} stroke="#F0A929" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <line x1="0" x2="1000" y1={yD} y2={yD} stroke="#F0A929" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <text x="992" textAnchor="end" y={yU - 2} className="mono-caps" fontSize="9" fill="#F0A929" opacity="0.85">EM +{expectedMovePct.toFixed(1)}% · {fmt(upP)}</text>
                <text x="992" textAnchor="end" y={yD + 10} className="mono-caps" fontSize="9" fill="#F0A929" opacity="0.85">EM −{expectedMovePct.toFixed(1)}% · {fmt(dnP)}</text>
              </g>
            );
          })()}
          
          {/* Volume bars */}
          {volBars.map((b, i) => (
            <rect key={i} x={b.x - 1.5} y={b.y} width={2.5} height={b.h} fill={b.up ? "#42C98B" : "#F06464"} opacity="0.25" />
          ))}

          {/* Series */}
          {series !== "CANDLES" && view.mode === "price" && series === "AREA" && (
            <polygon points={areaPts} fill="url(#priceFill)" />
          )}
          {series !== "CANDLES" && (
            <polyline
              points={pts}
              fill="none"
              stroke={compareTo ? "#F0A929" : up ? "#F0A929" : "#F06464"}
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={mounted ? { strokeDasharray: 3000, strokeDashoffset: 0, animation: "draw-in 800ms cubic-bezier(0.16,1,0.3,1) both" } : undefined}
            />
          )}
          {series === "CANDLES" && candles.map((c, i) => {
            const x = (i / Math.max(1, candles.length - 1)) * 1000;
            const cw = Math.max(2, 900 / candles.length);
            const yO = yPrice(c.o), yC = yPrice(c.c), yH = yPrice(c.h), yL = yPrice(c.l);
            const bull = c.c >= c.o;
            const color = bull ? "#42C98B" : "#F06464";
            const bodyTop = Math.min(yO, yC), bodyH = Math.max(1, Math.abs(yC - yO));
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
                <rect x={x - cw / 2} y={bodyTop} width={cw} height={bodyH} fill={color} opacity="0.85" />
              </g>
            );
          })}
          {compareTo && cmpPts && series !== "CANDLES" && (
            <polyline points={cmpPts} fill="none" stroke="#3B8BFF" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={mounted ? { strokeDasharray: 3000, strokeDashoffset: 0, animation: "draw-in 900ms cubic-bezier(0.16,1,0.3,1) both" } : undefined} />
          )}

          {/* Drawings */}
          {drawings.map((d, i) => {
            if (d.kind === "trend") {
              return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#F0A929" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
            }
            const top = Math.min(d.y1, d.y2), bot = Math.max(d.y1, d.y2);
            return (
              <g key={i} opacity="0.85">
                {FIB_LEVELS.map((lv, j) => {
                  const y = top + (bot - top) * lv;
                  return (
                    <g key={j}>
                      <line x1={Math.min(d.x1, d.x2)} x2={Math.max(d.x1, d.x2)} y1={y} y2={y} stroke="#F0A929" strokeOpacity={0.55} strokeDasharray="3 3" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
                      <text x={Math.max(d.x1, d.x2) + 4} y={y + 3} fontSize="8" fill="#F0A929" opacity="0.7" className="mono-caps">{(lv * 100).toFixed(1)}%</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
          {pending && drawMode && (
            <circle cx={pending.x} cy={pending.y} r={3} fill="#F0A929" stroke="#050607" />
          )}

          {hoverPt && !drawMode && (
            <g>
              <line x1={hoverPt.x} x2={hoverPt.x} y1={0} y2={260} stroke="#F0A929" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <line x1={0} x2={1000} y1={hoverPt.y} y2={hoverPt.y} stroke="#F0A929" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <circle cx={hoverPt.x} cy={hoverPt.y} r={4} fill="#F0A929" stroke="#050607" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
        {hoverStats && (
          <div className="mono-caps pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 border border-primary/60 bg-panel/95 px-3 py-1.5 text-[10px] amber-glow tabular-nums">
            <span className="text-primary">{hoverStats.time}</span>
            <span className="ml-3 text-faint">O</span>{" "}<span className="text-foreground">{fmt(hoverStats.O)}</span>
            <span className="ml-2 text-faint">H</span>{" "}<span className="text-up">{fmt(hoverStats.H)}</span>
            <span className="ml-2 text-faint">L</span>{" "}<span className="text-down">{fmt(hoverStats.L)}</span>
            <span className="ml-2 text-faint">C</span>{" "}<span className="text-foreground">{fmt(hoverStats.C)}</span>
            <span className={`ml-3 ${hoverStats.chg >= 0 ? "text-up" : "text-down"}`}>{fmtPct(hoverStats.chg)}</span>
          </div>
        )}
        {compareTo && (
          <div className="mono-caps pointer-events-none absolute bottom-2 left-3 flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-primary" /> {instrument.symbol}</span>
            <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-info" /> {compareTo.symbol}</span>
            <span className="text-faint">· normalized %</span>
          </div>
        )}
        <style>{`@keyframes draw-in { from { stroke-dashoffset: 3000 } to { stroke-dashoffset: 0 } }`}</style>
      </div>
      {/* silence unused warnings for drawTick */}
      <span className="hidden">{drawTick}</span>
    </div>
  );
}

