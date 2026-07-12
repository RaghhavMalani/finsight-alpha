import { useMemo } from "react";
import { fmt } from "@/lib/market";

function seededRand(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function DepthLadder({ mid, seed = 0 }: { mid: number; seed?: number }) {
  const { bids, asks, maxSize } = useMemo(() => {
    const rand = seededRand(Math.round(mid * 100) + seed * 7919 + 1);
    const bids = Array.from({ length: 10 }, (_, i) => ({
      price: mid - (i + 1) * mid * 0.0006,
      size: Math.round(rand() * 4000 + 500 + i * 200),
    }));
    const asks = Array.from({ length: 10 }, (_, i) => ({
      price: mid + (i + 1) * mid * 0.0006,
      size: Math.round(rand() * 4000 + 500 + i * 200),
    }));
    const maxSize = Math.max(...bids.map((b) => b.size), ...asks.map((a) => a.size));
    return { bids, asks, maxSize };
  }, [mid, seed]);

  return (
    <div className="flex h-full flex-col">
      <div className="mono-caps grid grid-cols-3 border-b border-divider px-3 py-2 text-[10px] text-faint">
        <span>BID</span>
        <span className="text-center">PRICE</span>
        <span className="text-right">ASK</span>
      </div>
      <div className="flex-1 overflow-hidden font-mono text-[11px]">
        {asks
          .slice()
          .reverse()
          .map((a, i) => (
            <div key={`a${i}`} className="relative grid grid-cols-3 px-3 py-1">
              <div
                className="absolute inset-y-0.5 right-0 bg-down/15"
                style={{ width: `${(a.size / maxSize) * 40}%` }}
              />
              <span />
              <span className="relative text-center text-down">{fmt(a.price)}</span>
              <span className="relative text-right text-foreground">{a.size.toLocaleString()}</span>
            </div>
          ))}
        <div className="border-y border-primary/40 bg-primary/5 px-3 py-1.5 text-center">
          <span className="mono-caps text-[10px] text-primary">MID </span>
          <span className="text-foreground">{fmt(mid)}</span>
        </div>
        {bids.map((b, i) => (
          <div key={`b${i}`} className="relative grid grid-cols-3 px-3 py-1">
            <div
              className="absolute inset-y-0.5 left-0 bg-up/15"
              style={{ width: `${(b.size / maxSize) * 40}%` }}
            />
            <span className="relative text-foreground">{b.size.toLocaleString()}</span>
            <span className="relative text-center text-up">{fmt(b.price)}</span>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectorHeatmap({ seed = 0 }: { seed?: number }) {
  const sectors = [
    "Tech",
    "Semis",
    "Financials",
    "Energy",
    "Health",
    "Consumer",
    "Industrials",
    "Utilities",
    "Materials",
    "REITs",
    "Comms",
    "Staples",
  ];
  const cells = useMemo(() => {
    const rand = seededRand(seed + 101);
    return sectors.map((s) => ({ s, v: (rand() - 0.45) * 4 }));
     
  }, [seed]);
  return (
    <div className="grid h-full grid-cols-4 gap-[2px] p-1">
      {cells.map((c) => {
        const t = Math.max(-2.5, Math.min(2.5, c.v));
        const bg =
          t >= 0
            ? `rgba(66,201,139,${0.15 + (t / 2.5) * 0.55})`
            : `rgba(240,100,100,${0.15 + (-t / 2.5) * 0.55})`;
        return (
          <div
            key={c.s}
            className="flex flex-col items-center justify-center p-1"
            style={{ background: bg }}
          >
            <div className="mono-caps text-[9px] text-foreground">{c.s}</div>
            <div className={`font-mono text-xs ${t >= 0 ? "text-up" : "text-down"}`}>
              {t >= 0 ? "▲" : "▼"} {Math.abs(t).toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

