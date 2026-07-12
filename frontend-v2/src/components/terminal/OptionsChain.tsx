import { useMemo, useState } from "react";
import { fmt, annualVolOf } from "@/lib/market";
import { StrategyBuilder, type Leg } from "./StrategyBuilder";

type Row = {
  k: number;
  atm: boolean;
  itmC: boolean;
  itmP: boolean;
  cbid: number; cask: number; civ: number; cdelta: number; cvol: number; coi: number; cunusual: number;
  pbid: number; pask: number; piv: number; pdelta: number; pvol: number; poi: number; punusual: number;
};

function buildRows(spot: number, symbol: string, expiry: "7D" | "30D" | "60D" | "90D", range: "±5" | "±10" | "±20"): Row[] {
  const annualVol = annualVolOf(symbol);
  const atmIvPct = annualVol * 100;
  const ivMul = expiry === "7D" ? 0.85 : expiry === "30D" ? 1 : expiry === "60D" ? 1.08 : 1.15;
  const step = spot > 1000 ? 25 : spot > 200 ? 5 : 2.5;
  const base = Math.round(spot / step) * step;
  const half = range === "±5" ? 5 : range === "±10" ? 10 : 20;
  const strikes = Array.from({ length: half * 2 + 1 }, (_, i) => base + (i - half) * step);
  // Deterministic per symbol pseudo-random for unusual flags & OI walls.
  const rand = (n: number) => {
    const s = Math.sin(n * 12.9898 + symbol.charCodeAt(0)) * 43758.5453;
    return s - Math.floor(s);
  };
  return strikes.map((k, idx) => {
    const moneyness = (k - spot) / spot;
    const civSkew = -moneyness * 40;
    const civ = Math.max(6, (atmIvPct + civSkew + moneyness * moneyness * 200) * ivMul);
    const piv = Math.max(6, (atmIvPct - civSkew * 0.6 + moneyness * moneyness * 200) * ivMul);
    const cbid = Math.max(0.05, Math.max(0, spot - k) + spot * 0.01 * (1 - Math.abs(moneyness) * 3));
    const cask = cbid + Math.max(0.02, spot * 0.0006);
    const pbid = Math.max(0.05, Math.max(0, k - spot) + spot * 0.01 * (1 - Math.abs(moneyness) * 3));
    const pask = pbid + Math.max(0.02, spot * 0.0006);
    const cdelta = k < spot ? Math.min(0.98, 0.55 + Math.abs(moneyness) * 4) : Math.max(0.02, 0.5 - Math.abs(moneyness) * 4);
    const pdelta = -(k > spot ? Math.min(0.98, 0.55 + Math.abs(moneyness) * 4) : Math.max(0.02, 0.5 - Math.abs(moneyness) * 4));
    // Volume/OI base: peak ATM, decays with distance; big-round strikes get walls
    const distDecay = Math.exp(-moneyness * moneyness * 25);
    const roundBonus = Math.abs(k - Math.round(k / (step * 2)) * (step * 2)) < 0.001 ? 1.6 : 1;
    const cbaseVol = 5000 * distDecay * roundBonus * (0.6 + rand(idx * 7));
    const cbaseOI = 12000 * distDecay * roundBonus * (0.8 + rand(idx * 11));
    const pbaseVol = 4500 * distDecay * roundBonus * (0.6 + rand(idx * 13));
    const pbaseOI = 11000 * distDecay * roundBonus * (0.8 + rand(idx * 17));
    // Unusual: rare boost
    const cunusual = rand(idx * 19) > 0.85 && Math.abs(moneyness) < 0.12 ? 3 + rand(idx * 23) * 2 : 1;
    const punusual = rand(idx * 29) > 0.85 && Math.abs(moneyness) < 0.12 ? 3 + rand(idx * 31) * 2 : 1;
    return {
      k, atm: Math.abs(k - spot) < spot * 0.005, itmC: k < spot, itmP: k > spot,
      cbid, cask, civ, cdelta, cvol: cbaseVol * cunusual, coi: cbaseOI, cunusual,
      pbid, pask, piv, pdelta, pvol: pbaseVol * punusual, poi: pbaseOI, punusual,
    };
  });
}

