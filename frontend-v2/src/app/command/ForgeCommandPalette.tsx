import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { WORKSPACES } from "@/app/workspaces";
import { parseCommand } from "./mnemonics";
import { setCurrentTicker, useCurrentTicker } from "@/replay/mode";

const MARKET_SCREENS = {
  "markets-overview": "/markets",
  "markets-options": "/markets/options",
  "markets-risk": "/markets/risk",
  "markets-backtest": "/markets/backtest",
  "markets-fundamentals": "/markets/fundamentals",
  "markets-research": "/markets/research",
} as const;

const COMMANDS = [
  ...WORKSPACES.map((w) => ({
    id: `workspace:${w.id}`,
    label: `${w.key} · ${w.label}`,
    hint: w.command,
    to: w.to,
  })),
  {
    id: "markets-overview",
    label: "Open Markets · Overview",
    hint: "Weekly derived Replay or sourced local Live quotes",
    to: "/markets",
  },
  {
    id: "markets-options",
    label: "Open Markets · Options",
    hint: "Quoted chain, pricer, payoff, IV surface",
    to: "/markets/options",
  },
  {
    id: "markets-risk",
    label: "Open Markets · Risk",
    hint: "VaR, stress, Monte Carlo, factors, portfolio",
    to: "/markets/risk",
  },
  {
    id: "markets-backtest",
    label: "Open Markets · Backtest",
    hint: "Indicator strategies against buy and hold",
    to: "/markets/backtest",
  },
  {
    id: "markets-fundamentals",
    label: "Open Markets · Fundamentals",
    hint: "EDGAR statements as of a date",
    to: "/markets/fundamentals",
  },
  {
    id: "markets-research",
    label: "Open Markets · Research",
    hint: "Ask a company's 10-K and 10-Q",
    to: "/markets/research",
  },
  { id: "center", label: "Open Command Center", hint: "Forge overview", to: "/forge" },
  { id: "runs", label: "Open Runs", hint: "Immutable trajectories", to: "/runs" },
  { id: "bench", label: "Open Bench", hint: "Frozen v0.2.5 baseline", to: "/bench" },
  { id: "worlds", label: "Open Worlds", hint: "World references", to: "/worlds" },
  { id: "artifacts", label: "Open Artifacts", hint: "Bound evidence", to: "/artifacts" },
  {
    id: "observatory",
    label: "Open Model Observatory",
    hint: "HMM, GBM and neural training traces",
    to: "/observatory",
  },
  {
    id: "reality",
    label: "Open Reality Ladder",
    hint: "Frozen v0.2.4.1 artifact",
    to: "/reality/forge-v0.2.4.1",
  },
  {
    id: "neural",
    label: "Open Neural Lab",
    hint: "Edit and train a network, epoch by epoch",
    to: "/observatory",
  },
  {
    id: "globe",
    label: "Open God's Eye",
    hint: "Checked World snapshot or local Live feeds",
    to: "/globe",
  },
  {
    id: "dynamics",
    label: "Open Dynamics Lab",
    hint: "Regime and event-process research",
    to: "/dynamics",
  },
  { id: "risk", label: "Open Paper Book", hint: "Positions, stress and hedges", to: "/risk" },
] as const;

export function ForgeCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const currentTicker = useCurrentTicker();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const mnemonic = useMemo(() => {
    try {
      return query.trim() ? parseCommand(query, currentTicker) : null;
    } catch {
      return null;
    }
  }, [query, currentTicker]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COMMANDS;
    const pages = COMMANDS.filter((command) =>
      `${command.label} ${command.hint}`.toLowerCase().includes(normalized),
    );
    return mnemonic
      ? [
          {
            id: "mnemonic",
            label: `GO · ${query.trim().toUpperCase()}`,
            hint: mnemonic.instrument
              ? `${mnemonic.instrument.exchange} · ${mnemonic.instrument.currency}`
              : "Open workspace",
            to: mnemonic.to,
          },
          ...pages,
        ]
      : pages;
  }, [query, mnemonic]);

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
    if (id === "mnemonic" && mnemonic) {
      if (mnemonic.instrument) setCurrentTicker(mnemonic.instrument.providerSymbol);
      onClose();
      void navigate({ to: mnemonic.to, search: mnemonic.search as never });
      return;
    }
    if (id.startsWith("workspace:")) {
      const workspace = WORKSPACES.find((w) => `workspace:${w.id}` === id);
      if (workspace) {
        onClose();
        void navigate({ to: workspace.to, search: { ticker: currentTicker } as never });
      }
      return;
    }
    onClose();
    if (id in MARKET_SCREENS) {
      void navigate({
        to: MARKET_SCREENS[id as keyof typeof MARKET_SCREENS],
        search: { ticker: currentTicker },
      });
      return;
    }
    switch (id) {
      case "center":
        void navigate({ to: "/forge", search: { run: undefined, node: 1 } });
        break;
      case "runs":
        void navigate({
          to: "/runs",
          search: {
            model: undefined,
            verdict: undefined,
            task: undefined,
            taskClass: undefined,
            seed: undefined,
            verified: undefined,
          },
        });
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
      case "observatory":
        void navigate({ to: "/observatory", search: { scene: "hmm", ticker: "SPY" } });
        break;
      case "reality":
        void navigate({
          to: "/reality/$artifactId",
          params: { artifactId: "forge-v0.2.4.1" },
          search: { checkpoint: undefined, metric: "sharpe" },
        });
        break;
      case "neural":
        void navigate({ to: "/observatory", search: { scene: "neural", ticker: "SPY" } });
        break;
      case "globe":
        void navigate({ to: "/globe" });
        break;
      case "dynamics":
        void navigate({ to: "/dynamics" });
        break;
      case "risk":
        void navigate({ to: "/risk" });
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
        className="w-full max-w-2xl border border-[#3b4651] bg-[#0B0D10] shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
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
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#F0A929]"
            >
              Terminal command
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a workspace or enter a ticker command. F5 and F7 stay with your browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-[#29313a] px-2 py-1 font-mono text-[9px] uppercase text-[#9ba5af] hover:border-[#F0A929] hover:text-[#F0A929] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F0A929]"
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
            placeholder="RELIANCE IN DES · SPY REG · FACT · EXEC"
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
              className={`flex w-full items-center justify-between gap-5 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F0A929] ${
                index === activeIndex ? "bg-[#111820]" : "hover:bg-[#0d1217]"
              }`}
            >
              <span className="text-sm font-medium text-[#dfe3e7]">{command.label}</span>
              <span className="font-mono text-[9px] text-[#65707c]">{command.hint}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[#7B8490]">
              Unknown command. Use TICKER [US/UN/UQ/UP/IN/IS/IB] FUNCTION, or choose a workspace.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
