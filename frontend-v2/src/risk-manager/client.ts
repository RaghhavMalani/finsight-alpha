import { sha256 } from "@/replay/client";
import { loadRiskReadManifest } from "./manifest";
import { RISK_READ_PLAN } from "./read-plan.generated";
import { checkedIssueReferences } from "./evidence";
import { assertDerivedPayload, type ReplayManifest } from "@/replay/contracts";
import {
  strictJSON,
  validateRisk,
  verifyRiskIdentity,
  stable,
  reviewedMonitoringBundle,
  type State,
  type Sweep,
  type Ref,
} from "./contracts";

export type RiskBundle = {
  state: State | null;
  sweep: Sweep;
  stateSweep: Sweep;
  manifest: ReplayManifest;
  stateRef: string | null;
  sweepRef: string;
};
function checkReferencedEntries(value: State | Sweep, manifest: ReplayManifest): void {
  const atEpoch = (refs: Ref[], cutoff: string) => refs.map((ref) => ({ ref, cutoff }));
  const refs =
    value.kind === "risk-state"
      ? [
          ...atEpoch(value.payload.evidence_index, value.evidence_cutoff),
          ...value.payload.coverage.flatMap((row) =>
            atEpoch(row.evidence_refs, value.evidence_cutoff),
          ),
          ...value.payload.issues.flatMap((issue) =>
            atEpoch(issue.evidence_refs, issue.evidence_cutoff),
          ),
        ]
      : [
          ...value.payload.observations.flatMap((observation) =>
            atEpoch(observation.evidence_refs, observation.evidence_cutoff),
          ),
          ...atEpoch(
            value.payload.failure?.issue.evidence_refs ?? [],
            value.payload.failure?.issue.evidence_cutoff ?? value.evidence_cutoff,
          ),
        ];
  for (const { ref, cutoff } of refs) {
    if (ref.type !== "REPLAY_ARTIFACT") continue;
    const entry = ref.artifact_id ? manifest.artifacts[ref.artifact_id] : null;
    if (ref.kind?.startsWith("data-organ-")) {
      const bundle = reviewedMonitoringBundle(cutoff);
      const binding = bundle.artifacts[ref.selector_id ?? ""];
      const admitted =
        binding?.artifact_id === ref.artifact_id
          ? binding.entry
          : bundle.health_history[ref.artifact_id ?? ""];
      if (!admitted || stable(entry) !== stable(admitted))
        throw new Error("Admitted monitoring artifact metadata changed.");
    }
    const rights = ref.kind?.startsWith("data-organ-")
      ? {
          status: "FIRST_PARTY",
          dataset: "project:data-organ-diagnostics",
          scope: "REAL_DERIVED_DIAGNOSTICS",
        }
      : ref.kind?.startsWith("regimes-")
        ? { status: "ACTIVE", dataset: ref.source_ids?.[0], scope: "REAL_DERIVED_REGIMES" }
        : ref.kind?.startsWith("factors-")
          ? {
              status: "FIRST_PARTY",
              dataset: "project:factor-evidence",
              scope: "READ_ONLY_FACTOR_EVIDENCE",
            }
          : ref.kind === "risk-state"
            ? {
                status: "FIRST_PARTY",
                dataset: "project:risk-manager-evidence",
                scope: "RETAINED_RISK_EVIDENCE",
              }
            : null;
    if (
      !entry ||
      !rights ||
      !ref.artifact_id ||
      entry.url !== "/artifacts/replay/" + ref.artifact_id.replaceAll(":", "-") + ".json" ||
      entry.scope !== rights.scope ||
      entry.status !== "AVAILABLE" ||
      entry.kind !== ref.kind ||
      entry.sha256 !== ref.sha256 ||
      entry.bytes !== ref.bytes ||
      entry.as_of !== ref.as_of ||
      entry.available_at !== ref.available_at ||
      stable(entry.sources) !== stable(ref.source_ids) ||
      entry.licence.status !== rights.status ||
      entry.licence.dataset_key !== rights.dataset ||
      stable(entry.licence.permitted_uses) !== stable(["publish_derived"]) ||
      entry.licence.valid_through !== null
    )
      throw new Error("Retained evidence provenance or publication rights changed.");
  }
}

