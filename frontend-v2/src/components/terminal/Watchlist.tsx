import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt, fmtPct } from "@/lib/market";
import { MiniSparkline } from "./MiniSparkline";
import { TICKERS } from "@/lib/market";
import { api } from "@/lib/api";
import { Bell } from "lucide-react";

type SymbolSearchItem = {
  symbol: string;
  name: string;
  exchange: string;
  market: "US" | "INDIA";
  type: string;
};

type SymbolSearchPayload = {
  items: SymbolSearchItem[];
  coverage: string;
};

function formatVol(v: number) {
  if (!Number.isFinite(v) || v <= 0) return "--";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "k";
  return String(Math.round(v));
}

function DeltaCell({ up, changePct }: { up: boolean; changePct: number }) {
  const prev = useRef(changePct);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (changePct !== prev.current) {
      setFlash(changePct > prev.current ? "up" : "down");
      prev.current = changePct;
      const id = setTimeout(() => setFlash(null), 380);
      return () => clearTimeout(id);
    }
  }, [changePct]);
  const cls =
    flash === "up" ? "animate-flash-cell-up" : flash === "down" ? "animate-flash-cell-down" : "";
  return (
    <span
      className={`inline-block text-right font-mono text-[10px] tabular-nums px-1 ${up ? "text-up" : "text-down"} ${cls}`}
    >
      {up ? "▲" : "▼"} {fmtPct(changePct)}
    </span>
  );
}

