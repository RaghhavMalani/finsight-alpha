import { useEffect, useRef, useState } from "react";
import { inspectRef, type RiskBundle } from "./client";
import { checkedIssueReferences } from "./evidence";
import { stamp, type Issue } from "./contracts";
import { displayText, tone } from "./filters";
import { PINNED_POLICY } from "./bindings";
import { replayOrigin } from "@/visual/origins";
import type { Origin } from "@/visual/Num";
import { issueOrigin, RiskCopy, RiskId, RiskNum, RiskTime, sweepOrigin } from "./prov";
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
  const sourceRefs = checkedIssueReferences(issue, bundle.stateSweep);
  const rule = PINNED_POLICY.rules.find((r) => r.rule_id === issue.rule_id);
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
            <RiskCopy>{displayText(issue.title)}</RiskCopy>
          </h2>
          <p className="mono-caps mt-2 text-[8px] text-faint">
            {issue.evidence_class} · {issue.currency} · {issue.availability}
            <br />
            {issue.country} · <RiskId>{issue.scope.subject_id}</RiskId> ·{" "}
            <RiskId>{issue.model ?? "NO MODEL"}</RiskId>
          </p>
        </div>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">WHY THIS EXISTS</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            <RiskCopy>{issue.reason}</RiskCopy>
          </p>
          <div className="mt-2 break-all font-mono text-[9px] text-faint">
            <RiskId>{issue.reason_code}</RiskId>
          </div>
        </section>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">EVIDENCE QUALITY</h3>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-2 text-[10px]">
            <dt className="text-faint">Clock quality</dt>
            <dd className="break-words font-mono">
              <RiskId>{issue.source_quality.clock_quality}</RiskId>
            </dd>
            <dt className="text-faint">Lineage</dt>
            <dd>{issue.source_quality.lineage_status}</dd>
            <dt className="text-faint">Publication</dt>
            <dd>{issue.source_quality.permission_status}</dd>
          </dl>
          <p className="mt-2 text-[9px] text-faint">
            <RiskId>{issue.source_quality.limitation_codes.join(" · ")}</RiskId>
          </p>
        </section>
        <section className="border-y border-divider py-4">
          <h3 className="mono-caps text-[9px] text-primary">RULE / POLICY</h3>
          <p className="mt-2 font-mono text-[10px]">
            <RiskId>
              {issue.rule_id} / v{issue.rule_version}
            </RiskId>
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            <RiskCopy>
              {rule?.predicate ?? "Operational failure rule; the last valid state is retained."}
            </RiskCopy>
          </p>
          {rule && (
            <p className="mt-2 text-[10px] text-faint" data-num-exempt="copy">
              Units: {rule.unit} · {rule.inherited_policy ?? "Phase 7 reviewed policy"}
            </p>
          )}
          <p className="mt-2 break-all font-mono text-[8px] text-faint">
            POLICY SHA <RiskId>{issue.policy_sha256}</RiskId>
          </p>
        </section>
        <section>
          <h3 className="mono-caps text-[9px] text-primary">CHRONOLOGY</h3>
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-2 text-[10px]">
            {(
              [
                ["F3 first seen", issue.first_seen_at, issueOrigin(bundle, issue, "first_seen_at")],
                ["Evidence at", issue.evidence_at, issueOrigin(bundle, issue, "evidence_at")],
                [
                  "Evidence cutoff",
                  issue.evidence_cutoff,
                  issueOrigin(bundle, issue, "evidence_cutoff"),
                ],
                issue.issue_id === bundle.sweep.payload.failure?.issue.issue_id || !bundle.state
                  ? ["Published", bundle.sweep.published_at, sweepOrigin(bundle, "/published_at")]
                  : [
                      "Published",
                      bundle.state.published_at,
                      replayOrigin(
                        bundle.stateRef ? bundle.manifest.artifacts[bundle.stateRef] : null,
                        "/published_at",
                      ),
                    ],
                ["Resolved", issue.resolved_at, issueOrigin(bundle, issue, "resolved_at")],
              ] as [string, string | null | undefined, Origin][]
            ).map(([label, value, origin]) => (
              <div key={label} className="contents">
                <dt className="text-faint">{label}</dt>
                <dd title={value ?? "Unavailable"} className="font-mono">
                  <RiskTime o={origin} v={value} label={label} />
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
          {issue.evidence_refs.length === 1 &&
            issue.evidence_refs[0].type === "RISK_OBSERVATION" && (
              <p className="mt-2 break-all font-mono text-[8px] text-faint">
                SEALED OBSERVATION <RiskId>{issue.last_observation_id}</RiskId>
                <br />
                SWEEP <RiskId>{issue.evidence_refs[0].sweep_fingerprint}</RiskId>
              </p>
            )}
          {sourceRefs.map((ref, index) => (
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
              <RiskId>{ref.artifact_id ?? ref.path_id ?? ref.check_id}</RiskId>
              <br />
              <RiskId>{ref.sha256}</RiskId>
              {ref.type === "REPLAY_ARTIFACT" && (
                <span className="mt-2 block text-[9px] leading-relaxed">
                  SOURCES <RiskId>{ref.source_ids?.join(" · ")}</RiskId>
                  <br />
                  AS OF{" "}
                  <RiskTime
                    o={replayOrigin(bundle.manifest.artifacts[ref.artifact_id ?? ""], "/as_of", {
                      note: "Named by the Issue's evidence reference; checked against the manifest entry.",
                    })}
                    v={ref.as_of}
                    label="Reference as of"
                    inert
                  />
                  <br />
                  AVAILABLE{" "}
                  <RiskTime
                    o={replayOrigin(
                      bundle.manifest.artifacts[ref.artifact_id ?? ""],
                      "/available_at",
                      {
                        note: "Named by the Issue's evidence reference; checked against the manifest entry.",
                      },
                    )}
                    v={ref.available_at}
                    label="Reference available at"
                    inert
                  />
                  <br />
                  RUN <RiskId>{ref.run_id ?? "NOT APPLICABLE"}</RiskId>
                  <br />
                  GRANT {bundle.manifest.artifacts[ref.artifact_id ?? ""]?.licence.status} ·{" "}
                  <RiskId>
                    {bundle.manifest.artifacts[ref.artifact_id ?? ""]?.licence.dataset_key}
                  </RiskId>
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
              <RiskCopy>{proof}</RiskCopy>
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
              ORIGIN RECORDS ·{" "}
              <RiskNum
                o={issueOrigin(bundle, issue, "origin_records")}
                v={issue.origin_records.length}
                label="Origin records"
                inert
              />
            </summary>
            {issue.origin_records.map((o, index) => (
              <div key={o.id + index} className="mt-3 border-l border-divider pl-3 text-[10px]">
                <p className={tone(o.severity)}>
                  {o.severity} · ORIGINAL {o.status} ·{" "}
                  <RiskNum
                    o={issueOrigin(bundle, issue, `origin_records/${index}/occurrences`)}
                    v={o.occurrences}
                    label="Occurrences"
                  />{" "}
                  occurrences
                </p>
                <p className="mt-1 break-all font-mono text-[8px] text-faint">
                  <RiskId>{o.id}</RiskId>
                </p>
                <p className="mt-1 text-muted-foreground">
                  <RiskCopy>{o.reason}</RiskCopy>
                </p>
                <p title={o.first_seen_at ?? undefined} className="mt-1 text-faint">
                  Original first seen:{" "}
                  <RiskTime
                    o={issueOrigin(bundle, issue, `origin_records/${index}/first_seen_at`)}
                    v={o.first_seen_at}
                    label="Original first seen"
                  />
                </p>
                <p title={o.last_seen_at ?? undefined} className="text-faint">
                  Original last seen:{" "}
                  <RiskTime
                    o={issueOrigin(bundle, issue, `origin_records/${index}/last_seen_at`)}
                    v={o.last_seen_at}
                    label="Original last seen"
                  />
                </p>
                <details className="mt-1 text-faint">
                  <summary>Original evidence IDs</summary>
                  {o.evidence.map((id) => (
                    <p key={id} className="break-all font-mono text-[8px]" data-num-exempt="id">
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
          <p className="mt-2 text-[11px] leading-relaxed">
            <RiskCopy>{issue.remediation.text}</RiskCopy>
          </p>
          <p className="mt-2 text-[9px] text-faint">
            {issue.remediation.state} · <RiskId>{issue.remediation.requirement_code}</RiskId>
          </p>
        </section>
        <div className="text-[9px] leading-relaxed text-faint" data-num-exempt="copy">
          {rule?.limitations}
          <br />
          Six scientific claim flags remain FALSE. HMM posterior probabilities remain uncalibrated.
        </div>
        <details>
          <summary className="mono-caps cursor-pointer text-[8px] text-faint">
            STABLE ISSUE ID
          </summary>
          <p className="mt-2 break-all font-mono text-[9px]" data-num-exempt="id">
            {issue.issue_id}
          </p>
        </details>
      </div>
    </aside>
  );
}
