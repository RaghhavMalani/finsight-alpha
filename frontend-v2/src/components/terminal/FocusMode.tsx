import { useEffect, useMemo, useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt, fmtPct } from "@/lib/market";
import { Odometer } from "./Odometer";

const BRIEFS: Record<string, string> = {
  NVDA: "NVDA is holding above session VWAP with call skew flattening — dealer hedging suggests grinding upside into settlement.",
  AAPL: "AAPL consolidating in a tight 40bp range; IV rank compressed to the 22nd percentile — cheap to own optionality here.",
  TSLA: "TSLA trading heavy on the tape; put/call ratio spiked to 1.6 — near-term downside protection is being bid.",
  MSFT: "MSFT drifting with the tape; realized-to-implied spread favors sellers of front-week straddles.",
  SPY: "SPY breadth improving under the surface — advance/decline positive despite flat index print.",
};

function fakeFundamentals(sym: string, price: number) {
  const seed = sym.charCodeAt(0) * 13 + sym.length * 7;
  const rnd = (n: number) => {
    const x = Math.sin(seed + n) * 43758.5453;
    return x - Math.floor(x);
  };
  const mktCap = (price * (300 + rnd(1) * 900)).toFixed(0);
  const pe = (12 + rnd(2) * 50).toFixed(1);
  const beta = (0.6 + rnd(3) * 1.4).toFixed(2);
  const low = price * (0.72 + rnd(4) * 0.1);
  const high = price * (1.05 + rnd(5) * 0.2);
  const pos = (price - low) / (high - low);
  const ivRank = Math.round(15 + rnd(6) * 75);
  return { mktCap, pe, beta, low, high, pos, ivRank };
}

export function FocusMode({
  instrument,
  onClose,
}: {
  instrument: Instrument | null;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!instrument) return;
    setTyped("");
    const full = BRIEFS[instrument.symbol] ?? `${instrument.symbol} — session flow is balanced. Awaiting a directional catalyst; positioning suggests dealers are neutral gamma.`;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [instrument]);

  useEffect(() => {
    if (!instrument) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [instrument, onClose]);

  const fund = useMemo(
    () => (instrument ? fakeFundamentals(instrument.symbol, instrument.price) : null),
    [instrument],
  );

  const sparkPts = useMemo(() => {
    if (!instrument) return "";
    const h = instrument.history;
    const min = Math.min(...h.map((x) => x.p));
    const max = Math.max(...h.map((x) => x.p));
    return h
      .map((x, i) => {
        const px = (i / (h.length - 1)) * 1000;
        const py = 80 - ((x.p - min) / (max - min || 1)) * 70 - 5;
        return `${px},${py}`;
      })
      .join(" ");
  }, [instrument]);

  if (!instrument || !fund) return null;
  const up = instrument.changePct >= 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-lg"
        style={{ animation: "fade-in 300ms cubic-bezier(0.16,1,0.3,1) both" }}
      />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-[min(1100px,94vw)] border border-border bg-panel p-8 amber-glow"
        style={{ animation: "focus-rise 400ms cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div className="flex items-start justify-between border-b border-divider pb-4">
          <div>
            <div className="mono-caps text-[10px] text-primary">DOSSIER · {instrument.symbol}</div>
            <div className="font-serif text-3xl text-foreground">{instrument.name}</div>
          </div>
          <button
            onClick={onClose}
            className="mono-caps border border-border bg-raised px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            ESC · CLOSE
          </button>
        </div>

        <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-8">
          <div>
            <div className={`font-mono text-[72px] leading-none ${up ? "text-up" : "text-down"}`}>
              <Odometer value={instrument.price} digits={2} />
            </div>
            <div className={`mono-caps mt-2 text-[12px] ${up ? "text-up" : "text-down"}`}>
              {up ? "▲" : "▼"} {fmt(Math.abs(instrument.change))} · {fmtPct(instrument.changePct)}
            </div>

            <svg viewBox="0 0 1000 80" className="mt-6 h-24 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dosFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up ? "#42C98B" : "#F06464"} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={up ? "#42C98B" : "#F06464"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,80 ${sparkPts} 1000,80`} fill="url(#dosFill)" />
              <polyline
                points={sparkPts}
                fill="none"
                stroke={up ? "#42C98B" : "#F06464"}
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <div className="mt-6 border-l-2 border-info bg-info/5 px-3 py-3">
              <div className="mono-caps text-[9px] text-info">AI · BRIEF</div>
              <div className="mt-1 font-serif text-[15px] leading-relaxed text-foreground">
                {typed}
                <span className="ml-0.5 inline-block h-4 w-[2px] bg-info animate-caret align-middle" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 self-start">
            <StatCard label="MKT CAP" value={`$${(Number(fund.mktCap) / 1000).toFixed(1)}B`} />
            <StatCard label="P/E" value={fund.pe} />
            <StatCard label="BETA" value={fund.beta} />
            <StatCard label="IV RANK" value={`${fund.ivRank}`} accent={fund.ivRank > 60 ? "up" : fund.ivRank < 30 ? "down" : undefined} />
            <div className="col-span-2 border border-divider bg-raised p-3">
              <div className="mono-caps text-[9px] text-faint">52W RANGE</div>
              <div className="mt-2 relative h-1 bg-background">
                <div
                  className="absolute -top-1 h-3 w-[2px] bg-primary"
                  style={{ left: `${Math.min(100, Math.max(0, fund.pos * 100))}%` }}
                />
              </div>
              <div className="mono-caps mt-2 flex justify-between text-[9px] text-muted-foreground">
                <span>{fmt(fund.low)}</span>
                <span>{fmt(fund.high)}</span>
              </div>
            </div>
            <div className="col-span-2 border border-divider bg-raised p-3">
              <div className="mono-caps mb-2 text-[9px] text-primary">OPTIONS SNAPSHOT</div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <MiniStat k="ATM IV" v={`${(fund.ivRank * 0.5 + 18).toFixed(1)}%`} />
                <MiniStat k="25Δ SKEW" v={`+${(2 + (fund.ivRank / 50)).toFixed(1)}v`} />
                <MiniStat k="P/C RATIO" v={(0.6 + (100 - fund.ivRank) / 100).toFixed(2)} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes focus-rise {
          from { opacity: 0; transform: translateY(24px) scale(0.98); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  const color = accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-foreground";
  return (
    <div className="border border-divider bg-raised p-3">
      <div className="mono-caps text-[9px] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-lg ${color}`}>{value}</div>
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mono-caps text-[9px] text-faint">{k}</div>
      <div className="text-foreground">{v}</div>
    </div>
  );
}

