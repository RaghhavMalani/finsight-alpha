import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, ScanSearch, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinSight — See beyond the price." },
      {
        name: "description",
        content:
          "A focused market research desk for live analytics, options, risk, models, and evidence-backed AI research.",
      },
    ],
  }),
  component: Landing,
});

const SPOTLIGHT_RADIUS = 270;

const NAV_ITEMS = [
  { label: "Overview", to: "/" as const },
  { label: "Markets", to: "/terminal" as const },
  { label: "Options", to: "/terminal" as const },
  { label: "Models", to: "/terminal" as const },
  { label: "Risk", to: "/risk" as const },
];

type Point = { x: number; y: number };

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { cursor, hasPointer, isCoarse } = useSpotlight();

  return (
    <main className="min-h-screen overflow-hidden bg-black tracking-[-0.02em] text-white">
      <HeroNav menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} />

      <section
        className="relative h-screen w-full overflow-hidden bg-black"
        style={{ height: "100dvh" }}
        aria-label="FinSight market intelligence"
      >
        <div className="finsight-hero-zoom absolute inset-0 z-0">
          <MarketBackdrop mode="market" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,5,0.08)_0%,rgba(2,4,5,0.22)_52%,rgba(2,4,5,0.82)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,rgba(0,0,0,0.16)_52%,rgba(0,0,0,0.62)_100%)]" />
        </div>

        <RevealLayer cursor={cursor} />

        {hasPointer && !isCoarse && (
          <div
            className="pointer-events-none absolute z-[25] size-[54px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 shadow-[0_0_70px_24px_rgba(94,234,212,0.07)]"
            style={{ left: cursor.x, top: cursor.y }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-[-7px] h-[13px] w-px -translate-x-1/2 bg-white/35" />
            <span className="absolute bottom-[-7px] left-1/2 h-[13px] w-px -translate-x-1/2 bg-white/35" />
            <span className="absolute left-[-7px] top-1/2 h-px w-[13px] -translate-y-1/2 bg-white/35" />
            <span className="absolute right-[-7px] top-1/2 h-px w-[13px] -translate-y-1/2 bg-white/35" />
          </div>
        )}

        <div className="pointer-events-none absolute left-0 right-0 top-[15%] z-40 flex flex-col items-center px-5 text-center sm:top-[14%]">
          <div
            className="finsight-hero-anim finsight-hero-fade mono-caps mb-5 flex items-center gap-3 text-[9px] text-white/58 sm:mb-7 sm:text-[10px]"
            style={{ animationDelay: "0.12s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#42C98B] shadow-[0_0_10px_rgba(66,201,139,0.8)]" />
            Live market intelligence · Session ready
          </div>
          <h1 className="leading-[0.91] text-white">
            <span
              className="finsight-hero-anim finsight-hero-reveal block font-serif text-5xl font-normal italic sm:text-7xl md:text-8xl lg:text-[7.25rem]"
              style={{ animationDelay: "0.25s", letterSpacing: "-0.055em" }}
            >
              Markets hold
            </span>
            <span
              className="finsight-hero-anim finsight-hero-reveal -mt-1 block text-5xl font-light sm:text-7xl md:text-8xl lg:text-[7.25rem]"
              style={{ animationDelay: "0.42s", letterSpacing: "-0.075em" }}
            >
              more than price.
            </span>
          </h1>
        </div>

        <div
          className="finsight-hero-anim finsight-hero-fade absolute bottom-12 left-10 z-40 hidden max-w-[280px] sm:block md:bottom-14 md:left-14"
          style={{ animationDelay: "0.72s" }}
        >
          <p className="text-sm font-light leading-relaxed text-white/68">
            Every move leaves evidence across price, volatility, positioning, news, and cross-asset
            flows.
          </p>
        </div>

        <div
          className="finsight-hero-anim finsight-hero-fade absolute bottom-7 left-5 right-5 z-40 flex max-w-full flex-col items-start gap-4 sm:bottom-14 sm:left-auto sm:right-10 sm:max-w-[300px] sm:gap-5 md:right-14"
          style={{ animationDelay: "0.88s" }}
        >
          <p className="text-xs font-light leading-relaxed text-white/68 sm:text-sm">
            FinSight brings live analytics, options, risk models, and cited AI research into one
            focused desk.
          </p>
          <Link
            to="/terminal"
            className="group inline-flex items-center gap-2.5 rounded-full bg-[#F0A929] px-7 py-3 text-sm font-semibold tracking-[-0.01em] text-[#080705] shadow-[0_12px_40px_rgba(240,169,41,0.16)] transition duration-300 hover:scale-[1.03] hover:bg-[#ffb83b] hover:shadow-[0_16px_44px_rgba(240,169,41,0.28)] active:scale-95"
          >
            Open the terminal
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div
          className="finsight-hero-anim finsight-hero-fade pointer-events-none absolute bottom-9 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/35 lg:flex"
          style={{ animationDelay: "1.05s" }}
          aria-hidden="true"
        >
          <ScanSearch className="size-3.5" />
          Move to reveal the signal
        </div>

        {menuOpen && (
          <button
            type="button"
            className="absolute inset-0 z-[45] bg-black/25 backdrop-blur-[2px] md:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          />
        )}
      </section>
    </main>
  );
}

function HeroNav({ menuOpen, onMenuToggle }: { menuOpen: boolean; onMenuToggle: () => void }) {
  return (
    <header className="fixed left-0 right-0 top-0 z-[100] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="FinSight home">
          <span
            className="grid size-7 grid-cols-3 items-end gap-[2px] rounded-full border border-white/30 p-[5px] transition-colors group-hover:border-white/60"
            aria-hidden="true"
          >
            <span className="h-[38%] rounded-[1px] bg-white/60" />
            <span className="h-[76%] rounded-[1px] bg-[#F0A929]" />
            <span className="h-full rounded-[1px] bg-white" />
          </span>
          <span className="font-serif text-2xl italic tracking-[-0.04em] text-white">FinSight</span>
        </Link>

        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/16 bg-white/10 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl md:flex"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item, index) => (
            <Link
              key={item.label}
              to={item.to}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                index === 0
                  ? "bg-white text-[#0A0C0E]"
                  : "text-white/68 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          to="/login"
          className="hidden rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-[#0A0C0E] transition hover:bg-white/88 md:block"
        >
          Sign in
        </Link>

        <button
          type="button"
          className="grid size-10 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md md:hidden"
          onClick={onMenuToggle}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="absolute left-4 right-4 top-[68px] z-[110] rounded-2xl border border-white/15 bg-[#0A0C0E]/92 p-2 shadow-2xl backdrop-blur-2xl md:hidden"
          aria-label="Mobile navigation"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={onMenuToggle}
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-white/75 hover:bg-white/8 hover:text-white"
            >
              {item.label}
              <ArrowUpRight className="size-3.5 text-white/35" />
            </Link>
          ))}
          <Link
            to="/login"
            onClick={onMenuToggle}
            className="mt-1 flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#0A0C0E]"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}

