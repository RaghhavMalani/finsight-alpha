import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandBar } from "@/components/terminal/CommandBar";
import { COMMANDS } from "@/lib/commands";
import { Panel } from "@/components/terminal/Panel";
import { PriceChart } from "@/components/terminal/PriceChart";
import { DepthLadder, SectorHeatmap } from "@/components/terminal/MarketPanels";
import { OptionsChain } from "@/components/terminal/OptionsChain";
import { MonteCarloPanel } from "@/components/terminal/MonteCarloPanel";
import { MLPanel } from "@/components/terminal/MLPanel";
import { StockIntelligencePanel } from "@/components/terminal/StockIntelligencePanel";
import { CorrelationPanel } from "@/components/terminal/CorrelationPanel";
import { SightPanel, type SightDeskContext } from "@/components/terminal/SightPanel";
import { IntelFeed } from "@/components/terminal/IntelFeed";
import { Watchlist } from "@/components/terminal/Watchlist";
import { SectorsStrip } from "@/components/terminal/SectorsStrip";
import { VolatilitySurface } from "@/components/terminal/VolatilitySurface";
import { GreeksSurface } from "@/components/terminal/GreeksSurface";
import { HomeOverview } from "@/components/terminal/HomeOverview";
import { NewsImpactPanel } from "@/components/terminal/NewsImpactPanel";
import { BTPanel } from "@/components/terminal/BTPanel";
import { STRATPanel } from "@/components/terminal/STRATPanel";
import { HintTicker } from "@/components/terminal/HintTicker";
import { GridStage2x2 } from "@/components/terminal/GridStage";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { KeyboardOverlay } from "@/components/terminal/KeyboardOverlay";
import { FocusMode } from "@/components/terminal/FocusMode";
import { PnlRibbon } from "@/components/terminal/PnlRibbon";
import { ReplayScrubber } from "@/components/terminal/ReplayScrubber";
import { AiInsight } from "@/components/terminal/AiInsight";
import { SpotlightTour } from "@/components/terminal/SpotlightTour";
import { MarketClock } from "@/components/terminal/MarketClock";
import { ContextMenu, type ContextState } from "@/components/terminal/ContextMenu";
import { AlertsPanel, AlertPopover, type Alert } from "@/components/terminal/AlertsPanel";
import { BookDrawer } from "@/components/terminal/BookDrawer";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";
import { TICKERS, unavailableInstrument, Instrument, fmt, fmtPct } from "@/lib/market";
import { useLiveMarket, type LiveMarketStatus } from "@/lib/live-market";
import { toast } from "sonner";

export const Route = createFileRoute("/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal — FinSight" },
      {
        name: "description",
        content: "The FinSight research desk — live analytics on one screen.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Terminal,
});

const EXPLAINERS: Record<string, { what: string; why: string; how: string }> = {
  HOME: {
    what: "Market overview — indices, sector treemap, top movers, breadth, and an AI desk brief.",
    why: "One glance tells you the session's tone, leadership, and the story worth caring about.",
    how: "Green treemap tiles are sectors gaining today. Breadth gauges show how broad the move is. Click any mover to load it in MK.",
  },
  NEWS: {
    what: "Evidence-labelled news intelligence — relevance, catalyst, transmission, exposed KPI, and scenario paths.",
    why: "A headline is actionable only when you can distinguish a direct company catalyst from a co-mention and see how it could reach fundamentals.",
    how: "Load any US, NSE, or BSE symbol. Read left to right through the flow; treat company chips and upside/downside paths as scenarios, never price forecasts.",
  },
  MK: {
    what: "Provider quote snapshot, real daily history, session range, volume when supplied, and explicit Level 2 availability.",
    why: "Price is useful only when its source and limits are visible.",
    how: "Switch timeframes for Yahoo daily closes. The liquidity panel shows only fields supplied by the active provider.",
  },
  OC: {
    what: "Yahoo option quotes with bid/ask, reported IV, volume, open interest, OI walls, max pain, and a strategy builder.",
    why: "Real chain positioning turns an options idea into something testable.",
    how: "Choose a target expiry and strike range. Click the bid to sell or the ask to buy; provider failures never fall back to a synthetic chain.",
  },
  MC: {
    what: "Monte Carlo probability landscape — a 3D density surface of terminal prices vs time.",
    why: "A single fan hides the density. The ridges show where paths cluster; the tails show risk you'd otherwise miss.",
    how: "Amber ridge = spot. Height + color = path density. Right-side flanks give P(>spot), EV, p5/p50/p95, and expected shortfall.",
  },
  GR: {
    what: "3D greek surfaces — delta, gamma, vega, theta as strike × time-to-expiry ridges.",
    why: "Greek shapes are the language of dealer positioning. Seeing them beats reading tables.",
    how: "Switch greeks via the toolbar. Drag to orbit, scroll to zoom, hover for exact values. Read the insight strip below.",
  },
  ML: {
    what: "Backend-trained classification signals and hidden-state market regimes fit from Yahoo price history.",
    why: "A model is useful only when its inputs, validation quality, probability, and failure state are visible.",
    how: "SIGNALS reports the gated out-of-sample result, scorecard, and feature importance. REGIMES shows the fitted HMM state, transition matrix, and observed performance.",
  },
  CX: {
    what: "Cross-asset intelligence — correlation matrix, force-directed web, and per-ticker dependency network.",
    why: "Correlations tell you diversification is real. Dependencies tell you who feeds whom.",
    how: "Switch tabs on the toolbar. In DEPENDENCIES, node color is relationship type — cyan supplier, green customer, red competitor.",
  },
  VS: {
    what: "A rotating 3D implied-volatility surface — every strike, every expiry, one shape.",
    why: "Smile, skew, and term structure are the entire language of options positioning.",
    how: "Bright yellow ridges are elevated IV — usually short-dated downside. Drag · scroll · hover.",
  },
  RISK: {
    what: "VaR, contribution to risk, portfolio optimizer, and stress paths.",
    why: "Knowing your worst plausible loss beats hoping the market cooperates.",
    how: "The 99% VaR is the loss you should expect once in a hundred days. Contribution bars show which names drive that risk.",
  },
  SIGHT: {
    what: "Ask the desk — an AI research assistant grounded in your current book.",
    why: "Fast, structured answers beat digging through five tabs.",
    how: "Ask in plain English. Ticker chips are clickable — jump straight to the panels.",
  },
  ALT: {
    what: "Industry and supply-chain intelligence selected automatically from the active stock.",
    why: "A semiconductor, retailer, automaker, and software company need different evidence.",
    how: "Choose a stock anywhere in the terminal. Its domicile, industry series, and trade proxy are registered automatically; every source card opens its immutable raw snapshot.",
  },
  ALERTS: {
    what: "Price-level alerts on your watchlist tickers.",
    why: "You can't stare at every ticker all day. Alerts do it for you.",
    how: "Click the bell on any row to arm a level. When price crosses, the row flashes and a toast fires.",
  },
};

