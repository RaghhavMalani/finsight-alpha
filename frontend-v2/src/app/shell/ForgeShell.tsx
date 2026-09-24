import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ForgeCommandPalette } from "@/app/command/ForgeCommandPalette";

const NAV_ITEMS = [
  { key: "F2", label: "Center", to: "/forge" },
  { key: "F3", label: "Runs", to: "/runs" },
  { key: "F4", label: "Bench", to: "/bench" },
  { key: "F5", label: "Worlds", to: "/worlds" },
  { key: "F6", label: "Artifacts", to: "/artifacts" },
] as const;

export function ForgeShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "F1") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const destination = NAV_ITEMS.find((item) => item.key === event.key)?.to;
      if (destination) {
        event.preventDefault();
        void navigate({ to: destination });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-[#07090B] text-[#E6E8EB]">
      <a
        href="#forge-main"
        className="fixed left-3 top-3 z-[60] -translate-y-20 border border-[#FFB000] bg-[#080a0d] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#FFB000] transition-transform focus:translate-y-0"
      >
        Skip to evidence
      </a>
      <header className="sticky top-0 z-40 border-b border-[#1D232B] bg-[#07090B]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-3 sm:px-5">
          <Link
            to="/forge"
            search={{ run: undefined, node: 1 }}
            className="group flex shrink-0 items-center gap-2 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
          >
            <span className="grid size-7 place-items-center border border-[#FFB000] font-mono text-[10px] font-semibold text-[#FFB000]">
              F
            </span>
            <span className="hidden text-xs font-semibold tracking-[0.03em] text-[#E6E8EB] sm:block">
              FinSight <span className="text-[#FFB000]">Forge</span>
            </span>
          </Link>
          <nav aria-label="Forge primary" className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-stretch">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 border-x border-[#1D232B] px-3 py-4 text-left hover:bg-[#0B0E11] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
              >
                <kbd className="font-mono text-[8px] text-[#65707c]">F1</kbd>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#c6ccd2]">
                  Command
                </span>
              </button>
              {NAV_ITEMS.map((item) => {
                const active =
                  item.to === "/forge" ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 border-r border-[#1D232B] px-3 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${
                      active ? "bg-[#111820] text-[#FFB000]" : "text-[#c6ccd2] hover:bg-[#0B0E11]"
                    }`}
                  >
                    <kbd className="font-mono text-[8px] text-[#65707c]">{item.key}</kbd>
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em]">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
          <Link
            to="/legacy-terminal"
            className="hidden shrink-0 border border-[#29313a] px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7B8490] hover:border-[#59636e] hover:text-[#c6ccd2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] lg:block"
          >
            Legacy terminal
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden shrink-0 items-center gap-2 border border-[#29313a] px-2.5 py-1.5 font-mono text-[8px] text-[#9ba5af] hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] sm:flex"
          >
            <span aria-hidden="true">⌘</span>K
          </button>
        </div>
      </header>
      <main
        id="forge-main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1800px] px-3 py-4 outline-none sm:px-5 sm:py-5"
      >
        {children}
      </main>
      <footer className="border-t border-[#1D232B] px-4 py-3">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#59636e]">
          <span>Observer Foundation · read-only</span>
          <span>Unknown schemas fail closed</span>
        </div>
      </footer>
      <ForgeCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
