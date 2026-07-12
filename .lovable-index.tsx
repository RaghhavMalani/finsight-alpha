import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TICKERS, seedInstrument, fmt, fmtPct, monteCarloPaths, percentileBands, viridis } from "@/lib/market";
import { HeroMiniTerminal } from "@/components/terminal/HeroMiniTerminal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinSight — The market, in focus." },
      {
        name: "description",
        content:
          "A research terminal for people who take their own view. Live analytics, options, risk, and AI research on one desk.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav />
      <Hero />
      <TickerTape />
      <Editorial />
      <FooterCTA />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 z-40 flex h-14 w-full items-center justify-between border-b border-divider bg-background/80 px-8 backdrop-blur">
      <div className="mono-caps text-sm text-primary">FinSight</div>
      <nav className="mono-caps hidden gap-8 text-[11px] text-muted-foreground md:flex">
        <a href="#capabilities" className="hover:text-foreground">Capabilities</a>
        <a href="#preview" className="hover:text-foreground">Preview</a>
        <Link to="/login" className="hover:text-foreground">Sign in</Link>
      </nav>
      <Link
        to="/terminal"
        className="mono-caps bg-primary px-4 py-2 text-[11px] text-primary-foreground transition hover:brightness-110"
      >
        Open the terminal
      </Link>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center px-8 pt-14">
      <TopographyCanvas />
      <div className="relative z-10 grid w-full max-w-7xl grid-cols-1 items-center gap-16 md:grid-cols-[1.05fr_1fr]">
        <div className="max-w-2xl">
          <div className="mono-caps mb-8 flex items-center gap-3 text-[11px] text-primary animate-fade-in">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-up animate-pulse-live" />
            Live simulated feed · Session ready
          </div>
          <h1 className="font-serif text-5xl leading-[1.02] tracking-tight text-foreground md:text-7xl">
            <span className="block animate-rise-in" style={{ animationDelay: "80ms" }}>The market,</span>
            <span className="relative inline-block animate-rise-in" style={{ animationDelay: "260ms" }}>
              in focus.
              <span className="animate-underline absolute -bottom-2 left-0 block h-[3px] w-full bg-primary" />
            </span>
          </h1>
          <p
            className="mt-10 max-w-xl text-lg leading-relaxed text-muted-foreground animate-rise-in"
            style={{ animationDelay: "500ms" }}
          >
            FinSight is a research terminal for people who take their own view — live analytics,
            options, risk, and AI research on one desk.
          </p>
          <div className="mt-10 flex items-center gap-6 animate-rise-in" style={{ animationDelay: "700ms" }}>
            <Link
              to="/terminal"
              className="mono-caps group inline-flex items-center gap-3 bg-primary px-6 py-3 text-xs text-primary-foreground transition hover:brightness-110"
            >
              Open the terminal
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link to="/login" className="mono-caps text-xs text-muted-foreground hover:text-foreground">
              or sign in
            </Link>
          </div>
        </div>
        <div className="relative flex justify-center md:justify-end animate-rise-in" style={{ animationDelay: "600ms" }}>
          <HeroMiniTerminal />
        </div>
      </div>
      <div className="absolute bottom-8 left-8 mono-caps text-[10px] text-faint animate-fade-in">
        Scroll ↓
      </div>
    </section>
  );
}

function TopographyCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      if (!cvs) return;
      cvs.width = cvs.offsetWidth * devicePixelRatio;
      cvs.height = cvs.offsetHeight * devicePixelRatio;
    }
    resize();
    window.addEventListener("resize", resize);

    let phase = 0;
    const lines = 22;
    function draw() {
      if (!cvs || !ctx) return;
      const w = cvs.width;
      const h = cvs.height;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < lines; i++) {
        const y = (i / lines) * h;
        const amp = 10 + i * 4;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(240,169,41,${0.03 + (i / lines) * 0.06})`;
        ctx.lineWidth = 1 * devicePixelRatio;
        for (let x = 0; x <= w; x += 6 * devicePixelRatio) {
          const yy =
            y +
            Math.sin(x * 0.005 + phase + i * 0.5) * amp +
            Math.sin(x * 0.012 + phase * 0.7) * (amp * 0.4);
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      phase += reduce ? 0 : 0.004;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full opacity-70"
      aria-hidden
    />
  );
}

function TickerTape() {
  const [insts, setInsts] = useState(() => TICKERS.map(seedInstrument));
  useEffect(() => {
    const id = setInterval(() => {
      setInsts((prev) =>
        prev.map((i) => {
          const drift = (Math.random() - 0.5) * 0.006 * i.price;
          const price = Math.max(0.01, i.price + drift);
          const first = i.history[0].p;
          return { ...i, price, changePct: ((price - first) / first) * 100 };
        })
      );
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const row = (
    <div className="flex shrink-0 items-center gap-10 px-6">
      {insts.map((i) => {
        const up = i.changePct >= 0;
        return (
          <div key={i.symbol} className="flex items-center gap-3">
            <span className="mono-caps text-[11px] text-foreground">{i.symbol}</span>
            <span className="font-mono text-[13px] text-foreground">{fmt(i.price)}</span>
            <span
              className={`font-mono text-[11px] ${up ? "text-up" : "text-down"}`}
            >
              {up ? "▲" : "▼"} {fmtPct(i.changePct)}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="group relative overflow-hidden border-y border-divider bg-panel py-4">
      <div className="flex animate-marquee group-hover:[animation-play-state:paused]">
        {row}
        {row}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-panel to-transparent" />
    </div>
  );
}

function Editorial() {
  return (
    <section id="capabilities" className="mx-auto max-w-7xl px-8 py-40">
      <RevealRow
        eyebrow="01 — Live desk"
        title="Every panel breathes with the tape."
        copy="Real-time price flashes, market depth, and sector heat that update as the desk moves. Nothing is a static screenshot."
        preview={<SparklineGrid />}
      />
      <RevealRow
        reverse
        eyebrow="02 — Forward view"
        title="Ten thousand futures, drawn."
        copy="Monte Carlo simulations render 10,000 GBM paths with percentile fans — read the distribution of outcomes, not just the median."
        preview={<FanPreview />}
      />
      <RevealRow
        eyebrow="03 — Signal desk"
        title="Models on the same screen as prices."
        copy="Momentum, mean-reversion, and volatility-regime classifiers with confidence gauges and interpretable feature importance."
        preview={<SignalCard />}
      />
    </section>
  );
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

function RevealRow({
  eyebrow,
  title,
  copy,
  preview,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  preview: React.ReactNode;
  reverse?: boolean;
}) {
  const { ref, seen } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`mb-40 grid gap-14 md:grid-cols-2 md:gap-24 ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
    >
      <div>
        <div
          className={`mono-caps text-[11px] text-primary ${seen ? "animate-fade-in" : "opacity-0"}`}
        >
          {eyebrow}
        </div>
        <h2
          className={`mt-6 font-serif text-5xl leading-tight text-foreground md:text-6xl ${
            seen ? "animate-rise-in" : "opacity-0"
          }`}
          style={{ animationDelay: "120ms" }}
        >
          {title}
        </h2>
        <p
          className={`mt-6 max-w-lg text-base leading-relaxed text-muted-foreground ${
            seen ? "animate-rise-in" : "opacity-0"
          }`}
          style={{ animationDelay: "260ms" }}
        >
          {copy}
        </p>
      </div>
      <div
        id="preview"
        className={`panel relative overflow-hidden p-6 ${seen ? "animate-rise-in" : "opacity-0"}`}
        style={{ animationDelay: "400ms" }}
      >
        {preview}
      </div>
    </div>
  );
}

