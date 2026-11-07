import type { InvestigationContext, Market } from "./context";
import { defaultContext, subjectTicker } from "./context";
import type { ContextCompatibility } from "./compatibility";
export type VerifiedSelection = {
  artifactId: string;
  clocks: readonly { label: string; value: string }[];
  limitations?: readonly string[];
};
export function ContextBar({
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
