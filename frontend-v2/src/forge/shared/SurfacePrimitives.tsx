import type { ReactNode } from "react";

export function SurfaceHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
}) {
  return (
    <header className="agents-header">
      <div>
        <div className="agents-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {meta}
    </header>
  );
}

export function InstrumentPanel({
  title,
  code,
  children,
  className = "",
}: {
  title: string;
  code?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`agents-card ${className}`}>
      <header className="agents-card-head">
        <h2>{title}</h2>
        {code && <span>{code}</span>}
      </header>
      {children}
    </section>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="agents-card grid min-h-48 place-items-center p-8">
      <div className="w-full max-w-md" role="status">
        <div className="h-2 w-24 animate-pulse bg-[#262B31]" />
        <div className="mt-4 h-5 w-3/4 animate-pulse bg-[#1A1E23]" />
        <div className="mt-2 h-5 w-1/2 animate-pulse bg-[#1A1E23]" />
        <span className="sr-only">Loading {label}</span>
      </div>
    </div>
  );
}

export function UnavailableState({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "The evidence projection is unavailable.";
  return (
    <section className="agents-card p-5" role="alert">
      <StatusMark status="ABSTAIN" label="Unavailable" />
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="agents-muted mt-2 max-w-2xl text-sm leading-6">{message}</p>
      {retry && (
        <button type="button" onClick={retry} className="agents-close mt-4 px-3 py-2 text-sm">
          Retry projection
        </button>
      )}
    </section>
  );
}

export function StatusMark({
  status,
  label,
}: {
  status: "PASS" | "FAIL" | "REJECT" | "ACCEPT" | "ABSTAIN" | "INFO";
  label?: string;
}) {
  return (
    <span className="agents-status" data-status={status}>
      {label ?? status}
    </span>
  );
}
