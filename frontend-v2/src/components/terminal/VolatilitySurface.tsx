import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { annualVolOf } from "@/lib/market";

const SurfaceCanvas = lazy(() => import("./VolatilitySurfaceCanvas"));

function hash(s: string) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let s = seed || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; }; }

type SurfaceStats = {
  atmTerm: { d: number; iv: number }[];      // days-to-expiry vs ATM IV
  skew: { d: number; skew: number }[];       // 25Δ put-call skew per expiry
  ivAtm: number;
  rv20: number;
  ivRank: number;   // 0..100
  ivPct: number;    // 0..100
  contango: boolean;
  insight: string;
};

function computeStats(symbol: string): SurfaceStats {
  const av = annualVolOf(symbol);
  const r = rng(hash(symbol + ":vsurf"));
  const days = [7, 14, 30, 60, 90, 180];
  // ATM term structure — near-term elevated bias
  const nearBump = 1 + (r() * 0.35 + 0.05);
  const atmTerm = days.map((d) => {
    const base = av * (0.9 + 0.25 * Math.log(1 + d / 60));
    const bump = d < 21 ? nearBump : 1;
    return { d, iv: base * bump };
  });
  // Skew — steeper near expiry
  const skew = days.map((d) => ({ d, skew: (0.06 + 0.14 * (30 / (d + 10))) * (r() * 0.6 + 0.7) }));
  const ivAtm = atmTerm.find((p) => p.d === 30)!.iv * 100;
  const rv20 = (av * (0.75 + r() * 0.35)) * 100;
  const ivRank = Math.min(100, Math.max(5, Math.round(50 + (ivAtm - rv20) * 3 + r() * 20)));
  const ivPct = Math.min(100, Math.max(2, Math.round(ivRank * 0.85 + r() * 15)));
  const contango = atmTerm[atmTerm.length - 1].iv > atmTerm[0].iv;
  const richness = ivAtm - rv20;
  const insight =
    skew[0].skew > 0.14 ? "Steep near-term put skew — crash protection in demand." :
    !contango ? "Term structure INVERTED — event risk pricing in near-term." :
    richness > 6 ? `IV rich vs realized by ${richness.toFixed(0)}pts — sellers advantaged.` :
    richness < -3 ? `IV cheap vs realized (${richness.toFixed(0)}pts) — vol looks under-priced.` :
    "Surface calm — no directional dislocation worth chasing.";
  return { atmTerm, skew, ivAtm, rv20, ivRank, ivPct, contango, insight };
}

