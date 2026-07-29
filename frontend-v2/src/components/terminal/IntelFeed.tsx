import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type NewsPayload } from "@/lib/api";
import { type Headline } from "@/lib/market";

const CHIP: Record<Headline["sentiment"], { symbol: string; color: string }> = {
  pos: { symbol: "▲", color: "text-up" },
  neg: { symbol: "▼", color: "text-down" },
  neu: { symbol: "◆", color: "text-faint" },
};

type NewsRecord = {
  title?: unknown;
  published?: unknown;
  score?: unknown;
  label?: unknown;
  url?: unknown;
  related_tickers?: unknown;
  proxy?: unknown;
  topic?: unknown;
  region?: unknown;
  channel?: unknown;
};

type GlobalNewsPayload = NewsPayload & {
  coverage?: {
    topics_requested?: number;
    topics_with_news?: number;
    regions_with_news?: number;
    headlines?: number;
  };
};

const DEFAULT_NEWS_SYMBOLS = ["SPY", "NVDA", "AAPL", "RELIANCE.NS"];

type IntelHeadline = Headline & {
  verified: boolean;
  scope: "GLOBAL" | "COMPANY";
  region: string;
  channel: string;
  url: string;
  publishedAt: number;
};

type FeedScope = "ALL" | "GLOBAL" | "COMPANY";

function sentimentOf(item: NewsRecord): Headline["sentiment"] {
  const label = String(item.label ?? "").toLowerCase();
  if (label.includes("positive")) return "pos";
  if (label.includes("negative")) return "neg";
  const score = typeof item.score === "number" ? item.score : Number(item.score);
  return score > 0.08 ? "pos" : score < -0.08 ? "neg" : "neu";
}

