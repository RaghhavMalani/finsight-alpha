import { useEffect, useMemo, useRef, useState } from "react";
import { COMMANDS, fuzzyCommands, parseCommand } from "@/lib/commands";
import { TICKERS } from "@/lib/market";

const RECENTS_KEY = "finsight.palette.recents";

export function CommandPalette({
  open,
  onClose,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  onRun: (code: string, symbol?: string, action?: "GO" | "COMPARE", symbol2?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
      try {
        const raw = localStorage.getItem(RECENTS_KEY);
        if (raw) setRecents(JSON.parse(raw));
      } catch {}
    }
  }, [open]);

  const parsed = useMemo(() => parseCommand(q), [q]);

  const results = useMemo(() => {
    if (!q.trim()) {
      const recentCmds = recents
        .map((code) => COMMANDS.find((c) => c.code === code))
        .filter(Boolean) as typeof COMMANDS;
      return recentCmds.length ? recentCmds : COMMANDS;
    }
    const cmds = fuzzyCommands(q);
    if (parsed?.code && !cmds.some((c) => c.code === parsed.code)) {
      const c = COMMANDS.find((x) => x.code === parsed.code);
      if (c) return [c, ...cmds];
    }
    return cmds;
  }, [q, recents, parsed]);

  const symbolMatch = useMemo(() => {
    const upper = q.trim().toUpperCase();
    return TICKERS.find((t) => t.startsWith(upper) && upper.length >= 1);
  }, [q]);

  function commit(code: string) {
    // pulse
    if (pulseRef.current) {
      pulseRef.current.classList.remove("palette-pulse");
      void pulseRef.current.offsetWidth;
      pulseRef.current.classList.add("palette-pulse");
    }
    const sym = parsed?.symbol ?? symbolMatch;
    const action = parsed?.action;
    const sym2 = parsed?.symbol2;
    const next = [code, ...recents.filter((r) => r !== code)].slice(0, 5);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {}
    setTimeout(() => {
      onRun(code, sym, action, sym2);
      onClose();
    }, 120);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(results.length - 1, s + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = results[sel];
        if (c) commit(c.code);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [open, results, sel, parsed, symbolMatch]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[16vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md animate-fade-in" style={{ animationDuration: "240ms" }} />
      <div
        ref={pulseRef}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-[min(640px,92vw)] border border-border bg-panel/95 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)] amber-glow"
        style={{ animation: "palette-in 240ms cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
          <span className="mono-caps text-[10px] text-primary">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Ask the terminal — 'monte carlo nvda', 'how risky is my book', or a code"
            className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-faint"
          />
          {parsed?.symbol && (
            <span className="mono-caps border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
              {parsed.symbol}
            </span>
          )}
        </div>

        {!q && recents.length > 0 && (
          <div className="mono-caps px-4 pt-3 text-[9px] text-faint">RECENT</div>
        )}

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((c, i) => (
            <button
              key={c.code}
              onMouseEnter={() => setSel(i)}
              onClick={() => commit(c.code)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                i === sel ? "bg-primary/10" : ""
              }`}
            >
              <span className={`mono-caps w-12 text-[11px] ${i === sel ? "text-primary" : "text-muted-foreground"}`}>
                {c.code}
              </span>
              <span className="flex-1">
                <span className="block text-[13px] text-foreground">{c.label}</span>
                <span className="mono-caps text-[9px] text-faint">{c.description}</span>
              </span>
              {i === sel && (
                <kbd className="mono-caps border border-border bg-raised px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  ↵
                </kbd>
              )}
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-4 py-4 font-mono text-[11px] text-down">
              No function found. Try MK · MC · VS · CX · RISK.
            </div>
          )}
        </div>

        <div className="mono-caps flex items-center justify-between border-t border-divider px-4 py-2 text-[9px] text-faint">
          <span>↑↓ NAVIGATE · ↵ RUN · ESC CLOSE</span>
          <span>{symbolMatch ? `TICKER ${symbolMatch}` : ""}</span>
        </div>
      </div>

      <style>{`
        @keyframes palette-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes palette-pulse-key {
          0% { box-shadow: 0 0 0 0 rgba(66,201,139,0), 0 0 0 1px var(--border); }
          40% { box-shadow: 0 0 0 6px rgba(66,201,139,0.35), 0 0 0 1px rgba(66,201,139,0.9); }
          100% { box-shadow: 0 0 0 0 rgba(66,201,139,0), 0 0 0 1px var(--border); }
        }
        .palette-pulse { animation: palette-pulse-key 500ms ease-out; }
      `}</style>
    </div>
  );
}