const INSIGHTS: Record<string, string[]> = {
  HOME: [
    "Tape prints skew to buyers — up 1.4× on the last 5-minute average.",
    "Realized vol dropping into the close — grinding regime intact.",
  ],
  MC: [
    "Paths cluster above spot — drift dominates at this horizon.",
    "Fan widening past day 30 — hedge farther-dated exposure.",
  ],
  VS: [
    "Skew steepening: downside protection bid.",
    "Short-dated IV rising while backend flat — event risk pricing in.",
  ],
  CX: [
    "Cross-asset correlations climbing — diversification thinning.",
    "Tech basket 60D ρ = 0.71, above 6-mo mean.",
  ],
  OC: [
    "25-delta risk reversal widening negative — put demand outpacing calls.",
    "Front-week gamma stacked at the money — pinning likely.",
  ],
  GR: [
    "Dealer gamma flips negative below spot — moves accelerate on the downside.",
    "Vanna positive across the belly — vol-up plus spot-up feeds itself.",
  ],
  BT: [
    "Strategy beats buy-hold on total return but bleeds Sharpe out-of-sample.",
    "Drawdowns cluster around regime transitions — tune stops or add filter.",
  ],
  STRAT: [
    "Rule count within safe band — over-fit risk stays LOW.",
    "Preview signals fire ~1× per month — sample size is acceptable.",
  ],
  ALT: [
    "Evidence is selected from the active ticker's registered industry profile.",
    "Economic observations are reconstructed against the selected historical information date.",
  ],
};

// SUBTITLE: one-line plain-English narrative for every function screen.
const SUBTITLES: Record<string, (sym: string) => string> = {
  HOME: () => "The desk brief — what moved, what's next, what your book is doing right now.",
  NEWS: (s) =>
    `${s} news-impact graph — verified relevance, causal pathway, company transmission, and upside/downside confirmation checks.`,
  MK: (s) =>
    `${s} provider quote, session range and real daily history — with unsupported liquidity fields clearly marked.`,
  OC: (s) =>
    `${s} Yahoo option market — reported quotes, volume, open interest, IV and derived positioning levels.`,
  MC: (s) =>
    `${s} probability landscape — a Monte Carlo of terminal prices. Where do paths cluster? How wide is the tail?`,
  GR: (s) =>
    `${s} greeks — how this option's price breathes with the market. Which risks is it carrying?`,
  ML: (s) =>
    `${s} research models — real trained signal validation and fitted market regimes from backend history.`,
  CX: (s) =>
    `Cross-asset dependencies — how ${s} moves with, or breaks from, everything else on the desk.`,
  VS: (s) => `${s} implied-volatility surface — smile, skew, and term structure in one shape.`,
  ALT: (s) =>
    `${s} industry and supply-chain evidence — ticker-derived domicile, vintages, and immutable source lineage.`,
  BT: (s) =>
    `Backtest lab — run the picked strategy on ${s} and see if the edge survives out-of-sample.`,
  STRAT: () =>
    "Strategy creator — wire indicators into entry/exit rules and preview signals before sending to BT.",
  RISK: () =>
    "Risk desk — the whole book's VaR, concentration and stress. Open /RISK for the full manager.",
  SIGHT: () => "Ask the desk — a research chat grounded in your book and the current tape.",
};

type Preset = "DESK" | "QUANT" | "RESEARCH";

