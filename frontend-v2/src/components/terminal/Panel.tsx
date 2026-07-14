import * as React from "react";
import { useEffect, useRef, useState } from "react";

export type LinkGroup = "A" | "B" | null;

export function Panel({
  code,
  title,
  subtitle,
  source,
  asOf,
  right,
  loading = false,
  className = "",
  children,
  explainer,
  live = false,
  replayChip,
  onMaximize,
  isMaximized,
  group = null,
  onGroupChange,
  flashSeed,
}: {
  code?: string;
  title: string;
  /** One-line plain-English narrative rendered under the header. */
  subtitle?: string;
  /** Short data-source badge shown next to the code (e.g. "SIM", "TFT", "HSMM"). */
  source?: string;
  /** Observation or calculation cutoff. Missing values render as UNAVAILABLE. */
  asOf?: string;
  right?: React.ReactNode;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
  explainer?: { what: string; why: string; how: string };
  live?: boolean;
  replayChip?: boolean;
  onMaximize?: () => void;
  isMaximized?: boolean;
  group?: LinkGroup;
  onGroupChange?: (g: LinkGroup) => void;
  /** When this changes and the panel is linked to a group, header briefly flashes. */
  flashSeed?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const [focused, setFocused] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const firstMount = useRef(true);

  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return; }
    if (!group) return;
    const el = headerRef.current;
    if (!el) return;
    el.classList.remove("animate-flash-group");
    void el.offsetWidth;
    el.classList.add("animate-flash-group");
  }, [flashSeed, group]);

  const groupColor = group === "A" ? "bg-primary" : group === "B" ? "bg-info" : "bg-transparent border border-border";
  const cycle: Record<string, LinkGroup> = { "null": "A", "A": "B", "B": null };

  return (
    <section
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseDown={() => setFocused(true)}
      className={`panel relative flex flex-col outline-none ${focused ? "panel-focused" : ""} ${className}`}
      style={{ perspective: "1200px" }}
    >
      <header
        ref={headerRef as React.RefObject<HTMLElement>}
        onDoubleClick={onMaximize}
        className="relative z-10 flex items-center justify-between border-b border-divider px-3 py-2"
      >
        <div className="mono-caps flex items-center gap-2 text-[10px] text-muted-foreground">
          {code && <span className="text-primary">{code}</span>}
          <span>{title}</span>
          <span className="ml-1 border border-border bg-raised px-1 py-0 text-[8px] text-faint" title={`Data source · ${source ?? "UNAVAILABLE"}`}>{source ?? "UNAVAILABLE"}</span>
          {onGroupChange !== undefined && (
            <button
              onClick={() => onGroupChange(cycle[String(group)] ?? "A")}
              title={group ? `Linked · group ${group} · click to cycle` : "Unlinked · click to join group A"}
              className="ml-1 flex items-center gap-1 border border-border px-1 py-0 text-[8px] text-faint hover:border-primary"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${groupColor}`} />
              {group ?? "—"}
            </button>
          )}
          {explainer && (
            <button
              onClick={() => setFlipped((f) => !f)}
              title={flipped ? "Back to data" : "What is this?"}
              className="ml-1 flex h-4 w-4 items-center justify-center border border-border text-[9px] text-muted-foreground transition hover:border-primary hover:text-primary"
              aria-label={flipped ? "Show data" : "Explain this panel"}
            >
              {flipped ? "×" : "i"}
            </button>
          )}
        </div>
        <div className="mono-caps flex items-center gap-3 text-[10px] text-muted-foreground">
          {right}
          <span className={asOf ? "text-foreground" : "text-down"}>AS OF · {asOf ?? "UNAVAILABLE"}</span>
          {replayChip ? (
            <span className="flex items-center gap-1.5 text-info">
              <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse-live" />
              REPLAY
            </span>
          ) : live ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-live" />
              LIVE
            </span>
          ) : null}
          {onMaximize && (
            <button
              onClick={onMaximize}
              title={isMaximized ? "Restore (Esc)" : "Maximize"}
              className="flex h-4 w-4 items-center justify-center border border-border text-[10px] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              {isMaximized ? "⤡" : "⛶"}
            </button>
          )}
        </div>
      </header>
      {subtitle && (
        <div className="border-b border-divider bg-panel/50 px-3 py-1.5 text-[12px] leading-snug text-muted-foreground">
          {subtitle}
        </div>
      )}
      <div className="relative flex min-h-0 w-full flex-col overflow-hidden" style={{ flex: "1 1 auto" }}>
        <div
          className="relative flex w-full flex-col"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            transformStyle: "preserve-3d",
            transition: "transform 400ms cubic-bezier(0.16,1,0.3,1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <div
            className="flex w-full flex-col"
            style={{ flex: "1 1 auto", minHeight: 0, backfaceVisibility: "hidden" }}
          >
            {children}
          </div>
          {explainer && (
            <div
              className="absolute inset-0 overflow-y-auto bg-panel p-5"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <ExplainerBlock label="WHAT THIS SHOWS" body={explainer.what} />
              <ExplainerBlock label="WHY IT MATTERS" body={explainer.why} />
              <ExplainerBlock label="HOW TO READ IT" body={explainer.how} />
              <button
                onClick={() => setFlipped(false)}
                className="mono-caps mt-4 border border-border bg-raised px-3 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                ← BACK TO DATA
              </button>
            </div>
          )}
        </div>
        {loading && <div className="scanline-overlay" aria-hidden />}
      </div>
    </section>
  );
}

function ExplainerBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="mb-4">
      <div className="mono-caps mb-1 text-[10px] text-primary">{label}</div>
      <div className="font-serif text-[14px] leading-relaxed text-foreground">{body}</div>
    </div>
  );
}

