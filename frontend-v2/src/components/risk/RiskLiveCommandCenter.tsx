import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { api, type TapeItem } from "@/lib/api";
import { COMMODITY_QUOTES, updateBookMarks, type Book } from "@/lib/book";

type TapePayload = { items: TapeItem[]; live: boolean };
type NewsRecord = {
  title?: unknown;
  published?: unknown;
  score?: unknown;
  label?: unknown;
  proxy?: unknown;
  region?: unknown;
  channel?: unknown;
  url?: unknown;
};
type NewsPayload = {
  items?: NewsRecord[];
  coverage?: {
    topics_requested?: number;
    topics_with_news?: number;
    regions_with_news?: number;
    headlines?: number;
  };
};

const BASE_MARKET_SYMBOLS = [
  "SPY",
  "QQQ",
  "IWM",
  "^VIX",
  "^TNX",
  "DX-Y.NYB",
  "BTC-USD",
  "^NSEI",
  "GC=F",
  "CL=F",
  "NG=F",
  "HG=F",
  "SI=F",
  "ZW=F",
];

const COMMODITY_META: Record<string, { label: string; code: string; transmission: string }> = {
  "GC=F": { label: "Gold", code: "GC", transmission: "REAL YIELDS · HAVEN" },
  "CL=F": { label: "WTI Crude", code: "CL", transmission: "INFLATION · MARGINS" },
  "NG=F": { label: "Natural Gas", code: "NG", transmission: "POWER · CHEMICALS" },
  "HG=F": { label: "Copper", code: "HG", transmission: "CHINA · INDUSTRIAL" },
  "SI=F": { label: "Silver", code: "SI", transmission: "SOLAR · HAVEN" },
  "ZW=F": { label: "Wheat", code: "ZW", transmission: "FOOD · EM FX" },
};

const COMMODITY_BOOK_SYMBOL = Object.fromEntries(
  Object.entries(COMMODITY_QUOTES).map(([bookSymbol, quoteSymbol]) => [quoteSymbol, bookSymbol]),
) as Record<string, string>;

function pct(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function compact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 2,
  }).format(value);
}

function timestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) return "LATEST";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function newsTone(item: NewsRecord) {
  const label = String(item.label ?? "").toLowerCase();
  const score = Number(item.score ?? 0);
  if (label.includes("positive") || score > 0.08) return "UP" as const;
  if (label.includes("negative") || score < -0.08) return "DOWN" as const;
  return "NEUTRAL" as const;
}

function itemMap(items: TapeItem[]) {
  return new Map(items.map((item) => [item.ticker, item]));
}

function regimeOf(items: TapeItem[]) {
  const map = itemMap(items);
  const spy = map.get("SPY")?.change_pct ?? 0;
  const qqq = map.get("QQQ")?.change_pct ?? 0;
  const vix = map.get("^VIX");
  const vixLevel = vix?.last ?? 0;
  const vixMove = vix?.change_pct ?? 0;
  const breadth =
    [spy, qqq, map.get("IWM")?.change_pct ?? 0].reduce((sum, value) => sum + value, 0) / 3;
  if (vixLevel >= 28 || (breadth < -0.012 && vixMove > 0.07)) {
    return {
      label: "DEFENSIVE",
      tone: "down",
      confidence: 88,
      note: "Volatility and breadth signal active deleveraging.",
    } as const;
  }
  if (breadth > 0.008 && vixMove < 0) {
    return {
      label: "RISK-ON",
      tone: "up",
      confidence: 74,
      note: "Broad participation with volatility compression.",
    } as const;
  }
  if (Math.abs(qqq - spy) > 0.007) {
    return {
      label: "DISPERSION",
      tone: "primary",
      confidence: 71,
      note: "Factor leadership is separating from the broad tape.",
    } as const;
  }
  return {
    label: "TRANSITION",
    tone: "info",
    confidence: 62,
    note: "Signals disagree; optionality is more valuable than conviction.",
  } as const;
}

