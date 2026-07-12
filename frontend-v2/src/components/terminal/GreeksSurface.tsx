import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { Greek } from "@/lib/greeks-surface";
import { GREEK_EXPLAINER } from "@/lib/greeks-surface";
import { annualVolOf, fmt } from "@/lib/market";

const SurfaceCanvas = lazy(() => import("./GreeksSurfaceCanvas"));

const GREEKS: Greek[] = ["DELTA", "GAMMA", "VEGA", "THETA", "VANNA", "CHARM"];

function hash(s: string) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let s = seed || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; }; }

type GexBar = { strike: number; gex: number };

function gexProfile(symbol: string, spot: number): { bars: GexBar[]; flip: number } {
  const r = rng(hash(symbol + ":gex"));
  const strikes = 21;
  const bars: GexBar[] = [];
  // Dealer gamma tends to be positive above spot (calls), negative below (puts)
  for (let i = 0; i < strikes; i++) {
    const k = spot * (0.85 + (0.30 * i) / (strikes - 1));
    const dist = (k - spot) / spot;
    const gex = (dist > 0 ? 1 : -1) * Math.exp(-Math.abs(dist) * 8) * (0.6 + r() * 0.8) * spot * 100;
    bars.push({ strike: k, gex });
  }
  // Flip = point where cumulative gex crosses zero
  let cum = 0, flip = spot;
  for (const b of bars) {
    const prev = cum;
    cum += b.gex;
    if (prev < 0 && cum >= 0) { flip = b.strike; break; }
  }
  return { bars, flip };
}

