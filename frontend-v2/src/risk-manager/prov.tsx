import type { ReactNode } from "react";
import { Num, Stamp } from "@/visual/Num";
import { num, ref, replayOrigin } from "@/visual/origins";
import type { Origin } from "@/visual/Num";
import type { RiskBundle } from "./client";
import { stamp, type Issue } from "./contracts";

/**
 * Risk values always come from checked Replay artifacts: the retained state and the sweep receipt,
 * each fetched and SHA-256 checked against the manifest entry that names it.
 */
export const stateOrigin = (bundle: RiskBundle, ptr: string, extra?: Partial<Origin>): Origin =>
  bundle.stateRef
    ? replayOrigin(bundle.manifest.artifacts[bundle.stateRef], ptr, extra)
    : { ...sweepOrigin(bundle, ptr, extra), reason: "No retained state for this sweep." };
export const sweepOrigin = (bundle: RiskBundle, ptr: string, extra?: Partial<Origin>): Origin =>
  replayOrigin(bundle.manifest.artifacts[bundle.sweepRef], ptr, extra);

/** An Issue lives in the state (by index) or, for a failed sweep, in the receipt. */
export function issueOrigin(bundle: RiskBundle, issue: Issue, field: string): Origin {
  const i = bundle.state?.payload.issues.findIndex((x) => x.issue_id === issue.issue_id) ?? -1;
  if (i >= 0) return stateOrigin(bundle, `/payload/issues/${i}/${field}`);
  if (bundle.sweep.payload.failure?.issue.issue_id === issue.issue_id)
    return sweepOrigin(bundle, `/payload/failure/issue/${field}`);
  return { kind: "replay", src: "unknown Risk artifact", ptr: field, reason: "Issue not located." };
}

/** A retained clock, in the Risk workspace's own date style. */
export function RiskTime({
  o,
  v,
  label,
  inert,
}: {
  o: Origin;
  v: string | null | undefined;
  label: string;
  inert?: boolean;
}) {
  return v ? (
    <Stamp s={ref(o, v)} display={stamp(v)} label={label} inert={inert} className="vx-inherit" />
  ) : (
    <>{stamp(null)}</>
  );
}

/** A retained number or a count over retained records (with the counting rule named). */
export function RiskNum({
  o,
  v,
  label,
  inert,
}: {
  o: Origin;
  v: number | null | undefined;
  label: string;
  inert?: boolean;
}) {
  return (
    <Num
      n={num(o, v, "int")}
      display={v == null ? undefined : String(v)}
      label={label}
      inert={inert}
      className="vx-inherit"
    />
  );
}

/** Identifiers and verbatim record text may contain digits; they are not measured values. */
export const RiskId = ({ children }: { children: ReactNode }) => (
  <span data-num-exempt="id">{children}</span>
);
export const RiskCopy = ({ children }: { children: ReactNode }) => (
  <span data-num-exempt="copy">{children}</span>
);
