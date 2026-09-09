import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

const COMMANDS = [
  { id: "center", label: "Open Command Center", hint: "Forge overview", to: "/forge" },
  { id: "runs", label: "Open Runs", hint: "Immutable trajectories", to: "/runs" },
  { id: "bench", label: "Open Bench", hint: "Frozen v0.2.5 baseline", to: "/bench" },
  { id: "worlds", label: "Open Worlds", hint: "World references", to: "/worlds" },
  { id: "artifacts", label: "Open Artifacts", hint: "Bound evidence", to: "/artifacts" },
  {
    id: "reality",
    label: "Open Reality Ladder",
    hint: "Frozen v0.2.4.1 artifact",
    to: "/reality/forge-v0.2.4.1",
  },
  {
    id: "legacy",
    label: "Open Legacy Terminal",
    hint: "Market and quant workspace",
    to: "/legacy-terminal",
  },
] as const;

export function ForgeCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COMMANDS;
    return COMMANDS.filter((command) =>
      `${command.label} ${command.hint}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => restoreFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  if (!open) return null;

  const execute = (id: (typeof COMMANDS)[number]["id"]) => {
    onClose();
    switch (id) {
      case "center":
        void navigate({ to: "/forge", search: { run: undefined } });
        break;
      case "runs":
        void navigate({ to: "/runs", search: { model: undefined, verdict: undefined } });
        break;
      case "bench":
        void navigate({ to: "/bench" });
        break;
      case "worlds":
        void navigate({ to: "/worlds" });
        break;
      case "artifacts":
        void navigate({ to: "/artifacts" });
        break;
      case "reality":
        void navigate({
          to: "/reality/$artifactId",
          params: { artifactId: "forge-v0.2.4.1" },
          search: { checkpoint: undefined, metric: "sharpe" },
        });
        break;
      case "legacy":
        void navigate({ to: "/legacy-terminal" });
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forge-command-title"
        className="w-full max-w-2xl border border-[#3b4651] bg-[#080a0d] shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((value) => Math.min(value + 1, results.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((value) => Math.max(value - 1, 0));
            return;
          }
          if (event.key === "Enter" && results[activeIndex]) {
            event.preventDefault();
            execute(results[activeIndex].id);
            return;
          }
          if (event.key === "Tab") {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              'input, button, [href], [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-[#1D232B] px-4 py-3">
          <div>
            <div
              id="forge-command-title"
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#FFB000]"
            >
              Forge command
            </div>
            <p className="mt-1 text-xs text-[#65707c]">Navigation only in Observer Foundation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-[#29313a] px-2 py-1 font-mono text-[9px] uppercase text-[#9ba5af] hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
          >
            Esc
          </button>
        </div>
        <label className="block border-b border-[#1D232B] p-4">
          <span className="sr-only">Find a Forge destination</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="forge-command-results"
            aria-expanded="true"
            aria-activedescendant={
              results[activeIndex] ? `forge-command-${results[activeIndex].id}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Open runs, bench, reality, worlds, artifacts…"
            className="w-full bg-transparent font-mono text-sm text-[#E6E8EB] outline-none placeholder:text-[#48515C]"
          />
        </label>
        <div
          className="px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#59636e]"
          aria-live="polite"
        >
          {results.length} {results.length === 1 ? "destination" : "destinations"}
        </div>
        <div
          id="forge-command-results"
          role="listbox"
          className="max-h-[46vh] overflow-y-auto border-t border-[#1D232B] p-2"
        >
          {results.map((command, index) => (
            <button
              key={command.id}
              id={`forge-command-${command.id}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => execute(command.id)}
              className={`flex w-full items-center justify-between gap-5 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                index === activeIndex ? "bg-[#111820]" : "hover:bg-[#0d1217]"
              }`}
            >
              <span className="text-sm font-medium text-[#dfe3e7]">{command.label}</span>
              <span className="font-mono text-[9px] text-[#65707c]">{command.hint}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[#7B8490]">
              No known destination. Observer Foundation does not infer commands.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