export function Watchlist({
  items,
  onSelect,
  onOpen,
  active,
  onRemove,
  onAdd,
  onAlert,
  onContext,
  triggeredSyms = new Set<string>(),
}: {
  items: Instrument[];
  onSelect: (sym: string) => void;
  onOpen?: (sym: string) => void;
  active: string;
  onRemove?: (sym: string) => void;
  onAdd?: (sym: string) => void;
  onAlert?: (sym: string) => void;
  onContext?: (e: React.MouseEvent, sym: string) => void;
  triggeredSyms?: Set<string>;
}) {
  const pctRange = useMemo(() => {
    const maxAbs = items.reduce((m, i) => Math.max(m, Math.abs(i.changePct)), 0);
    return Math.max(1, Math.ceil(maxAbs * 1.2 * 2) / 2);
  }, [items]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(id);
  }, [query]);
  const search = useQuery({
    queryKey: ["symbol-search", debouncedQuery],
    queryFn: () =>
      api<SymbolSearchPayload>(`/assets/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: adding && debouncedQuery.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const suggestions = useMemo<SymbolSearchItem[]>(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const owned = new Set(items.map((i) => i.symbol));
    const remote = search.data?.items ?? [];
    const local = TICKERS.filter((ticker) => ticker.startsWith(q)).map((symbol) => ({
      symbol,
      name: symbol,
      exchange: "US",
      market: "US" as const,
      type: "EQUITY",
    }));
    const direct = /^[A-Z0-9][A-Z0-9.\-^=]{0,24}$/.test(q)
      ? [
          {
            symbol: q,
            name: "Direct symbol lookup",
            exchange: q.endsWith(".NS") ? "NSE" : q.endsWith(".BO") ? "BSE" : "US",
            market: q.endsWith(".NS") || q.endsWith(".BO") ? ("INDIA" as const) : ("US" as const),
            type: "EQUITY",
          },
        ]
      : [];
    return [...remote, ...local, ...direct]
      .filter(
        (item, index, all) =>
          !owned.has(item.symbol) &&
          all.findIndex((candidate) => candidate.symbol === item.symbol) === index,
      )
      .slice(0, 8);
  }, [query, items, search.data?.items]);

  return (
    <div className="flex h-full flex-col">
      <div className="mono-caps grid grid-cols-[44px_1fr_48px_54px_54px_40px] items-center gap-1 border-b border-divider bg-panel px-2 py-1 text-[9px] text-faint tabular-nums">
        <span>SYM</span>
        <span className="text-right">LAST</span>
        <span></span>
        <span className="text-right">Δ$</span>
        <span className="text-right">Δ%</span>
        <span className="text-right">VOL</span>
      </div>
      <div className="divide-y divide-divider">
        {items.length === 0 && (
          <div className="p-4 text-[11px] text-muted-foreground">
            Nothing pinned yet. Click any ticker on the tape to track it here.
          </div>
        )}
        {items.map((i) => {
          const up = i.changePct >= 0;
          const flash = triggeredSyms.has(i.symbol);
          const change = i.price - i.prevClose;
          const vol = i.history.reduce((s, t) => s + (t.v || 0), 0);
          return (
            <div
              key={i.symbol}
              onClick={() => onSelect(i.symbol)}
              onDoubleClick={() => onOpen?.(i.symbol)}
              onContextMenu={(e) => onContext?.(e, i.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen?.(i.symbol);
              }}
              tabIndex={0}
              role="button"
              className={`group relative grid w-full cursor-pointer grid-cols-[44px_1fr_48px_54px_54px_40px] items-center gap-1 px-2 py-1.5 text-left outline-none tabular-nums transition hover:bg-raised focus:bg-raised ${
                active === i.symbol ? "border-l-2 border-primary bg-primary/5 -ml-[2px]" : ""
              } ${flash ? "animate-flash-alert" : ""}`}
              style={{ minHeight: 26 }}
            >
              <span className="mono-caps text-[11px] text-foreground">{i.symbol}</span>
              <span className="text-right font-mono text-[11px] text-foreground">
                {fmt(i.price)}
              </span>
              <MiniSparkline
                history={i.history}
                up={up}
                prevClose={i.prevClose}
                pctRange={pctRange}
              />
              <span
                className={`text-right font-mono text-[10px] tabular-nums ${up ? "text-up" : "text-down"}`}
              >
                {up ? "+" : ""}
                {change.toFixed(2)}
              </span>
              <DeltaCell up={up} changePct={i.changePct} />
              <span className="text-right font-mono text-[9.5px] text-muted-foreground">
                {formatVol(vol)}
              </span>
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 bg-raised pl-1 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlert?.(i.symbol);
                  }}
                  title="Set alert"
                  className="text-faint hover:text-primary"
                >
                  <Bell size={10} />
                </button>
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i.symbol);
                    }}
                    title="Remove"
                    className="text-faint hover:text-down px-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {onAdd && (
        <div className="border-t border-divider">
          {adding ? (
            <div className="relative px-3 py-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => setTimeout(() => setAdding(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0]) {
                    onAdd(suggestions[0].symbol);
                    setQuery("");
                    setAdding(false);
                  } else if (e.key === "Escape") {
                    setAdding(false);
                    setQuery("");
                  }
                }}
                placeholder="Symbol…"
                className="w-full border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
              />
              <div className="mono-caps mt-1 text-[8px] text-faint">
                SEARCH ALL YAHOO-LISTED US · NSE (.NS) · BSE (.BO)
              </div>
              {suggestions.length > 0 && (
                <div className="absolute left-3 right-3 top-full z-20 border border-border bg-raised">
                  {suggestions.map((result) => (
                    <button
                      key={result.symbol}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onAdd(result.symbol);
                        setQuery("");
                        setAdding(false);
                      }}
                      className="mono-caps block w-full px-2 py-1 text-left text-[10px] text-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-primary">{result.symbol}</span>
                        <span className="text-[8px] text-faint">
                          {result.exchange} · {result.market}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] normal-case text-muted-foreground">
                        {result.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mono-caps interactive flex w-full items-center justify-center gap-1 py-1.5 text-[10px] text-faint hover:bg-raised hover:text-primary"
            >
              + ADD
            </button>
          )}
        </div>
      )}
    </div>
  );
}
