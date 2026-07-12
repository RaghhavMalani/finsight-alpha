import { useMemo, useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt, fmtPct, TICKERS } from "@/lib/market";
import {
  addDemoPosition, removeDemoPosition, updateDemoPosition,
  clearDemoBook, resetDemoBook, type DemoPosition,
} from "@/lib/demoBook";
import { toast } from "sonner";

export function BookDrawer({
  positions,
  instruments,
  onClose,
}: {
  positions: DemoPosition[];
  instruments: Record<string, Instrument>;
  onClose: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("100");

  const rows = useMemo(() => {
    return positions.map((p) => {
      const inst = instruments[p.symbol];
      const last = inst?.price ?? p.entry;
      const prev = inst?.prevClose ?? p.entry;
      const dayPnl = (last - prev) * p.qty;
      const unrl = (last - p.entry) * p.qty;
      const mv = last * p.qty;
      return { p, inst, last, dayPnl, unrl, mv };
    });
  }, [positions, instruments]);

  const totalMV = rows.reduce((s, r) => s + Math.abs(r.mv), 0) || 1;
  const cls = (sym: string): "EQ" | "CX" | "OP" =>
    sym === "BTC-USD" ? "CX" : "EQ";

  const suggestions = useMemo(() => {
    const owned = new Set(positions.map((p) => p.symbol));
    const upper = q.trim().toUpperCase();
    if (!upper) return [];
    return TICKERS.filter((t) => t.startsWith(upper) && !owned.has(t)).slice(0, 6);
  }, [q, positions]);

  function commitAdd(sym: string) {
    const n = parseInt(qty, 10);
    if (!sym || isNaN(n) || n === 0) return;
    const inst = instruments[sym];
    addDemoPosition({ symbol: sym, qty: n, entry: +(inst?.price ?? 100).toFixed(2) });
    toast.success(`+ ${sym} × ${n} @ ${fmt(inst?.price ?? 0)}`);
    setQ(""); setAdding(false);
  }

  if (positions.length === 0) {
    return (
      <div className="border border-primary/40 bg-panel p-4 amber-glow">
        <div className="mono-caps mb-2 text-[10px] text-primary">DEMO BOOK · EMPTY</div>
        <div className="font-serif text-[13px] text-foreground leading-snug">
          No positions. Add some — P&amp;L, RISK, and DISCOVER all read this book.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => resetDemoBook()}
            className="mono-caps interactive border border-primary bg-primary/10 px-2 py-1 text-[10px] text-primary hover:brightness-110"
          >RESET DEMO</button>
          <button
            onClick={() => { setAdding(true); setEdit(true); }}
            className="mono-caps interactive border border-border px-2 py-1 text-[10px] text-foreground hover:border-primary hover:text-primary"
          >+ ADD POSITION</button>
          <button
            onClick={onClose}
            className="mono-caps ml-auto text-[10px] text-faint hover:text-foreground"
          >CLOSE</button>
        </div>
        {adding && (
          <AddRow
            q={q} setQ={setQ}
            qty={qty} setQty={setQty}
            suggestions={suggestions}
            onCommit={commitAdd}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="border border-primary/40 bg-panel amber-glow">
      <div className="mono-caps flex items-center gap-2 border-b border-divider px-3 py-1.5 text-[10px]">
        <span className="text-primary">DEMO BOOK · {positions.length} POSITIONS</span>
        <span className="text-faint">click to inspect · edit to change</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setEdit((v) => !v)}
            className={`interactive border px-2 py-0.5 text-[9px] ${edit ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}
          >{edit ? "DONE" : "EDIT"}</button>
          {edit && (
            <>
              <button
                onClick={() => setAdding(true)}
                className="interactive border border-border px-2 py-0.5 text-[9px] text-foreground hover:border-primary hover:text-primary"
              >+ ADD</button>
              <button
                onClick={() => { if (confirm("Clear all positions?")) clearDemoBook(); }}
                className="interactive border border-border px-2 py-0.5 text-[9px] text-down hover:border-down"
              >CLEAR</button>
              <button
                onClick={() => resetDemoBook()}
                className="interactive border border-border px-2 py-0.5 text-[9px] text-faint hover:text-primary"
              >RESET DEMO</button>
            </>
          )}
          <button
            onClick={onClose}
            className="mono-caps ml-1 text-[10px] text-faint hover:text-foreground"
            title="Close"
          >✕</button>
        </div>
      </div>

      {adding && (
        <div className="border-b border-divider bg-raised">
          <AddRow
            q={q} setQ={setQ}
            qty={qty} setQty={setQty}
            suggestions={suggestions}
            onCommit={commitAdd}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div className="mono-caps grid grid-cols-[38px_58px_46px_54px_54px_58px_60px_1fr_18px] items-center gap-2 border-b border-divider bg-panel/70 px-3 py-1 text-[9px] text-faint tabular-nums">
        <span>CLS</span>
        <span>SYMBOL</span>
        <span className="text-right">QTY</span>
        <span className="text-right">ENTRY</span>
        <span className="text-right">LAST</span>
        <span className="text-right">DAY $</span>
        <span className="text-right">UNRL $</span>
        <span>WEIGHT</span>
        <span></span>
      </div>

      <div className="max-h-[260px] overflow-y-auto divide-y divide-divider/60">
        {rows.map(({ p, last, dayPnl, unrl, mv }) => {
          const w = Math.abs(mv) / totalMV;
          const c = cls(p.symbol);
          const clsColor = c === "EQ" ? "bg-primary/15 text-primary" : c === "CX" ? "bg-info/15 text-info" : "bg-up/15 text-up";
          const short = p.qty < 0;
          return (
            <div
              key={p.symbol}
              className="grid grid-cols-[38px_58px_46px_54px_54px_58px_60px_1fr_18px] items-center gap-2 px-3 py-1 font-mono text-[11px] tabular-nums"
            >
              <span className={`mono-caps rounded-sm px-1 py-0.5 text-[8px] text-center ${clsColor}`}>{c}</span>
              <span className={`mono-caps text-[11px] ${short ? "text-down" : "text-foreground"}`}>{p.symbol}</span>
              {edit ? (
                <input
                  type="number"
                  value={p.qty}
                  onChange={(e) => updateDemoPosition(p.symbol, { qty: parseInt(e.target.value || "0", 10) })}
                  className="w-full border border-border bg-background px-1 py-0.5 text-right text-[10px] text-foreground outline-none focus:border-primary"
                />
              ) : (
                <span className="text-right text-foreground">{p.qty}</span>
              )}
              <span className="text-right text-muted-foreground">{fmt(p.entry)}</span>
              <span className="text-right text-foreground">{fmt(last)}</span>
              <span className={`text-right ${dayPnl >= 0 ? "text-up" : "text-down"}`}>
                {dayPnl >= 0 ? "+" : "−"}${fmt(Math.abs(dayPnl), 0)}
              </span>
              <span className={`text-right ${unrl >= 0 ? "text-up" : "text-down"}`}>
                {unrl >= 0 ? "+" : "−"}${fmt(Math.abs(unrl), 0)}
              </span>
              <div className="relative h-1.5 bg-background">
                <div
                  className={`absolute inset-y-0 left-0 ${short ? "bg-down/60" : "bg-primary/60"}`}
                  style={{ width: `${w * 100}%`, transition: "width 400ms cubic-bezier(0.16,1,0.3,1)" }}
                />
              </div>
              {edit ? (
                <button
                  onClick={() => removeDemoPosition(p.symbol)}
                  className="text-faint hover:text-down"
                  title="Remove"
                >✕</button>
              ) : <span />}
            </div>
          );
        })}
      </div>

      <div className="mono-caps flex items-center justify-between border-t border-divider bg-panel/70 px-3 py-1 text-[9px] text-faint tabular-nums">
        <span>NOTIONAL <span className="text-foreground">${fmt(totalMV, 0)}</span></span>
        <span className="text-primary/70">read by P&amp;L · RISK · ML DISCOVER</span>
      </div>
    </div>
  );
}

function AddRow({
  q, setQ, qty, setQty, suggestions, onCommit, onCancel,
}: {
  q: string; setQ: (s: string) => void;
  qty: string; setQty: (s: string) => void;
  suggestions: string[];
  onCommit: (sym: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="relative flex items-center gap-2 px-3 py-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) onCommit(suggestions[0]);
          else if (e.key === "Escape") onCancel();
        }}
        placeholder="Symbol"
        className="w-24 border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty (±)"
        className="w-20 border border-border bg-background px-2 py-1 text-right font-mono text-[11px] text-foreground outline-none focus:border-primary"
      />
      <span className="mono-caps text-[9px] text-faint">ENTRY = LAST · negative qty = short</span>
      <button
        onClick={onCancel}
        className="mono-caps ml-auto border border-border px-2 py-1 text-[10px] text-faint hover:text-foreground"
      >CANCEL</button>
      {suggestions.length > 0 && (
        <div className="absolute left-3 top-full z-30 mt-1 w-40 border border-border bg-raised">
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); onCommit(s); }}
              className="mono-caps block w-full px-2 py-1 text-left text-[10px] text-foreground hover:bg-primary/10 hover:text-primary"
            >{s}</button>
          ))}
        </div>
      )}
      {/* Unused indirect ref for pct helper if needed later */}
      <span className="sr-only">{fmtPct(0)}</span>
    </div>
  );
}

