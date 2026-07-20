import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
};
const DEFAULT_NEWS_SYMBOLS = ["SPY", "NVDA", "AAPL", "RELIANCE.NS"];
type IntelHeadline = Headline & { verified: boolean };

function sentimentOf(item: NewsRecord): Headline["sentiment"] {
  const label = String(item.label ?? "").toLowerCase();
  if (label.includes("positive")) return "pos";
  if (label.includes("negative")) return "neg";
  const score = typeof item.score === "number" ? item.score : Number(item.score);
  return score > 0.08 ? "pos" : score < -0.08 ? "neg" : "neu";
}

function publishedTime(value: unknown): string {
  if (value == null) return "LATEST";
  const raw = typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(raw as string | number);
  if (Number.isNaN(date.getTime())) return "LATEST";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
export function IntelFeed({
  onSymbolClick,
  symbols = DEFAULT_NEWS_SYMBOLS,
}: {
  onSymbolClick?: (sym: string) => void;
  symbols?: string[];
}) {
  const symbolKey = Array.from(new Set(symbols.map((value) => value.toUpperCase())))
    .slice(0, 4)
    .join(",");
  const newsSymbols = symbolKey.split(",").filter(Boolean);
  const news = useQuery({
    queryKey: ["terminal-news", symbolKey],
    queryFn: () => Promise.all(newsSymbols.map((symbol) => api<NewsPayload>(`/news/${symbol}`))),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  const items = useMemo<IntelHeadline[]>(() => {
    return (news.data ?? [])
      .flatMap((payload, payloadIndex) => {
        const sym = payload.ticker || symbolKey.split(",")[payloadIndex];
        const records = (payload.items ?? payload.headlines ?? []) as NewsRecord[];
        return records.map((item, itemIndex) => {
          const text = typeof item.title === "string" ? item.title : "";
          return {
            id: String(item.url ?? `${sym}-${itemIndex}-${text}`),
            time: publishedTime(item.published),
            text,
            sym,
            verified:
              Array.isArray(item.related_tickers) &&
              item.related_tickers
                .map(String)
                .map((value) => value.toUpperCase())
                .includes(sym),
            sentiment: sentimentOf(item),
          };
        });
      })
      .filter((item) => item.text.length > 0)
      .slice(0, 20);
  }, [news.data, symbolKey]);

  if (news.isPending)
    return <div className="mono-caps p-3 text-[10px] text-faint">LOADING REAL NEWS…</div>;
  if (news.isError)
    return <div className="mono-caps p-3 text-[10px] text-down">NEWS FEED UNAVAILABLE</div>;
  if (!items.length)
    return <div className="mono-caps p-3 text-[10px] text-faint">NO RECENT PROVIDER HEADLINES</div>;
  return (
    <div className="h-full overflow-y-auto">
      {items.map((h, i) => {
        const chip = CHIP[h.sentiment];
        return (
          <button
            key={h.id}
            onClick={() => onSymbolClick?.(h.sym)}
            className={`block w-full border-b border-divider px-3 py-2 text-left transition hover:bg-raised ${
              i === 0 ? "animate-fade-in bg-primary/5" : ""
            }`}
          >
            <div className="mono-caps flex items-center gap-2 text-[9px] text-faint">
              <span className={`${chip.color}`}>{chip.symbol}</span>
              <span>{h.time}</span>
              <span className="text-primary">{h.sym}</span>
            </div>
            <span className={h.verified ? "text-up" : "text-primary"}>
              {h.verified ? "TAGGED" : "UNVERIFIED"}
            </span>
            <div className="mt-1 text-[11px] leading-snug text-foreground">{h.text}</div>
          </button>
        );
      })}
    </div>
  );
}
