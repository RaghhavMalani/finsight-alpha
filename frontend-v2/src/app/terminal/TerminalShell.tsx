import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { CommandLine } from "../command/CommandLine";
import type { ForgeCommandPalette } from "../command/ForgeCommandPalette";
import { FUNCTION_KEYS, isTextField, WORKSPACES } from "../workspaces";
import { changeDataMode, localLiveAllowed, setCurrentTicker, useDataMode } from "../../replay/mode";
import type { ReplayManifest } from "../../replay/contracts";
import {
  ContextError,
  defaultContext,
  contextQuery,
  safeParseInvestigationContext,
  serializeInvestigationContext,
  subjectTicker,
  workspaceOf,
  type Market,
  type InvestigationContext,
  type InvestigationView,
  type TerminalWorkspace,
} from "./context";
import { adaptContext, type ContextBindings, type ContextCompatibility } from "./compatibility";
import { buildInvestigationTarget, targetHref, type InvestigationTarget } from "./links";
import type { VerifiedSelection } from "./ContextBar";
import "../shell/shell.css";
import "./terminal.css";

export type { VerifiedSelection } from "./ContextBar";
export type HistoryChange = "push" | "replace";
type ViewPatch = InvestigationView extends infer V
  ? V extends InvestigationView
    ? Partial<Omit<V, "workspace">>
    : never
  : never;
type EnrichContext = (context: InvestigationContext) => InvestigationContext;
type Registration = {
  key: string;
  bindings: ContextBindings;
  selection?: VerifiedSelection;
  enrich?: EnrichContext;
};
export type TerminalInvestigation = {
  context: InvestigationContext;
  compatibility: ContextCompatibility;
  error: string | null;
  key: string;
  navigationContext: InvestigationContext;
  updateContext: (next: InvestigationContext, history?: HistoryChange) => void;
  updateView: (patch: ViewPatch, history?: HistoryChange) => void;
  target: (workspace: TerminalWorkspace, view?: InvestigationView) => InvestigationTarget;
  openTarget: (target: InvestigationTarget, history?: HistoryChange) => void;
  registerBindings: (
    bindings: ContextBindings,
    selection?: VerifiedSelection,
    enrich?: EnrichContext,
  ) => () => void;
};
const InvestigationProvider = createContext<TerminalInvestigation | null>(null);
const NO_BINDINGS: ContextBindings = {};
const noopRegistration = () => () => undefined;

// Start normalizes query escapes before building its server history. Read the request only on the server.
export const requestSearch = createIsomorphicFn()
  .server(() => new URL(getRequest().url).search)
  .client(() => undefined);