export async function readChecked(
  id: string,
  manifest: ReplayManifest,
  signal?: AbortSignal,
): Promise<State | Sweep> {
  if (!/^risk:(state|sweep):[a-f0-9]{64}$/.test(id)) throw new Error("Unlisted risk artifact.");
  const entry = manifest.artifacts[id];
  const expectedKind = id.startsWith("risk:state:") ? "risk-state" : "risk-sweep";
  if (
    !entry ||
    entry.status !== "AVAILABLE" ||
    !entry.url ||
    entry.url !== "/artifacts/replay/" + id.replaceAll(":", "-") + ".json"
  )
    throw new Error("Risk artifact unavailable.");
  if (
    entry.kind !== expectedKind ||
    entry.scope !== "RETAINED_RISK_EVIDENCE" ||
    entry.licence.dataset_key !== "project:risk-manager-evidence" ||
    stable(entry.licence.permitted_uses) !== stable(["publish_derived"]) ||
    entry.licence.valid_through !== null
  )
    throw new Error("Risk publication binding invalid.");
  const response = await fetch(entry.url, { credentials: "omit", signal });
  if (!response.ok) throw new Error("Checked risk artifact unavailable.");
  const raw = await response.arrayBuffer();
  if (
    raw.byteLength > 128 * 1024 ||
    raw.byteLength !== entry.bytes ||
    (await sha256(raw)) !== entry.sha256 ||
    entry.sha256 !== id.split(":").at(-1)
  )
    throw new Error("Risk artifact checksum or byte count mismatch.");
  const value = validateRisk(
    strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    expectedKind,
  );
  await verifyRiskIdentity(value);
  checkReferencedEntries(value, manifest);
  if (
    value.input_hash !== entry.input_hash ||
    value.published_at !== entry.available_at ||
    value.published_at !== entry.as_of ||
    value.published_at !== entry.observed_at ||
    stable(value.sources) !== stable(entry.sources) ||
    stable(value.licence) !== stable(entry.licence)
  )
    throw new Error("Risk cutoff/provenance substituted.");
  return value;
}
export async function loadRisk(signal?: AbortSignal, sweepId?: string): Promise<RiskBundle> {
  const manifest = await loadRiskReadManifest(Boolean(sweepId));
  if (signal?.aborted) throw new DOMException("Risk selection cancelled.", "AbortError");
  if (sweepId && !/^[a-f0-9]{64}$/.test(sweepId))
    throw new Error("Unknown retained sweep selector.");
  const suffix = sweepId ? "?sweep_id=" + sweepId : "";
  const sweepRef = manifest.routes["/risk-manager/sweep" + suffix];
  if (!sweepRef) throw new Error("No retained Risk Sweep is published.");
  const selectedStateRef = manifest.routes["/risk-manager/state" + suffix];
  // Both routes come from one checked manifest snapshot. Independent bytes load in parallel.
  const [receipt, selectedState] = await Promise.all([
    readChecked(sweepRef, manifest, signal),
    selectedStateRef ? readChecked(selectedStateRef, manifest, signal) : Promise.resolve(null),
  ]);
  if (receipt.kind !== "risk-sweep" || (selectedState && selectedState.kind !== "risk-state"))
    throw new Error("Risk route kind substituted.");
  const sweep = receipt,
    stateRef = sweep.payload.state_ref;
  if (selectedStateRef && selectedStateRef !== stateRef)
    throw new Error("Risk receipt/state route pair is not atomic.");
  const exactState =
    selectedState ?? (stateRef ? await readChecked(stateRef, manifest, signal) : null);
  if (exactState && exactState.kind !== "risk-state")
    throw new Error("Risk state kind substituted.");
  const state = exactState as State | null;
  if (
    state &&
    sweep.payload.status !== "FAILED" &&
    (state.payload.sweep_fingerprint !== sweep.payload.fingerprint ||
      state.payload.policy.sha256 !== sweep.payload.policy_sha256 ||
      state.evidence_cutoff !== sweep.evidence_cutoff ||
      state.published_at !== sweep.published_at)
  )
    throw new Error("Risk state/sweep lineage mismatch.");
  let stateSweep = sweep;
  const compactState = state?.payload.issues.some(
    (issue) =>
      issue.evidence_refs.length === 1 && issue.evidence_refs[0].type === "RISK_OBSERVATION",
  );
  if (state && compactState && sweep.payload.status === "FAILED") {
    let parent = sweep.payload.prior_sweep_ref;
    const visited = new Set([sweepRef]);
    let riskBytes =
      manifest.artifacts[sweepRef].bytes + (stateRef ? manifest.artifacts[stateRef].bytes : 0);
    let found = false;
    while (parent) {
      if (visited.has(parent)) throw new Error("Risk source receipt history cycle.");
      visited.add(parent);
      const entry = manifest.artifacts[parent];
      if (
        !entry ||
        (!sweepId &&
          (riskBytes + entry.bytes > 256 * 1024 ||
            RISK_READ_PLAN.projection.bytes + riskBytes + entry.bytes > 512 * 1024))
      )
        throw new Error("Risk source receipt exceeds the bounded read budget.");
      riskBytes += entry.bytes;
      const ancestor = await readChecked(parent, manifest, signal);
      if (ancestor.kind !== "risk-sweep" || ancestor.payload.state_ref !== stateRef)
        throw new Error("Failure source receipt changed the last valid state.");
      if (ancestor.payload.status !== "FAILED") {
        stateSweep = ancestor;
        found = true;
        break;
      }
      parent = ancestor.payload.prior_sweep_ref;
    }
    if (
      !found ||
      state.payload.sweep_fingerprint !== stateSweep.payload.fingerprint ||
      state.evidence_cutoff !== stateSweep.evidence_cutoff ||
      state.published_at !== stateSweep.published_at ||
      state.payload.policy.sha256 !== stateSweep.payload.policy_sha256
    )
      throw new Error("Last valid state source receipt substituted.");
  }
  for (const issue of state?.payload.issues ?? []) checkedIssueReferences(issue, stateSweep);
  if (sweepId && sweep.payload.sweep_id !== sweepId) throw new Error("Sweep selector substituted.");
  if (signal?.aborted) throw new DOMException("Risk selection cancelled.", "AbortError");
  return { state, sweep, stateSweep, manifest, stateRef, sweepRef };
}
export async function readCoverage(bundle: RiskBundle, signal?: AbortSignal): Promise<State> {
  const ref = bundle.state?.payload.evidence_index.find((r) => r.selector_id === "risk_coverage");
  if (!ref?.artifact_id) throw new Error("Full coverage evidence unavailable.");
  const value = await readChecked(ref.artifact_id, bundle.manifest, signal);
  if (value.kind !== "risk-state") throw new Error("Coverage page kind substituted.");
  const page = value,
    entry = bundle.manifest.artifacts[ref.artifact_id];
  if (
    ref.sha256 !== entry.sha256 ||
    ref.bytes !== entry.bytes ||
    ref.as_of !== entry.as_of ||
    ref.available_at !== entry.available_at ||
    page.payload.issues.length ||
    page.payload.evidence_index.some((item) => item.selector_id === "risk_coverage") ||
    page.payload.policy.sha256 !== bundle.state?.payload.policy.sha256 ||
    page.payload.sweep_fingerprint !== bundle.state?.payload.sweep_fingerprint ||
    page.evidence_cutoff !== bundle.state?.evidence_cutoff ||
    page.published_at !== bundle.state?.published_at
  )
    throw new Error("Coverage page substituted.");
  return page;
}
export async function inspectRef(ref: Ref, bundle: RiskBundle): Promise<string> {
  if (ref.type === "FROZEN_FILE")
    return (
      "Frozen assertion: " +
      ref.path_id +
      " · " +
      ref.assertion_id +
      ". Full source bytes are not served here."
    );
  if (ref.type === "POLICY_ASSERTION")
    return "Required evidence contract is absent under policy " + ref.policy_sha256 + ".";
  if (ref.type !== "REPLAY_ARTIFACT" || !ref.artifact_id)
    return "Immutable observation reference; inspect sealed sweep history.";
  const entry = bundle.manifest.artifacts[ref.artifact_id];
  if (
    !entry ||
    entry.sha256 !== ref.sha256 ||
    entry.bytes !== ref.bytes ||
    entry.kind !== ref.kind ||
    entry.as_of !== ref.as_of ||
    entry.available_at !== ref.available_at ||
    stable(entry.sources) !== stable(ref.source_ids)
  )
    throw new Error("Original evidence binding changed.");
  if (entry.url !== "/artifacts/replay/" + ref.artifact_id.replaceAll(":", "-") + ".json")
    throw new Error("Original evidence URL substituted.");
  const response = await fetch(entry.url, { credentials: "omit" });
  if (!response.ok) throw new Error("Original evidence unavailable.");
  const raw = await response.arrayBuffer();
  if (raw.byteLength !== ref.bytes || (await sha256(raw)) !== ref.sha256)
    throw new Error("Original evidence checksum or byte count mismatch.");
  assertDerivedPayload(strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  return (
    "Original artifact verified · " +
    entry.scope +
    " · " +
    entry.available_at +
    " · derived publication permission retained."
  );
}
