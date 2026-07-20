import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TICKERS, type Instrument, fmt, fmtPct } from "@/lib/market";
import { MiniSparkline } from "./MiniSparkline";
import { subscribeDemoBook, type DemoPosition } from "@/lib/demoBook";
import { api, type NewsPayload, type TapeItem } from "@/lib/api";

const GICS = [
  { name: "Info Tech", symbol: "XLK" },
  { name: "Comms", symbol: "XLC" },
  { name: "Cons Discr", symbol: "XLY" },
  { name: "Cons Staples", symbol: "XLP" },
  { name: "Health Care", symbol: "XLV" },
  { name: "Financials", symbol: "XLF" },
  { name: "Industrials", symbol: "XLI" },
  { name: "Energy", symbol: "XLE" },
  { name: "Utilities", symbol: "XLU" },
  { name: "Real Estate", symbol: "XLRE" },
  { name: "Materials", symbol: "XLB" },
] as const;
const CROSS_ASSETS = [
  { label: "ES", symbol: "ES=F", yield: false },
  { label: "NQ", symbol: "NQ=F", yield: false },
  { label: "2Y", symbol: "2YY=F", yield: true },
  { label: "10Y", symbol: "^TNX", yield: true },
  { label: "DXY", symbol: "DX-Y.NYB", yield: false },
  { label: "WTI", symbol: "CL=F", yield: false },
  { label: "GOLD", symbol: "GC=F", yield: false },
  { label: "BTC", symbol: "BTC-USD", yield: false },
] as const;
const COMPANY_ALIASES: Record<string, string[]> = {
  AAPL: ["AAPL", "APPLE", "IPHONE"],
  MSFT: ["MSFT", "MICROSOFT", "AZURE"],
  NVDA: ["NVDA", "NVIDIA"],
  TSLA: ["TSLA", "TESLA"],
  AMZN: ["AMZN", "AMAZON"],
  META: ["META", "META PLATFORMS", "FACEBOOK", "INSTAGRAM", "WHATSAPP"],
  GOOGL: ["GOOGL", "GOOGLE", "ALPHABET"],
  SPY: ["SPY", "S&P 500"],
  QQQ: ["QQQ", "NASDAQ 100"],
  IWM: ["IWM", "RUSSELL 2000"],
  "BTC-USD": ["BITCOIN", "BTC"],
};
const CATALYST_WORDS =
  /\b(earnings|revenue|guidance|forecast|margin|downgrade|upgrade|target|launch|recall|probe|investigation|deal|acquisition|antitrust|approval|orders?|deliveries|sales|outlook|buyback|dividend)\b/i;
const SECTOR_SYMBOLS = GICS.map((sector) => sector.symbol);
const CROSS_SYMBOLS = CROSS_ASSETS.map((asset) => asset.symbol);
type TapePayload = { items: TapeItem[]; live: boolean };
type DriverLabel = "LIKELY DRIVER" | "CO-MENTIONED" | "NO VERIFIED DRIVER";
type Driver = { headline: string; label: DriverLabel; score: number };
type RegimePayload = {
  current: {
    current_regime?: string | number | null;
    current_regime_probability?: string | number | null;
    current_regime_duration?: string | number | null;
    current_regime_risk_level?: string | number | null;
    latest_date?: string | number | null;
  };
};

function pickDriver(payload: NewsPayload | undefined, symbol: string): Driver {
  const aliases = COMPANY_ALIASES[symbol] ?? [symbol];
  const candidates = [...(payload?.items ?? []), ...(payload?.headlines ?? [])]
    .map((item) => (typeof item.title === "string" ? item.title.trim() : ""))
    .filter(Boolean);
  let best: Driver | null = null;
  for (const headline of candidates) {
    const upper = headline.toUpperCase();
    const mention = aliases.some((alias) => upper.includes(alias.toUpperCase()));
    const score =
      (upper.includes(symbol) ? 4 : mention ? 3 : 0) + (CATALYST_WORDS.test(headline) ? 2 : 0);
    const label: DriverLabel =
      score >= 5 ? "LIKELY DRIVER" : mention ? "CO-MENTIONED" : "NO VERIFIED DRIVER";
    if (!best || score > best.score) best = { headline, label, score };
  }
  return best && best.label !== "NO VERIFIED DRIVER"
    ? best
    : {
        headline: "No company-specific catalyst verified in the provider feed.",
        label: "NO VERIFIED DRIVER",
        score: 0,
      };
}

