import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { COMMANDS as CMD_LIST, fuzzyCommands, parseCommand, nearestCommand } from "@/lib/commands";

export const COMMANDS = CMD_LIST;
export type Command = (typeof CMD_LIST)[number];

export function CommandBar({
  onRun,
  onFocus,
}: {
  onRun: (code: string, symbol?: string, action?: "GO" | "COMPARE", symbol2?: string) => void;
  onFocus?: () => void;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !editing) {
        e.preventDefault();
        inputRef.current?.focus();
        onFocus?.();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFocus]);

  const filtered = value.trim() === "" ? COMMANDS : fuzzyCommands(value);

  function run(raw: string) {
    const parsed = parseCommand(raw);
    if (!parsed) {
      const nearest = nearestCommand(raw);
      setError(`No function '${raw.toUpperCase()}'. Closest match: ${nearest.code} — ${nearest.label}. Enter to run it.`);
      wrapRef.current?.classList.remove("animate-shake");
      void wrapRef.current?.offsetWidth;
      wrapRef.current?.classList.add("animate-shake");
      return;
    }
    setError(null);
    setHistory((h) => [...h.filter((x) => x !== raw), raw].slice(-20));
    setHistIdx(-1);
    setValue("");
    setOpen(false);
    onRun(parsed.code, parsed.symbol, parsed.action, parsed.symbol2);
    toast.success(`${parsed.code}${parsed.symbol ? ` · ${parsed.symbol}` : ""} loaded`);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mono-caps text-[10px] text-primary">
          /
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (error) {
                run(nearestCommand(value).code);
              } else if (filtered[0] && !parseCommand(value)) {
                run(filtered[0].code);
              } else {
                run(value);
              }
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (history.length) {
                const next = Math.min(history.length - 1, histIdx + 1);
                setHistIdx(next);
                setValue(history[history.length - 1 - next]);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (histIdx > 0) {
                const next = histIdx - 1;
                setHistIdx(next);
                setValue(history[history.length - 1 - next]);
              } else {
                setHistIdx(-1);
                setValue("");
              }
            }
          }}
          placeholder="Type / to command · try VS, MK, or 'monte carlo nvda'"
          className="w-full border border-border bg-background py-2 pl-8 pr-4 font-mono text-sm text-foreground outline-none transition focus:border-primary focus:shadow-[0_0_0_3px_rgba(240,169,41,0.18)]"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-border bg-raised amber-glow">
          {filtered.map((c, i) => (
            <button
              key={c.code}
              onMouseDown={(e) => {
                e.preventDefault();
                run(c.code);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-primary/10 ${
                i === 0 ? "bg-primary/5" : ""
              }`}
            >
              <span className="mono-caps text-[11px] text-primary">{c.code}</span>
              <span className="flex-1 px-3 text-xs text-foreground">— {c.description}</span>
              <span className="mono-caps text-[9px] text-faint">↵</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-3 font-mono text-xs text-down">No matching function.</div>
          )}
        </div>
      )}
      {error && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 border-l-2 border-down bg-raised px-3 py-2 font-mono text-xs text-down">
          {error}
        </div>
      )}
    </div>
  );
}

