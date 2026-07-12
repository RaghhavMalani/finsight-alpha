import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TICKERS, seedInstrument, nextTick, fmt, fmtPct, monteCarloPaths, percentileBands, type Instrument } from "@/lib/market";

type Mode = "MK" | "MC" | "VS";

const HERO_SYMS = ["NVDA", "AAPL", "SPY"];

export function HeroMiniTerminal() {
  const [insts, setInsts] = useState<Record<string, Instrument>>(() => {
    const m: Record<string, Instrument> = {};
    HERO_SYMS.forEach((s) => (m[s] = seedInstrument(s)));
    // extras for tape
    ["MSFT", "TSLA", "META", "QQQ", "GOOGL"].forEach((s) => (m[s] = seedInstrument(s)));
    return m;
  });
  const [mode, setMode] = useState<Mode>("MK");
  const [cmd, setCmd] = useState("");
  const [err, setErr] = useState(false);
  const [active] = useState("NVDA");
  const [drawKey, setDrawKey] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const id = setInterval(() => {
      setInsts((prev) => {
        const upd = { ...prev };
        Object.keys(upd).forEach((s) => (upd[s] = nextTick(upd[s])));
        return upd;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  function run(raw: string) {
    const t = raw.trim().toUpperCase();
    if (t === "MK" || t === "MC" || t === "VS") {
      setMode(t as Mode);
      setErr(false);
      setCmd("");
      setDrawKey((k) => k + 1);
    } else {
      setErr(true);
      setTimeout(() => setErr(false), 500);
    }
  }

  const inst = insts[active];

  return (
    <div className="relative w-full max-w-[560px]" style={{ perspective: "1400px" }}>
      <div
        className="group panel relative overflow-hidden amber-glow"
        style={{
          transform: isMobile ? "none" : "rotateY(-8deg) rotateX(4deg)",
          transformStyle: "preserve-3d",
          transition: "transform 600ms cubic-bezier(0.16,1,0.3,1)",
        }}
        onMouseEnter={(e) => {
          if (isMobile) return;
          (e.currentTarget as HTMLDivElement).style.transform = "rotateY(0deg) rotateX(0deg)";
        }}
        onMouseLeave={(e) => {
          if (isMobile) return;
          (e.currentTarget as HTMLDivElement).style.transform = "rotateY(-8deg) rotateX(4deg)";
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider bg-panel px-3 py-2">
          <div className="mono-caps flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="text-primary">FINSIGHT/OS</span>
            <span className="h-1 w-1 rounded-full bg-up animate-pulse-live" />
            <span>LIVE · SIM</span>
          </div>
          <div className="mono-caps flex items-center gap-1 text-[9px]">
            {(["MK", "MC", "VS"] as Mode[]).map((m) => (
              <span key={m} className={`border px-1.5 py-0.5 ${mode === m ? "border-primary text-primary" : "border-border text-faint"}`}>{m}</span>
            ))}
          </div>
        </div>

        {/* Stage */}
        <div className="relative h-[220px] bg-background">
          {mode === "MK" && <MiniPriceChart key={drawKey} inst={inst} />}
          {mode === "MC" && <MiniFan key={drawKey} spot={inst.price} />}
          {mode === "VS" && <MiniSurface key={drawKey} />}
        </div>

        {/* Watchlist */}
        <div className="divide-y divide-divider border-t border-divider">
          {HERO_SYMS.map((s) => {
            const i = insts[s];
            const up = i.changePct >= 0;
            return (
              <div key={s} className="grid grid-cols-[60px_1fr_80px] items-center gap-2 px-3 py-1.5 tabular-nums">
                <span className="mono-caps text-[10px] text-foreground">{s}</span>
                <span className="text-right font-mono text-[11px] text-foreground">{fmt(i.price)}</span>
                <span className={`text-right font-mono text-[10px] ${up ? "text-up" : "text-down"}`}>
                  {up ? "▲" : "▼"} {fmtPct(i.changePct)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Tape */}
        <div className="overflow-hidden border-t border-divider bg-panel py-1.5">
          <div className="flex animate-marquee gap-6 whitespace-nowrap px-3">
            {[...Object.values(insts), ...Object.values(insts)].map((i, k) => {
              const up = i.changePct >= 0;
              return (
                <span key={k} className="mono-caps flex items-center gap-1.5 text-[9.5px]">
                  <span className="text-foreground">{i.symbol}</span>
                  <span className={up ? "text-up" : "text-down"}>{up ? "▲" : "▼"}{Math.abs(i.changePct).toFixed(2)}%</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Command */}
        <div className={`flex items-center border-t border-divider bg-background px-2 py-1.5 transition ${err ? "animate-shake" : ""}`}>
          <span className="mono-caps text-[10px] text-primary pr-2">/</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(cmd); }}
            placeholder={isMobile ? "MK · MC · VS" : "Type MK, MC, or VS · Enter"}
            disabled={isMobile}
            readOnly={isMobile}
            className="w-full bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-faint"
          />
          <Link to="/terminal" className="mono-caps ml-2 border border-primary bg-primary/10 px-2 py-0.5 text-[9px] text-primary hover:bg-primary hover:text-primary-foreground">OPEN →</Link>
        </div>
      </div>
      <p className="mono-caps mt-3 text-center text-[10px] text-faint">
        {isMobile ? "Mini-terminal preview · tap OPEN to launch" : "This is live. Type MK, MC, or VS."}
      </p>
    </div>
  );
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

function MiniPriceChart({ inst }: { inst: Instrument }) {
  const h = inst.history;
  const prices = h.map((x) => x.p);
  const min = Math.min(...prices), max = Math.max(...prices);
  const up = inst.changePct >= 0;
  const pts = h.map((x, i) => {
    const px = (i / (h.length - 1)) * 100;
    const py = 100 - ((x.p - min) / (max - min || 1)) * 96 - 2;
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(" ");
  return (
    <div className="relative h-full w-full p-3">
      <div className="mono-caps mb-1 flex items-baseline justify-between text-[9px] text-muted-foreground">
        <span>{inst.symbol} · SESSION</span>
        <span className={up ? "text-up" : "text-down"}>{up ? "▲" : "▼"} {fmtPct(inst.changePct)}</span>
      </div>
      <div className="font-mono text-2xl tabular-nums text-foreground">{fmt(inst.price)}</div>
      <svg viewBox="0 0 100 60" className="absolute inset-x-3 bottom-3 h-32" preserveAspectRatio="none">
        <defs>
          <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#F0A929" : "#F06464"} stopOpacity="0.35" />
            <stop offset="100%" stopColor={up ? "#F0A929" : "#F06464"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,60 ${pts} 100,60`} fill="url(#miniFill)" />
        <polyline
          points={pts}
          fill="none"
          stroke={up ? "#F0A929" : "#F06464"}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          style={{ strokeDasharray: 400, strokeDashoffset: 0, animation: "draw-in 900ms cubic-bezier(0.16,1,0.3,1) both" }}
        />
        <style>{`@keyframes draw-in { from { stroke-dashoffset: 400 } to { stroke-dashoffset: 0 } }`}</style>
      </svg>
    </div>
  );
}

function MiniFan({ spot }: { spot: number }) {
  const { p5, p50, p95 } = useMemo(() => {
    const full = monteCarloPaths(spot, 0.07, 0.32, 40, 200);
    const [a, b, c] = percentileBands(full);
    return { p5: a, p50: b, p95: c };
  }, [spot]);
  const steps = p5.length;
  const min = Math.min(...p5), max = Math.max(...p95);
  const scale = (v: number, i: number) => {
    const x = (i / (steps - 1)) * 100;
    const y = 100 - ((v - min) / (max - min || 1)) * 90 - 5;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const band = (a: number[], b: number[]) => `${b.map((v, i) => scale(v, i)).join(" ")} ${a.map((v, i) => scale(v, i)).reverse().join(" ")}`;
  return (
    <div className="relative h-full w-full p-3">
      <div className="mono-caps mb-1 text-[9px] text-muted-foreground">MONTE CARLO · 10,000 PATHS · GBM</div>
      <svg viewBox="0 0 100 60" className="absolute inset-x-3 bottom-3 h-40" preserveAspectRatio="none">
        <polygon points={band(p5, p95)} fill="#21918C" opacity="0.25" />
        <polygon points={band(p5, p50)} fill="#440154" opacity="0.20" />
        <polyline points={p50.map((v, i) => scale(v, i)).join(" ")} fill="none" stroke="#F0A929" strokeWidth="1.2" vectorEffect="non-scaling-stroke" style={{ strokeDasharray: 300, strokeDashoffset: 0, animation: "draw-mc 900ms cubic-bezier(0.16,1,0.3,1) both" }} />
        <style>{`@keyframes draw-mc { from { stroke-dashoffset: 300 } to { stroke-dashoffset: 0 } }`}</style>
      </svg>
    </div>
  );
}

function MiniSurface() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [rot, setRot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRot((r) => r + 1), 60);
    return () => clearInterval(id);
  }, []);
  // 8x8 grid of rectangles rendered as an SVG isometric mesh
  const N = 10;
  const cells: React.ReactElement[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = i / (N - 1) - 0.5;
      const y = j / (N - 1) - 0.5;
      const h = 0.35 + 0.55 * (x * x + y * y) + 0.15 * Math.sin(x * 6 + rot / 20);
      const proj = project(x, h, y, rot);
      cells.push(
        <rect
          key={`${i}-${j}`}
          x={50 + proj.x - 2}
          y={30 + proj.y - 2}
          width={4}
          height={4}
          fill={colorFor(h)}
          opacity={0.85}
        />
      );
    }
  }
  return (
    <div ref={ref} className="relative h-full w-full p-3">
      <div className="mono-caps mb-1 text-[9px] text-muted-foreground">IV SURFACE · SIM · AUTO-ROTATE</div>
      <svg viewBox="0 0 100 60" className="absolute inset-x-3 bottom-3 h-40 w-[calc(100%-1.5rem)]">
        {cells}
      </svg>
    </div>
  );
}

function project(x: number, y: number, z: number, rot: number) {
  const a = (rot * Math.PI) / 180;
  const rx = x * Math.cos(a) - z * Math.sin(a);
  const rz = x * Math.sin(a) + z * Math.cos(a);
  return { x: rx * 60 + rz * 10, y: -y * 40 + rz * 20 };
}
function colorFor(h: number) {
  const t = Math.max(0, Math.min(1, h));
  if (t < 0.3) return "#440154";
  if (t < 0.55) return "#21918C";
  if (t < 0.8) return "#5EC962";
  return "#FDE725";
}