function RevealLayer({ cursor }: { cursor: Point }) {
  const mask = `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${cursor.x}px ${cursor.y}px, #000 0%, #000 36%, rgba(0,0,0,.82) 56%, rgba(0,0,0,.42) 73%, rgba(0,0,0,.10) 88%, transparent 100%)`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
      aria-hidden="true"
    >
      <MarketBackdrop mode="signal" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,8,10,0.02)_0%,rgba(2,8,10,0.16)_56%,rgba(2,8,10,0.74)_100%)]" />
    </div>
  );
}

function useSpotlight() {
  const [cursor, setCursor] = useState<Point>({ x: -999, y: -999 });
  const [hasPointer, setHasPointer] = useState(false);
  const [isCoarse, setIsCoarse] = useState(false);
  const raw = useRef<Point>({ x: -999, y: -999 });
  const smooth = useRef<Point>({ x: -999, y: -999 });
  const pointerSeen = useRef(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const initial = {
      x: window.innerWidth * (coarse ? 0.68 : 0.58),
      y: window.innerHeight * (coarse ? 0.58 : 0.55),
    };
    setIsCoarse(coarse);
    raw.current = initial;
    smooth.current = initial;
    setCursor(initial);

    let raf = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      raw.current = { x: event.clientX, y: event.clientY };
      pointerSeen.current = true;
      setHasPointer(true);
    };
    const onResize = () => {
      if (!pointerSeen.current) {
        raw.current = { x: window.innerWidth * 0.58, y: window.innerHeight * 0.55 };
      }
    };
    const tick = () => {
      smooth.current.x += (raw.current.x - smooth.current.x) * 0.1;
      smooth.current.y += (raw.current.y - smooth.current.y) * 0.1;
      setCursor({ ...smooth.current });
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return { cursor, hasPointer, isCoarse };
}

function MarketBackdrop({ mode }: { mode: "market" | "signal" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMarketScene(context, width, height, mode);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

function drawMarketScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: "market" | "signal",
) {
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, width, height);
  if (mode === "market") {
    background.addColorStop(0, "#07100f");
    background.addColorStop(0.48, "#10110d");
    background.addColorStop(1, "#020405");
  } else {
    background.addColorStop(0, "#051519");
    background.addColorStop(0.5, "#092126");
    background.addColorStop(1, "#04090b");
  }
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * 0.65,
    height * 0.55,
    0,
    width * 0.65,
    height * 0.55,
    width * 0.62,
  );
  glow.addColorStop(0, mode === "market" ? "rgba(240,169,41,.18)" : "rgba(69,185,211,.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  drawGrid(context, width, height, mode);
  if (mode === "market") {
    drawPriceField(context, width, height);
  } else {
    drawSignalField(context, width, height);
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: "market" | "signal",
) {
  const gap = Math.max(54, Math.round(width / 22));
  context.save();
  context.strokeStyle = mode === "market" ? "rgba(255,255,255,.045)" : "rgba(107,231,222,.09)";
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += gap) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += gap) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawPriceField(context: CanvasRenderingContext2D, width: number, height: number) {
  const random = seededRandom(18);
  const points = 92;
  const values: number[] = [];
  let value = 0.55;
  for (let index = 0; index < points; index += 1) {
    value += (random() - 0.46) * 0.082;
    value += (0.58 - value) * 0.022;
    values.push(value);
  }

  for (let band = 0; band < 13; band += 1) {
    context.beginPath();
    values.forEach((item, index) => {
      const x = (index / (points - 1)) * width;
      const wave = Math.sin(index * 0.22 + band * 0.48) * (6 + band * 0.7);
      const y = height * (0.54 + band * 0.026) - item * height * 0.18 + wave;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = `rgba(240,169,41,${0.035 + band * 0.009})`;
    context.lineWidth = band === 0 ? 1.6 : 0.75;
    context.stroke();
  }

  context.beginPath();
  values.forEach((item, index) => {
    const x = (index / (points - 1)) * width;
    const y = height * 0.62 - item * height * 0.22;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "rgba(255,221,158,.58)";
  context.lineWidth = 1.3;
  context.shadowColor = "rgba(240,169,41,.28)";
  context.shadowBlur = 14;
  context.stroke();
  context.shadowBlur = 0;

  context.fillStyle = "rgba(255,255,255,.27)";
  context.font = "500 10px 'JetBrains Mono', monospace";
  context.fillText("PRICE / VOLUME", width * 0.075, height * 0.73);
  context.fillStyle = "rgba(240,169,41,.55)";
  context.fillText("SESSION +1.42%", width * 0.075, height * 0.73 + 22);
}

function drawSignalField(context: CanvasRenderingContext2D, width: number, height: number) {
  const random = seededRandom(42);
  const horizon = 70;

  for (let path = 0; path < 25; path += 1) {
    context.beginPath();
    let value = 0;
    for (let index = 0; index < horizon; index += 1) {
      value += (random() - 0.47) * (1 + index / horizon) * 0.55;
      const x = width * 0.35 + (index / (horizon - 1)) * width * 0.58;
      const y = height * 0.6 - value * 4 - path * 0.12;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = path % 5 === 0 ? "rgba(253,231,37,.32)" : "rgba(69,185,211,.16)";
    context.lineWidth = path % 5 === 0 ? 1.1 : 0.7;
    context.stroke();
  }

  const tiles = [
    { x: 0.08, y: 0.6, w: 0.12, h: 0.08, color: "rgba(66,201,139,.28)" },
    { x: 0.205, y: 0.6, w: 0.08, h: 0.08, color: "rgba(240,100,100,.22)" },
    { x: 0.08, y: 0.685, w: 0.075, h: 0.06, color: "rgba(69,185,211,.28)" },
    { x: 0.16, y: 0.685, w: 0.125, h: 0.06, color: "rgba(253,231,37,.19)" },
  ];
  tiles.forEach((tile) => {
    context.fillStyle = tile.color;
    context.fillRect(width * tile.x, height * tile.y, width * tile.w, height * tile.h);
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.strokeRect(
      width * tile.x + 0.5,
      height * tile.y + 0.5,
      width * tile.w - 1,
      height * tile.h - 1,
    );
  });

  context.font = "500 10px 'JetBrains Mono', monospace";
  context.fillStyle = "rgba(255,255,255,.55)";
  context.fillText("PROBABILITY FIELD / 10,000 PATHS", width * 0.35, height * 0.51);
  context.fillStyle = "rgba(253,231,37,.78)";
  context.fillText("P(> SPOT)  68.4%", width * 0.35, height * 0.51 + 22);
  context.fillStyle = "rgba(255,255,255,.5)";
  context.fillText("SIGNAL  0.82", width * 0.095, height * 0.635);
  context.fillText("RISK  0.34", width * 0.215, height * 0.635);
  context.fillText("VOL  0.61", width * 0.095, height * 0.72);
  context.fillText("REGIME  EXPANDING", width * 0.17, height * 0.72);
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}