function publishedAt(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  const parsed = Date.parse(String(value).replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function publishedTime(value: unknown): string {
  const timestamp = publishedAt(value);
  if (!timestamp) return "LATEST";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function IntelFeed({
  onSymbolClick,
  symbols = DEFAULT_NEWS_SYMBOLS,
}: {
  onSymbolClick?: (sym: string) => void;
  symbols?: string[];
}) {
  const [scope, setScope] = useState<FeedScope>("ALL");
  const symbolKey = Array.from(new Set(symbols.map((value) => value.toUpperCase())))
    .slice(0, 6)
    .join(",");
  const newsSymbols = symbolKey.split(",").filter(Boolean);

  const companyNews = useQuery({
    queryKey: ["terminal-company-news", symbolKey],
    queryFn: () =>
      Promise.all(
        newsSymbols.map((symbol) =>
          api<NewsPayload>(`/news/${encodeURIComponent(symbol)}?limit=10`).catch(() => ({
            ticker: symbol,
            items: [],
          })),
        ),
      ),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const globalNews = useQuery({
    queryKey: ["terminal-global-news"],
    queryFn: () => api<GlobalNewsPayload>("/news/global/cues?limit=48"),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const items = useMemo<IntelHeadline[]>(() => {
    const companyItems = (companyNews.data ?? []).flatMap((payload, payloadIndex) => {
      const sym = payload.ticker || newsSymbols[payloadIndex] || "MARKET";
      const records = (payload.items ?? payload.headlines ?? []) as NewsRecord[];
      return records.map((item, itemIndex) => {
        const text = typeof item.title === "string" ? item.title : "";
        const timestamp = publishedAt(item.published);
        const related = Array.isArray(item.related_tickers)
          ? item.related_tickers.map(String).map((value) => value.toUpperCase())
          : [];
        return {
          id: String(item.url ?? `${sym}-${itemIndex}-${text}`),
          time: publishedTime(item.published),
          text,
          sym,
          verified: related.includes(sym) || related.includes(sym.split(".", 1)[0]),
          sentiment: sentimentOf(item),
          scope: "COMPANY" as const,
          region: "COMPANY",
          channel: "CATALYST",
          url: String(item.url ?? ""),
          publishedAt: timestamp,
        };
      });
    });

    const globalItems = ((globalNews.data?.items ?? []) as NewsRecord[]).map((item, index) => {
      const text = typeof item.title === "string" ? item.title : "";
      const timestamp = publishedAt(item.published);
      return {
        id: String(item.url ?? `global-${index}-${text}`),
        time: publishedTime(item.published),
        text,
        sym: String(item.proxy ?? "GLOBAL"),
        verified: true,
        sentiment: sentimentOf(item),
        scope: "GLOBAL" as const,
        region: String(item.region ?? "GLOBAL"),
        channel: String(item.channel ?? item.topic ?? "CROSS-ASSET"),
        url: String(item.url ?? ""),
        publishedAt: timestamp,
      };
    });

    const seen = new Set<string>();
    return [...globalItems, ...companyItems]
      .filter((item) => {
        const key = item.text.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 48);
  }, [companyNews.data, globalNews.data?.items, newsSymbols]);

  const counts = useMemo(
    () => ({
      global: items.filter((item) => item.scope === "GLOBAL").length,
      company: items.filter((item) => item.scope === "COMPANY").length,
    }),
    [items],
  );
  const visibleItems = scope === "ALL" ? items : items.filter((item) => item.scope === scope);

  if (companyNews.isPending && globalNews.isPending)
    return <div className="mono-caps p-3 text-[10px] text-faint">BUILDING GLOBAL NEWS MAP…</div>;
  if (companyNews.isError && globalNews.isError)
    return <div className="mono-caps p-3 text-[10px] text-down">NEWS FEED UNAVAILABLE</div>;
  if (!items.length)
    return <div className="mono-caps p-3 text-[10px] text-faint">NO RECENT PROVIDER HEADLINES</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-divider bg-panel p-2">
        <div className="mono-caps mb-2 flex items-center justify-between text-[7px] text-faint">
          <span>
            GLOBAL COVERAGE · {globalNews.data?.coverage?.regions_with_news ?? 0} REGIONS ·{" "}
            {globalNews.data?.coverage?.topics_with_news ?? 0}/
            {globalNews.data?.coverage?.topics_requested ?? 10} CHANNELS
          </span>
          <span>{items.length} HEADLINES</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["ALL", `ALL ${items.length}`],
              ["GLOBAL", `GLOBAL ${counts.global}`],
              ["COMPANY", `COMPANY ${counts.company}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`mono-caps border px-1.5 py-1 text-[7px] transition ${
                scope === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-faint hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleItems.map((headline, index) => (
          <IntelHeadlineRow
            key={headline.id}
            headline={headline}
            first={index === 0}
            onSymbolClick={onSymbolClick}
          />
        ))}
      </div>
    </div>
  );
}

function IntelHeadlineRow({
  headline,
  first,
  onSymbolClick,
}: {
  headline: IntelHeadline;
  first: boolean;
  onSymbolClick?: (sym: string) => void;
}) {
  const chip = CHIP[headline.sentiment];
  const className = `block w-full border-b border-divider px-3 py-2 text-left transition hover:bg-raised ${
    first ? "animate-fade-in bg-primary/5" : ""
  }`;
  const body = (
    <>
      <div className="mono-caps flex items-center gap-2 text-[8px] text-faint">
        <span className={chip.color}>{chip.symbol}</span>
        <span>{headline.time}</span>
        <span className={headline.scope === "GLOBAL" ? "text-info" : "text-primary"}>
          {headline.scope === "GLOBAL" ? headline.region : headline.sym}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span
          className={`mono-caps border px-1 py-0.5 text-[6px] ${
            headline.scope === "GLOBAL"
              ? "border-info/35 text-info"
              : headline.verified
                ? "border-up/35 text-up"
                : "border-primary/35 text-primary"
          }`}
        >
          {headline.scope === "GLOBAL" ? "GLOBAL CUE" : headline.verified ? "TAGGED" : "UNVERIFIED"}
        </span>
        <span className="mono-caps truncate text-[6px] text-faint">{headline.channel}</span>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-foreground">{headline.text}</div>
    </>
  );

  if (headline.scope === "GLOBAL" && headline.url) {
    return (
      <a href={headline.url} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={() => onSymbolClick?.(headline.sym)} className={className}>
      {body}
    </button>
  );
}