export function GreeksSurface({ symbol, spot }: { symbol: string; spot: number }) {
  const [mounted, setMounted] = useState(false);
  const [greek, setGreek] = useState<Greek>("GAMMA");
  useEffect(() => setMounted(true), []);
  const gex = useMemo(() => gexProfile(symbol, spot), [symbol, spot]);
  const av = annualVolOf(symbol);
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-[#050607]">
      <div className="mono-caps flex items-center justify-between border-b border-divider bg-panel px-3 py-1.5 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-primary">GREEKS · {symbol}</span>
          <span className="text-faint">σ {(av * 100).toFixed(0)}%</span>
          <span className="text-faint">·</span>
          <span className="text-foreground">flip {fmt(gex.flip)}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {GREEKS.map((g) => (
            <button
              key={g}
              onClick={() => setGreek(g)}
              className={`interactive border px-1.5 py-0.5 text-[9px] ${greek === g ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}
            >{g}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_260px] overflow-hidden">
        <div className="relative">
          {mounted && (
            <Suspense fallback={<div className="mono-caps flex h-full items-center justify-center text-[10px] text-muted-foreground">Loading surface…</div>}>
              <SurfaceCanvas symbol={symbol} spot={spot} greek={greek === "VANNA" || greek === "CHARM" ? "GAMMA" : greek} />
            </Suspense>
          )}
          {(greek === "VANNA" || greek === "CHARM") && (
            <div className="mono-caps pointer-events-none absolute right-3 top-3 border border-primary bg-primary/10 px-2 py-1 text-[9px] text-primary">
              {greek} · derived overlay
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto border-l border-divider bg-panel/50 p-2">
          <GexPanel gex={gex} spot={spot} />
          <ExpiryTable symbol={symbol} spot={spot} />
          <PositionCalc spot={spot} symbol={symbol} />
        </div>
      </div>

      <div className="border-t border-divider bg-panel px-3 py-2">
        <div className="mono-caps text-[9px] text-primary">INSIGHT · {greek}</div>
        <div className="mt-1 font-serif text-[12px] leading-snug text-foreground">
          {GREEK_EXPLAINER[greek]}
        </div>
      </div>
    </div>
  );
}

function GexPanel({ gex, spot }: { gex: { bars: GexBar[]; flip: number }; spot: number }) {
  const maxAbs = Math.max(...gex.bars.map((b) => Math.abs(b.gex)));
  return (
    <div className="border border-divider bg-raised">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-2 py-1 text-[9px]">
        <span className="text-primary">DEALER GEX · by strike</span>
        <span className="text-faint">flip <span className="text-primary">{fmt(gex.flip)}</span></span>
      </div>
      <div className="space-y-[2px] p-2">
        {gex.bars.map((b) => {
          const pct = Math.abs(b.gex) / maxAbs;
          const nearSpot = Math.abs(b.strike - spot) / spot < 0.02;
          const isFlip = Math.abs(b.strike - gex.flip) / spot < 0.015;
          return (
            <div key={b.strike} className="grid items-center gap-1" style={{ gridTemplateColumns: "48px 1fr" }}>
              <span className={`font-mono text-[9px] tabular-nums ${nearSpot ? "text-primary" : isFlip ? "text-primary" : "text-faint"}`}>
                {fmt(b.strike, 0)}
              </span>
              <div className="relative h-2.5 bg-background">
                <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <div
                  className={`absolute top-0 h-full ${b.gex >= 0 ? "bg-up" : "bg-down"}`}
                  style={{ width: `${pct * 48}%`, left: b.gex >= 0 ? "50%" : `${50 - pct * 48}%`, opacity: 0.75 }}
                />
                {isFlip && <div className="absolute inset-y-0 left-1/2 w-[2px] bg-primary" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpiryTable({ symbol, spot }: { symbol: string; spot: number }) {
  const av = annualVolOf(symbol);
  const rows = [7, 14, 30, 60, 90].map((d) => {
    const T = d / 365;
    const sigma = av * (0.9 + Math.log(1 + d / 60) * 0.15);
    const delta = 0.5;
    const gamma = 1 / (spot * sigma * Math.sqrt(T));
    const vega = (spot * Math.sqrt(T)) / 100 * 0.4;
    const theta = -(spot * sigma) / (2 * Math.sqrt(T)) / 365;
    return { d, delta, gamma, vega, theta };
  });
  return (
    <div className="border border-divider bg-raised">
      <div className="mono-caps border-b border-divider px-2 py-1 text-[9px] text-primary">ATM GREEKS · per expiry</div>
      <div className="p-2">
        <div className="mono-caps grid gap-1 text-[8px] text-faint" style={{ gridTemplateColumns: "34px 44px 44px 44px 44px" }}>
          <span>EXP</span><span className="text-right">Δ</span><span className="text-right">Γ</span><span className="text-right">V</span><span className="text-right">Θ</span>
        </div>
        {rows.map((r) => (
          <div key={r.d} className="mono-caps grid gap-1 text-[9px] font-mono tabular-nums" style={{ gridTemplateColumns: "34px 44px 44px 44px 44px" }}>
            <span className="text-primary">{r.d}d</span>
            <span className="text-right text-foreground">{r.delta.toFixed(2)}</span>
            <span className="text-right text-foreground">{(r.gamma * 1000).toFixed(2)}</span>
            <span className="text-right text-foreground">{r.vega.toFixed(2)}</span>
            <span className="text-right text-down">{r.theta.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionCalc({ spot, symbol }: { spot: number; symbol: string }) {
  const [qty, setQty] = useState(10);
  const [strike, setStrike] = useState(Math.round(spot));
  const [type, setType] = useState<"CALL" | "PUT">("CALL");
  const av = annualVolOf(symbol);
  const T = 30 / 365;
  const sigma = av;
  // very rough BSM greeks per contract (1 contract = 100 shares)
  const d1 = (Math.log(spot / strike) + (0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const N = (x: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  const npdf = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const sign = type === "CALL" ? 1 : -1;
  const delta = (type === "CALL" ? N(d1) : N(d1) - 1);
  const gamma = npdf(d1) / (spot * sigma * Math.sqrt(T));
  const theta = -(spot * npdf(d1) * sigma) / (2 * Math.sqrt(T)) / 365;
  const vega = (spot * npdf(d1) * Math.sqrt(T)) / 100;
  const shares = qty * 100;
  const dollarPerPct = delta * spot * shares * 0.01;
  const thetaPerDay = theta * shares;
  const vegaPerVolPt = vega * shares;
  return (
    <div className="border border-divider bg-raised">
      <div className="mono-caps border-b border-divider px-2 py-1 text-[9px] text-primary">POSITION GREEKS · calculator</div>
      <div className="grid grid-cols-3 gap-1 p-2">
        <label className="mono-caps text-[8px] text-faint">QTY
          <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))}
            className="mt-0.5 w-full border border-border bg-background px-1 py-1 font-mono text-[11px] text-foreground" />
        </label>
        <label className="mono-caps text-[8px] text-faint">STRIKE
          <input type="number" value={strike} onChange={(e) => setStrike(Math.max(1, +e.target.value))}
            className="mt-0.5 w-full border border-border bg-background px-1 py-1 font-mono text-[11px] text-foreground" />
        </label>
        <label className="mono-caps text-[8px] text-faint">TYPE
          <select value={type} onChange={(e) => setType(e.target.value as "CALL" | "PUT")}
            className="mt-0.5 w-full border border-border bg-background px-1 py-1 font-mono text-[11px] text-foreground">
            <option>CALL</option><option>PUT</option>
          </select>
        </label>
      </div>
      <div className="mono-caps space-y-1 border-t border-divider px-2 py-2 text-[10px]">
        <div className="flex justify-between"><span className="text-faint">Δ · per +1% move</span>
          <span className={sign * dollarPerPct >= 0 ? "text-up" : "text-down"}>${Math.round(Math.abs(dollarPerPct * sign)).toLocaleString()}</span>
        </div>
        <div className="flex justify-between"><span className="text-faint">Θ · per day</span>
          <span className="text-down">−${Math.round(Math.abs(thetaPerDay)).toLocaleString()}</span>
        </div>
        <div className="flex justify-between"><span className="text-faint">V · per +1 vol pt</span>
          <span className="text-up">${Math.round(vegaPerVolPt).toLocaleString()}</span>
        </div>
        <div className="flex justify-between"><span className="text-faint">Γ</span>
          <span className="text-foreground">{(gamma * shares).toFixed(2)}</span>
        </div>
      </div>
      <div className="border-t border-divider bg-primary/5 px-2 py-2 font-serif text-[11px] leading-snug text-foreground">
        Your {qty} {type.toLowerCase()}s gain ~${Math.round(Math.abs(dollarPerPct)).toLocaleString()} per +1% move ({(delta * sign).toFixed(2)} delta),
        lose ~${Math.round(Math.abs(thetaPerDay)).toLocaleString()}/day (theta).
      </div>
    </div>
  );
}

