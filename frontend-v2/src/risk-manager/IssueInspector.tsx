import { useEffect, useRef, useState } from "react";
import { inspectRef, type RiskBundle } from "./client";
import { stamp, type Issue } from "./contracts";
import { displayText, tone } from "./filters";
export function IssueInspector({
  issue,
  bundle,
  onClose,
}: {
  issue: Issue | null;
  bundle: RiskBundle;
  onClose: () => void;
}) {
  const [proof, setProof] = useState<string | null>(null);
  const header = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const request = useRef({ sequence: 0 });
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!issue) return;
    const tracker = request.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (mobile) {
      header.current?.focus();
      document.body.style.overflow = "hidden";
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (mobile && event.key === "Tab") {
        const targets = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, summary, [tabindex]",
          ) ?? [],
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            element.getClientRects().length > 0 &&
            !element.hasAttribute("disabled"),
        );
        const first = targets[0],
          last = targets.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || !panel.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !panel.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      tracker.sequence++;
      window.removeEventListener("keydown", keydown);
      if (mobile) {
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus();
      }
    };
  }, [issue, mobile, onClose]);
  if (!issue)
    return (
      <aside className="hidden border border-divider bg-raised/20 p-5 text-sm text-muted-foreground lg:block">
        Select a finding to inspect its rule, immutable evidence and unblock requirements.
      </aside>
    );
  const rule = bundle.state?.payload.policy.rules.find((r) => r.rule_id === issue.rule_id);
  return (
    <aside
      ref={panel}
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile ? true : undefined}
      aria-labelledby="risk-inspector-title"
      aria-label="Issue evidence inspector"
      className="fixed inset-x-2 bottom-2 top-20 z-40 overflow-y-auto border border-divider bg-background shadow-xl lg:static lg:inset-auto lg:z-auto lg:shadow-none"
    >
      <header className="flex items-center justify-between border-b border-divider bg-raised px-4 py-3">
        <span className="mono-caps text-[10px]">EVIDENCE INSPECTOR</span>
        <button ref={header} onClick={onClose} className="mono-caps text-[9px] text-faint">
          Close ×
        </button>
      </header>
      <div className="space-y-5 p-4">
        <div>
          <div className={"mono-caps text-[9px] " + tone(issue.severity)}>
            {issue.severity} · {issue.category.replaceAll("_", " ")} · {issue.status}
          </div>
          <h2 id="risk-inspector-title" className="mt-2 text-base font-medium leading-snug">
            {displayText(issue.title)}
          </h2>
          <p className="mono-caps mt-2 text-[8px] text-faint">
            {issue.evidence_class} · {issue.currency} · {issue.availability}
            <br />
            {issue.country} · {issue.scope.subject_id} · {issue.model ?? "NO MODEL"}
          </p>
        </div>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">WHY THIS EXISTS</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{issue.reason}</p>
          <div className="mt-2 break-all font-mono text-[9px] text-faint">{issue.reason_code}</div>
        </section>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">EVIDENCE QUALITY</h3>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-2 text-[10px]">
            <dt className="text-faint">Clock quality</dt>
            <dd className="break-words font-mono">{issue.source_quality.clock_quality}</dd>
            <dt className="text-faint">Lineage</dt>
            <dd>{issue.source_quality.lineage_status}</dd>
            <dt className="text-faint">Publication</dt>
            <dd>{issue.source_quality.permission_status}</dd>
          </dl>
          <p className="mt-2 text-[9px] text-faint">
            {issue.source_quality.limitation_codes.join(" · ")}
          </p>
        </section>
        <section className="border-y border-divider py-4">
          <h3 className="mono-caps text-[9px] text-primary">RULE / POLICY</h3>
          <p className="mt-2 font-mono text-[10px]">
            {issue.rule_id} / v{issue.rule_version}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {rule?.predicate ?? "Operational failure rule; the last valid state is retained."}
          </p>
          {rule && (
            <p className="mt-2 text-[10px] text-faint">
              Units: {rule.unit} · {rule.inherited_policy ?? "Phase 7 reviewed policy"}
            </p>
          )}
          <p className="mt-2 break-all font-mono text-[8px] text-faint">
            POLICY SHA {issue.policy_sha256}
          </p>
        </section>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">CHRONOLOGY</h3>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-2 text-[10px]">
            {[
              ["F3 first seen", issue.first_seen_at],
              ["Evidence at", issue.evidence_at],
              ["Evidence cutoff", issue.evidence_cutoff],
              [
                "Published",
                issue.issue_id === bundle.sweep.payload.failure?.issue.issue_id
                  ? bundle.sweep.published_at
                  : (bundle.state?.published_at ?? bundle.sweep.published_at),
              ],
              ["Resolved", issue.resolved_at],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-faint">{label}</dt>
                <dd title={value ?? "Unavailable"} className="font-mono">
                  {stamp(value ?? null)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[9px] text-faint">
            First seen is the witnessed Phase 7 detection. Upstream historical clocks below are
            separate.
          </p>
        </section>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">IMMUTABLE REFERENCES</h3>
          {issue.evidence_refs.map((ref, index) => (
            <button
              key={index}
              className="mt-2 block w-full break-all border border-divider p-2 text-left font-mono text-[9px] text-muted-foreground hover:border-primary"
              onClick={() => {
                const currentRequest = ++request.current.sequence;
                setProof("Verifying original evidence…");
                void inspectRef(ref, bundle)
                  .then((message) => {
                    if (request.current.sequence === currentRequest) setProof(message);
                  })
                  .catch((e: unknown) => {
                    if (request.current.sequence === currentRequest)
                      setProof(e instanceof Error ? e.message : "Evidence unavailable.");
                  });
              }}
            >
              <span className="text-primary">{ref.type}</span>
              <br />
              {ref.artifact_id ?? ref.path_id ?? ref.check_id}
              <br />
              {ref.sha256}
              {ref.type === "REPLAY_ARTIFACT" && (
                <span className="mt-2 block text-[9px] leading-relaxed">
                  SOURCES {ref.source_ids?.join(" · ")}
                  <br />
                  AS OF {stamp(ref.as_of ?? null)}
                  <br />
                  AVAILABLE {stamp(ref.available_at ?? null)}
                  <br />
                  RUN {ref.run_id ?? "NOT APPLICABLE"}
                  <br />
                  GRANT {bundle.manifest.artifacts[ref.artifact_id ?? ""]?.licence.status} ·{" "}
                  {bundle.manifest.artifacts[ref.artifact_id ?? ""]?.licence.dataset_key}
                  <br />
                  USES{" "}
                  {bundle.manifest.artifacts[ref.artifact_id ?? ""]?.licence.permitted_uses.join(
                    " · ",
                  )}
                </span>
              )}
            </button>
          ))}
          {proof && (
            <p role="status" className="mt-2 text-[10px] text-muted-foreground">
              {proof}
            </p>
          )}
          <p className="mt-3 text-[9px] text-faint">
            References retain original rights; they do not grant access to private inputs or
            unrestricted traces.
          </p>
        </section>
        {issue.origin_records.length > 0 && (
          <details className="border-y border-divider py-3">
            <summary className="mono-caps cursor-pointer text-[9px]">
              ORIGIN RECORDS · {issue.origin_records.length}
            </summary>
            {issue.origin_records.map((o, index) => (
              <div key={o.id + index} className="mt-3 border-l border-divider pl-3 text-[10px]">
                <p className={tone(o.severity)}>
                  {o.severity} · ORIGINAL {o.status} · {o.occurrences} occurrences
                </p>
                <p className="mt-1 break-all font-mono text-[8px] text-faint">{o.id}</p>
                <p className="mt-1 text-muted-foreground">{o.reason}</p>
                <p title={o.first_seen_at ?? undefined} className="mt-1 text-faint">
                  Original first seen: {stamp(o.first_seen_at)}
                </p>
                <p title={o.last_seen_at ?? undefined} className="text-faint">
                  Original last seen: {stamp(o.last_seen_at)}
                </p>
                <details className="mt-1 text-faint">
                  <summary>Original evidence IDs</summary>
                  {o.evidence.map((id) => (
                    <p key={id} className="break-all font-mono text-[8px]">
                      {id}
                    </p>
                  ))}
                </details>
              </div>
            ))}
          </details>
        )}
        <section className="border-l-2 border-primary bg-primary/5 p-3">
          <h3 className="mono-caps text-[9px] text-primary">REMEDIATION / UNBLOCK</h3>
          <p className="mt-2 text-[11px] leading-relaxed">{issue.remediation.text}</p>
          <p className="mt-2 text-[9px] text-faint">
            {issue.remediation.state} · {issue.remediation.requirement_code}
          </p>
        </section>
        <div className="text-[9px] leading-relaxed text-faint">
          {rule?.limitations}
          <br />
          Six scientific claim flags remain FALSE. HMM posterior probabilities remain uncalibrated.
        </div>
        <details>
          <summary className="mono-caps cursor-pointer text-[8px] text-faint">
            STABLE ISSUE ID
          </summary>
          <p className="mt-2 break-all font-mono text-[9px]">{issue.issue_id}</p>
        </details>
      </div>
    </aside>
  );
}
