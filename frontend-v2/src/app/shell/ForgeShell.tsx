import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ForgeCommandPalette } from "@/app/command/ForgeCommandPalette";
import { CommandLine } from "@/app/command/CommandLine";
import { activeWorkspace, FUNCTION_KEYS, isTextField, WORKSPACES } from "@/app/workspaces";
import { lookupInstrument } from "@/markets/instruments";
import { factorSeries } from "@/replay/factor-series";
import {
  changeDataMode,
  localLiveAllowed,
  setCurrentTicker,
  useCurrentTicker,
  useDataMode,
} from "@/replay/mode";
import { loadReplayManifest } from "@/replay/client";
import "./shell.css";

const AGENT_PAGES = [
  ["Center", "/forge"],
  ["Runs", "/runs"],
  ["Bench", "/bench"],
  ["Worlds", "/worlds"],
  ["Artifacts", "/artifacts"],
] as const;

export function ForgeShell({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [liveAllowed, setLiveAllowed] = useState(false);
  const [ready, setReady] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as { ticker?: string } });
  const params = useParams({ strict: false }) as { ticker?: string };
  const context = useCurrentTicker();
  const ticker = params.ticker ?? search.ticker ?? context;
  const asset = lookupInstrument(ticker);
  const series = factorSeries(ticker);
  const workspace = activeWorkspace(pathname);
  const mode = useDataMode();
  const client = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    setLiveAllowed(localLiveAllowed());
    setReady(true);
  }, []);
  useEffect(() => {
    setCurrentTicker(ticker);
  }, [ticker]);
  useEffect(() => {
    let alive = true;
    loadReplayManifest()
      .then((m) => {
        if (alive) setCutoff(m.as_of);
      })
      .catch(() => {
        if (alive) setCutoff(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (
        isTextField(event.target) ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.isComposing ||
        event.repeat ||
        !FUNCTION_KEYS.includes(event.key)
      )
        return;
      const target = WORKSPACES.find((w) => w.key === event.key);
      if (target) {
        event.preventDefault();
        void navigate({ to: target.to, search: { ticker } as never });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, ticker]);
  return (
    <div
      className={`shell ${bleed ? "shell-bleed" : ""}`}
      data-mode={mode}
      data-workspace={workspace}
      data-ready={ready}
    >
      <a href="#forge-main" className="shell-skip">
        Skip to workspace
      </a>
      <header className="shell-bar">
        <Link to="/" className="shell-brand" aria-label="FinSight home">
          <span className="shell-mark" aria-hidden="true">
            F
          </span>
          <b>FinSight</b>
        </Link>
        <nav aria-label="Workspaces" className="shell-nav">
          {WORKSPACES.map((w) => (
            <Link
              key={w.id}
              to={w.to}
              search={{ ticker } as never}
              className="shell-link"
              aria-current={workspace === w.id ? "page" : undefined}
              title={
                FUNCTION_KEYS.includes(w.key)
                  ? `${w.key} · ${w.command}`
                  : `${w.key} belongs to the browser; use ${w.command} or click`
              }
            >
              <kbd aria-hidden="true">{w.key}</kbd>
              <span>{w.label}</span>
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="shell-k"
          onClick={() => setPaletteOpen(true)}
          aria-label="Open command palette"
        >
          <kbd>⌘K / Ctrl K</kbd>
        </button>
      </header>
      <div className="shell-controls">
        <CommandLine />
        <div className="shell-context">
          <span className="shell-instrument">
            <b>{asset?.symbol ?? ticker}</b>
            <span>
              {asset
                ? `${asset.code} · ${asset.exchange} · ${asset.currency}`
                : series
                  ? `${series.country} · market factor, not a ticker`
                  : "Listing metadata unavailable"}
            </span>
          </span>
          <div className="shell-mode" role="group" aria-label="Data mode">
            <button
              type="button"
              aria-pressed={mode === "replay"}
              onClick={() => void changeDataMode("replay", client)}
            >
              Replay
            </button>
            <button
              type="button"
              aria-pressed={mode === "live"}
              disabled={!liveAllowed}
              title="Local installation with configured backend credentials"
              onClick={() => void changeDataMode("live", client)}
            >
              Local Live
            </button>
          </div>
          <span className="shell-cutoff">
            {mode === "replay"
              ? cutoff
                ? `Artifact cutoff ${cutoff.replace("T", " ").replace("Z", " UTC")}`
                : "Loading checked manifest…"
              : "Local API · credentials stay on your server"}
          </span>
        </div>
      </div>
      {workspace === "agents" && (
        <nav className="shell-subnav" aria-label="Agents sections">
          {AGENT_PAGES.map(([label, to]) => (
            <Link
              key={to}
              to={to}
              search={{ ticker } as never}
              aria-current={pathname === to || pathname.startsWith(`${to}/`) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <main id="forge-main" tabIndex={-1} className={bleed ? "shell-main-bleed" : "shell-main"}>
        {children}
      </main>
      {!bleed && (
        <footer className="shell-foot">
          <span>
            {mode === "replay"
              ? "Checked derived artifacts · anonymous access"
              : "Local Live · source and timestamp on every response"}
          </span>
          <span>Unknown or unlicensed evidence stays unavailable</span>
        </footer>
      )}
      <ForgeCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
