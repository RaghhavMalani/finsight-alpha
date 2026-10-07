import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { MarketsContractError } from "./contracts";

/** A titled instrument card. `meta` sits on the right of the header (source, as-of, model). */
export function Panel({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mk-panel ${className}`} aria-label={title}>
      <header className="mk-panel-head">
        <h2>{title}</h2>
        {meta && <div className="mk-panel-meta">{meta}</div>}
      </header>
      <div className="mk-panel-body">{children}</div>
    </section>
  );
}

/** Provenance and labelling chips; `tone` is semantic only. */
export function Chip({
  children,
  tone = "plain",
  title,
}: {
  children: ReactNode;
  tone?: "plain" | "warn" | "info" | "pass" | "fail";
  title?: string;
}) {
  return (
    <span className={`mk-chip mk-chip-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="mk-line mk-loading" role="status">
      Loading {label}…
    </p>
  );
}

/** One line, never a grid: what is missing and why, with a sign-in link or a retry. */
export function Unavailable({
  what,
  error,
  retry,
}: {
  what: string;
  error: unknown;
  retry?: () => void;
}) {
  if (error instanceof ApiError && error.status === 401)
    return (
      <p className="mk-line mk-unavailable" role="alert">
        <b>Sign in to load {what.toLowerCase()}.</b> Market data comes from the API under your
        account. <Link to="/login">Sign in</Link>
      </p>
    );
  const detail =
    error instanceof MarketsContractError
      ? `The response did not match the expected contract (${error.message})`
      : error instanceof ApiError
        ? error.message
        : error instanceof TypeError
          ? "The API could not be reached."
          : error instanceof Error
            ? error.message
            : "The source did not answer.";
  return (
    <p className="mk-line mk-unavailable" role="alert">
      <b>{what} unavailable.</b> {detail}
      {retry && (
        <>
          {" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}

/** A row of labelled headline numbers. */
export function Kpis({
  items,
}: {
  items: { label: string; value: string; hint?: string; tone?: "up" | "down" }[];
}) {
  return (
    <dl className="mk-kpis">
      {items.map((k) => (
        <div key={k.label} title={k.hint}>
          <dt>{k.label}</dt>
          <dd className={k.tone ? `mk-${k.tone}` : undefined}>{k.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A short caveat that travels with a number: what the model is and is not. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mk-note">{children}</p>;
}

/** Horizontal labelled bars (factor betas, risk contributions); zero-centred when signed. */
export function BarList({
  rows,
  format,
}: {
  rows: { label: string; value: number | null }[];
  format: (v: number | null) => string;
}) {
  const max = Math.max(1e-12, ...rows.map((r) => Math.abs(r.value ?? 0)));
  const signed = rows.some((r) => (r.value ?? 0) < 0);
  return (
    <div className={`mk-bars ${signed ? "mk-bars-signed" : ""}`}>
      {rows.map((r) => {
        const w = r.value == null ? 0 : (Math.abs(r.value) / max) * (signed ? 50 : 100);
        const left = signed && r.value != null && r.value < 0 ? 50 - w : signed ? 50 : 0;
        return (
          <div key={r.label} className="mk-bar-row">
            <span>{r.label}</span>
            <i>
              <b
                className={r.value != null && r.value < 0 ? "neg" : "pos"}
                style={{ left: `${left}%`, width: `${w}%` }}
              />
            </i>
            <em>{format(r.value)}</em>
          </div>
        );
      })}
    </div>
  );
}