function strategyDeck(items: TapeItem[], book: Book) {
  const map = itemMap(items);
  const spy = map.get("SPY")?.change_pct ?? 0;
  const qqq = map.get("QQQ")?.change_pct ?? 0;
  const vix = map.get("^VIX");
  const oil = map.get("CL=F")?.change_pct ?? 0;
  const gold = map.get("GC=F")?.change_pct ?? 0;
  const india = map.get("^NSEI")?.change_pct ?? 0;
  const largest = [...book.positions].sort((a, b) => b.gross - a.gross)[0];

  return [
    {
      code: "TAIL",
      title: vix && vix.last > 24 ? "Put-spread collar" : "Conditional tail budget",
      trigger: vix ? `VIX ${compact(vix.last)} · ${pct(vix.change_pct)}` : "VIX SOURCE PENDING",
      thesis:
        vix && vix.last > 24
          ? "Elevated volatility favors defined-spread protection over naked premium spend."
          : "Keep convex protection conditional until volatility or breadth confirms stress.",
      action: largest
        ? `Size against ${largest.symbol} concentration`
        : "No portfolio trade · monitor only",
      tone: "down" as const,
      score: Math.min(96, 58 + Math.abs(vix?.change_pct ?? 0) * 260),
    },
    {
      code: "DSP",
      title: "Factor dispersion pair",
      trigger: `QQQ − SPY ${pct(qqq - spy)}`,
      thesis:
        "Trade relative factor leadership with matched beta instead of taking another market-direction bet.",
      action:
        Math.abs(qqq - spy) > 0.006
          ? "Research long leader / short laggard"
          : "Wait for >60bp separation",
      tone: "primary" as const,
      score: Math.min(94, 52 + Math.abs(qqq - spy) * 3_800),
    },
    {
      code: "CMD",
      title:
        oil > 0.015
          ? "Energy shock spread"
          : gold > 0.01
            ? "Haven confirmation"
            : "Commodity convexity watch",
      trigger: `WTI ${pct(oil)} · GOLD ${pct(gold)}`,
      thesis:
        "Separate inflation-sensitive commodity momentum from broad equity beta and USD effects.",
      action:
        Math.abs(oil) > 0.015 || Math.abs(gold) > 0.012
          ? "Open cross-asset scenario lab"
          : "No confirmed commodity break",
      tone: "up" as const,
      score: Math.min(92, 48 + Math.max(Math.abs(oil), Math.abs(gold)) * 2_300),
    },
    {
      code: "IND",
      title: "India oil–INR relay",
      trigger: `NIFTY ${pct(india)} · WTI ${pct(oil)}`,
      thesis:
        "India equity risk can amplify when oil strength combines with local equity weakness and currency pressure.",
      action:
        oil > 0.015 && india < 0 ? "Review India beta and energy importers" : "Relay inactive",
      tone: "info" as const,
      score: Math.min(90, 45 + Math.abs(india - oil) * 1_900),
    },
  ].sort((a, b) => b.score - a.score);
}

