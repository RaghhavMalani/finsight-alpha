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
  type InvestigationContext,
  type InvestigationView,
  type TerminalWorkspace,
} from "./context";
import { adaptContext, type ContextBindings, type ContextCompatibility } from "./compatibility";
import { buildInvestigationTarget, targetHref, type InvestigationTarget } from "./links";
import { ContextBar, type VerifiedSelection } from "./ContextBar";
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
  const object = (value: unknown, keys: readonly string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new Error("Navigation seed contains an undeclared or missing field.");
    return value as Record<string, unknown>;
  };
  const text = (v: unknown, max = 4096): v is string =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= max &&
    ![...v].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
  const stable = (v: unknown) =>
    JSON.stringify(v, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : item,
    );
  if (new TextEncoder().encode(JSON.stringify(value)).length > 48 * 1024)
    throw new Error("Navigation seed byte bound exceeded.");
  const seed = object(value, [
    "schema_version",
    "generator_contract",
    "manifestBinding",
    "bindings",
    "payloadDigest",
  ]);
  const manifest = object(seed.manifestBinding, ["sha256", "bytes", "asOf"]);
  if (
    seed.schema_version !== "terminal-navigation-seed/1" ||
    seed.generator_contract !== "terminal-generator/1" ||
    !hash(seed.payloadDigest) ||
    !hash(manifest.sha256) ||
    !Number.isSafeInteger(manifest.bytes) ||
    Number(manifest.bytes) <= 0 ||
    Number(manifest.bytes) > 2 * 1024 * 1024 ||
    !date(manifest.asOf)
  )
    throw new Error("Navigation seed identity or source binding is invalid.");
  const bindings = object(seed.bindings, ["market:IN-MKT", "market:US-MKT"]);
  for (const [id, entry] of Object.entries(bindings)) {
    const india = id === "market:IN-MKT";
    const r = object(entry, [
      "status",
      "kind",
      "url",
      "sha256",
      "bytes",
      "sources",
      "licence",
      "input_hash",
      "as_of",
      "observed_at",
      "available_at",
      "reason",
      "scope",
    ]);
    const licence = object(r.licence, [
      "status",
      "permitted_uses",
      "dataset_key",
      "valid_through",
      "attribution",
      "source_urls",
      "terms_url",
      "basis",
    ]);
    if (
      r.status !== "AVAILABLE" ||
      r.kind !== "market-series" ||
      r.scope !== "FACTOR_RESEARCH" ||
      r.url !== "/artifacts/replay/market-" + id.slice(7) + ".json" ||
      !Array.isArray(r.sources) ||
      r.sources.length !== 1 ||
      r.sources[0] !== (india ? "IIMA" : "KENNETH_FRENCH") ||
      licence.dataset_key !== (india ? "iima:daily-factors" : "ken-french:daily-factors") ||
      !text(r.url) ||
      !/^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(r.url) ||
      !hash(r.sha256) ||
      !hash(r.input_hash) ||
      !Number.isSafeInteger(r.bytes) ||
      Number(r.bytes) <= 0 ||
      Number(r.bytes) > 16 * 1024 * 1024 ||
      !Array.isArray(r.sources) ||
      !r.sources.length ||
      !r.sources.every((source) => text(source, 160)) ||
      !date(r.as_of) ||
      !date(r.observed_at) ||
      !date(r.available_at) ||
      r.reason !== null ||
      !["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN", "TEST_ONLY"].includes(String(licence.status)) ||
      !Array.isArray(licence.permitted_uses) ||
      !licence.permitted_uses.every((use) => text(use)) ||
      !licence.permitted_uses.includes("publish_derived") ||
      !text(licence.dataset_key) ||
      !text(licence.attribution) ||
      !text(licence.basis) ||
      !text(licence.terms_url) ||
      !Array.isArray(licence.source_urls) ||
      !licence.source_urls.length ||
      !licence.source_urls.every((url) => text(url)) ||
      (licence.valid_through !== null &&
        (!date(licence.valid_through) ||
          Date.parse(String(licence.valid_through)) <= Date.parse(String(r.as_of))))
    )
      throw new Error("Navigation source is not an available admitted public derivative.");
  }
  const seal = {
    schema_version: seed.schema_version,
    generator_contract: seed.generator_contract,
    manifestBinding: manifest,
    bindings,
  };
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(seal)))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== seed.payloadDigest) throw new Error("Navigation seed digest mismatch.");
  return {
    artifacts: bindings as Snapshot["artifacts"],
    as_of: String(manifest.asOf),
    basis: "Build-verified navigation seed",
  };
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
