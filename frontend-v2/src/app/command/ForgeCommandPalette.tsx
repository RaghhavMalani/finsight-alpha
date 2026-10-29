import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { WORKSPACES } from "@/app/workspaces";
import { parseLegacyCommand } from "./mnemonics";
import { useInvestigation } from "../terminal/TerminalShell";
import { targetHref, type InvestigationTarget } from "../terminal/links";
import type { CommandResolution, LegacyMarketNavigation } from "../terminal/commands";
import type { Capability } from "../terminal/capabilities";
import { localLiveAllowed, setCurrentTicker, useDataMode } from "@/replay/mode";
import { subjectTicker } from "../terminal/context";

type Item = {
  key: string;
  label: string;
  detail: string;
  target?: InvestigationTarget;
  legacy?: LegacyMarketNavigation;
  capability?: Capability;
  choices?: Item[];
};
const href = (item: Item) =>
  item.target
    ? targetHref(item.target)
    : item.legacy
      ? item.legacy.to + "?" + new URLSearchParams(item.legacy.search).toString()
      : undefined;
function resolutionItems(result: CommandResolution, query: string): Item[] {
  const workspace = WORKSPACES.find((w) =>
    [w.command, w.label].includes(query.trim().toUpperCase() as never),
  );
  const label = workspace ? `${workspace.key} · ${workspace.label}` : `GO · ${query.trim()}`;
  if (result.status === "READY")
    return [
      {
        key: "command",
        label,
        detail: result.note ?? result.capability.reason,
        target: result.target,
        capability: result.capability,
      },
    ];
  if (result.status === "LEGACY_READY")
    return [
      {
        key: "command",
        label,
        detail: result.note,
        legacy: result.navigation,
        capability: result.capability,
      },
    ];
  return result.choices.map((choice, index) => ({
    key: `command-choice-${index}`,
    label: choice.label,
    detail: [
      choice.cutoff ? `Retained selection time ${choice.cutoff}` : "",
      choice.artifactId ?? "",
      choice.reason ?? "",
    ]
      .filter(Boolean)
      .join(" · "),
    target: choice.target,
  }));
}
export function ForgeCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const investigation = useInvestigation();
  const navigate = useNavigate();
  const mode = useDataMode();
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Item[]>();
  const [acceptedScope, setAcceptedScope] = useState("");
  const scopeKey = JSON.stringify([
    open,
    query,
    history,
    investigation.key,
    investigation.navigationContext,
    mode,
  ]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setHistory(false);
    setActive(0);
    setChoices(undefined);
    setItems([]);
    setBusy(true);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      restoreRef.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    setMessage("");
    setItems([]);
    setChoices(undefined);
    setActive(0);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (investigation.error) throw new Error(investigation.error);
          const [{ terminalSearch }, { resolveTerminalCommand }] = await Promise.all([
            import("../terminal/search"),
            import("../terminal/commands"),
          ]);
          const response = await terminalSearch.search(query, investigation.navigationContext, {
            history,
            limit: 30,
            signal: controller.signal,
            ...(!query.trim()
              ? { workspaces: ["observatory"] as const, types: ["workspace"] }
              : {}),
          });
          if (controller.signal.aborted) return;
          const catalog = terminalSearch.catalog();
          const resolve = (text: string) =>
            resolveTerminalCommand(text, investigation.navigationContext, {
              ...catalog,
              legacyParser: parseLegacyCommand,
              environment: {
                hostname: window.location.hostname,
                localLiveFlag: localLiveAllowed(),
                mode,
              },
            });
          const command = query.trim() ? resolve(query) : undefined;
          const commandItems = command ? resolutionItems(command, query) : [];
          const searchItems: Item[] = response.results.map((result) => {
            const workspace =
              result.type === "workspace" ? WORKSPACES.find((w) => w.id === result.id) : undefined;
            // Workspace labels are presentation; all destinations still use the shared resolver.
            const resolved = workspace ? resolve(workspace.command) : undefined;
            const explicit = resolved ? resolutionItems(resolved, workspace!.command) : [];
            const target = resolved?.status === "READY" ? resolved.target : undefined;
            const capability =
              resolved?.status === "READY" ? resolved.capability : result.capability;
            const detail =
              resolved && (resolved.status === "CHOOSE" || resolved.status === "REJECTED")
                ? `${resolved.reason} ${resolved.correction}`
                : `${result.kind.toUpperCase()} · ${capability.label} · ${result.market ?? "No market filter"}${result.cutoff ? ` · Retained selection time ${result.cutoff}` : ""} · ${capability.reason}`;
            return {
              key: result.key,
              label: workspace ? `${workspace.key} · ${workspace.label}` : result.label,
              detail,
              ...(workspace
                ? target
                  ? { target }
                  : { choices: explicit }
                : { target: result.target }),
              capability,
              ...(!workspace && result.requiresChoice
                ? {
                    choices: result.choices.map((choice) => ({
                      key: choice.key,
                      label: result.label,
                      detail: `${choice.market ?? result.market ?? "No market"} · ${choice.cutoff ?? "No selected clock"} · ${choice.artifactId ?? "Reference identity"}`,
                      target: choice.target,
                    })),
                  }
                : {}),
            };
          });
          const seen = new Set<string>();
          const merged = [...commandItems, ...searchItems].filter((item) => {
            const key = href(item) ?? item.key;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setItems(merged);
          setActive(0);
          setAcceptedScope(scopeKey);
          setMessage(
            command && (command.status === "CHOOSE" || command.status === "REJECTED")
              ? `${command.reason} ${command.correction}`
              : response.limited
                ? `${response.total} matching identities; showing ${response.results.length}. Refine the query to see other results.`
                : "Reference identities do not imply evidence coverage. Clocks belong to each exact selection.",
          );
        } catch (error) {
          if (
            !controller.signal.aborted &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            setItems([]);
            setAcceptedScope(scopeKey);
            setMessage(error instanceof Error ? error.message : "Navigation metadata unavailable.");
          }
        } finally {
          if (!controller.signal.aborted) setBusy(false);
        }
      })();
    }, 80);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, history, investigation.navigationContext, investigation.error, mode, scopeKey]);
  const shown = acceptedScope === scopeKey ? (choices ?? items) : [];
  useEffect(() => {
    dialogRef.current
      ?.querySelector(`[id="forge-command-${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items, choices]);
  useEffect(() => {
    if (open && !dialogRef.current?.contains(document.activeElement)) inputRef.current?.focus();
  }, [open, items, choices]);
  const execute = (item: Item) => {
    if (busy || acceptedScope !== scopeKey) return;
    if (item.choices?.length) {
      setChoices(item.choices);
      setActive(0);
      setMessage("Choose an exact retained artifact and its own clock. No cutoff was substituted.");
      return;
    }
    if (item.target) {
      const ticker = subjectTicker(item.target.context.subject);
      if (ticker) setCurrentTicker(ticker);
      investigation.openTarget(item.target);
      onClose();
    } else if (item.legacy) {
      const ticker = subjectTicker(item.legacy.context.subject);
      if (ticker) setCurrentTicker(ticker);
      void navigate({ to: item.legacy.to, search: item.legacy.search as never });
      onClose();
    }
  };
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start bg-black/70 px-4 pt-[8vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forge-command-title"
        className="w-full max-w-3xl border border-[#3b4651] bg-[#0B0D10] shadow-xl"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            if (choices) {
              setChoices(undefined);
              setActive(0);
            } else onClose();
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            setActive((index) =>
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? Math.max(0, shown.length - 1)
                  : Math.max(
                      0,
                      Math.min(shown.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
                    ),
            );
            return;
          }
          if (event.key === "Enter" && event.target === inputRef.current && shown[active]) {
            event.preventDefault();
            execute(shown[active]);
            return;
          }
          if (event.key === "Tab") {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              'input, button:not([disabled]), a[href], [tabindex="0"]',
            );
            if (!focusable?.length) return;
            const first = focusable[0],
              last = focusable[focusable.length - 1];
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
        <header className="flex items-center justify-between border-b border-[#1D232B] px-4 py-3">
          <div>
            <h2 id="forge-command-title" className="font-mono text-sm text-[#F0A929]">
              Terminal command
            </h2>
            <p className="text-xs text-[#a6afb8]">
              Admitted evidence and navigation. F5 and F7 stay with your browser.
            </p>
          </div>
          <button type="button" onClick={onClose} className="border px-3 py-1 text-sm">
            Esc
          </button>
        </header>
        <label className="block border-b border-[#1D232B] px-4 py-3">
          <span className="sr-only">Search destinations or enter command</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="forge-command-results"
            aria-expanded="true"
            aria-activedescendant={shown[active] ? `forge-command-${active}` : undefined}
            value={query}
            maxLength={160}
            onChange={(event) => {
              setQuery(event.target.value);
              setItems([]);
              setBusy(true);
              setChoices(undefined);
              setActive(0);
            }}
            placeholder="INDIA REG · RISK HIGH · DATA IIMA · exact ID"
            className="w-full bg-transparent text-sm text-[#E6E8EB] outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-[#a6afb8]">
          <span role="status">
            {busy
              ? "Checking admitted metadata…"
              : `${shown.length} destinations${history ? " · retained history" : " · current admitted selections"}`}
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => {
                setHistory(event.target.checked);
                setItems([]);
                setBusy(true);
                setChoices(undefined);
              }}
            />
            Include retained history
          </label>
          {choices && (
            <button
              type="button"
              onClick={() => {
                setChoices(undefined);
                setActive(0);
              }}
            >
              Back to results
            </button>
          )}
        </div>
        <p className="px-4 pb-2 text-xs text-[#a6afb8]" aria-live="polite">
          {message}
        </p>
        <div
          id="forge-command-results"
          role="listbox"
          aria-busy={busy}
          className="max-h-[55vh] overflow-auto border-t border-[#1D232B] p-2"
        >
          {shown.map((item, index) => {
            const destination = href(item),
              disabled = !destination && !item.choices?.length;
            const content = (
              <>
                <span className="block text-sm text-[#e6e8eb]">{item.label}</span>
                <span className="mt-1 block break-words text-xs text-[#a6afb8]">{item.detail}</span>
              </>
            );
            const props = {
              id: `forge-command-${index}`,
              role: "option",
              "aria-selected": index === active,
              "aria-disabled": disabled,
              onMouseEnter: () => setActive(index),
              className: `block w-full px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F0A929] ${index === active ? "bg-[#17212b]" : "hover:bg-[#111820]"}`,
            };
            return destination ? (
              <a
                key={item.key}
                {...props}
                href={destination}
                onClick={(event) => {
                  if (
                    event.button === 0 &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    execute(item);
                  }
                }}
              >
                {content}
              </a>
            ) : (
              <button
                key={item.key}
                {...props}
                type="button"
                disabled={disabled}
                onClick={() => execute(item)}
              >
                {content}
              </button>
            );
          })}
          {!busy && !shown.length && (
            <p className="px-3 py-6 text-sm text-[#a6afb8]">
              No eligible result. Use a complete identifier, a supported command, or change the
              explicit history scope.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
