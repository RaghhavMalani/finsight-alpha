import { useMemo } from "react";
import { recommendationsFor, type Suggestion, type Pair } from "@/lib/recommender";

export function MLDiscover({ book, activeSymbol }: { book: string[]; activeSymbol: string }) {
  const rec = useMemo(() => recommendationsFor(book.length ? book : [activeSymbol]), [book, activeSymbol]);
  return (
    <div className="grid h-full gap-2 overflow-y-auto p-3" style={{ gridAutoRows: "min-content" }}>
      <div className="mono-caps text-[10px] text-primary">
        BECAUSE YOUR BOOK HOLDS <span className="text-foreground">{book.slice(0, 3).join(" · ")}</span>
        <span className="ml-2 text-[9px] text-faint">collaborative filter · factor overlap</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {rec.suggestions.map((s) => <SuggestionCard key={s.sym} s={s} />)}
      </div>

      <div className="mono-caps mt-4 text-[10px] text-primary">STAT-ARB PAIRS · TOP CANDIDATES</div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rec.pairs.map((p) => <PairCard key={p.a + p.b} p={p} />)}
      </div>
    </div>
  );
}

function SuggestionCard({ s }: { s: Suggestion }) {
  return (
    <div className="border border-divider bg-panel p-3">
      <div className="mono-caps flex items-center justify-between text-[10px]">
        <span className="text-primary">{s.sym}</span>
        <span className="text-faint">SIM <span className="text-foreground">{(s.similarity * 100).toFixed(0)}</span></span>
      </div>
      <div className="mt-2 flex items-center justify-center">
        <FactorRadar factors={s.factors} />
      </div>
      <div className="mono-caps mt-2 flex items-baseline justify-between text-[9px]">
        <span className="text-faint">DIVERSIFICATION Δρ</span>
        <span className={s.diversificationDelta < -0.15 ? "text-up" : "text-primary"}>
          {s.diversificationDelta.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 border-t border-divider pt-2 text-[11px] leading-snug text-foreground">{s.because}</div>
    </div>
  );
}

function FactorRadar({ factors }: { factors: { name: string; v: number }[] }) {
  const size = 140;
  const cx = size / 2, cy = size / 2, R = size * 0.38;
  const n = factors.length;
  const angle = (i: number) => (-Math.PI / 2) + (i / n) * Math.PI * 2;
  const pt = (i: number, r: number) => `${cx + Math.cos(angle(i)) * r},${cy + Math.sin(angle(i)) * r}`;
  const rings = [0.25, 0.5, 0.75, 1].map((frac) =>
    Array.from({ length: n }, (_, i) => pt(i, R * frac)).join(" ")
  );
  const poly = factors.map((f, i) => pt(i, R * f.v)).join(" ");
  return (
    <svg width={size} height={size}>
      {rings.map((r, i) => <polygon key={i} points={r} fill="none" stroke="#171B1F" strokeWidth={0.5} />)}
      {factors.map((_, i) => <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(angle(i)) * R} y2={cy + Math.sin(angle(i)) * R} stroke="#171B1F" strokeWidth={0.5} />)}
      <polygon points={poly} fill="#F0A929" fillOpacity={0.22} stroke="#F0A929" strokeWidth={1.2} />
      {factors.map((f, i) => {
        const p = pt(i, R + 12).split(",");
        return (
          <text key={i} x={p[0]} y={p[1]} fontSize={8} fill="#9AA2A9" textAnchor="middle" fontFamily="ui-monospace,monospace">
            {f.name}
          </text>
        );
      })}
    </svg>
  );
}

function PairCard({ p }: { p: Pair }) {
  const n = p.spread.length;
  const H = 90, W = 400, PAD = 10;
  const iw = W - PAD * 2, ih = H - PAD * 2;
  const zMax = Math.max(3, ...p.spread.map(Math.abs));
  const yAt = (v: number) => PAD + ih / 2 - (v / zMax) * (ih / 2);
  const xAt = (i: number) => PAD + (i / (n - 1)) * iw;
  const pts = p.spread.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const bandE = yAt(p.entryZ), bandE2 = yAt(-p.entryZ);
  const bandX = yAt(p.exitZ), bandX2 = yAt(-p.exitZ);
  return (
    <div className="border border-divider bg-panel p-3">
      <div className="mono-caps flex items-center justify-between text-[10px]">
        <span><span className="text-primary">{p.a}</span> / <span className="text-primary">{p.b}</span></span>
        <span className="text-faint">ρ <span className="text-foreground">{p.correlation.toFixed(2)}</span> · z <span className={Math.abs(p.z) > p.entryZ ? "text-primary" : "text-foreground"}>{p.z.toFixed(2)}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full" preserveAspectRatio="none">
        {/* entry/exit bands */}
        <rect x={PAD} y={bandE} width={iw} height={bandE2 - bandE} fill="#F06464" opacity={0.06} />
        <rect x={PAD} y={bandX} width={iw} height={bandX2 - bandX} fill="#42C98B" opacity={0.06} />
        {[bandE, bandE2].map((y, i) => <line key={"e" + i} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#F06464" strokeDasharray="2 3" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
        {[bandX, bandX2].map((y, i) => <line key={"x" + i} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#42C98B" strokeDasharray="2 3" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
        {/* zero */}
        <line x1={PAD} x2={W - PAD} y1={yAt(0)} y2={yAt(0)} stroke="#636C74" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
        <polyline points={pts} fill="none" stroke="#F0A929" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mono-caps mt-2 border-t border-divider pt-2 text-[9px] text-muted-foreground leading-snug">{p.hint}</div>
    </div>
  );
}

