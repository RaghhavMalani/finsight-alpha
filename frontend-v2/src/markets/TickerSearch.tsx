import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { normalizeTicker } from "./contracts";
import { useTickerSearch } from "./queries";
import { localLiveAllowed, useDataMode } from "../replay/mode";
import { useInvestigation } from "../app/terminal/TerminalShell";
import { subjectTicker, type InvestigationContext } from "../app/terminal/context";
import type { InvestigationTarget } from "../app/terminal/links";
import type { SearchResponse } from "../app/terminal/search";

type SearchOption = {
  key: string;
  id: string;
  label: string;
  detail: string;
  target?: InvestigationTarget;
  symbol?: string;
};
function replayOptions(response: SearchResponse): SearchOption[] {
  return response.results.flatMap((result) => {
    const kind =
      result.availability === "REFERENCE"
        ? "REFERENCE IDENTITY | coverage not implied"
        : result.capability.label;
    return result.requiresChoice
      ? result.choices.map((choice) => ({
          key: choice.key,
          id: result.id,
          label: result.label,
          detail: `${kind} | choose exact retained selection | ${choice.cutoff ?? "no selected clock"} | ${choice.artifactId ?? result.namespace}`,
          target: choice.target,
        }))
      : [
          {
            key: result.key,
            id: result.id,
            label: result.label,
            detail: `${kind} | ${result.type} | ${result.market ?? result.namespace}${result.cutoff ? " | retained selection time " + result.cutoff : ""}${!result.target ? " | " + result.capability.reason : ""}`,
            target: result.target,
          },
        ];
  });
}
export default function TickerSearch({
  ticker,
  onPick,
}: {
  ticker: string;
  onPick: (ticker: string) => void;
}) {
  const id = useId(),
    { navigationContext, openTarget, error: contextError } = useInvestigation(),
    mode = useDataMode(),
    live = mode === "live" && localLiveAllowed();
  const [draft, setDraft] = useState(ticker),
    [query, setQuery] = useState(""),
    [queryRevision, setQueryRevision] = useState(0),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [history, setHistory] = useState(false),
    [invalid, setInvalid] = useState<string | null>(null),
    [response, setResponse] = useState<SearchResponse>(),
    [responseContext, setResponseContext] = useState<InvestigationContext>(),
    [loading, setLoading] = useState(false),
    [searchError, setSearchError] = useState<string | null>(null);
  // An empty query disables this frozen hook in Replay; only the existing loopback/config gate enables Live search.
  const liveSearch = useTickerSearch(live && open ? query : ""),
    request = useRef(0),
    currentDraft = useRef(draft),
    currentContext = useRef(navigationContext),
    currentMode = useRef(mode),
    popup = useRef<HTMLDivElement>(null);
  currentDraft.current = draft;
  currentContext.current = navigationContext;
  currentMode.current = mode;
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(draft.trim());
      // Refresh even when rapid edits return to the previous trimmed query after invalidation.
      setQueryRevision((revision) => revision + 1);
    }, 250);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    if (!open || mode !== "replay" || contextError) return;
    const controller = new AbortController(),
      ticket = ++request.current;
    setLoading(true);
    setSearchError(null);
    import("../app/terminal/search")
      .then(({ terminalSearch }) =>
        terminalSearch.search(query, navigationContext, {
          history,
          limit: 20,
          signal: controller.signal,
        }),
      )
      .then((value) => {
        if (ticket === request.current && !controller.signal.aborted) {
          setResponse(value);
          setResponseContext(navigationContext);
        }
      })
      .catch((error: unknown) => {
        if (
          ticket === request.current &&
          !controller.signal.aborted &&
          !(error instanceof Error && error.name === "AbortError")
        )
          setSearchError(
            error instanceof Error ? error.message : "Checked navigation search unavailable.",
          );
      })
      .finally(() => {
        if (ticket === request.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, query, queryRevision, history, mode, navigationContext, contextError]);
  const currentResponse =
      mode === "replay" &&
      response &&
      responseContext === navigationContext &&
      response.scope === (history ? "history" : "current") &&
      response.query === query.trim().toLowerCase() &&
      draft.trim() === query
        ? response
        : undefined,
    allItems: SearchOption[] =
      mode === "replay"
        ? currentResponse
          ? replayOptions(currentResponse)
          : []
        : live && draft.trim() === query
          ? (liveSearch.data ?? []).map((item) => ({
              key: item.symbol,
              id: item.symbol,
              label: item.name,
              detail: `${item.exchange} | ${item.market} | LOCAL LIVE`,
              symbol: item.symbol,
            }))
          : [],
    items = allItems.slice(0, 50),
    activeKey = items[active]?.key;
  useEffect(() => {
    const container = popup.current,
      option = document.getElementById(`${id}-${active}`);
    if (!open || active < 0 || !container || !option) return;
    const viewport = container.getBoundingClientRect(),
      bounds = option.getBoundingClientRect();
    if (bounds.top < viewport.top) container.scrollTop += bounds.top - viewport.top;
    else if (bounds.bottom > viewport.bottom)
      container.scrollTop += bounds.bottom - viewport.bottom;
  }, [open, active, activeKey, id]);
  const pick = (item: SearchOption) => {
    if (item.target) {
      setDraft(subjectTicker(item.target.context.subject) ?? item.id);
      openTarget(item.target);
    } else if (live && item.symbol) {
      setDraft(item.symbol);
      onPick(item.symbol);
    } else {
      setInvalid("This action is unavailable. Choose an enabled exact retained result.");
      return;
    }
    setOpen(false);
    setActive(-1);
    setInvalid(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (open && active >= 0 && items[active]) {
      pick(items[active]);
      return;
    }
    if (live) {
      const symbol = normalizeTicker(draft);
      if (symbol) pick({ key: symbol, id: symbol, label: symbol, detail: "LOCAL LIVE", symbol });
      else setInvalid("Use a ticker with 1-20 letters, digits or . ^ = -");
      return;
    }
    if (mode !== "replay" || contextError) {
      setInvalid(contextError ?? "Configured local Live is unavailable.");
      return;
    }
    const text = draft.trim(),
      ticket = ++request.current;
    setLoading(true);
    setSearchError(null);
    try {
      const { terminalSearch } = await import("../app/terminal/search"),
        value = await terminalSearch.search(text, navigationContext, { history, limit: 20 });
      if (
        ticket !== request.current ||
        currentDraft.current.trim() !== text ||
        currentContext.current !== navigationContext ||
        currentMode.current !== mode
      )
        return;
      setResponse(value);
      setResponseContext(navigationContext);
      const exact = replayOptions(value).filter(
        (item) => item.target && item.id.toLowerCase() === text.toLowerCase(),
      );
      if (exact.length === 1) pick(exact[0]);
      else {
        setOpen(true);
        setActive(-1);
        setInvalid(
          exact.length > 1
            ? "Choose the exact retained cutoff or recorded listing."
            : "Choose a matching checked result. Unknown listings have no implied public coverage.",
        );
      }
    } catch (error: unknown) {
      if (ticket === request.current && !(error instanceof Error && error.name === "AbortError"))
        setSearchError(
          error instanceof Error ? error.message : "Checked navigation search unavailable.",
        );
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      if (items.length)
        setActive((index) =>
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (index + 1) % items.length
                : index < 0
                  ? items.length - 1
                  : (index - 1 + items.length) % items.length,
        );
    }
  };
  const fetching = mode === "replay" ? loading : liveSearch.isFetching,
    failure =
      contextError ??
      searchError ??
      (liveSearch.isError && live ? "Configured local search unavailable." : null);
  return (
    <form
      className="mk-ticker mk-search"
      role="search"
      onSubmit={(event) => void submit(event)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>Ticker or company</label>
      <div className="mk-search-field">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && active >= 0 && items[active] ? `${id}-${active}` : undefined
          }
          aria-invalid={!!invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          value={draft}
          onChange={(event) => {
            request.current++;
            setResponse(undefined);
            setDraft(event.target.value);
            setOpen(true);
            setActive(-1);
            setInvalid(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keys}
          autoComplete="off"
          spellCheck={false}
          maxLength={160}
        />
        {open && (
          <div ref={popup} className="mk-search-popup">
            {mode === "replay" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                <input
                  type="checkbox"
                  style={{ minWidth: 0, width: "auto" }}
                  checked={history}
                  onChange={(event) => {
                    request.current++;
                    setResponse(undefined);
                    setHistory(event.target.checked);
                    setActive(-1);
                  }}
                />
                Include retained history
              </label>
            )}
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-label="Matching instruments and retained evidence"
            >
              {items.map((item, index) => (
                <li
                  key={item.key}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  aria-disabled={!item.target && !item.symbol}
                >
                  {item.target ? (
                    <Link
                      to={item.target.to as never}
                      search={item.target.search as never}
                      style={{
                        display: "grid",
                        gap: 2,
                        margin: "-9px -12px",
                        padding: "9px 12px",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                      onMouseDown={(event) => {
                        if (
                          event.button === 0 &&
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.shiftKey &&
                          !event.altKey
                        )
                          event.preventDefault();
                      }}
                      onClick={(event) => {
                        if (
                          event.button === 0 &&
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.shiftKey &&
                          !event.altKey
                        ) {
                          setOpen(false);
                          setActive(-1);
                          setInvalid(null);
                        }
                      }}
                    >
                      <b>{item.id}</b>
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </Link>
                  ) : item.symbol ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(item)}
                      style={{ display: "grid", gap: 2, textAlign: "left" }}
                    >
                      <b>{item.id}</b>
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </button>
                  ) : (
                    <>
                      <b>{item.id}</b>
                      <span>{item.label}</span>
                      <small>{item.detail}</small>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {failure ? (
              <p role="status">{failure}</p>
            ) : (
              !items.length && (
                <p role="status">
                  {draft.trim() !== query || fetching
                    ? "Searching checked metadata..."
                    : "No checked matches. Refine the identifier or company name."}
                </p>
              )
            )}
            {currentResponse && (allItems.length > items.length || currentResponse.limited) && (
              <p role="status">
                Showing {items.length} of {allItems.length} loaded choices from{" "}
                {currentResponse.results.length} of {currentResponse.total} matching search
                identities. Refine the query for another exact selection.
              </p>
            )}
          </div>
        )}
      </div>
      <button type="submit">Load</button>
      {invalid && (
        <span className="mk-field-error" id={`${id}-error`}>
          {invalid}
        </span>
      )}
    </form>
  );
}