function nowLine(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${date} · ${time} ET · New York market time`;
}

type SetupChip = { label: string; code: string; sym?: string };

export function HomeOverview({
  instruments,
  onOpenSymbol,
  onRun,
  marketStatus,
}: {
  instruments: Record<string, Instrument>;
  onOpenSymbol: (sym: string) => void;
  onRun?: (code: string, sym?: string) => void;
  marketStatus?: {
    connected: boolean;
    source: "FINNHUB" | "EOD" | "UNAVAILABLE";
    asOf: string | null;
  };
}) {
  const list = TICKERS.map((s) => instruments[s]).filter(Boolean);
  const spy = instruments["SPY"];
  const sectorTape = useQuery({
    queryKey: ["sector-tape", SECTOR_SYMBOLS],
    queryFn: () =>
      api<TapePayload>(`/tape?symbols=${encodeURIComponent(SECTOR_SYMBOLS.join(","))}`),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const crossTape = useQuery({
    queryKey: ["cross-asset-tape", CROSS_SYMBOLS],
    queryFn: () => api<TapePayload>("/tape?symbols=" + encodeURIComponent(CROSS_SYMBOLS.join(","))),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const regime = useQuery({
    queryKey: ["home-regime", "SPY"],
    queryFn: () => api<RegimePayload>("/regime/SPY?model=hmm&n_states=4"),
    staleTime: 30 * 60_000,
    retry: 0,
  });
  const vixTape = useQuery({
    queryKey: ["vix-tape"],
    queryFn: () => api<TapePayload>("/tape?symbols=%5EVIX"),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const vix = vixTape.data?.items[0];

  const [positions, setPositions] = useState<DemoPosition[]>([]);
  useEffect(() => subscribeDemoBook(setPositions), []);

  const bookAgg = useMemo(() => {
    let notional = 0,
      gross = 0,
      prev = 0,
      pnl = 0,
      betaDollar = 0;
    const sigmas: number[] = [];
    for (const p of positions) {
      const inst = instruments[p.symbol];
      if (!inst || inst.dataSource === "UNAVAILABLE") continue;
      const marketValue = inst.price * p.qty;
      notional += marketValue;
      gross += Math.abs(marketValue);
      prev += inst.prevClose * p.qty;
      pnl += (inst.price - inst.prevClose) * p.qty;
      betaDollar += marketValue * inst.beta;
      sigmas.push((inst.annualVol / Math.sqrt(252)) * Math.abs(marketValue));
    }
    const pct = prev !== 0 ? (pnl / Math.abs(prev)) * 100 : 0;
    let variance = 0;
    for (let i = 0; i < sigmas.length; i += 1) {
      for (let j = 0; j < sigmas.length; j += 1) {
        variance += sigmas[i] * sigmas[j] * (i === j ? 1 : 0.35);
      }
    }
    const dailySigma = Math.sqrt(Math.max(0, variance));
    const beta = gross ? betaDollar / gross : 0;
    const stress = -0.05 * betaDollar;
    return {
      notional,
      gross,
      pnl,
      pct,
      beta,
      var95: dailySigma * 1.645,
      cvar95: dailySigma * 2.063,
      stress,
      stressPct: gross ? (stress / gross) * 100 : 0,
    };
  }, [positions, instruments]);

  const topMovers = useMemo(
    () =>
      [...list]
        .filter((inst) => inst.dataSource !== "UNAVAILABLE")
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, 3),
    [list],
  );
  const moverSymbols = topMovers.map((inst) => inst.symbol);
  const moverNews = useQuery({
    queryKey: ["home-mover-news", moverSymbols],
    queryFn: () => Promise.all(moverSymbols.map((symbol) => api<NewsPayload>(`/news/${symbol}`))),
    enabled: moverSymbols.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const movers = useMemo(
    () =>
      topMovers.map((inst, index) => ({
        inst,
        driver: pickDriver(moverNews.data?.[index], inst.symbol),
      })),
    [moverNews.data, topMovers],
  );

  const sectorReturns = useMemo(
    () =>
      GICS.flatMap((sector) => {
        const item = sectorTape.data?.items.find((quote) => quote.ticker === sector.symbol);
        if (!item || !Number.isFinite(item.change_pct)) return [];
        return [{ name: sector.name, symbol: sector.symbol, ret: item.change_pct * 100 }];
      }).sort((a, b) => b.ret - a.ret),
    [sectorTape.data],
  );

  const sectorInternals = useMemo(() => {
    const values = sectorReturns.map((sector) => sector.ret);
    const up = values.filter((value) => value >= 0).length;
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length
      ? values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
      : 0;
    return {
      up,
      down: values.length - up,
      positivePct: values.length ? (up / values.length) * 100 : 0,
      mean,
      dispersion: Math.sqrt(variance),
    };
  }, [sectorReturns]);

  const crossQuotes = crossTape.data?.items ?? [];
  const twoYear = crossQuotes.find((item) => item.ticker === "2YY=F");
  const tenYear = crossQuotes.find((item) => item.ticker === "^TNX");
  const curveBps = twoYear && tenYear ? (tenYear.last - twoYear.last) * 100 : null;

  const [dateLine, setDateLine] = useState("");
  useEffect(() => {
    setDateLine(nowLine());
  }, []);

  // A deterministic summary derived only from provider quotes, news, and the local demo book.
  const briefFull = useMemo(() => {
    const spyPct = spy?.changePct ?? 0;
    const dir = spyPct >= 0.1 ? "is firm" : spyPct <= -0.1 ? "is heavy" : "is two-way";
    const outlier = movers[0]?.inst;
    const outlierTxt = outlier
      ? movers[0].driver.label === "LIKELY DRIVER"
        ? ` ${outlier.symbol} ${fmtPct(outlier.changePct)} leads; provider coverage flags a likely company driver.`
        : ` ${outlier.symbol} ${fmtPct(outlier.changePct)} leads, but no company-specific driver is verified.`
      : "";
    const bookTxt = positions.length
      ? ` Your demo book is ${bookAgg.pct >= 0 ? "up" : "down"} ${Math.abs(bookAgg.pct).toFixed(2)}% on ${positions.length} positions.`
      : " The demo book is empty.";
    const sectorTxt = sectorReturns[0]
      ? ` ${sectorReturns[0].name} leads sectors at ${fmtPct(sectorReturns[0].ret)}.`
      : "";
    return `SPY ${fmtPct(spyPct)} — the tape ${dir}.${outlierTxt}.${bookTxt}${sectorTxt}`;
  }, [spy, movers, positions.length, bookAgg.pct, sectorReturns]);

  const [brief, setBrief] = useState("");
  useEffect(() => {
    let i = 0;
    setBrief("");
    const id = setInterval(() => {
      i++;
      setBrief(briefFull.slice(0, i));
      if (i >= briefFull.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
  }, [briefFull]);

  // Navigation chips derived only from live quote values.
  const setups: SetupChip[] = useMemo(() => {
    const out: SetupChip[] = [];
    if (movers[0])
      out.push({
        label: `${movers[0].inst.symbol} ${fmtPct(movers[0].inst.changePct)} → inspect real quote`,
        code: "MK",
        sym: movers[0].inst.symbol,
      });
    if (sectorReturns[0])
      out.push({
        label: `${sectorReturns[0].name} leads via ${sectorReturns[0].symbol} → cross-asset`,
        code: "CX",
        sym: sectorReturns[0].symbol,
      });
    if (vix)
      out.push({
        label: `VIX ${fmt(vix.last)} · ${fmtPct(vix.change_pct * 100)} → risk`,
        code: "RISK",
      });
    if (positions.length === 0)
      out.push({ label: `Empty book — inspect the demo → click P&L ribbon`, code: "" });
    return out.slice(0, 3);
  }, [movers, sectorReturns, vix, positions.length]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1480px] flex-col gap-3 overflow-y-auto px-4 py-3">
      {/* Date line */}
      <div className="flex items-center justify-between gap-4 border border-divider bg-panel px-3 py-2">
        <div className="font-serif text-[14px] italic text-muted-foreground">{dateLine}</div>
        <div className="mono-caps flex items-center gap-2 text-[9px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${marketStatus?.source === "FINNHUB" ? "bg-up animate-pulse-live" : "bg-primary"}`}
          />
          <span className="text-foreground">
            {marketStatus?.connected
              ? marketStatus.source === "FINNHUB"
                ? "US CASH · LIVE"
                : "US CASH · CLOSED / EOD"
              : "PROVIDER HANDSHAKE"}
          </span>
          {marketStatus?.asOf && <span className="text-faint">LAST PRINT {marketStatus.asOf}</span>}
        </div>
        <RegimeBadge
          data={regime.data}
          loading={regime.isLoading}
          onRetry={() => regime.refetch()}
        />
      </div>
      <CrossAssetStrip quotes={crossQuotes} curveBps={curveBps} />

      {/* Brief */}
      <div className="border-l-2 border-primary/50 pl-4">
        <div className="mono-caps mb-1 flex items-center gap-2 text-[10px] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-live" />
          MARKET BRIEF · DATA-DERIVED
        </div>
        <div className="font-serif text-[19px] leading-[1.35] text-foreground">
          {brief}
          {brief.length < briefFull.length && (
            <span className="inline-block h-5 w-2 bg-primary/70 align-middle animate-pulse-live" />
          )}
        </div>
        <div className="mono-caps mt-2 border-t border-divider pt-2 text-[8px] text-faint">
          SO WHAT ·{" "}
          {vix && vix.change_pct * 100 > Math.abs(spy?.changePct ?? 0) * 4
            ? "VOL BID IS OUTRUNNING THE INDEX MOVE · WATCH HEDGING FLOWS"
            : "CONFIRM DIRECTION WITH BREADTH, RATES AND DOLLAR BEFORE ADDING RISK"}
        </div>
      </div>

      {/* Three instruments */}
      <div className="grid grid-cols-3 gap-6 border-y border-divider py-5">
        <InstrumentCell
          label="SPY"
          sublabel="S&P 500"
          inst={spy}
          onOpen={() => spy && onOpenSymbol("SPY")}
        />
        <VixCell quote={vix} />
        <BookCell
          notional={bookAgg.notional}
          pnl={bookAgg.pnl}
          pct={bookAgg.pct}
          count={positions.length}
        />
      </div>

      {/* What moved */}
      <div>
        <div className="mono-caps mb-1 flex items-center justify-between text-[9px]">
          <span className="text-primary">WHAT MOVED</span>
          <span className="text-faint">ATTRIBUTION CONFIDENCE IS EXPLICIT</span>
        </div>
        <div className="divide-y divide-divider/60">
          {movers.map(({ inst, driver }) => {
            const up = inst.changePct >= 0;
            const driverTone =
              driver.label === "LIKELY DRIVER"
                ? "border-up/40 text-up"
                : driver.label === "CO-MENTIONED"
                  ? "border-primary/40 text-primary"
                  : "border-border text-faint";
            return (
              <button
                key={inst.symbol}
                onClick={() => onOpenSymbol(inst.symbol)}
                className="group grid w-full grid-cols-[58px_70px_118px_1fr] items-center gap-3 px-1 py-2 text-left transition hover:bg-raised"
              >
                <span className="mono-caps w-16 shrink-0 border border-border bg-panel px-2 py-1 text-center text-[10px] text-primary group-hover:border-primary">
                  {inst.symbol}
                </span>
                <span
                  className={`mono-caps w-16 shrink-0 text-right font-mono text-[12px] tabular-nums ${up ? "text-up" : "text-down"}`}
                >
                  {up ? "▲" : "▼"} {fmtPct(inst.changePct)}
                </span>
                <span
                  className={`mono-caps border px-1.5 py-1 text-center text-[7px] ${driverTone}`}
                >
                  {driver.label}
                </span>
                <span className="truncate font-serif text-[13px] leading-snug text-foreground">
                  {driver.headline}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Today's setup */}
      <div>
        <div className="mono-caps mb-2 text-[10px] text-primary">TODAY'S SETUP</div>
        <div className="flex flex-wrap gap-2">
          {setups.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                if (s.sym) onOpenSymbol(s.sym);
                if (s.code && onRun) onRun(s.code, s.sym);
              }}
              className="mono-caps interactive group flex items-center gap-2 border border-border bg-panel px-3 py-2 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <span className="text-primary/70 group-hover:text-primary">▸</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <MarketInternals stats={sectorInternals} ready={sectorReturns.length > 0} />
          <EventHorizon />
          <RiskLens book={bookAgg} count={positions.length} />
        </div>
      </div>

      {/* Sector pulse — compact bottom strip */}
      <div className="hidden">
        <div className="mono-caps mb-2 flex items-center justify-between text-[9px] text-faint">
          <span>SECTOR PULSE</span>
          <span>
            {sectorReturns.length
              ? `${sectorReturns[0].name} ${fmtPct(sectorReturns[0].ret)} · ${sectorReturns[sectorReturns.length - 1].name} ${fmtPct(sectorReturns[sectorReturns.length - 1].ret)}`
              : sectorTape.isPending
                ? "LOADING ETF QUOTES…"
                : "SECTOR DATA UNAVAILABLE"}
          </span>
        </div>
        <div className="flex items-stretch gap-0.5">
          {sectorReturns.map((s) => {
            const abs = Math.abs(s.ret);
            const w = Math.max(2, abs * 22);
            const up = s.ret >= 0;
            return (
              <div
                key={s.name}
                className="group relative flex-1"
                title={`${s.name} · ${fmtPct(s.ret)}`}
              >
                <div className="h-6 border border-divider/40 bg-background overflow-hidden">
                  <div
                    className={`h-full ${up ? "bg-up/60" : "bg-down/60"}`}
                    style={{
                      width: `${Math.min(100, w * 2)}%`,
                      transition: "width 500ms cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <div className="mono-caps mt-1 truncate text-center text-[8.5px] text-faint group-hover:text-foreground">
                  {s.name.slice(0, 4)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InstrumentCell({
  label,
  sublabel,
  inst,
  onOpen,
}: {
  label: string;
  sublabel: string;
  inst?: Instrument;
  onOpen: () => void;
}) {
  const up = (inst?.changePct ?? 0) >= 0;
  return (
    <button onClick={onOpen} className="text-left group">
      <div className="mono-caps text-[10px] text-primary">
        {label} <span className="text-faint">· {sublabel}</span>
      </div>
      <div className="mt-1 font-mono text-[28px] tabular-nums text-foreground group-hover:text-primary transition">
        {inst ? fmt(inst.price) : "—"}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className={`mono-caps text-[11px] tabular-nums ${up ? "text-up" : "text-down"}`}>
          {up ? "▲" : "▼"} {inst ? fmtPct(inst.changePct) : "—"}
        </span>
        {inst && (
          <MiniSparkline
            history={inst.history.slice(-48)}
            up={up}
            width={80}
            height={22}
            color={up ? "#42C98B" : "#F06464"}
          />
        )}
      </div>
    </button>
  );
}

function VixCell({ quote }: { quote?: TapeItem }) {
  const changePct = (quote?.change_pct ?? 0) * 100;
  const up = changePct >= 0;
  return (
    <div className="text-left">
      <div className="mono-caps text-[10px] text-primary">
        VIX <span className="text-faint">· {quote?.source ?? "PENDING"}</span>
      </div>
      <div className="mt-1 font-mono text-[28px] tabular-nums text-foreground">
        {quote ? fmt(quote.last) : "—"}
      </div>
      <div className="mono-caps mt-1 text-[11px] tabular-nums">
        <span className={up ? "text-down" : "text-up"}>
          {quote ? `${up ? "▲" : "▼"} ${fmtPct(changePct)}` : "QUOTE PENDING"}
        </span>
      </div>
    </div>
  );
}

function BookCell({
  notional,
  pnl,
  pct,
  count,
}: {
  notional: number;
  pnl: number;
  pct: number;
  count: number;
}) {
  const up = pnl >= 0;
  if (count === 0) {
    return (
      <div className="text-left">
        <div className="mono-caps text-[10px] text-primary">
          YOUR BOOK <span className="text-faint">· demo</span>
        </div>
        <div className="mt-1 font-mono text-[28px] tabular-nums text-muted-foreground">—</div>
        <div className="mono-caps mt-1 text-[10px] text-faint">
          click P&amp;L ribbon → RESET DEMO
        </div>
      </div>
    );
  }
  return (
    <div className="text-left">
      <div className="mono-caps text-[10px] text-primary">
        YOUR BOOK <span className="text-faint">· {count} positions</span>
      </div>
      <div className={`mt-1 font-mono text-[28px] tabular-nums ${up ? "text-up" : "text-down"}`}>
        {up ? "+" : "−"}${fmt(Math.abs(pnl), 0)}
      </div>
      <div className="mono-caps mt-1 text-[11px] tabular-nums">
        <span className={up ? "text-up" : "text-down"}>
          {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
        </span>
        <span className="ml-2 text-faint">${fmt(Math.abs(notional) / 1000, 0)}k notional</span>
      </div>
    </div>
  );
}

function CrossAssetStrip({ quotes, curveBps }: { quotes: TapeItem[]; curveBps: number | null }) {
  return (
    <div className="grid grid-cols-3 border border-divider bg-panel lg:grid-cols-9">
      {CROSS_ASSETS.map((asset) => {
        const quote = quotes.find((item) => item.ticker === asset.symbol);
        const change = (quote?.change_pct ?? 0) * 100;
        const up = change >= 0;
        const value = quote
          ? asset.yield
            ? quote.last.toFixed(3) + "%"
            : Math.abs(quote.last) >= 10_000
              ? fmt(quote.last, 0)
              : fmt(quote.last)
          : "PENDING";
        return (
          <div key={asset.symbol} className="border-l border-divider px-2.5 py-2 first:border-l-0">
            <div className="mono-caps flex items-center justify-between text-[8px] text-faint">
              <span>{asset.label}</span>
              {quote && <span className={up ? "text-up" : "text-down"}>{up ? "▲" : "▼"}</span>}
            </div>
            <div className="mt-1 font-mono text-[12px] tabular-nums text-foreground">{value}</div>
            <div
              className={[
                "mono-caps mt-0.5 text-[7px] tabular-nums",
                quote ? (up ? "text-up" : "text-down") : "text-faint",
              ].join(" ")}
            >
              {quote ? fmtPct(change) : "PROVIDER"}
            </div>
          </div>
        );
      })}
      <div className="border-l border-divider px-2.5 py-2">
        <div className="mono-caps text-[8px] text-faint">2S10S</div>
        <div className="mt-1 font-mono text-[12px] tabular-nums text-foreground">
          {curveBps == null ? "PENDING" : (curveBps >= 0 ? "+" : "") + curveBps.toFixed(0) + " BP"}
        </div>
        <div className="mono-caps mt-0.5 text-[7px] text-faint">YIELD CURVE</div>
      </div>
    </div>
  );
}

function RegimeBadge({
  data,
  loading,
  onRetry,
}: {
  data?: RegimePayload;
  loading: boolean;
  onRetry: () => unknown;
}) {
  if (loading) {
    return (
      <span className="mono-caps flex items-center gap-2 border border-primary/30 bg-primary/5 px-2 py-1 text-[8px] text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-live" />
        REGIME · FITTING HMM
      </span>
    );
  }
  if (!data) {
    return (
      <button
        onClick={onRetry}
        className="mono-caps border border-border px-2 py-1 text-[8px] text-faint hover:border-primary hover:text-primary"
      >
        REGIME · RETRY FIT
      </button>
    );
  }
  const raw = String(data.current.current_regime ?? "").toUpperCase();
  const label = /BEAR|HIGH.VOL|RISK.OFF|STRESS/.test(raw)
    ? "RISK-OFF"
    : /BULL|LOW.VOL|RISK.ON|EXPANSION/.test(raw)
      ? "RISK-ON"
      : raw || "STATE PENDING";
  const parsedProbability = Number(data.current.current_regime_probability);
  const probability = Number.isFinite(parsedProbability)
    ? (parsedProbability * 100).toFixed(0) + "% CONF"
    : "CONF PENDING";
  const parsedDuration = Number(data.current.current_regime_duration);
  const duration = Number.isFinite(parsedDuration)
    ? parsedDuration.toFixed(0) + "D"
    : "DURATION PENDING";
  const riskOff = label === "RISK-OFF";
  return (
    <span
      className={[
        "mono-caps border px-2 py-1 text-[8px]",
        riskOff ? "border-down/50 text-down" : "border-up/40 text-up",
      ].join(" ")}
    >
      REGIME: {label} · {probability} · {duration}
    </span>
  );
}

function MarketInternals({
  stats,
  ready,
}: {
  stats: { up: number; down: number; positivePct: number; mean: number; dispersion: number };
  ready: boolean;
}) {
  return (
    <section className="border border-divider bg-panel">
      <div className="mono-caps border-b border-divider px-3 py-2 text-[8px] text-primary">
        SECTOR INTERNALS · GICS ETF PROXY
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-divider">
        <TinyMetric label="UP / DOWN" value={ready ? stats.up + " / " + stats.down : "PENDING"} />
        <TinyMetric
          label="ABOVE FLAT"
          value={ready ? stats.positivePct.toFixed(0) + "%" : "PENDING"}
        />
        <TinyMetric label="AVG MOVE" value={ready ? fmtPct(stats.mean) : "PENDING"} />
        <TinyMetric
          label="DISPERSION"
          value={ready ? stats.dispersion.toFixed(2) + "σ" : "PENDING"}
        />
      </div>
    </section>
  );
}

function EventHorizon() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  const events = [
    {
      when: Date.parse("2026-07-29T14:00:00-04:00"),
      label: "FOMC DECISION",
      time: "2:00 PM ET",
      source: "FED",
      url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    },
    {
      when: Date.parse("2026-08-12T08:30:00-04:00"),
      label: "US CPI · JUL",
      time: "8:30 AM ET",
      source: "BLS",
      url: "https://www.bls.gov/schedule/news_release/cpi.htm",
    },
    {
      when: Date.parse("2026-08-21T16:00:00-04:00"),
      label: "US MONTHLY OPEX",
      time: "4:00 PM ET",
      source: "CALC",
      url: "https://www.cboe.com/tradable_products/sp_500/spx_options/specifications/",
    },
    {
      when: Date.parse("2026-09-11T08:30:00-04:00"),
      label: "US CPI · AUG",
      time: "8:30 AM ET",
      source: "BLS",
      url: "https://www.bls.gov/schedule/news_release/cpi.htm",
    },
    {
      when: Date.parse("2026-09-16T14:00:00-04:00"),
      label: "FOMC + SEP",
      time: "2:00 PM ET",
      source: "FED",
      url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    },
  ]
    .filter((event) => now == null || event.when > now)
    .slice(0, 3);
  return (
    <section className="border border-divider bg-panel">
      <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-2 text-[8px]">
        <span className="text-primary">EVENT HORIZON</span>
        <span className="text-faint">OFFICIAL SCHEDULES</span>
      </div>
      <div className="divide-y divide-divider">
        {events.map((event) => {
          const days = now == null ? "—" : Math.ceil((event.when - now) / 86_400_000) + "D";
          const date = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            month: "short",
            day: "2-digit",
          })
            .format(new Date(event.when))
            .toUpperCase();
          return (
            <a
              key={event.label}
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="interactive grid grid-cols-[38px_1fr_auto] items-center gap-2 px-3 py-1.5"
            >
              <span className="font-mono text-[10px] tabular-nums text-primary">{days}</span>
              <span>
                <span className="mono-caps block text-[8px] text-foreground">{event.label}</span>
                <span className="mono-caps text-[7px] text-faint">
                  {date} · {event.time}
                </span>
              </span>
              <span className="mono-caps border border-border px-1 text-[7px] text-faint">
                {event.source}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function RiskLens({
  book,
  count,
}: {
  book: {
    gross: number;
    beta: number;
    var95: number;
    cvar95: number;
    stress: number;
    stressPct: number;
  };
  count: number;
}) {
  if (!count) {
    return (
      <section className="border border-divider bg-panel p-3">
        <div className="mono-caps text-[8px] text-primary">BOOK RISK · INERT</div>
        <div className="mt-2 font-mono text-[14px] text-muted-foreground">NO POSITIONS</div>
        <div className="mono-caps mt-1 text-[7px] leading-relaxed text-faint">
          ADD POSITIONS VIA THE P&L RIBBON TO ACTIVATE VAR, CVAR, BETA AND STRESS.
        </div>
      </section>
    );
  }
  return (
    <section className="border border-divider bg-panel">
      <div className="mono-caps border-b border-divider px-3 py-2 text-[8px] text-primary">
        BOOK RISK · 1D PARAMETRIC
      </div>
      <div className="grid grid-cols-3 divide-x divide-divider">
        <TinyMetric label="VAR 95" value={"-$" + fmt(book.var95, 0)} />
        <TinyMetric label="CVAR 95" value={"-$" + fmt(book.cvar95, 0)} />
        <TinyMetric label="BOOK BETA" value={book.beta.toFixed(2)} />
      </div>
      <div className="mono-caps flex items-center justify-between border-t border-divider px-3 py-2 text-[8px] text-faint">
        <span>IF SPY -5%</span>
        <span className={book.stress < 0 ? "text-down" : "text-up"}>
          BOOK {book.stress < 0 ? "-" : "+"}
          {"$"}
          {fmt(Math.abs(book.stress), 0)} · {fmtPct(book.stressPct)}
        </span>
      </div>
    </section>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2 text-center">
      <div className="mono-caps text-[7px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-[10px] tabular-nums text-foreground">{value}</div>
    </div>
  );
}
