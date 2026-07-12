import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt, fmtPct } from "@/lib/market";
import { MiniSparkline } from "./MiniSparkline";
import { TICKERS } from "@/lib/market";
import { Bell } from "lucide-react";

function formatVol(v: number) {
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
  const cls = flash === "up" ? "animate-flash-cell-up" : flash === "down" ? "animate-flash-cell-down" : "";
  return (
    <span className={`inline-block text-right font-mono text-[10px] tabular-nums px-1 ${up ? "text-up" : "text-down"} ${cls}`}>
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
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const owned = new Set(items.map((i) => i.symbol));
    return TICKERS.filter((t) => t.startsWith(q) && !owned.has(t)).slice(0, 5);
  }, [query, items]);

  return (
    <div className="flex h-full flex-col">
      <div className="mono-caps grid grid-cols-[46px_1fr_52px_60px_58px_18px] items-center gap-1.5 border-b border-divider bg-panel px-2 py-1 text-[9px] text-faint tabular-nums">
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
              className={`group grid w-full cursor-pointer grid-cols-[46px_1fr_52px_60px_58px_auto] items-center gap-1.5 px-2 py-1.5 text-left outline-none tabular-nums transition hover:bg-raised focus:bg-raised ${
                active === i.symbol ? "border-l-2 border-primary bg-primary/5 -ml-[2px]" : ""
              } ${flash ? "animate-flash-alert" : ""}`}
              style={{ minHeight: 26 }}
            >
              <span className="mono-caps text-[11px] text-foreground">{i.symbol}</span>
              <span className="text-right font-mono text-[11px] text-foreground">{fmt(i.price)}</span>
              <MiniSparkline history={i.history} up={up} prevClose={i.prevClose} pctRange={pctRange} />
              <span className={`text-right font-mono text-[10px] tabular-nums ${up ? "text-up" : "text-down"}`}>
                {up ? "+" : ""}{change.toFixed(2)}
              </span>
              <DeltaCell up={up} changePct={i.changePct} />
              <span className="text-right font-mono text-[9.5px] text-muted-foreground">{formatVol(vol)}</span>
              <div className="col-start-6 row-start-1 justify-self-end flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onAlert?.(i.symbol); }}
                  title="Set alert"
                  className="text-faint hover:text-primary"
                >
                  <Bell size={10} />
                </button>
                {onRemove && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(i.symbol); }}
                    title="Remove"
                    className="text-faint hover:text-down px-0.5"
                  >✕</button>
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
                    onAdd(suggestions[0]); setQuery(""); setAdding(false);
                  } else if (e.key === "Escape") { setAdding(false); setQuery(""); }
                }}
                placeholder="Symbol…"
                className="w-full border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-3 right-3 top-full z-20 border border-border bg-raised">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onMouseDown={(e) => { e.preventDefault(); onAdd(s); setQuery(""); setAdding(false); }}
                      className="mono-caps block w-full px-2 py-1 text-left text-[10px] text-foreground hover:bg-primary/10 hover:text-primary"
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mono-caps interactive flex w-full items-center justify-center gap-1 py-1.5 text-[10px] text-faint hover:bg-raised hover:text-primary"
            >+ ADD</button>
          )}
        </div>
      )}
    </div>
  );
}