function Terminal() {
  const [fn, setFn] = useState<string>("HOME");
  const [instruments, setInstruments] = useState<Record<string, Instrument>>(() => {
    const m: Record<string, Instrument> = {};
    TICKERS.forEach((s) => (m[s] = unavailableInstrument(s)));
    return m;
  });
  const [active, setActive] = useState<string>("NVDA");
  const [watch, setWatch] = useState<string[]>(["NVDA", "AAPL", "SPY", "MSFT", "META"]);
  const [cmdCount, setCmdCount] = useState(24);
  const [panelKey, setPanelKey] = useState(0);
  const marketSymbols = useMemo(
    () => Array.from(new Set([...TICKERS, ...watch, active])).slice(0, 30),
    [watch, active],
  );
  const market = useLiveMarket(setInstruments, marketSymbols);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusSym, setFocusSym] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>(() => {
    if (typeof window === "undefined") return "QUANT";
    return (localStorage.getItem("finsight.preset") as Preset) || "QUANT";
  });
  const [replayT, setReplayT] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextState>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertFor, setAlertFor] = useState<{
    sym: string;
    anchor?: { x: number; y: number };
  } | null>(null);
  const [triggeredSyms, setTriggeredSyms] = useState<Set<string>>(new Set());
  const [bookOpen, setBookOpen] = useState(false);
  const [demoPositions, setDemoPositions] = useState<DemoPosition[]>([]);
  const [emCone, setEmCone] = useState<{ symbol: string; pct: number } | null>(null);
  useEffect(() => subscribeDemoBook(setDemoPositions), []);
  const prevPricesRef = useRef<Record<string, number>>({});
  // Group A flash — increments whenever the active (group-A) symbol changes.
  const [groupASeed, setGroupASeed] = useState(0);
  const lastActive = useRef(active);
  useEffect(() => {
    if (lastActive.current !== active) {
      lastActive.current = active;
      setGroupASeed((n) => n + 1);
    }
  }, [active]);

  // Alert engine — fire on price crossing.
  useEffect(() => {
    if (alerts.length === 0) return;
    setAlerts((prev) => {
      let changed = false;
      const flashes = new Set<string>();
      const next = prev.map((a) => {
        if (a.state === "triggered") return a;
        const inst = instruments[a.sym];
        if (!inst) return a;
        const prevP = prevPricesRef.current[a.sym] ?? inst.price;
        const crossed =
          a.direction === "above"
            ? prevP < a.level && inst.price >= a.level
            : prevP > a.level && inst.price <= a.level;
        if (crossed) {
          changed = true;
          flashes.add(a.sym);
          toast.success(
            `ALERT · ${a.sym} ${a.direction === "above" ? "≥" : "≤"} ${a.level.toFixed(2)}`,
          );
          return { ...a, state: "triggered" as const, triggeredAt: Date.now() };
        }
        return a;
      });
      if (flashes.size) {
        setTriggeredSyms(flashes);
        setTimeout(() => setTriggeredSyms(new Set()), 900);
      }
      return changed ? next : prev;
    });
    // update prev prices
    const p: Record<string, number> = {};
    for (const s of marketSymbols) p[s] = instruments[s]?.price ?? 0;
    prevPricesRef.current = p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruments]);

  // Global hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!editing && e.key === "?") {
        e.preventDefault();
        setHelpOpen((h) => !h);
      } else if (!editing && (e.key === "g" || e.key === "G")) {
        setFocusSym(active);
      } else if (
        !editing &&
        (/^[1-9]$/.test(e.key) || e.key === "0" || e.key === "-" || e.key === "=")
      ) {
        const idx =
          e.key === "0" ? 9 : e.key === "-" ? 10 : e.key === "=" ? 11 : parseInt(e.key, 10) - 1;
        const cmd = COMMANDS[idx];
        if (cmd) runCmd(cmd.code);
      } else if (e.key === "Escape") {
        setFocusSym(null);
        setHelpOpen(false);
        setMaximized(null);
        setCompareTo(null);
        setAlertFor(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    try {
      localStorage.setItem("finsight.preset", preset);
    } catch {
      /* ignore */
    }
  }, [preset]);

  function openWorkspace(nextPreset: Preset) {
    setPreset(nextPreset);
    setFn("MK");
    setMaximized(null);
    setPanelKey((key) => key + 1);
  }

  function ensureSymbol(raw: string) {
    const symbol = raw.trim().toUpperCase();
    setInstruments((current) =>
      current[symbol] ? current : { ...current, [symbol]: unavailableInstrument(symbol) },
    );
  }

  function runCmd(code: string, symbol?: string, action?: "GO" | "COMPARE", symbol2?: string) {
    if (code === "TOUR") {
      window.dispatchEvent(new Event("finsight:tour-replay"));
      return;
    }
    if (action === "COMPARE" && symbol) {
      setActive(symbol);
      setCompareTo(symbol2 ?? null);
      setFn("HOME");
      setPanelKey((k) => k + 1);
      ensureSymbol(symbol);
      if (symbol2) ensureSymbol(symbol2);
      setCmdCount((c) => c + 1);
      toast.success(`Compare · ${symbol}${symbol2 ? ` vs ${symbol2}` : ""}`);
      return;
    }
    if (symbol) {
      ensureSymbol(symbol);
      setActive(symbol);
    }
    if (action === "GO" && symbol) {
      setFocusSym(symbol);
      return;
    }
    setFn(code === "HOME" ? "HOME" : code);
    setPanelKey((k) => k + 1);
    setCmdCount((c) => c + 1);
  }

  function togglePin(sym: string) {
    ensureSymbol(sym);
    setWatch((w) => (w.includes(sym) ? w : [...w, sym]));
    setActive(sym);
  }

  function openContextForSym(e: React.MouseEvent, sym: string) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Open dossier", onClick: () => setFocusSym(sym) },
        { label: "Pin to watchlist", onClick: () => togglePin(sym) },
        {
          label: "Set alert",
          onClick: () => setAlertFor({ sym, anchor: { x: e.clientX, y: e.clientY } }),
        },
        {
          label: `Compare · ${active} vs ${sym}`,
          onClick: () => {
            setCompareTo(sym);
            setFn("HOME");
          },
        },
        {
          label: "Load in OC",
          onClick: () => {
            setActive(sym);
            setFn("OC");
            setPanelKey((k) => k + 1);
          },
        },
        {
          label: "Load in MC",
          onClick: () => {
            setActive(sym);
            setFn("MC");
            setPanelKey((k) => k + 1);
          },
        },
        {
          label: "Load in VS",
          onClick: () => {
            setActive(sym);
            setFn("VS");
            setPanelKey((k) => k + 1);
          },
        },
      ],
    });
  }

  function addAlert(sym: string, level: number, direction: "above" | "below") {
    const id = `${sym}-${Date.now()}`;
    setAlerts((a) => [...a, { id, sym, level, direction, createdAt: Date.now(), state: "armed" }]);
    toast.success(`ARMED · ${sym} ${direction === "above" ? "≥" : "≤"} ${level.toFixed(2)}`);
  }

  const inst = instruments[active] ?? unavailableInstrument(active);
  const cmpInst = compareTo ? (instruments[compareTo] ?? unavailableInstrument(compareTo)) : null;
  const sightContext: SightDeskContext = {
    activePanel: fn,
    ticker: active,
    displayedPrice:
      replayT !== null
        ? (inst.history[Math.max(1, Math.round(inst.history.length * replayT) - 1)]?.p ??
          inst.price)
        : inst.price,
    changePct: inst.changePct,
    marketSource: market.source,
    priceProvenance:
      market.source === "UNAVAILABLE" ? "UNAVAILABLE" : `${market.source}_PROVIDER_QUOTE`,
    replay: replayT !== null,
    watchlist: watch,
    paperBook: demoPositions.map((position) => position.symbol),
    panelData: {
      quote_display: {
        price: Number(inst.price.toFixed(4)),
        bid: Number(inst.bid.toFixed(4)),
        ask: Number(inst.ask.toFixed(4)),
        change_pct: Number(inst.changePct.toFixed(4)),
      },
      session_model: {
        source: "SIM",
        open: Number(inst.open.toFixed(4)),
        high: Number(inst.sessionHigh.toFixed(4)),
        low: Number(inst.sessionLow.toFixed(4)),
        vwap: Number(inst.vwap.toFixed(4)),
        annualized_vol: Number(inst.annualVol.toFixed(4)),
        beta: Number(inst.beta.toFixed(4)),
        recent_price_path: inst.history.slice(-24).map((point) => ({
          timestamp: new Date(point.t).toISOString(),
          price: Number(point.p.toFixed(4)),
          volume: point.v == null ? null : Math.round(point.v),
        })),
      },
    },
    comparedWith: compareTo,
    expectedMovePct: emCone?.symbol === active ? emCone.pct : null,
  };

  const centerContent = renderCenter(fn, preset, {
    active,
    inst,
    cmpInst,
    instruments,
    replayT,
    setReplayT,
    setFocusSym,
    setActive,
    onAddCompare: () => {
      const nextSym = watch.find((s) => s !== active) ?? "AAPL";
      setCompareTo(nextSym);
      toast(`Comparing ${active} vs ${nextSym} — try 'NVDA VS AAPL'`);
    },
    setCompareTo,
    onMaximize: setMaximized,
    isMaximized: !!maximized,
    groupASeed,
    groupBSeed: compareTo ?? "",
    setFn,
    watch,
    demoBookSyms: demoPositions.map((p) => p.symbol),
    onRun: runCmd,
    marketStatus: market,
    emCone,
    sightContext,
    setEmCone,
  });

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-divider bg-panel px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="mono-caps text-sm text-primary">
            FinSight
          </Link>
          <div className="mono-caps flex items-center gap-2 text-[10px] text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${replayT !== null ? "bg-info" : market.source === "FINNHUB" ? "bg-up animate-pulse-live" : market.connected ? "bg-primary" : "bg-faint"}`}
            />
            {replayT !== null
              ? "REPLAY · LOCAL"
              : market.connected
                ? market.source === "FINNHUB"
                  ? "LIVE · FINNHUB"
                  : `EOD SNAPSHOT · ${market.asOf ?? "TIMESTAMP PENDING"}`
                : "CONNECTING · MARKET DATA"}
          </div>
          <MarketClock />
        </div>
        <div data-tour="cmd" className="flex-1 flex justify-center px-6">
          <CommandBar onRun={runCmd} />
        </div>
        <div className="mono-caps flex items-center gap-4 text-[10px] text-muted-foreground">
          <button
            onClick={() => setPaletteOpen(true)}
            className="border border-border bg-raised px-2 py-1 text-[10px] hover:border-primary hover:text-primary"
          >
            ⌘K
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="hover:text-primary"
            title="Keyboard shortcuts"
          >
            ?
          </button>
          <Link to="/risk" className="hover:text-primary">
            /RISK
          </Link>
        </div>
      </header>
      <div className="h-7 shrink-0 overflow-hidden border-b border-divider bg-panel">
        <TapePin
          instruments={instruments}
          onPin={togglePin}
          onOpen={setFocusSym}
          onContext={openContextForSym}
          paused={replayT !== null}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left rail */}
        <aside
          data-tour="rail"
          className="flex w-16 shrink-0 flex-col overflow-y-auto border-r border-divider bg-panel py-2"
        >
          {COMMANDS.filter((c) => c.code !== "TOUR").map((c, i) => {
            const activeFn = fn === c.code;
            return (
              <button
                key={c.code}
                onClick={() => runCmd(c.code)}
                title={`${c.code} — ${c.description} · hotkey ${i + 1}`}
                className={`mono-caps relative border-l-2 px-1 py-3 text-center text-[10px] transition ${
                  activeFn
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-raised hover:text-foreground"
                }`}
              >
                {c.code}
                {i < 9 && (
                  <span className="absolute right-1 top-1 text-[7px] text-faint">{i + 1}</span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Center stage */}
        <main key={panelKey} className="relative flex-1 overflow-hidden p-2">
          <div className="grid h-full gap-2 animate-fade-in" style={{ animationDuration: "400ms" }}>
            {centerContent}
          </div>
          {maximized && (
            <div
              className="absolute inset-2 z-40 flex flex-col bg-background animate-fade-in"
              style={{ animationDuration: "300ms" }}
            >
              {renderMaximized(maximized, {
                active,
                inst,
                cmpInst,
                replayT,
                setFocusSym,
                setCompareTo,
                sightContext,
                onRestore: () => setMaximized(null),
              })}
            </div>
          )}
        </main>

        {/* Right rail */}
        <aside className="flex w-80 shrink-0 flex-col gap-2 border-l border-divider bg-background p-2 overflow-y-auto">
          <PnlRibbon
            instruments={instruments}
            onInspect={() => setBookOpen((v) => !v)}
            expanded={bookOpen}
          />
          {bookOpen && (
            <BookDrawer
              positions={demoPositions}
              instruments={instruments}
              onClose={() => setBookOpen(false)}
            />
          )}
          <div data-tour="watchlist" className="flex flex-col">
            <Panel code="WL" title="Watchlist">
              <Watchlist
                items={watch.map((s) => instruments[s]).filter(Boolean)}
                active={active}
                onSelect={setActive}
                onOpen={(s) => setFocusSym(s)}
                onRemove={(s) => setWatch((w) => w.filter((x) => x !== s))}
                onAdd={(s) => {
                  ensureSymbol(s);
                  setWatch((w) => (w.includes(s) ? w : [...w, s]));
                  setActive(s);
                }}
                onAlert={(s) => setAlertFor({ sym: s })}
                onContext={openContextForSym}
                triggeredSyms={triggeredSyms}
              />
            </Panel>
          </div>
          <Panel code="SEC" title="Sectors · GICS" live={false}>
            <SectorsStrip />
          </Panel>
          <Panel code="AL" title={`Alerts · ${alerts.length}`} live={false}>
            <div className="max-h-40 overflow-y-auto">
              <AlertsPanel
                alerts={alerts}
                onRemove={(id) => setAlerts((a) => a.filter((x) => x.id !== id))}
              />
            </div>
          </Panel>
          <Panel code="INTEL" title="Market intel">
            <IntelFeed
              onSymbolClick={(s) => {
                ensureSymbol(s);
                setActive(s);
                setFn("NEWS");
                setTriggeredSyms(new Set([s]));
                setTimeout(() => setTriggeredSyms(new Set()), 900);
              }}
              symbols={[active, ...watch]}
            />
          </Panel>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="mono-caps flex h-7 shrink-0 items-center justify-between gap-4 border-t border-divider bg-panel px-4 text-[10px] text-muted-foreground">
        <span className="whitespace-nowrap">
          CMD {cmdCount} · REFRESH 30S · ALERTS {alerts.length} · {market.source}{" "}
          {market.count ? `· ${market.count} SYMBOLS` : "· RETRYING"}
        </span>
        <div className="hidden min-w-0 flex-1 justify-center overflow-hidden md:flex">
          <HintTicker />
        </div>
        <div data-tour="preset" className="flex items-center gap-2">
          <span className="text-faint">WORKSPACE</span>
          {(["DESK", "QUANT", "RESEARCH"] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => openWorkspace(p)}
              aria-pressed={fn === "MK" && preset === p}
              title={`Open ${p.toLowerCase()} market workspace`}
              className={`interactive border px-1.5 py-0.5 transition ${
                fn === "MK" && preset === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPaletteOpen(true)}
            className="interactive border border-border px-1.5 py-0.5 hover:border-primary hover:text-primary"
            title="Command palette"
          >
            ⌘K COMMANDS
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="interactive border border-border px-1.5 py-0.5 hover:border-primary hover:text-primary"
            title="Keyboard shortcuts"
          >
            ? SHORTCUTS
          </button>
        </div>
      </footer>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onRun={runCmd} />
      <KeyboardOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <FocusMode
        instrument={focusSym ? instruments[focusSym] : null}
        onClose={() => setFocusSym(null)}
      />
      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      {alertFor && instruments[alertFor.sym] && (
        <AlertPopover
          instrument={instruments[alertFor.sym]}
          anchor={alertFor.anchor}
          onClose={() => setAlertFor(null)}
          onSet={(level, direction) => addAlert(alertFor.sym, level, direction)}
        />
      )}

      <SpotlightTour />
    </div>
  );
}

type CenterProps = {
  active: string;
  inst: Instrument;
  cmpInst: Instrument | null;
  instruments: Record<string, Instrument>;
  replayT: number | null;
  setReplayT: (t: number | null) => void;
  setFocusSym: (s: string | null) => void;
  setActive: (s: string) => void;
  onAddCompare: () => void;
  setCompareTo: (s: string | null) => void;
  onMaximize: (code: string | null) => void;
  isMaximized: boolean;
  groupASeed: number;
  groupBSeed: string;
  setFn: (f: string) => void;
  watch: string[];
  demoBookSyms: string[];
  onRun: (code: string, symbol?: string) => void;
  marketStatus: LiveMarketStatus;
  emCone: { symbol: string; pct: number } | null;
  setEmCone: (v: { symbol: string; pct: number } | null) => void;
  sightContext: SightDeskContext;
};

function renderCenter(fn: string, preset: Preset, p: CenterProps) {
  const {
    active,
    inst,
    cmpInst,
    instruments,
    replayT,
    setReplayT,
    setFocusSym,
    setActive,
    onAddCompare,
    onMaximize,
    groupASeed,
    groupBSeed,
    setFn,
    emCone,
    setEmCone,
    sightContext,
  } = p;
  const A = { group: "A" as const, flashSeed: groupASeed };
  const B = { group: "B" as const, flashSeed: groupBSeed.length };
  void B;
  const emPctForActive = emCone && emCone.symbol === active ? emCone.pct : null;
  const ocProps = {
    emOnChart: !!(emCone && emCone.symbol === active),
    onToggleEmOnChart: (on: boolean, pct: number) => setEmCone(on ? { symbol: active, pct } : null),
  };
  // Helper: jump chip shortcut
  const sightPanel = (
    <SightPanel
      context={sightContext}
      onCite={(symbol) => {
        setActive(symbol);
        setFn("MK");
      }}
    />
  );
  const jumpTo = (code: string, sym?: string) => () => {
    if (sym) setActive(sym);
    setFn(code);
  };

  if (fn === "HOME") {
    return (
      <Panel
        code="HOME"
        title="Market overview"
        subtitle={SUBTITLES.HOME(active)}
        source={p.marketStatus.connected ? p.marketStatus.source : "CONNECTING"}
        asOf={p.marketStatus.asOf ?? undefined}
        explainer={EXPLAINERS.HOME}
        onMaximize={() => onMaximize("HOME")}
        className="h-full"
      >
        <HomeOverview
          instruments={instruments}
          onOpenSymbol={(s) => setActive(s)}
          onRun={p.onRun}
          marketStatus={p.marketStatus}
        />
      </Panel>
    );
  }

  if (fn === "MK") {
    if (preset === "QUANT") {
      return (
        <GridStage2x2
          initial={{ colFrac: 0.6, rowFrac: 0.55 }}
          storageKey="finsight.quant.grid"
          slots={[
            <div key="a" data-tour="panel-toolbar" className="h-full">
              <Panel
                code={fn}
                title={`${active} · Price`}
                subtitle={SUBTITLES.MK(active)}
                source={inst.dataSource}
                explainer={EXPLAINERS[fn]}
                onMaximize={() => onMaximize("PRICE")}
                className="h-full"
                {...A}
              >
                <PriceChart
                  instrument={inst}
                  compareTo={cmpInst}
                  replayFrac={replayT}
                  onAddCompare={onAddCompare}
                  expectedMovePct={emPctForActive}
                />
              </Panel>
            </div>,
            <Panel
              key="b"
              code="VS"
              title={`${active} · Vol surface`}
              subtitle={SUBTITLES.VS(active)}
              source="SIM"
              explainer={EXPLAINERS.VS}
              onMaximize={() => onMaximize("VS")}
              className="h-full"
              {...A}
            >
              <VolatilitySurface symbol={active} spot={inst.price} />
            </Panel>,
            <Panel
              key="c"
              code="MC"
              title={`${active} · Monte Carlo`}
              subtitle={SUBTITLES.MC(active)}
              source="SIM"
              explainer={EXPLAINERS.MC}
              onMaximize={() => onMaximize("MC")}
              className="h-full"
              {...A}
            >
              <MonteCarloPanel spot={inst.price} symbol={active} />
            </Panel>,
            <Panel
              key="d"
              code="CX"
              title="Correlation"
              subtitle={SUBTITLES.CX(active)}
              explainer={EXPLAINERS.CX}
              onMaximize={() => onMaximize("CX")}
              className="h-full"
            >
              <CorrelationPanel
                symbols={TICKERS.slice(0, 8)}
                activeSymbol={active}
                onFocus={setFocusSym}
              />
            </Panel>,
          ]}
        />
      );
    }
    if (preset === "RESEARCH") {
      return (
        <div className="grid h-full grid-cols-[2fr_1fr] grid-rows-2 gap-2">
          <Panel
            code="SIGHT"
            title="AI research"
            subtitle={SUBTITLES.SIGHT(active)}
            explainer={EXPLAINERS.SIGHT}
            className="row-span-2"
            onMaximize={() => onMaximize("SIGHT")}
          >
            {sightPanel}
          </Panel>
          <Panel code="INTEL" title="Market intel">
            <IntelFeed
              symbols={[active, ...p.watch]}
              onSymbolClick={(symbol) => {
                setActive(symbol);
                setFn("NEWS");
              }}
            />
          </Panel>
          <Panel
            code={fn}
            title={`${active} · Price`}
            subtitle={SUBTITLES.MK(active)}
            source={inst.dataSource}
            explainer={EXPLAINERS[fn]}
            onMaximize={() => onMaximize("PRICE")}
            {...A}
          >
            <PriceChart
              instrument={inst}
              compareTo={cmpInst}
              replayFrac={replayT}
              onAddCompare={onAddCompare}
              expectedMovePct={emPctForActive}
            />
          </Panel>
        </div>
      );
    }
    return (
      <div className="grid h-full grid-rows-[1.4fr_auto_1fr] gap-2">
        <div className="grid grid-cols-[1fr_320px] gap-2">
          <Panel
            code={fn}
            title={`${active} · Price`}
            subtitle={SUBTITLES.MK(active)}
            source={inst.dataSource}
            explainer={EXPLAINERS[fn]}
            replayChip={replayT !== null}
            onMaximize={() => onMaximize("PRICE")}
            {...A}
          >
            <PriceChart
              instrument={inst}
              compareTo={cmpInst}
              replayFrac={replayT}
              onAddCompare={onAddCompare}
              expectedMovePct={emPctForActive}
            />
            <AiInsight
              source="DATA"
              lines={[
                `${active} ${fmtPct(inst.changePct)} from the previous close at ${fmt(inst.price)}; session range ${fmt(inst.sessionLow)}–${fmt(inst.sessionHigh)}.`,
                `${inst.dataSource} quote · ${inst.volume > 0 ? `${fmt(inst.volume, 0)} shares reported` : "volume unavailable"} · Level 2 depth not supplied.`,
              ]}
              jumps={[
                { label: `OC ${active}`, onClick: jumpTo("OC") },
                { label: `MC ${active}`, onClick: jumpTo("MC") },
              ]}
            />
          </Panel>
          <Panel
            code="LIQ"
            title="Quote & liquidity"
            subtitle={`${active} provider snapshot and explicit market-depth availability.`}
            source={inst.dataSource}
            explainer={EXPLAINERS.MK}
          >
            <DepthLadder instrument={inst} />
          </Panel>
        </div>
        <ReplayScrubber onReplay={setReplayT} />
        <Panel
          code="HEAT"
          title="Sector ETF performance"
          subtitle="Provider returns for liquid US sector and industry ETFs."
          source="FINNHUB · YFINANCE"
          explainer={EXPLAINERS.MK}
        >
          <SectorHeatmap />
        </Panel>
      </div>
    );
  }

  if (fn === "OC")
    return (
      <Panel
        code="OC"
        title={`${active} · Options chain`}
        subtitle={SUBTITLES.OC(active)}
        source="YFINANCE · MARKET"
        explainer={EXPLAINERS.OC}
        onMaximize={() => onMaximize("OC")}
        {...A}
      >
        <OptionsChain spot={inst.price} symbol={active} {...ocProps} />
        <AiInsight
          source="DATA"
          lines={[
            `${active} quotes, IV, volume and open interest come from Yahoo; max pain and OI walls are computed from that chain.`,
          ]}
          jumps={[{ label: "VS surface", onClick: jumpTo("VS") }]}
        />
      </Panel>
    );
  if (fn === "VS")
    return (
      <Panel
        code="VS"
        title={`Volatility surface · ${active}`}
        subtitle={SUBTITLES.VS(active)}
        source="SIM"
        explainer={EXPLAINERS.VS}
        onMaximize={() => onMaximize("VS")}
        {...A}
      >
        <VolatilitySurface symbol={active} spot={inst.price} />
        <AiInsight
          lines={INSIGHTS.VS}
          jumps={[
            { label: `OC strategy builder`, onClick: jumpTo("OC") },
            { label: `MC with this vol`, onClick: jumpTo("MC") },
          ]}
        />
      </Panel>
    );
  if (fn === "MC")
    return (
      <Panel
        code="MC"
        title={`${active} · Monte Carlo`}
        subtitle={SUBTITLES.MC(active)}
        source="SIM"
        explainer={EXPLAINERS.MC}
        onMaximize={() => onMaximize("MC")}
        {...A}
      >
        <MonteCarloPanel spot={inst.price} symbol={active} />
        <AiInsight
          lines={INSIGHTS.MC}
          jumps={[
            { label: `OC hedge`, onClick: jumpTo("OC") },
            { label: `RISK exposure`, onClick: () => setFn("RISK") },
          ]}
        />
      </Panel>
    );
  if (fn === "GR")
    return (
      <Panel
        code="GR"
        title={`${active} · Greeks surfaces`}
        subtitle={SUBTITLES.GR(active)}
        source="SIM"
        explainer={EXPLAINERS.GR}
        onMaximize={() => onMaximize("GR")}
        {...A}
      >
        <GreeksSurface symbol={active} spot={inst.price} />
        <AiInsight
          lines={INSIGHTS.GR}
          jumps={[
            { label: `OC unusual flow`, onClick: jumpTo("OC") },
            { label: `VS surface`, onClick: jumpTo("VS") },
          ]}
        />
      </Panel>
    );
  if (fn === "ML")
    return (
      <Panel
        code="ML"
        title={`${active} · ML research lab`}
        subtitle={SUBTITLES.ML(active)}
        source="API · YFINANCE"
        explainer={EXPLAINERS.ML}
        onMaximize={() => onMaximize("ML")}
        {...A}
      >
        <MLPanel symbol={active} book={p.demoBookSyms.length ? p.demoBookSyms : p.watch} />
      </Panel>
    );
  if (fn === "NEWS")
    return (
      <Panel
        code="NEWS"
        title={`${active} · News impact intelligence`}
        subtitle={SUBTITLES.NEWS(active)}
        source="YAHOO SEARCH · EVIDENCE MODEL"
        explainer={EXPLAINERS.NEWS}
        className="h-full"
      >
        <NewsImpactPanel symbol={active} />
      </Panel>
    );
  if (fn === "ALT")
    return (
      <Panel
        code="ALT"
        title={`${active} · Stock Intelligence`}
        subtitle={SUBTITLES.ALT(active)}
        source="FRED/ALFRED · UN COMTRADE"
        explainer={EXPLAINERS.ALT}
        onMaximize={() => onMaximize("ALT")}
      >
        <StockIntelligencePanel activeSymbol={active} />
      </Panel>
    );
  if (fn === "CX")
    return (
      <Panel
        code="CX"
        title="Correlation"
        subtitle={SUBTITLES.CX(active)}
        source="SIM"
        explainer={EXPLAINERS.CX}
        onMaximize={() => onMaximize("CX")}
      >
        <CorrelationPanel
          symbols={TICKERS.slice(0, 8)}
          activeSymbol={active}
          onFocus={setFocusSym}
        />
        <AiInsight
          lines={INSIGHTS.CX}
          jumps={[
            { label: `RISK exposure`, onClick: () => setFn("RISK") },
            { label: `ML regimes`, onClick: jumpTo("ML") },
          ]}
        />
      </Panel>
    );
  if (fn === "SIGHT")
    return (
      <Panel
        code="SIGHT"
        title="AI research"
        subtitle={SUBTITLES.SIGHT(active)}
        explainer={EXPLAINERS.SIGHT}
        onMaximize={() => onMaximize("SIGHT")}
      >
        {sightPanel}
      </Panel>
    );
  if (fn === "BT")
    return (
      <Panel
        code="BT"
        title={`${active} · Backtest`}
        subtitle={SUBTITLES.BT(active)}
        source="API + LOCAL · WALK-FWD"
        onMaximize={() => onMaximize("BT")}
        {...A}
      >
        <BTPanel activeSymbol={active} />
        <AiInsight
          lines={INSIGHTS.BT}
          jumps={[
            { label: `STRAT tune params`, onClick: jumpTo("STRAT") },
            { label: `ML regimes`, onClick: jumpTo("ML") },
          ]}
        />
      </Panel>
    );
  if (fn === "STRAT")
    return (
      <Panel
        code="STRAT"
        title="Strategy builder"
        subtitle={SUBTITLES.STRAT(active)}
        onMaximize={() => onMaximize("STRAT")}
      >
        <STRATPanel activeSymbol={active} onSendToBT={() => setFn("BT")} />
        <AiInsight lines={INSIGHTS.STRAT} jumps={[{ label: `Run in BT`, onClick: jumpTo("BT") }]} />
      </Panel>
    );
  if (fn === "RISK")
    return (
      <div className="flex h-full items-center justify-center">
        <Link
          to="/risk"
          className="mono-caps bg-primary px-6 py-3 text-xs text-primary-foreground hover:brightness-110"
        >
          Open /RISK desk →
        </Link>
      </div>
    );
  return null;
}

function renderMaximized(
  code: string,
  p: {
    active: string;
    inst: Instrument;
    cmpInst: Instrument | null;
    replayT: number | null;
    setFocusSym: (s: string | null) => void;
    setCompareTo: (s: string | null) => void;
    sightContext: SightDeskContext;
    onRestore: () => void;
  },
) {
  const { active, inst, cmpInst, replayT, setFocusSym, sightContext, onRestore } = p;
  const wrap = (
    node: React.ReactNode,
    title: string,
    codeLabel: string,
    explainer?: { what: string; why: string; how: string },
  ) => (
    <Panel
      code={codeLabel}
      title={title}
      explainer={explainer}
      isMaximized
      onMaximize={onRestore}
      className="h-full"
    >
      {node}
    </Panel>
  );
  switch (code) {
    case "PRICE":
      return wrap(
        <PriceChart instrument={inst} compareTo={cmpInst} replayFrac={replayT} />,
        `${active} · Price`,
        "PRICE",
        EXPLAINERS.HOME,
      );
    case "MC":
      return wrap(
        <MonteCarloPanel spot={inst.price} symbol={active} />,
        `${active} · Monte Carlo`,
        "MC",
        EXPLAINERS.MC,
      );
    case "VS":
      return wrap(
        <VolatilitySurface symbol={active} spot={inst.price} />,
        `${active} · Vol surface`,
        "VS",
        EXPLAINERS.VS,
      );
    case "CX":
      return wrap(
        <CorrelationPanel symbols={TICKERS.slice(0, 8)} onFocus={setFocusSym} />,
        "Correlation",
        "CX",
        EXPLAINERS.CX,
      );
    case "OC":
      return wrap(
        <OptionsChain spot={inst.price} symbol={active} />,
        `${active} · Options`,
        "OC",
        EXPLAINERS.OC,
      );
    case "ML":
      return wrap(
        <MLPanel symbol={active} book={["NVDA", "AAPL", "SPY"]} />,
        `${active} · ML research lab`,
        "ML",
        EXPLAINERS.ML,
      );
    case "ALT":
      return wrap(
        <StockIntelligencePanel activeSymbol={active} />,
        `${active} · Stock Intelligence`,
        "ALT",
        EXPLAINERS.ALT,
      );
    case "SIGHT":
      return wrap(
        <SightPanel context={{ ...sightContext, activePanel: "SIGHT" }} />,
        "AI research",
        "SIGHT",
        EXPLAINERS.SIGHT,
      );
    default:
      return null;
  }
}

function TapePin({
  instruments,
  onPin,
  onOpen,
  onContext,
  paused,
}: {
  instruments: Record<string, Instrument>;
  onPin: (s: string) => void;
  onOpen: (s: string) => void;
  onContext: (e: React.MouseEvent, s: string) => void;
  paused?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => TICKERS, []);
  return (
    <div ref={ref} className="group overflow-hidden">
      <div
        className="flex animate-marquee gap-4 py-2 group-hover:[animation-play-state:paused]"
        style={paused ? { animationPlayState: "paused" } : undefined}
      >
        {[...items, ...items].map((s, i) => {
          const inst = instruments[s];
          const up = inst.changePct >= 0;
          const size = Math.abs(inst.changePct);
          return (
            <button
              key={i}
              onClick={() => onPin(s)}
              onDoubleClick={() => onOpen(s)}
              onContextMenu={(e) => onContext(e, s)}
              className="mono-caps flex shrink-0 items-center gap-2 px-2 text-[10px] text-muted-foreground hover:text-primary"
              title={`Click to pin · double-click for dossier · right-click for menu`}
              style={
                size > 1.2
                  ? {
                      textShadow: `0 0 8px ${up ? "rgba(66,201,139,0.8)" : "rgba(240,100,100,0.8)"}`,
                    }
                  : undefined
              }
            >
              <span className="text-foreground">{s}</span>
              <span className={up ? "text-up" : "text-down"}>
                {up ? "▲" : "▼"} {Math.abs(inst.changePct).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