export function VolatilitySurface({ symbol, spot }: { symbol: string; spot: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stats = useMemo(() => computeStats(symbol), [symbol]);

  return (
    <div className="grid h-full grid-cols-[1fr_280px] gap-0 bg-[#050607]">
      {/* left: 3D + insight */}
      <div className="relative flex flex-col overflow-hidden">
        <div className="mono-caps pointer-events-none absolute left-3 top-3 z-10 text-[10px] text-primary">
          VOL SURFACE · {symbol} · SIM
        </div>
        <div className="mono-caps pointer-events-none absolute right-3 top-3 z-10 text-[9px] text-faint">
          DRAG · ORBIT   SCROLL · ZOOM
        </div>
        <div className="relative flex-1">
          {mounted && (
            <Suspense fallback={<div className="mono-caps flex h-full items-center justify-center text-[10px] text-muted-foreground">Loading surface…</div>}>
              <SurfaceCanvas symbol={symbol} spot={spot} />
            </Suspense>
          )}
        </div>
        <div className="mono-caps border-t border-divider bg-panel/80 px-3 py-2 text-[10px]">
          <span className="text-primary">SURFACE INSIGHT · </span>
          <span className="text-foreground">{stats.insight}</span>
        </div>
      </div>

      {/* right: stats stack */}
      <div className="grid grid-rows-[auto_1fr_1fr_auto] gap-2 overflow-y-auto border-l border-divider bg-panel/40 p-2">
        <div className="grid grid-cols-2 gap-2">
          <StatChip label="ATM IV · 30d" value={`${stats.ivAtm.toFixed(1)}%`} tone={stats.ivAtm - stats.rv20 > 5 ? "up" : "n"} />
          <StatChip label="RV · 20d" value={`${stats.rv20.toFixed(1)}%`} tone="n" />
          <StatChip label="IV rank" value={`${stats.ivRank}`} tone={stats.ivRank > 70 ? "up" : stats.ivRank < 30 ? "down" : "n"} />
          <StatChip label="IV pctile" value={`${stats.ivPct}`} tone="n" />
        </div>
        <TermStrip stats={stats} />
        <SkewStrip stats={stats} />
        <div className="mono-caps border border-divider bg-raised px-2 py-1.5 text-[9px]">
          <span className="text-faint">IV − RV · </span>
          <span className={stats.ivAtm - stats.rv20 > 0 ? "text-up" : "text-down"}>
            {stats.ivAtm - stats.rv20 >= 0 ? "+" : ""}{(stats.ivAtm - stats.rv20).toFixed(1)}pts
          </span>
          <span className="ml-2 text-faint">Options {stats.ivAtm - stats.rv20 > 4 ? "RICH" : stats.ivAtm - stats.rv20 < -3 ? "CHEAP" : "FAIR"}</span>
          <span className="ml-2 text-faint">·</span>
          <span className={stats.contango ? "ml-2 text-foreground" : "ml-2 text-primary"}>{stats.contango ? "CONTANGO" : "INVERTED"}</span>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "n" }) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="border border-divider bg-raised px-2 py-1.5">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`font-mono text-[13px] tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function TermStrip({ stats }: { stats: SurfaceStats }) {
  const W = 260, H = 90, PAD = 22;
  const vals = stats.atmTerm.map((p) => p.iv);
  const min = Math.min(...vals) * 0.9, max = Math.max(...vals) * 1.1;
  const n = stats.atmTerm.length;
  const xAt = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const yAt = (v: number) => PAD / 2 + (H - PAD) - ((v - min) / (max - min || 1)) * (H - PAD * 1.2);
  const pts = stats.atmTerm.map((p, i) => `${xAt(i)},${yAt(p.iv)}`).join(" ");
  return (
    <div className="border border-divider bg-raised">
      <div className="mono-caps flex justify-between px-2 py-1 text-[9px]">
        <span className="text-primary">ATM TERM · IV by expiry</span>
        <span className={stats.contango ? "text-faint" : "text-primary"}>{stats.contango ? "contango" : "inverted"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#F0A929" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        {stats.atmTerm.map((p, i) => (
          <g key={p.d}>
            <circle cx={xAt(i)} cy={yAt(p.iv)} r={1.5} fill="#F0A929" />
            <text x={xAt(i)} y={H - 4} fontSize={7} fill="#636C74" textAnchor="middle" fontFamily="ui-monospace,monospace">{p.d}d</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SkewStrip({ stats }: { stats: SurfaceStats }) {
  const W = 260, H = 90, PAD = 22;
  const vals = stats.skew.map((p) => p.skew);
  const max = Math.max(...vals) * 1.1;
  const n = stats.skew.length;
  const xAt = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const yAt = (v: number) => PAD / 2 + (H - PAD) - (v / max) * (H - PAD * 1.2);
  const pts = stats.skew.map((p, i) => `${xAt(i)},${yAt(p.skew)}`).join(" ");
  return (
    <div className="border border-divider bg-raised">
      <div className="mono-caps flex justify-between px-2 py-1 text-[9px]">
        <span className="text-primary">25Δ SKEW · put − call</span>
        <span className={stats.skew[0].skew > 0.12 ? "text-primary" : "text-faint"}>{stats.skew[0].skew > 0.12 ? "steep" : "flat"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#F06464" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        {stats.skew.map((p, i) => (
          <g key={p.d}>
            <circle cx={xAt(i)} cy={yAt(p.skew)} r={1.5} fill="#F06464" />
            <text x={xAt(i)} y={H - 4} fontSize={7} fill="#636C74" textAnchor="middle" fontFamily="ui-monospace,monospace">{p.d}d</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

