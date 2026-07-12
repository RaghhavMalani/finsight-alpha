import { useEffect, useLayoutEffect, useState } from "react";

const KEY = "finsight.tour.v1";

type Step = { sel: string; title: string; body: string };

const STEPS: Step[] = [
  {
    sel: '[data-tour="cmd"]',
    title: "COMMAND BAR",
    body: "Press / to focus. Type a code (MK, VS, MC) or plain English — 'monte carlo nvda'. Try 'NVDA VS AAPL' to compare.",
  },
  {
    sel: '[data-tour="rail"]',
    title: "FUNCTION RAIL",
    body: "Jump between markets, options, vol surface, Monte Carlo, ML, correlation, risk. Numbered hotkeys 1–9.",
  },
  {
    sel: '[data-tour="watchlist"]',
    title: "WATCHLIST",
    body: "Click to select · double-click (or press G) for the dossier · right-click for actions · send to group A/B to relink panels.",
  },
  {
    sel: '[data-tour="panel-toolbar"]',
    title: "PANEL TOOLBARS",
    body: "Every panel exposes its powers as chips — series type, timeframe, drawing tools, ticker groups. Hover for hotkeys.",
  },
  {
    sel: '[data-tour="preset"]',
    title: "WORKSPACE PRESETS",
    body: "DESK, QUANT, RESEARCH lay the desk out for different jobs. Drag any splitter to resize · double-click to reset · type TOUR to replay this.",
  },
  {
    sel: '[data-tour="pnl"]',
    title: "YOUR SIMULATED BOOK",
    body: "Your simulated book. It powers P&L, RISK and recommendations — click to inspect or edit. Add, remove, or reset positions at any time.",
  },
];

export function SpotlightTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (localStorage.getItem(KEY) !== "done") {
        timeout = setTimeout(() => { setOpen(true); setI(0); }, 900);
      }
    } catch { /* ignore */ }
    function replay() { setI(0); setOpen(true); }
    window.addEventListener("finsight:tour-replay", replay);
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("finsight:tour-replay", replay);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const el = document.querySelector(STEPS[i].sel) as HTMLElement | null;
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, i]);

  function done() {
    try {
      localStorage.setItem(KEY, "done");
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  const pad = 6;
  const x = rect ? rect.left - pad : 0;
  const y = rect ? rect.top - pad : 0;
  const w = rect ? rect.width + pad * 2 : 0;
  const h = rect ? rect.height + pad * 2 : 0;

  const popW = 320;
  const vpW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = y + h + 12 + 160 < vpH;
  const popY = below ? y + h + 12 : Math.max(16, y - 180);
  const popX = Math.min(vpW - popW - 16, Math.max(16, x + w / 2 - popW / 2));

  return (
    <div className="fixed inset-0 z-[95] pointer-events-none">
      <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ pointerEvents: "none" }}>

        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={x} y={y} width={w} height={h} rx={4} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(5,6,7,0.78)" mask="url(#tour-mask)" />
        {rect && (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={4}
            fill="none"
            stroke="#F0A929"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="20" dur="1.2s" repeatCount="indefinite" />
          </rect>
        )}
      </svg>
      <div
        className="absolute w-[320px] border border-primary bg-panel p-4 amber-glow pointer-events-auto"
        style={{ left: popX, top: popY, animation: "fade-in 240ms ease-out both" }}
      >
        <div className="mono-caps mb-2 flex items-center justify-between text-[10px] text-primary">
          <span>
            STEP {i + 1} / {STEPS.length} · {STEPS[i].title}
          </span>
        </div>
        <div className="font-mono text-[12px] leading-relaxed text-foreground">{STEPS[i].body}</div>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={done}
            className="mono-caps text-[10px] text-muted-foreground hover:text-foreground"
          >
            SKIP TOUR
          </button>
          <button
            onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : done())}
            className="mono-caps bg-primary px-3 py-1.5 text-[10px] text-primary-foreground transition hover:brightness-110"
          >
            {i < STEPS.length - 1 ? "NEXT →" : "DONE"}
          </button>
        </div>
      </div>
    </div>
  );
}

