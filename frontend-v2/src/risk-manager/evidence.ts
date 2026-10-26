import { stable, utcMicros, type Issue, type Ref, type Sweep } from "./contracts.ts";

/** Resolve a compact primary reference only through its exact sealed source observation. */
export function checkedIssueReferences(issue: Issue, owner: Sweep): Ref[] {
  const refs = issue.evidence_refs;
  const pointers = refs.filter((ref) => ref.type === "RISK_OBSERVATION");
  if (!pointers.length) return refs;
  if (refs.length !== 1 || pointers.length !== 1)
    throw new Error("Compact Issue observation pointer is mixed with other references.");
  const ref = pointers[0];
  if (ref.observation_id !== issue.last_observation_id)
    throw new Error("Issue observation pointer is not its latest observation.");
  const matches = owner.payload.observations.filter(
    (row) => row.observation_id === ref.observation_id,
  );
  const observation = matches.length === 1 ? matches[0] : undefined;
  if (
    owner.payload.status === "FAILED" ||
    ref.sweep_fingerprint !== owner.payload.fingerprint ||
    !observation ||
    observation.outcome === "CLEAR" ||
    observation.issue_id !== issue.issue_id ||
    observation.rule_id !== issue.rule_id ||
    observation.rule_version !== issue.rule_version ||
    stable(observation.scope) !== stable(issue.scope) ||
    observation.policy_sha256 !== issue.policy_sha256 ||
    observation.evidence_cutoff !== issue.evidence_cutoff ||
    observation.evidence_at !== issue.evidence_at ||
    utcMicros(observation.witnessed_at) < utcMicros(owner.payload.started_at) ||
    utcMicros(observation.witnessed_at) > utcMicros(owner.payload.completed_at) ||
    observation.evidence_refs.some(
      (source) =>
        source.type === "RISK_OBSERVATION" &&
        source.sweep_fingerprint === owner.payload.fingerprint,
    )
  )
    throw new Error("Issue source observation or owning sweep substituted.");
  return observation.evidence_refs;
}
