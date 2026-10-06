import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ForgeCommandPalette } from "@/app/command/ForgeCommandPalette";
import "./shell.css";

type NavItem = {
  key: string;
  label: string;
  to: string;
  /** Path prefix that marks the item active, when it differs from `to`. */
  match?: string;
  search?: Record<string, unknown>;
};
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Forge",
    items: [
      { key: "F2", label: "Center", to: "/forge", search: { run: undefined, node: 1 } },
      { key: "F3", label: "Runs", to: "/runs" },
      { key: "F4", label: "Bench", to: "/bench" },
      { key: "F5", label: "Worlds", to: "/worlds" },
      { key: "F6", label: "Artifacts", to: "/artifacts" },
    ],
  },
  {
    title: "Models",
    items: [
      {
        key: "F7",
        label: "Observatory",
        to: "/observatory",
        search: { scene: "hmm", ticker: "SPY" },
      },
      {
        key: "F8",
        label: "Neural",
        to: "/observatory",
        match: "neural",
        search: { scene: "neural", ticker: "SPY" },
      },
    ],
  },
  {
    title: "World",
    items: [
      { key: "F9", label: "God's Eye", to: "/globe" },
      { key: "", label: "Dynamics", to: "/dynamics" },
      { key: "", label: "Risk", to: "/risk" },
    ],
  },
];
const ALL = NAV_GROUPS.flatMap((g) => g.items);

/** Live UTC time, rendered only after mount so server and client markup agree. */
function UtcClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="shell-clock" aria-label="UTC time">
      {now ? now.toISOString().slice(11, 19) : "--:--:--"}
      <small>UTC</small>
    </span>
  );
}

/** The FinSight mark: three layers of units, wired, pulsing toward the output. */
function Mark() {
  return (
    <svg className="shell-mark" viewBox="0 0 32 32" aria-hidden="true">
      <g className="w">
        {[8, 16, 24].flatMap((y1) =>
          [11, 21].map((y2) => <line key={`a${y1}${y2}`} x1="6" y1={y1} x2="16" y2={y2} />),
        )}
        {[11, 21].map((y) => (
          <line key={`b${y}`} x1="16" y1={y} x2="26" y2="16" />
        ))}
      </g>
      {[8, 16, 24].map((y) => (
        <circle key={`i${y}`} cx="6" cy={y} r="2" className="n" />
      ))}
      {[11, 21].map((y) => (
        <circle key={`h${y}`} cx="16" cy={y} r="2.2" className="n h" />
      ))}
      <circle cx="26" cy="16" r="2.8" className="n o" />
    </svg>
  );
}

/** `bleed` gives the page the whole viewport below the nav: no gutters, no footer. */
export function ForgeShell({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const scene = useRouterState({
    select: (state) => (state.location.search as { scene?: string }).scene,
  });
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
      const item = ALL.find((entry) => entry.key && entry.key === event.key);
      if (item) {
        event.preventDefault();
        void navigate({ to: item.to, search: item.search as never });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const isActive = (item: NavItem) => {
    if (item.to === "/observatory")
      return (
        pathname.startsWith("/observatory") && (item.match === "neural") === (scene === "neural")
      );
    return item.to === "/forge" ? pathname === item.to : pathname.startsWith(item.to);
  };

  return (
    <div className={`shell ${bleed ? "shell-bleed" : ""}`}>
      <a href="#forge-main" className="shell-skip">
        Skip to evidence
      </a>
      {!bleed && <div className="shell-backdrop" aria-hidden="true" />}
      <header className="shell-bar">
        <Link to="/" className="shell-brand" aria-label="FinSight home">
          <Mark />
          <span>
            FINSIGHT <b>FORGE</b>
          </span>
        </Link>
        <nav aria-label="Primary" className="shell-nav">
          <button type="button" className="shell-cmd" onClick={() => setPaletteOpen(true)}>
            <kbd>F1</kbd>Command
          </button>
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="shell-group" role="group" aria-label={group.title}>
              <span className="shell-group-title" aria-hidden="true">
                {group.title}
              </span>
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    search={item.search as never}
                    aria-current={active ? "page" : undefined}
                    className="shell-link"
                  >
                    {item.key && <kbd>{item.key}</kbd>}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="shell-right">
          <UtcClock />
          <button
            type="button"
            className="shell-k"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <span aria-hidden="true">⌘</span>K
          </button>
        </div>
        <i className="shell-signal" aria-hidden="true" />
      </header>
      <main id="forge-main" tabIndex={-1} className={bleed ? "shell-main-bleed" : "shell-main"}>
        {children}
      </main>
      {!bleed && (
        <footer className="shell-foot">
          <span>Observer foundation · read-only</span>
          <span>Unknown schemas fail closed</span>
        </footer>
      )}
      <ForgeCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