function findWalls(rows: Row[]): { callWall: Row | null; putWall: Row | null } {
  let callWall: Row | null = null, putWall: Row | null = null;
  for (const r of rows) {
    if (!callWall || r.coi > callWall.coi) callWall = r;
    if (!putWall || r.poi > putWall.poi) putWall = r;
  }
  return { callWall, putWall };
}

function computeMaxPain(rows: Row[]): number {
  let bestK = rows[0].k, bestPain = Infinity;
  for (const t of rows) {
    let pain = 0;
    for (const r of rows) {
      if (r.k < t.k) pain += (t.k - r.k) * r.coi;
      else pain += (r.k - t.k) * r.poi;
    }
    if (pain < bestPain) { bestPain = pain; bestK = t.k; }
  }
  return bestK;
}

export function OptionsChain({
  spot,
  symbol,
  emOnChart,
  onToggleEmOnChart,
}: {
  spot: number;
  symbol: string;
  emOnChart?: boolean;
  onToggleEmOnChart?: (on: boolean, pct: number) => void;
}) {
  const [expiry, setExpiry] = useState<"7D" | "30D" | "60D" | "90D">("30D");
  const [range, setRange] = useState<"±5" | "±10" | "±20">("±10");
  const [legs, setLegs] = useState<Leg[]>([]);
  const [showBuilder, setShowBuilder] = useState(true);
  const [showSmile, setShowSmile] = useState(false);

  const rows = useMemo(() => buildRows(spot, symbol, expiry, range), [spot, symbol, expiry, range]);
  const { callWall, putWall } = useMemo(() => findWalls(rows), [rows]);
  const maxPain = useMemo(() => computeMaxPain(rows), [rows]);
  const maxVol = useMemo(() => Math.max(...rows.map((r) => Math.max(r.cvol, r.pvol))), [rows]);
  const maxOI = useMemo(() => Math.max(...rows.map((r) => Math.max(r.coi, r.poi))), [rows]);
  const annualVol = annualVolOf(symbol);
  const atmIvPct = annualVol * 100;
  const ivMul = expiry === "7D" ? 0.85 : expiry === "30D" ? 1 : expiry === "60D" ? 1.08 : 1.15;
  const days = expiry === "7D" ? 7 : expiry === "30D" ? 30 : expiry === "60D" ? 60 : 90;
  // Expected move = spot * atmIV * sqrt(T)
  const emPct = ((atmIvPct * ivMul) / 100) * Math.sqrt(days / 365) * 100;
  const emDollar = spot * (emPct / 100);

  const totalCV = rows.reduce((s, r) => s + r.cvol, 0);
  const totalPV = rows.reduce((s, r) => s + r.pvol, 0);
  const pcr = totalPV / (totalCV || 1);
  const ivRank = Math.min(100, Math.max(0, ((annualVol * 100) - 15) * 2.2));

  function addLeg(k: number, kind: "call" | "put", side: "buy" | "sell") {
    const row = rows.find((r) => r.k === k);
    if (!row) return;
    const premium = kind === "call" ? (side === "buy" ? row.cask : row.cbid) : side === "buy" ? row.pask : row.pbid;
    setLegs((prev) => [...prev, { kind, side, strike: k, premium, iv: kind === "call" ? row.civ : row.piv }]);
  }

  function toggleEm() {
    onToggleEmOnChart?.(!emOnChart, emPct);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header strip */}
      <div className="mono-caps flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-panel px-3 py-1.5 text-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{symbol}</span>
          <div className="flex gap-0.5">
            {(["7D", "30D", "60D", "90D"] as const).map((e) => (
              <button key={e} onClick={() => setExpiry(e)} className={`interactive border px-1.5 py-0.5 text-[9px] ${expiry === e ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>{e}</button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {(["±5", "±10", "±20"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`interactive border px-1.5 py-0.5 text-[9px] ${range === r ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] tabular-nums">
          <span title={`1-sigma expected move by ${expiry} = spot × ATM IV × √T`}>
            <span className="text-faint">EXPECTED MOVE </span>
            <span className="text-primary">±{emPct.toFixed(2)}%</span>
            <span className="ml-1 text-faint">(±${fmt(emDollar)})</span>
          </span>
          <button
            onClick={toggleEm}
            className={`interactive border px-1.5 py-0.5 text-[9px] ${emOnChart ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}
            title="Draw the expected-move cone on the MK chart"
          >EM CONE {emOnChart ? "◉" : "○"}</button>
          <button
            onClick={() => setShowSmile((s) => !s)}
            className={`interactive border px-1.5 py-0.5 text-[9px] ${showSmile ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}
            title="Toggle IV smile — IV vs strike for the selected expiry"
          >IV SMILE {showSmile ? "◉" : "○"}</button>
          <span title="Max pain — strike minimizing option-writer P&L"><span className="text-faint">MAX PAIN </span><span className="text-primary">{fmt(maxPain)}</span></span>
          <span title="Put/Call volume ratio"><span className="text-faint">P/C </span><span className={pcr > 1 ? "text-down" : "text-up"}>{pcr.toFixed(2)}</span></span>
          <span title="IV rank vs 52-week"><span className="text-faint">IV RANK </span><span className="text-foreground">{ivRank.toFixed(0)}</span></span>
          <span title="ATM IV"><span className="text-faint">ATM IV </span><span className="text-primary">{(atmIvPct * ivMul).toFixed(1)}%</span></span>
          <button onClick={() => setShowBuilder((s) => !s)} className={`interactive border px-1.5 py-0.5 text-[9px] ${showBuilder ? "border-primary text-primary" : "border-border text-faint hover:text-foreground"}`}>STRATEGY {showBuilder ? "◀" : "▶"}</button>
        </div>
      </div>

      {showSmile && (
        <IVSmileStrip spot={spot} rows={rows} expiry={expiry} />
      )}

      <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: showBuilder ? "1fr 340px" : "1fr 0px" }}>
        {/* Chain */}
        <div className="flex flex-col overflow-hidden">
          <div className="mono-caps grid grid-cols-[1fr_auto_1fr] gap-1 border-b border-divider bg-panel px-3 py-1 text-[9px] text-faint tabular-nums">
            <span className="grid grid-cols-[1fr_36px_36px_36px_36px_36px] text-right">
              <span className="text-left text-primary" title="Volume · today total contracts">VOL</span>
              <span title="Open interest — outstanding contracts">OI</span>
              <span title="Delta — probability finishing ITM">Δ</span>
              <span title="Implied volatility (%)">IV</span>
              <span>BID</span>
              <span>ASK</span>
            </span>
            <span className="w-14 text-center text-primary">STRIKE</span>
            <span className="grid grid-cols-[36px_36px_36px_36px_36px_1fr] text-right">
              <span>BID</span>
              <span>ASK</span>
              <span title="Implied volatility (%)">IV</span>
              <span title="Delta">Δ</span>
              <span title="Open interest">OI</span>
              <span className="text-left text-primary" title="Volume">VOL</span>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] tabular-nums">
            {rows.map((r) => {
              const cVolPct = r.cvol / maxVol;
              const pVolPct = r.pvol / maxVol;
              const cOIPct = r.coi / maxOI;
              const pOIPct = r.poi / maxOI;
              const isCallWall = callWall && r.k === callWall.k;
              const isPutWall = putWall && r.k === putWall.k;
              const isMaxPain = Math.abs(r.k - maxPain) < 0.001;
              return (
                <div
                  key={r.k}
                  className={`relative grid grid-cols-[1fr_auto_1fr] gap-1 border-b border-divider/60 px-3 py-[3px] transition hover:bg-raised ${r.atm ? "bg-primary/10" : ""}`}
                  style={{ minHeight: 24 }}
                >
                  {/* CALL side */}
                  <div className={`grid grid-cols-[1fr_36px_36px_36px_36px_36px] text-right ${r.itmC ? "bg-primary/5" : ""}`}>
                    <div className="relative text-left">
                      {/* Volume heat bar */}
                      <div className="absolute inset-y-0 left-0" style={{ width: `${cVolPct * 100}%`, background: `rgba(253,231,37,${0.08 + cVolPct * 0.25})` }} />
                      <span className="relative">
                        {r.cunusual > 1 && <span title={`${r.cunusual.toFixed(1)}× avg volume at this strike today`} className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                        <span className={r.cunusual > 1 ? "text-primary" : "text-foreground"}>{Math.round(r.cvol).toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0" style={{ width: `${cOIPct * 100}%`, background: `rgba(66,201,139,${0.08 + cOIPct * 0.20})` }} />
                      <span className="relative text-muted-foreground">{Math.round(r.coi).toLocaleString()}</span>
                    </div>
                    <span className="text-foreground">{r.cdelta.toFixed(2)}</span>
                    <span className="text-muted-foreground">{r.civ.toFixed(1)}</span>
                    <button title="Add BUY CALL" onClick={() => addLeg(r.k, "call", "buy")} className="text-up hover:underline">{fmt(r.cbid)}</button>
                    <button title="Add SELL CALL" onClick={() => addLeg(r.k, "call", "sell")} className="text-down hover:underline">{fmt(r.cask)}</button>
                  </div>

                  {/* Strike */}
                  <div className="w-14 text-center">
                    <span className={`${r.atm ? "text-primary" : "text-foreground"} ${isMaxPain ? "border-b border-primary/60" : ""}`} title={isMaxPain ? "MAX PAIN" : undefined}>{fmt(r.k)}</span>
                    {isCallWall && <span title="CALL WALL — resistance" className="ml-1 text-[8px] text-primary">◀C</span>}
                    {isPutWall && <span title="PUT WALL — support" className="ml-1 text-[8px] text-info">◀P</span>}
                  </div>

                  {/* PUT side */}
                  <div className={`grid grid-cols-[36px_36px_36px_36px_36px_1fr] text-right ${r.itmP ? "bg-primary/5" : ""}`}>
                    <button title="Add SELL PUT" onClick={() => addLeg(r.k, "put", "sell")} className="text-up hover:underline">{fmt(r.pbid)}</button>
                    <button title="Add BUY PUT" onClick={() => addLeg(r.k, "put", "buy")} className="text-down hover:underline">{fmt(r.pask)}</button>
                    <span className="text-muted-foreground">{r.piv.toFixed(1)}</span>
                    <span className="text-foreground">{r.pdelta.toFixed(2)}</span>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${pOIPct * 100}%`, background: `rgba(240,100,100,${0.08 + pOIPct * 0.20})` }} />
                      <span className="relative text-muted-foreground">{Math.round(r.poi).toLocaleString()}</span>
                    </div>
                    <div className="relative text-left">
                      <div className="absolute inset-y-0 right-0" style={{ width: `${pVolPct * 100}%`, background: `rgba(253,231,37,${0.08 + pVolPct * 0.25})` }} />
                      <span className="relative">
                        {r.punusual > 1 && <span title={`${r.punusual.toFixed(1)}× avg volume`} className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                        <span className={r.punusual > 1 ? "text-primary" : "text-foreground"}>{Math.round(r.pvol).toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Strategy builder drawer */}
        {showBuilder && (
          <StrategyBuilder
            spot={spot}
            symbol={symbol}
            legs={legs}
            setLegs={setLegs}
            suggestOnBias={(bias) => {
              // preset structures
              const step = spot > 1000 ? 25 : spot > 200 ? 5 : 2.5;
              const atm = Math.round(spot / step) * step;
              if (bias === "BULL") {
                const long = rows.find((r) => r.k === atm)!;
                const short = rows.find((r) => r.k === atm + step * 2) ?? long;
                setLegs([
                  { kind: "call", side: "buy", strike: long.k, premium: long.cask, iv: long.civ },
                  { kind: "call", side: "sell", strike: short.k, premium: short.cbid, iv: short.civ },
                ]);
              } else if (bias === "BEAR") {
                const short = rows.find((r) => r.k === atm - step * 2) ?? rows[0];
                const long = rows.find((r) => r.k === atm)!;
                setLegs([
                  { kind: "put", side: "sell", strike: short.k, premium: short.pbid, iv: short.piv },
                  { kind: "put", side: "buy", strike: long.k, premium: long.pask, iv: long.piv },
                ]);
              } else if (bias === "NEUTRAL") {
                // iron condor
                const wingP = rows.find((r) => r.k === atm - step * 4) ?? rows[0];
                const bodyP = rows.find((r) => r.k === atm - step * 2) ?? rows[0];
                const bodyC = rows.find((r) => r.k === atm + step * 2) ?? rows[rows.length - 1];
                const wingC = rows.find((r) => r.k === atm + step * 4) ?? rows[rows.length - 1];
                setLegs([
                  { kind: "put", side: "buy", strike: wingP.k, premium: wingP.pask, iv: wingP.piv },
                  { kind: "put", side: "sell", strike: bodyP.k, premium: bodyP.pbid, iv: bodyP.piv },
                  { kind: "call", side: "sell", strike: bodyC.k, premium: bodyC.cbid, iv: bodyC.civ },
                  { kind: "call", side: "buy", strike: wingC.k, premium: wingC.cask, iv: wingC.civ },
                ]);
              } else if (bias === "VOL") {
                // long straddle
                const atmR = rows.find((r) => r.k === atm)!;
                setLegs([
                  { kind: "call", side: "buy", strike: atmR.k, premium: atmR.cask, iv: atmR.civ },
                  { kind: "put", side: "buy", strike: atmR.k, premium: atmR.pask, iv: atmR.piv },
                ]);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function IVSmileStrip({ spot, rows, expiry }: { spot: number; rows: Row[]; expiry: string }) {
  const W = 900, H = 90, PAD = 12;
  const iw = W - PAD * 2, ih = H - PAD * 2;
  const kMin = rows[0].k, kMax = rows[rows.length - 1].k;
  const ivs = rows.flatMap((r) => [r.civ, r.piv]);
  const yMin = Math.min(...ivs) * 0.95;
  const yMax = Math.max(...ivs) * 1.05;
  const xAt = (k: number) => PAD + ((k - kMin) / (kMax - kMin || 1)) * iw;
  const yAt = (v: number) => PAD + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const callPts = rows.map((r) => `${xAt(r.k)},${yAt(r.civ)}`).join(" ");
  const putPts  = rows.map((r) => `${xAt(r.k)},${yAt(r.piv)}`).join(" ");
  return (
    <div className="border-b border-divider bg-panel/80 px-3 py-2">
      <div className="mono-caps mb-1 flex items-center gap-3 text-[9px] text-faint">
        <span className="text-primary">IV SMILE · {expiry}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-up" /> calls</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-down" /> puts</span>
        <span className="ml-auto">spot {fmt(spot)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={PAD} x2={W-PAD} y1={PAD + ih*t} y2={PAD + ih*t} stroke="#171B1F" strokeWidth={0.5} />
        ))}
        <line x1={xAt(spot)} x2={xAt(spot)} y1={PAD} y2={H-PAD} stroke="#F0A929" strokeOpacity={0.5} strokeDasharray="3 3" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
        <polyline points={callPts} fill="none" stroke="#42C98B" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <polyline points={putPts}  fill="none" stroke="#F06464" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}