function useRouteInvestigation() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  // TanStack owns history. Read its original wire query so malformed escapes cannot be normalized away.
  const rawSearch = requestSearch() ?? router.history.location.search ?? location.searchStr;
  const params = useParams({ strict: false }) as { ticker?: string; runId?: string };
  const navigate = useNavigate();
  const workspace = workspaceOf(pathname) ?? "market";
  const parsed = useMemo(() => {
    // Validate the raw URL before URLSearchParams can normalize malformed escapes or duplicate keys.
    const initial = safeParseInvestigationContext(workspace, rawSearch);
    if (!initial.ok) return initial;
    const query = new URLSearchParams(rawSearch);
    if (params.ticker) {
      const pathIdentity = safeParseInvestigationContext(workspace, { ticker: params.ticker });
      if (!pathIdentity.ok) return pathIdentity;
      if (
        initial.context.subject &&
        JSON.stringify(initial.context.subject) !== JSON.stringify(pathIdentity.context.subject)
      )
        return {
          ok: false as const,
          error: new ContextError(
            "ROUTE_CONTRADICTION",
            "The path and investigation identify different subjects.",
          ),
        };
      if (!query.has("ticker") && !query.has("subject")) query.set("ticker", params.ticker);
    }
    if (workspace === "agents" && params.runId) {
      if (
        initial.context.view.workspace === "agents" &&
        initial.context.view.runId &&
        initial.context.view.runId !== params.runId
      )
        return {
          ok: false as const,
          error: new ContextError(
            "ROUTE_CONTRADICTION",
            "The path and investigation identify different recorded runs.",
          ),
        };
      if (!query.has("run")) query.set("run", params.runId);
    }
    return safeParseInvestigationContext(workspace, query.toString());
  }, [workspace, rawSearch, params.ticker, params.runId]);
  const context = useMemo(
    () => (parsed.ok ? parsed.context : defaultContext(workspace)),
    [parsed, workspace],
  );
  const key = pathname + "?" + rawSearch;
  const updateContext = useCallback(
    (next: InvestigationContext, history: HistoryChange = "push") => {
      if (next.view.workspace !== workspace)
        throw new Error("Use a typed target to change workspace.");
      const search = serializeInvestigationContext(next);
      void navigate({
        to: pathname as never,
        search: search as never,
        replace: history === "replace",
      });
    },
    [navigate, pathname, workspace],
  );
  const updateView = useCallback(
    (patch: ViewPatch, history: HistoryChange = "push") => {
      if ("workspace" in patch) throw new Error("A view update cannot change its workspace.");
      updateContext(
        { ...context, view: { ...context.view, ...patch } as InvestigationView },
        history,
      );
    },
    [context, updateContext],
  );
  const openTarget = useCallback(
    (next: InvestigationTarget, history: HistoryChange = "push") => {
      targetHref(next);
      void navigate({
        to: next.to as never,
        search: next.search as never,
        replace: history === "replace",
      });
    },
    [navigate],
  );
  return {
    context,
    error: parsed.ok ? null : parsed.error.message,
    key,
    updateContext,
    updateView,
    openTarget,
  };
}

/** Also works in legacy frozen wrappers; absence of the new provider never throws. */
export function useInvestigation(): TerminalInvestigation {
  const inherited = useContext(InvestigationProvider);
  const route = useRouteInvestigation();
  return useMemo(
    () =>
      inherited ?? {
        ...route,
        compatibility: adaptContext(route.context, route.context.view.workspace),
        navigationContext: route.context,
        target: (workspace, view) => buildInvestigationTarget(route.context, workspace, view),
        registerBindings: noopRegistration,
      },
    [inherited, route],
  );
}

type Snapshot = Pick<ReplayManifest, "artifacts"> & { as_of: string; basis?: string };
/** Closed navigation metadata only; this never verifies or fetches an original evidence payload. */
export async function validateNavigationSeed(value: unknown): Promise<Snapshot> {
  const module = await import("./ContextBar");
  return module.validateNavigationSeed(value);
}

async function loadNavigationSeed(): Promise<Snapshot> {
  const { navigationSeed } = await import("./generated/seed.generated.ts");
  return validateNavigationSeed(navigationSeed);
}
function PaletteLoading({ message, onClose }: { message?: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/70 px-4 pt-[8vh]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Terminal command"
        aria-busy={!message}
        className="w-full max-w-3xl border border-[#3b4651] bg-[#0B0D10] p-4"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            event.preventDefault();
            close.current?.focus();
          }
        }}
      >
        <p role={message ? "alert" : "status"}>
          {message ? "Command palette unavailable: " + message : "Loading terminal commands…"}
        </p>
        <button type="button" ref={close} onClick={onClose}>
          Close · Esc
        </button>
      </section>
    </div>
  );
}

const AGENT_PAGES = [
  ["Center", "/forge"],
  ["Runs", "/runs"],
  ["Bench", "/bench"],
  ["Worlds", "/worlds"],
  ["Artifacts", "/artifacts"],
] as const;

