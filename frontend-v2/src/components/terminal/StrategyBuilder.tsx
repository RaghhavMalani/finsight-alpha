import { useMemo } from "react";
import { fmt } from "@/lib/market";

export type Leg = {
  kind: "call" | "put";
  side: "buy" | "sell";
  strike: number;
  premium: number;
  iv: number;
};

type Bias = "BULL" | "BEAR" | "NEUTRAL" | "VOL";

function legPnl(leg: Leg, S: number): number {
  const intrinsic = leg.kind === "call" ? Math.max(0, S - leg.strike) : Math.max(0, leg.strike - S);
  return (leg.side === "buy" ? 1 : -1) * (intrinsic - leg.premium);
}

const BIAS_STRUCTURES: Record<Bias, string> = {
  BULL: "Bull call spread · buy ATM call, sell OTM call · defined risk long delta",
  BEAR: "Put credit spread · sell OTM put, buy further OTM put · short vol, short delta",
  NEUTRAL: "Iron condor · sell OTM put + call, buy wings · short vol range trade",
  VOL: "Long straddle · buy ATM call + ATM put · long vol, direction-agnostic",
};

export function StrategyBuilder({
  spot, symbol, legs, setLegs, suggestOnBias,
}: {
  spot: number;
  symbol: string;
  legs: Leg[];
  setLegs: (l: Leg[]) => void;
  suggestOnBias: (bias: Bias) => void;
}) {
  const range = useMemo(() => {
    const w = Math.max(spot * 0.25, 5);
    return { lo: spot - w, hi: spot + w };
  }, [spot]);
  const curve = useMemo(() => {
    const N = 120;
    const pts: Array<{ S: number; pnl: number }> = [];
    for (let i = 0; i < N; i++) {
      const S = range.lo + (i / (N - 1)) * (range.hi - range.lo);
      const pnl = legs.reduce((s, l) => s + legPnl(l, S), 0);
      pts.push({ S, pnl });
    }
    return pts;
  }, [legs, range]);
  const maxProfit = Math.max(...curve.map((p) => p.pnl), 0);
  const maxLoss = Math.min(...curve.map((p) => p.pnl), 0);
  const netCost = legs.reduce((s, l) => s + (l.side === "buy" ? l.premium : -l.premium), 0);
  // Approx greeks
  const netDelta = legs.reduce((s, l) => {
    const sign = l.side === "buy" ? 1 : -1;
    const moneyness = (spot - l.strike) / spot;
    const rawDelta = l.kind === "call"
      ? (l.strike < spot ? Math.min(0.98, 0.55 + Math.abs(moneyness) * 4) : Math.max(0.02, 0.5 - Math.abs(moneyness) * 4))
      : -(l.strike > spot ? Math.min(0.98, 0.55 + Math.abs(moneyness) * 4) : Math.max(0.02, 0.5 - Math.abs(moneyness) * 4));
    return s + sign * rawDelta;
  }, 0);
  const netVega = legs.reduce((s, l) => s + (l.side === "buy" ? 1 : -1) * 0.15, 0);

  // Breakevens
  const breakevens: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if ((curve[i - 1].pnl < 0 && curve[i].pnl >= 0) || (curve[i - 1].pnl > 0 && curve[i].pnl <= 0)) {
      const t = -curve[i - 1].pnl / (curve[i].pnl - curve[i - 1].pnl);
      breakevens.push(curve[i - 1].S + t * (curve[i].S - curve[i - 1].S));
    }
  }

  const W = 320, H = 160, padY = 12;
  const yMin = Math.min(...curve.map((p) => p.pnl)) - 0.5;
  const yMax = Math.max(...curve.map((p) => p.pnl)) + 0.5;
  const yScale = (v: number) => H - padY - ((v - yMin) / (yMax - yMin || 1)) * (H - padY * 2);
  const xScale = (S: number) => ((S - range.lo) / (range.hi - range.lo || 1)) * W;
  const pathAbove = curve.map((p) => `${xScale(p.S)},${yScale(Math.max(0, p.pnl))}`).join(" ");
  const pathBelow = curve.map((p) => `${xScale(p.S)},${yScale(Math.min(0, p.pnl))}`).join(" ");
  const line = curve.map((p) => `${xScale(p.S)},${yScale(p.pnl)}`).join(" ");
  const zeroY = yScale(0);
  const spotX = xScale(spot);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-divider bg-panel/40">
      <div className="mono-caps flex items-center justify-between border-b border-divider bg-panel px-3 py-1.5 text-[10px]">
        <span className="text-primary">STRATEGY BUILDER · {symbol}</span>
        <button onClick={() => setLegs([])} className="interactive border border-border px-1.5 py-0.5 text-[9px] text-faint hover:text-down">CLEAR</button>
      </div>
      <div className="border-b border-divider px-3 py-2">
        <div className="mono-caps mb-1 text-[9px] text-faint">BIAS</div>
        <div className="flex gap-1">
          {(["BULL", "BEAR", "NEUTRAL", "VOL"] as Bias[]).map((b) => (
            <button key={b} onClick={() => suggestOnBias(b)} className="interactive flex-1 border border-border bg-raised px-1.5 py-1 text-[9px] mono-caps text-foreground hover:border-primary hover:text-primary">
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Payoff */}
      <div className="border-b border-divider px-3 py-2">
        <div className="mono-caps mb-1 flex items-center justify-between text-[9px]">
          <span className="text-faint">PAYOFF at expiry</span>
          <span className={`tabular-nums ${netCost >= 0 ? "text-down" : "text-up"}`}>
            NET {netCost >= 0 ? "DR" : "CR"} {fmt(Math.abs(netCost))}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 160 }}>
          {/* Grid */}
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#636C74" strokeWidth={0.75} strokeDasharray="2 3" />
          <line x1={spotX} x2={spotX} y1="0" y2={H} stroke="#F0A929" strokeOpacity={0.4} strokeDasharray="3 3" strokeWidth={0.75} />
          {/* Profit fill */}
          <polygon points={`0,${zeroY} ${pathAbove} ${W},${zeroY}`} fill="#42C98B" opacity={0.16} />
          <polygon points={`0,${zeroY} ${pathBelow} ${W},${zeroY}`} fill="#F06464" opacity={0.16} />
          {/* Curve */}
          {legs.length > 0 && (
            <polyline points={line} fill="none" stroke="#F0A929" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          )}
          {/* Breakevens */}
          {breakevens.map((be, i) => (
            <g key={i}>
              <line x1={xScale(be)} x2={xScale(be)} y1="0" y2={H} stroke="#45B9D3" strokeOpacity={0.5} strokeDasharray="2 2" strokeWidth={0.75} />
              <text x={xScale(be)} y={12} fontSize="8" fill="#45B9D3" textAnchor="middle" className="mono-caps">BE {be.toFixed(1)}</text>
            </g>
          ))}
          {/* Spot marker */}
          <text x={spotX + 3} y={H - 4} fontSize="8" fill="#F0A929" className="mono-caps">SPOT {spot.toFixed(2)}</text>
          {legs.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="#636C74" fontSize="10" className="mono-caps">Pick a bias or click chain rows</text>
          )}
        </svg>
        <div className="mono-caps mt-1 grid grid-cols-4 gap-2 text-[9px] tabular-nums">
          <div><span className="text-faint">MAX P </span><span className="text-up">{maxProfit === Infinity ? "∞" : fmt(maxProfit)}</span></div>
          <div><span className="text-faint">MAX L </span><span className="text-down">{maxLoss === -Infinity ? "-∞" : fmt(maxLoss)}</span></div>
          <div><span className="text-faint">Δ </span><span className="text-foreground">{netDelta.toFixed(2)}</span></div>
          <div><span className="text-faint">V </span><span className="text-foreground">{netVega.toFixed(2)}</span></div>
        </div>
      </div>

      {/* Legs */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mono-caps mb-1 text-[9px] text-faint">LEGS · {legs.length}</div>
        {legs.length === 0 && (
          <div className="mono-caps px-1 py-4 text-center text-[10px] text-faint">
            Click a bid/ask in the chain to add a leg.
          </div>
        )}
        {legs.map((l, i) => (
          <div key={i} className="mono-caps mb-1 flex items-center justify-between border border-divider bg-raised px-2 py-1 text-[10px] tabular-nums">
            <span className={l.side === "buy" ? "text-up" : "text-down"}>{l.side.toUpperCase()}</span>
            <span className="text-foreground">{l.kind.toUpperCase()}</span>
            <span className="text-primary">{fmt(l.strike)}</span>
            <span className="text-muted-foreground">@ {fmt(l.premium)}</span>
            <button onClick={() => setLegs(legs.filter((_, j) => j !== i))} className="text-faint hover:text-down">✕</button>
          </div>
        ))}
      </div>
      {legs.length > 0 && (
        <div className="mono-caps border-t border-divider bg-panel px-3 py-2 text-[9px]">
          <div className="text-faint">STRUCTURE</div>
          <div className="mt-0.5 text-[10px] text-foreground">
            {legs.length === 2 && legs[0].kind === "call" && legs[1].kind === "call" ? BIAS_STRUCTURES.BULL
              : legs.length === 2 && legs[0].kind === "put" && legs[1].kind === "put" ? BIAS_STRUCTURES.BEAR
              : legs.length === 4 ? BIAS_STRUCTURES.NEUTRAL
              : legs.length === 2 && legs[0].strike === legs[1].strike ? BIAS_STRUCTURES.VOL
              : "Custom multi-leg"}
          </div>
        </div>
      )}
    </div>
  );
}

