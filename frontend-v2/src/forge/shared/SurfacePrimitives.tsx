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
    <header className="border-b border-[#1D232B] pb-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[#FFB000]">
            {eyebrow}
          </div>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] text-[#E6E8EB] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-[#7B8490]">
            {description}
          </p>
        </div>
        {meta}
      </div>
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
    <section className={`min-w-0 border border-[#1D232B] bg-[#0B0E11] ${className}`}>
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-[#1D232B] px-3 py-2">
        <h2 className="text-sm font-medium tracking-[-0.01em] text-[#dce0e4]">{title}</h2>
        {code && (
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#59636e]">
            {code}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="grid min-h-48 place-items-center border border-[#1D232B] bg-[#0B0E11] p-8">
      <div className="w-full max-w-md" role="status">
        <div className="h-2 w-24 animate-pulse bg-[#29313a]" />
        <div className="mt-4 h-5 w-3/4 animate-pulse bg-[#1b2229]" />
        <div className="mt-2 h-5 w-1/2 animate-pulse bg-[#1b2229]" />
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
    <section className="border border-[#3a2f28] bg-[#12100e] p-5" role="alert">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#FFB000]">
        Unavailable
      </div>
      <h2 className="mt-2 text-lg font-semibold text-[#E6E8EB]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8d959e]">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 border border-[#3b4651] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d4d9de] transition-colors hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
        >
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
  const tone =
    status === "PASS" || status === "ACCEPT"
      ? "border-[#28694f] text-[#35C78A]"
      : status === "FAIL" || status === "REJECT"
        ? "border-[#763b3a] text-[#FF5A57]"
        : status === "ABSTAIN"
          ? "border-[#745f31] text-[#D8A43A]"
          : "border-[#315d83] text-[#52A8FF]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] ${tone}`}
    >
      <span aria-hidden="true">
        {status === "PASS" || status === "ACCEPT"
          ? "◆"
          : status === "FAIL" || status === "REJECT"
            ? "×"
            : "◇"}
      </span>
      {label ?? status}
    </span>
  );
}