export function TerminalShell({
  children,
  bleed = false,
  loadManifest = loadNavigationSeed,
}: {
  children: ReactNode;
  bleed?: boolean;
  loadManifest?: () => Promise<Snapshot>;
}) {
  const route = useRouteInvestigation();
  const [registration, setRegistration] = useState<Registration>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [Palette, setPalette] = useState<typeof ForgeCommandPalette>();
  const [paletteError, setPaletteError] = useState<string>();
  const paletteRestore = useRef<HTMLElement | null>(null);
  const openPalette = useCallback(() => {
    if (paletteOpen) return;
    paletteRestore.current = document.activeElement as HTMLElement | null;
    setPaletteError(undefined);
    setPaletteOpen(true);
  }, [paletteOpen]);
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    queueMicrotask(() => paletteRestore.current?.focus());
  }, []);
  useEffect(() => {
    if (!paletteOpen || Palette) return;
    let active = true;
    import("../command/ForgeCommandPalette")
      .then((module) => {
        if (active) setPalette(() => module.ForgeCommandPalette);
      })
      .catch((error: unknown) => {
        if (active)
          setPaletteError(error instanceof Error ? error.message : "Command palette unavailable.");
      });
    return () => {
      active = false;
    };
  }, [paletteOpen, Palette]);
  const [ready, setReady] = useState(false);
  const [liveAllowed, setLiveAllowed] = useState(false);
  const [copyState, setCopyState] = useState("");
  const mode = useDataMode();
  const client = useQueryClient();
  const active = registration?.key === route.key ? registration : undefined;
  useEffect(() => {
    setReady(true);
    setLiveAllowed(localLiveAllowed());
  }, []);
  useEffect(() => {
    const ticker = subjectTicker(route.context.subject);
    if (ticker) setCurrentTicker(ticker);
  }, [route.context.subject]);
  useEffect(() => {
    let alive = true;
    setSnapshot(undefined);
    setSnapshotError(null);
    loadManifest()
      .then((value) => {
        if (alive) setSnapshot(value);
      })
      .catch((e: unknown) => {
        if (alive)
          setSnapshotError(e instanceof Error ? e.message : "Navigation metadata unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [loadManifest]);
  const bindings = useMemo<ContextBindings>(
    () => ({
      ...active?.bindings,
      resolveArtifact: (id) => {
        const verified = active?.bindings.resolveArtifact?.(id) ?? active?.bindings.artifacts?.[id];
        if (verified) return verified;
        const entry = snapshot?.artifacts[id];
        if (!entry) return undefined;
        const india = entry.sources.some((s) => /^(?:iima|IIMA)/.test(s));
        const us = entry.sources.some((s) => /^(?:ken-french|Ken French)/.test(s));
        return {
          status: entry.status,
          ...(india !== us ? { market: india ? ("INDIA" as const) : ("US" as const) } : {}),
          kind: entry.kind,
        };
      },
    }),
    [active, snapshot],
  );
  const compatibility = useMemo(
    () => adaptContext(route.context, route.context.view.workspace, bindings),
    [route.context, bindings],
  );
  const registerBindings = useCallback(
    (next: ContextBindings, selection?: VerifiedSelection, enrich?: EnrichContext) => {
      const item: Registration = { key: route.key, bindings: next, selection, enrich };
      setRegistration(item);
      return () => setRegistration((current) => (current === item ? undefined : current));
    },
    [route.key],
  );
  const navigationContext = useMemo(() => {
    if (!active?.enrich) return route.context;
    const next = active.enrich(route.context);
    serializeInvestigationContext(next);
    if (next.view.workspace !== route.context.view.workspace)
      throw new Error("A source adapter cannot change workspace.");
    return next;
  }, [active, route.context]);
  const target = useCallback(
    (workspace: TerminalWorkspace, view?: InvestigationView) =>
      buildInvestigationTarget(navigationContext, workspace, view),
    [navigationContext],
  );
  const value = useMemo<TerminalInvestigation>(
    () => ({ ...route, compatibility, navigationContext, target, registerBindings }),
    [route, compatibility, navigationContext, target, registerBindings],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (
        route.error ||
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
      const destination = WORKSPACES.find((w) => w.key === event.key);
      if (destination) {
        event.preventDefault();
        route.openTarget(target(destination.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, target, openPalette]);
  const workspace = route.context.view.workspace;
  const copyLink = async () => {
    try {
      const href = targetHref(target(workspace));
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      setCopyState("Investigation link copied");
    } catch {
      setCopyState("Copy unavailable; use the address bar");
    }
  };
  return (
    <InvestigationProvider value={value}>
      <div
        className={`shell terminal-shell ${bleed ? "shell-bleed" : ""}`}
        data-testid="terminal-shell"
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
            {WORKSPACES.map((w) => {
              const next = target(w.id);
              return (
                <Link
                  key={w.id}
                  to={next.to as never}
                  search={next.search as never}
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
              );
            })}
          </nav>
          <button
            type="button"
            className="shell-k"
            onClick={openPalette}
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
            aria-label="Open command palette"
          >
            <kbd>⌘K / Ctrl K</kbd>
          </button>
        </header>
        <div className="shell-controls">
          <CommandLine />
          <ContextBar
            context={route.context}
            compatibility={compatibility}
            selection={active?.selection}
            publication={snapshot?.as_of}
            basis={snapshot?.basis ?? "Checked bounded manifest"}
            mode={mode}
            liveAllowed={liveAllowed}
            changeMode={(next) => void changeDataMode(next, client)}
            adoptContext={route.updateContext}
            copyLink={() => void copyLink()}
            copyState={copyState}
            invalid={!!route.error}
          />
        </div>
        {workspace === "agents" && (
          <nav className="shell-subnav" aria-label="Agents sections">
            {AGENT_PAGES.map(([label, to]) => (
              <Link
                key={to}
                to={to}
                search={serializeInvestigationContext(navigationContext) as never}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <main id="forge-main" tabIndex={-1} className={bleed ? "shell-main-bleed" : "shell-main"}>
          {!route.error && compatibility.reasons.length > 0 && (
            <p className="terminal-compatibility" role="status">
              CONTEXT NOT APPLICABLE ·{" "}
              {compatibility.reasons
                .map((r) => r.field)
                .filter((field, i, all) => all.indexOf(field) === i)
                .join(", ")}{" "}
              preserved. Open Evidence / context for exact reasons and explicit choices.
            </p>
          )}
          {route.error ? (
            <section className="terminal-notice" role="alert">
              <h1>CONTEXT NOT APPLICABLE</h1>
              <p>{route.error}</p>
              <button onClick={() => route.updateContext(defaultContext(workspace))}>
                Clear invalid selection
              </button>
            </section>
          ) : (
            children
          )}
          {snapshotError && (
            <p className="terminal-notice" role="status">
              Navigation metadata unavailable: {snapshotError}. No replacement evidence was
              selected.
            </p>
          )}
        </main>
        {!bleed && (
          <footer className="shell-foot">
            <span>
              {mode === "replay"
                ? "PUBLIC REPLAY · retained derived evidence"
                : "LOCAL LIVE · configured installation"}
            </span>
            <span>Source, clocks and limitations stay with each selection</span>
          </footer>
        )}
        {paletteOpen &&
          (Palette ? (
            <Palette open onClose={closePalette} returnFocus={paletteRestore.current} />
          ) : (
            <PaletteLoading message={paletteError} onClose={closePalette} />
          ))}
      </div>
    </InvestigationProvider>
  );
}

function ContextBar({
  context,
  compatibility,
  selection,
  publication,
  basis,
  mode,
  liveAllowed,
  changeMode,
  adoptContext,
  copyLink,
  copyState,
  invalid,
}: {
  context: InvestigationContext;
  compatibility: ContextCompatibility;
  selection?: VerifiedSelection;
  publication?: string;
  basis: string;
  mode: "replay" | "live";
  liveAllowed: boolean;
  changeMode: (mode: "replay" | "live") => void;
  adoptContext: (context: InvestigationContext) => void;
  copyLink: () => void;
  copyState: string;
  invalid: boolean;
}) {
  const adopt = (market: Market) =>
    adoptContext({
      ...defaultContext(context.view.workspace, market),
      subject: { kind: "market-factor", id: market === "INDIA" ? "IN-MKT" : "US-MKT" },
      ...(context.origin
        ? { origin: context.origin }
        : context.anchor
          ? { origin: { kind: "artifact", artifactId: context.anchor.artifactId } as const }
          : {}),
    });
  const subject = context.subject;
  const origin = context.origin;
  const originId =
    origin?.kind === "risk-issue"
      ? origin.issueId
      : origin?.kind === "artifact"
        ? origin.artifactId
        : origin?.entityId;
  return (
    <div className="terminal-context-wrap">
      <div className="terminal-context" role="region" aria-label="Investigation context">
        <span className="terminal-subject shell-instrument">
          <b>{subjectTicker(subject) ?? context.market ?? "All markets"}</b>
          <span>
            {subject?.kind === "market-factor"
              ? "market factor, not a ticker"
              : subject?.kind === "reference-listing"
                ? `${subject.venue} · reference listing`
                : (context.market ?? "No subject selected")}
          </span>
        </span>
        <div className="shell-mode" role="group" aria-label="Data mode">
          <button
            type="button"
            aria-pressed={mode === "replay"}
            onClick={() => changeMode("replay")}
          >
            Replay
          </button>
          <button
            type="button"
            aria-pressed={mode === "live"}
            disabled={!liveAllowed}
            title="Local installation with configured backend credentials"
            onClick={() => changeMode("live")}
          >
            Local Live
          </button>
        </div>
        {selection?.clocks.slice(0, 2).map((clock) => (
          <span key={clock.label} className="terminal-clock">
            <span>{clock.label}</span>
            <b>{clock.value}</b>
          </span>
        ))}
        <details className="terminal-context-detail">
          <summary>
            Evidence / context
            {compatibility.reasons.length ? ` · ${compatibility.reasons.length} notices` : ""}
          </summary>
          <div>
            {context.anchor && (
              <p>
                Requested anchor <code>{context.anchor.artifactId}</code>
              </p>
            )}
            {selection && (
              <p>
                Verified selection <code>{selection.artifactId}</code>
              </p>
            )}
            {selection?.clocks.map((clock) => (
              <p key={clock.label}>
                <b>{clock.label}:</b> {clock.value}
              </p>
            ))}
            <p>
              Manifest publication: {publication ?? "Verifying bounded navigation metadata…"} ·{" "}
              {basis}
            </p>
            {context.observationDate && (
              <p>
                Observation date: {context.observationDate} · only exact compatible dated points may
                apply it.
              </p>
            )}
            {originId && (
              <p>
                Investigation origin <code>{originId}</code>
                {compatibility.parked.origin ? " · not verified for an enabled link" : ""}
              </p>
            )}
            {selection?.limitations?.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {compatibility.reasons.length > 0 && (
              <div role="status">
                <b>CONTEXT NOT APPLICABLE</b>
                {compatibility.reasons.map((reason, i) => (
                  <p key={reason.code + i}>
                    {reason.field}: {reason.message}
                  </p>
                ))}
              </div>
            )}
            <div className="terminal-adopt">
              <button onClick={() => adopt("US")}>Open US market factor</button>
              <button onClick={() => adopt("INDIA")}>Open India market factor</button>
            </div>
          </div>
        </details>
        <button type="button" className="terminal-copy" disabled={invalid} onClick={copyLink}>
          {copyState || "Copy investigation link"}
        </button>
      </div>
      <span className="sr-only" role="status">
        {copyState}
      </span>
    </div>
  );
}