function SparklineGrid() {
  const items = useMemo(
    () => ["AAPL", "NVDA", "TSLA", "MSFT", "META", "GOOGL"].map(seedInstrument),
    []
  );
  return (
    <div>
      <div className="mono-caps mb-4 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Watch · Sparklines</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-live" /> Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((i) => {
          const up = i.changePct >= 0;
          const stroke = up ? "#42C98B" : "#F06464";
          const min = Math.min(...i.history.map((h) => h.p));
          const max = Math.max(...i.history.map((h) => h.p));
          const pts = i.history
            .map((h, idx) => {
              const x = (idx / (i.history.length - 1)) * 100;
              const y = 100 - ((h.p - min) / (max - min || 1)) * 100;
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <div key={i.symbol} className="bg-raised p-3">
              <div className="mono-caps flex items-center justify-between text-[10px]">
                <span className="text-foreground">{i.symbol}</span>
                <span className={up ? "text-up" : "text-down"}>
                  {up ? "▲" : "▼"} {fmtPct(i.changePct)}
                </span>
              </div>
              <svg viewBox="0 0 100 40" className="mt-2 h-10 w-full" preserveAspectRatio="none">
                <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FanPreview() {
  const [bands, setBands] = useState<{ bands: number[][]; paths: number[][] } | null>(null);
  useEffect(() => {
    const paths = monteCarloPaths(100, 0.06, 0.28, 60, 200);
    setBands({ bands: percentileBands(paths), paths });
  }, []);
  if (!bands) {
    return (
      <div>
        <div className="mono-caps mb-4 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>MC · 10,000 paths</span>
          <span className="text-primary">p5 · p50 · p95</span>
        </div>
        <svg viewBox="0 0 100 60" className="h-40 w-full" />
      </div>
    );
  }
  const [p5, p50, p95] = bands.bands;
  const steps = p5.length;
  const min = Math.min(...p5);
  const max = Math.max(...p95);
  const pt = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = (i / (steps - 1)) * 100;
        const y = 100 - ((v - min) / (max - min || 1)) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  const fillArea = (a: number[], b: number[]) => {
    const top = pt(b);
    const bot = a
      .map((v, i) => {
        const x = 100 - (i / (steps - 1)) * 100;
        const y = 100 - ((v - min) / (max - min || 1)) * 100;
        return `${x},${y}`;
      })
      .reverse()
      .reverse();
    return `${top} ${bot.reverse().join(" ")}`;
  };
  return (
    <div>
      <div className="mono-caps mb-4 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>MC · 10,000 paths</span>
        <span className="text-primary">p5 · p50 · p95</span>
      </div>
      <svg viewBox="0 0 100 60" className="h-40 w-full" preserveAspectRatio="none">
        <polygon points={fillArea(p5, p95)} fill="#21918C" opacity={0.18} />
        <polyline points={pt(p5)} fill="none" stroke="#440154" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <polyline points={pt(p50)} fill="none" stroke="#FDE725" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <polyline points={pt(p95)} fill="none" stroke="#21918C" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mono-caps mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <Stat label="p5" value={fmt(p5[p5.length - 1])} tone="down" />
        <Stat label="p50" value={fmt(p50[p50.length - 1])} tone="primary" />
        <Stat label="p95" value={fmt(p95[p95.length - 1])} tone="up" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "primary" }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-primary";
  return (
    <div className="bg-raised p-2">
      <div className="text-faint">{label}</div>
      <div className={`font-mono text-sm ${c}`}>{value}</div>
    </div>
  );
}

function SignalCard() {
  const signals = [
    { name: "Momentum", conf: 0.82, dir: "up" as const },
    { name: "Mean reversion", conf: 0.34, dir: "down" as const },
    { name: "Vol regime", conf: 0.61, dir: "up" as const, note: "expanding" },
  ];
  return (
    <div>
      <div className="mono-caps mb-4 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>ML · Signals · NVDA</span>
        <span className="text-primary">Ensemble v3</span>
      </div>
      <div className="space-y-3">
        {signals.map((s) => (
          <div key={s.name} className="bg-raised p-3">
            <div className="mono-caps flex items-center justify-between text-[10px]">
              <span className="text-foreground">{s.name}</span>
              <span className={s.dir === "up" ? "text-up" : "text-down"}>
                {s.dir === "up" ? "▲" : "▼"} {(s.conf * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-2 h-1 bg-background">
              <div
                className={`h-full ${s.dir === "up" ? "bg-up" : "bg-down"}`}
                style={{ width: `${s.conf * 100}%`, transition: "width 800ms cubic-bezier(0.16,1,0.3,1)" }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mono-caps mt-4 flex gap-1 text-[10px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-2 flex-1" style={{ background: viridis(i / 4) }} />
        ))}
      </div>
    </div>
  );
}

function FooterCTA() {
  return (
    <footer className="border-t border-divider bg-panel px-8 py-24 text-center">
      <h3 className="font-serif text-5xl text-foreground">Ready to open the desk?</h3>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
        No account required for the demo. The tape starts moving the moment you land.
      </p>
      <Link
        to="/terminal"
        className="mono-caps mt-10 inline-flex items-center gap-3 bg-primary px-6 py-3 text-xs text-primary-foreground hover:brightness-110"
      >
        Open the terminal →
      </Link>
      <div className="mono-caps mt-16 flex justify-between text-[10px] text-faint">
        <span>FINSIGHT/OS v2.0</span>
        <span>SIMULATED FEED · NOT FINANCIAL ADVICE</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

