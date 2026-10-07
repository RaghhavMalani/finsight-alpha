import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { normalizeTicker } from "./contracts";
import { useTickerSearch } from "./queries";

export default function TickerSearch({
  ticker,
  onPick,
}: {
  ticker: string;
  onPick: (ticker: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(ticker);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const search = useTickerSearch(open ? query : "");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  const items = draft.trim() === query ? (search.data ?? []) : [];
  const pick = (symbol: string) => {
    setDraft(symbol);
    setOpen(false);
    setActive(-1);
    setInvalid(false);
    onPick(symbol);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const symbol = open && active >= 0 ? items[active]?.symbol : normalizeTicker(draft);
    if (symbol) pick(symbol);
    else setInvalid(true);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (items.length)
        setActive((i) =>
          e.key === "ArrowDown"
            ? (i + 1) % items.length
            : i < 0
              ? items.length - 1
              : (i - 1 + items.length) % items.length,
        );
    }
  };
  return (
    <form
      className="mk-ticker mk-search"
      role="search"
      onSubmit={submit}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
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
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActive(-1);
            setInvalid(false);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keys}
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
        />
        {open && (
          <div className="mk-search-popup">
            <ul id={`${id}-list`} role="listbox" aria-label="Matching instruments">
              {items.map((item, i) => (
                <li
                  key={item.symbol}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item.symbol)}
                >
                  <b>{item.symbol}</b>
                  <span>{item.name}</span>
                  <small>
                    {item.exchange} · {item.market}
                  </small>
                </li>
              ))}
            </ul>
            {search.isError ? (
              <p role="status">Search unavailable. Enter a ticker directly.</p>
            ) : (
              !items.length && (
                <p role="status">
                  {draft.trim() !== query || search.isFetching
                    ? "Searching…"
                    : "No matches. Enter a ticker directly."}
                </p>
              )
            )}
          </div>
        )}
      </div>
      <button type="submit">Load</button>
      {invalid && (
        <span className="mk-field-error" id={`${id}-error`}>
          Use a ticker with 1–20 letters, digits or . ^ = -
        </span>
      )}
    </form>
  );
}