export function RiskLiveCommandCenter({ book }: { book: Book }) {
  const marketSymbols = useMemo(
    () =>
      Array.from(
        new Set([
          ...BASE_MARKET_SYMBOLS,
          ...book.positions.map((position) => COMMODITY_QUOTES[position.symbol] ?? position.symbol),
        ]),
      ),
    [book.positions],
  );
  const symbolKey = marketSymbols.join(",");
  const tape = useQuery({
    queryKey: ["risk-live-tape", symbolKey],
    queryFn: () => api<TapePayload>(`/tape?symbols=${encodeURIComponent(symbolKey)}`),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
  const news = useQuery({
    queryKey: ["risk-live-news"],
    queryFn: () => api<NewsPayload>("/news/global/cues?limit=48"),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const items = useMemo(() => tape.data?.items ?? [], [tape.data?.items]);
  useEffect(() => {
    const heldSymbols = new Set(book.positions.map((position) => position.symbol));
    const marks: Record<string, number> = {};
    for (const item of items) {
      const bookSymbol = COMMODITY_BOOK_SYMBOL[item.ticker] ?? item.ticker;
      if (heldSymbols.has(bookSymbol)) marks[bookSymbol] = item.last;
    }
    if (Object.keys(marks).length) updateBookMarks(marks);
  }, [book.positions, items]);
  const markets = useMemo(() => itemMap(items), [items]);
  const regime = useMemo(() => regimeOf(items), [items]);
  const strategies = useMemo(() => strategyDeck(items, book), [items, book]);
  const catalysts = (news.data?.items ?? []).slice(0, 14);
  const commodities = Object.keys(COMMODITY_META)
    .map((symbol) => markets.get(symbol))
    .filter((item): item is TapeItem => Boolean(item));
  const empty = book.positions.length === 0;
  const liveCount = items.filter((item) => item.live).length;

  return (
    <div className="risk-live-shell relative space-y-3 overflow-hidden">
      <div className="risk-aurora pointer-events-none absolute inset-x-0 top-0 h-[620px]" />

      <section className="risk-command-hero relative overflow-hidden border border-primary/35 bg-panel">
        <div className="risk-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="risk-scan-beam pointer-events-none absolute inset-y-0 w-40" />
        <div className="relative grid min-h-[310px] xl:grid-cols-[1.12fr_.88fr]">
          <div className="flex flex-col justify-between border-b border-divider p-5 xl:border-b-0 xl:border-r">
            <div>
              <div className="mono-caps flex flex-wrap items-center gap-2 text-[8px]">
                <span className="border border-primary/50 bg-primary/10 px-2 py-1 text-primary">
                  RISK OS · LIVE
                </span>
                <span className="border border-info/40 bg-info/5 px-2 py-1 text-info">
                  {tape.data?.live ? `${liveCount} STREAMING` : "EOD VERIFIED"}
                </span>
                <span className="text-faint">30S MARKET REFRESH · 5M CATALYST REFRESH</span>
              </div>
              <div className="mt-5 max-w-3xl">
                <div className="mono-caps text-[9px] text-faint">CURRENT CROSS-ASSET STATE</div>
                <div
                  className={`risk-title mt-2 font-mono text-4xl tracking-[-0.06em] sm:text-6xl ${toneText(regime.tone)}`}
                >
                  {regime.label}
                </div>
                <div className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {regime.note} The command layer separates portfolio truth from market
                  intelligence, so an empty account never inherits fabricated risk.
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-px bg-divider sm:grid-cols-4">
              <HeroMetric
                label="BOOK STATE"
                value={empty ? "EMPTY" : `${book.positions.length} POS`}
                detail={empty ? "$0 EXPOSURE" : `$${compact(book.gross)} GROSS`}
                tone={empty ? "info" : "primary"}
              />
              <HeroMetric
                label="DATA NODES"
                value={`${items.length}/${marketSymbols.length}`}
                detail={tape.isFetching ? "REFRESHING" : "CONNECTED"}
                tone="up"
              />
              <HeroMetric
                label="CATALYSTS"
                value={String(catalysts.length)}
                detail={`${news.data?.coverage?.regions_with_news ?? 0} REGIONS`}
                tone="primary"
              />
              <HeroMetric
                label="REGIME CONF."
                value={`${regime.confidence}%`}
                detail="RULE-TRACEABLE"
                tone={regime.tone}
              />
            </div>
          </div>

          <TransmissionRadar items={items} regime={regime.label} />
        </div>
      </section>

      {empty && (
        <section className="risk-rise relative overflow-hidden border border-info/45 bg-info/[.045] p-5">
          <div className="absolute inset-y-0 left-0 w-1 bg-info risk-edge-pulse" />
          <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="mono-caps text-[8px] text-info">PORTFOLIO TRUTH · ZERO POSITIONS</div>
              <div className="mt-2 font-serif text-2xl text-foreground">
                Your risk is zero because your paper book is empty.
              </div>
              <div className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
                The old screen silently injected a $10M sample book, five commodity futures, and two
                options. That fallback is removed. Add only the positions you actually want modeled;
                market intelligence remains active without changing your exposure.
              </div>
            </div>
            <Link
              to="/terminal"
              className="mono-caps interactive border border-info bg-info px-5 py-3 text-[9px] text-background shadow-[0_0_32px_rgba(69,185,211,.16)] hover:brightness-110"
            >
              OPEN PAPER BOOK · ADD POSITIONS →
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-3 2xl:grid-cols-[1.18fr_.82fr]">
        <section className="panel overflow-hidden">
          <CommandHeader
            code="CMD"
            title="Commodity complex"
            detail="LIVE / EOD · TRANSMISSION CHANNELS"
            pulse
          />
          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(COMMODITY_META).map(([symbol, meta], index) => (
              <CommodityCell key={symbol} item={markets.get(symbol)} meta={meta} index={index} />
            ))}
          </div>
          <div className="mono-caps flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-raised/30 px-3 py-2 text-[7px] text-faint">
            <span>GOLD · OIL · GAS · COPPER · SILVER · WHEAT</span>
            <span>{commodities.length}/6 SOURCES RESPONDING</span>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <CommandHeader
            code="ACT"
            title="Catalyst firehose"
            detail={`${news.data?.coverage?.topics_with_news ?? 0}/${news.data?.coverage?.topics_requested ?? 10} CHANNELS`}
            pulse={news.isFetching}
          />
          <div className="max-h-[380px] overflow-y-auto">
            {news.isLoading && <LoadingRows label="PULLING GLOBAL CATALYSTS" />}
            {!news.isLoading && !catalysts.length && (
              <EmptySource label="NO VERIFIED HEADLINES RETURNED" />
            )}
            {catalysts.map((item, index) => (
              <CatalystRow key={`${String(item.url)}-${index}`} item={item} index={index} />
            ))}
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <CommandHeader
          code="STR"
          title="Strategy swarm"
          detail="EVIDENCE-LABELLED · PAPER RESEARCH ONLY"
          pulse
        />
        <div className="grid md:grid-cols-2 2xl:grid-cols-4">
          {strategies.map((strategy, index) => (
            <StrategyCard key={strategy.code} strategy={strategy} index={index} />
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <CommandHeader
          code="XAS"
          title="Cross-asset pulse"
          detail={`${items.length} ACTIVE NODES`}
          pulse={tape.isFetching}
        />
        <div className="risk-tape overflow-hidden">
          <div className="risk-tape-track flex min-w-max">
            {[...items, ...items].map((item, index) => (
              <div
                key={`${item.ticker}-${index}`}
                className="flex min-w-44 items-center justify-between gap-3 border-r border-divider px-4 py-3"
              >
                <div>
                  <div className="mono-caps text-[8px] text-foreground">{item.ticker}</div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {compact(item.last)}
                  </div>
                </div>
                <div
                  className={`font-mono text-[10px] ${item.change_pct >= 0 ? "text-up" : "text-down"}`}
                >
                  {pct(item.change_pct)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes risk-aurora { 0%,100%{transform:translate3d(-8%,0,0) scale(1);opacity:.42} 50%{transform:translate3d(12%,4%,0) scale(1.12);opacity:.72} }
        @keyframes risk-scan { from{transform:translateX(-180px)} to{transform:translateX(calc(100vw + 180px))} }
        @keyframes risk-flow { to{stroke-dashoffset:-80} }
        @keyframes risk-orbit { to{transform:rotate(360deg)} }
        @keyframes risk-node { 0%,100%{opacity:.45;r:4} 50%{opacity:1;r:6} }
        @keyframes risk-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes risk-edge { 0%,100%{opacity:.35;box-shadow:0 0 0 rgba(69,185,211,0)} 50%{opacity:1;box-shadow:0 0 24px rgba(69,185,211,.8)} }
        @keyframes risk-tape { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .risk-aurora{background:radial-gradient(circle at 28% 18%,rgba(240,169,41,.16),transparent 34%),radial-gradient(circle at 72% 28%,rgba(69,185,211,.14),transparent 32%),radial-gradient(circle at 52% 62%,rgba(66,201,139,.08),transparent 34%);filter:blur(18px);animation:risk-aurora 12s ease-in-out infinite alternate}
        .risk-grid{background-image:linear-gradient(rgba(240,169,41,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(240,169,41,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,black,transparent)}
        .risk-scan-beam{background:linear-gradient(90deg,transparent,rgba(69,185,211,.06),transparent);animation:risk-scan 8s linear infinite}
        .risk-flow-path{stroke-dasharray:5 9;animation:risk-flow 4s linear infinite}
        .risk-orbit{transform-origin:50% 50%;animation:risk-orbit 18s linear infinite}
        .risk-node{animation:risk-node 2.4s ease-in-out infinite}
        .risk-rise{animation:risk-rise .7s cubic-bezier(.16,1,.3,1) both}
        .risk-edge-pulse{animation:risk-edge 2s ease-in-out infinite}
        .risk-tape-track{animation:risk-tape 46s linear infinite}
        .risk-tape:hover .risk-tape-track{animation-play-state:paused}
      `}</style>
    </div>
  );
}

function TransmissionRadar({ items, regime }: { items: TapeItem[]; regime: string }) {
  const map = itemMap(items);
  const nodes = [
    { symbol: "SPY", x: 92, y: 78, color: "#F0A929" },
    { symbol: "^VIX", x: 235, y: 50, color: "#F06464" },
    { symbol: "CL=F", x: 306, y: 142, color: "#42C98B" },
    { symbol: "GC=F", x: 238, y: 242, color: "#F0A929" },
    { symbol: "^NSEI", x: 92, y: 228, color: "#45B9D3" },
  ];
  return (
    <div className="relative flex min-h-[310px] items-center justify-center overflow-hidden p-4">
      <div className="absolute left-4 top-4 mono-caps text-[7px] text-faint">
        TRANSMISSION RADAR · NORMALIZED LINKS
      </div>
      <svg
        viewBox="0 0 400 300"
        className="h-full min-h-[270px] w-full max-w-[520px]"
        aria-label="Cross-asset transmission radar"
      >
        <defs>
          <radialGradient id="riskCore">
            <stop offset="0" stopColor="#F0A929" stopOpacity=".42" />
            <stop offset="1" stopColor="#F0A929" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g opacity=".35" fill="none" stroke="#252A2F">
          <circle cx="200" cy="150" r="45" />
          <circle cx="200" cy="150" r="90" />
          <circle cx="200" cy="150" r="132" />
          <path d="M20 150H380M200 12V288" />
        </g>
        <g className="risk-orbit" fill="none" stroke="#45B9D3" opacity=".18">
          <ellipse cx="200" cy="150" rx="146" ry="72" strokeDasharray="4 12" />
        </g>
        {nodes.map((node) => (
          <g key={node.symbol}>
            <path
              className="risk-flow-path"
              d={`M200 150 Q${(200 + node.x) / 2 + 18} ${(150 + node.y) / 2 - 18} ${node.x} ${node.y}`}
              fill="none"
              stroke={node.color}
              strokeOpacity=".58"
            />
            <circle className="risk-node" cx={node.x} cy={node.y} r="4" fill={node.color} />
            <text
              x={node.x}
              y={node.y - 12}
              textAnchor="middle"
              fill="#E7EAEC"
              fontSize="8"
              fontFamily="monospace"
            >
              {node.symbol}
            </text>
            <text
              x={node.x}
              y={node.y + 18}
              textAnchor="middle"
              fill={(map.get(node.symbol)?.change_pct ?? 0) >= 0 ? "#42C98B" : "#F06464"}
              fontSize="7"
              fontFamily="monospace"
            >
              {pct(map.get(node.symbol)?.change_pct, 1)}
            </text>
          </g>
        ))}
        <circle cx="200" cy="150" r="55" fill="url(#riskCore)" />
        <circle cx="200" cy="150" r="25" fill="#0A0C0E" stroke="#F0A929" strokeWidth="1.5" />
        <text
          x="200"
          y="148"
          textAnchor="middle"
          fill="#F0A929"
          fontSize="8"
          fontFamily="monospace"
        >
          REGIME
        </text>
        <text
          x="200"
          y="161"
          textAnchor="middle"
          fill="#E7EAEC"
          fontSize="8"
          fontFamily="monospace"
        >
          {regime}
        </text>
      </svg>
      <div className="absolute bottom-4 right-4 mono-caps text-[6px] text-faint">
        FLOW DIRECTION IS HEURISTIC · NOT CAUSAL PROOF
      </div>
    </div>
  );
}

function CommodityCell({
  item,
  meta,
  index,
}: {
  item?: TapeItem;
  meta: { label: string; code: string; transmission: string };
  index: number;
}) {
  const range =
    item && item.high != null && item.low != null && item.high > item.low
      ? ((item.last - item.low) / (item.high - item.low)) * 100
      : 50;
  return (
    <div
      className="risk-rise relative min-h-36 overflow-hidden border-b border-r border-divider p-4"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div
        className={`absolute inset-x-0 top-0 h-px ${item && item.change_pct >= 0 ? "bg-up/60" : "bg-down/60"}`}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="mono-caps text-[8px] text-primary">
            {meta.code} · {meta.label}
          </div>
          <div className="mt-1 mono-caps text-[6px] text-faint">{meta.transmission}</div>
        </div>
        <span className={`mono-caps text-[7px] ${item?.live ? "text-up" : "text-faint"}`}>
          {item?.live ? "LIVE" : item ? "EOD" : "WAIT"}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="font-mono text-2xl text-foreground">{compact(item?.last)}</span>
        <span
          className={`font-mono text-[11px] ${(item?.change_pct ?? 0) >= 0 ? "text-up" : "text-down"}`}
        >
          {pct(item?.change_pct)}
        </span>
      </div>
      <div className="mt-4 h-1 bg-background">
        <div
          className={`h-full ${(item?.change_pct ?? 0) >= 0 ? "bg-up" : "bg-down"}`}
          style={{
            width: `${Math.max(2, Math.min(100, range))}%`,
            transition: "width 800ms cubic-bezier(.16,1,.3,1)",
          }}
        />
      </div>
      <div className="mono-caps mt-1 flex justify-between text-[6px] text-faint">
        <span>L {compact(item?.low)}</span>
        <span>SESSION RANGE</span>
        <span>H {compact(item?.high)}</span>
      </div>
    </div>
  );
}

function CatalystRow({ item, index }: { item: NewsRecord; index: number }) {
  const tone = newsTone(item);
  const url = String(item.url ?? "");
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${tone === "UP" ? "bg-up" : tone === "DOWN" ? "bg-down" : "bg-faint"}`}
        />
        <span className="mono-caps text-[7px] text-faint">{timestamp(item.published)}</span>
        <span className="mono-caps text-[7px] text-info">{String(item.region ?? "GLOBAL")}</span>
        <span className="mono-caps ml-auto text-[6px] text-faint">
          {String(item.channel ?? "CROSS-ASSET")}
        </span>
      </div>
      <div className="mt-1.5 text-[10px] leading-relaxed text-foreground">
        {String(item.title ?? "Untitled catalyst")}
      </div>
    </>
  );
  const className =
    "risk-rise block w-full border-b border-divider px-3 py-2.5 text-left transition hover:bg-raised";
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      {body}
    </a>
  ) : (
    <div className={className} style={{ animationDelay: `${index * 45}ms` }}>
      {body}
    </div>
  );
}

function StrategyCard({
  strategy,
  index,
}: {
  strategy: ReturnType<typeof strategyDeck>[number];
  index: number;
}) {
  return (
    <article
      className="risk-rise group relative min-h-64 overflow-hidden border-b border-r border-divider p-4 transition hover:bg-raised/70"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div
        className={`absolute inset-x-0 top-0 h-0.5 ${strategy.tone === "down" ? "bg-down" : strategy.tone === "up" ? "bg-up" : strategy.tone === "info" ? "bg-info" : "bg-primary"}`}
      />
      <div className="flex items-center justify-between">
        <span className="mono-caps border border-border px-2 py-1 text-[7px] text-primary">
          {strategy.code}
        </span>
        <span className="font-mono text-[10px] text-foreground">
          {strategy.score.toFixed(0)}
          <span className="text-faint">/100</span>
        </span>
      </div>
      <div className="mt-4 font-serif text-xl text-foreground">{strategy.title}</div>
      <div className="mono-caps mt-2 text-[7px] text-info">TRIGGER · {strategy.trigger}</div>
      <div className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
        {strategy.thesis}
      </div>
      <div className="absolute inset-x-4 bottom-4 border-l border-primary/60 bg-primary/[.035] px-3 py-2">
        <div className="mono-caps text-[6px] text-faint">NEXT RESEARCH ACTION</div>
        <div className="mt-1 text-[9px] text-foreground">{strategy.action}</div>
      </div>
    </article>
  );
}

function CommandHeader({
  code,
  title,
  detail,
  pulse,
}: {
  code: string;
  title: string;
  detail: string;
  pulse?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-divider px-3 py-2">
      <div className="mono-caps flex items-center gap-2 text-[8px]">
        <span className="text-primary">{code}</span>
        <span className="text-foreground">{title}</span>
        {pulse && <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-live" />}
      </div>
      <span className="mono-caps text-right text-[6px] text-faint">{detail}</span>
    </header>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="bg-panel/90 p-3">
      <div className="mono-caps text-[6px] text-faint">{label}</div>
      <div className={`mt-2 font-mono text-lg ${toneText(tone)}`}>{value}</div>
      <div className="mono-caps mt-1 text-[6px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function toneText(tone: string) {
  return tone === "down"
    ? "text-down"
    : tone === "up"
      ? "text-up"
      : tone === "info"
        ? "text-info"
        : "text-primary";
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden p-5">
      <div className="scanline-overlay" />
      <div className="mono-caps text-[8px] text-info">{label}…</div>
    </div>
  );
}

function EmptySource({ label }: { label: string }) {
  return <div className="mono-caps p-5 text-[8px] text-faint">{label}</div>;
}
