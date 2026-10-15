import { loadReplayManifest, sha256, readReplayArtifact } from "@/replay/client";
import type { ReplayManifest } from "@/replay/contracts";
import {
  strictJSON,
  validateRisk,
  verifyRiskIdentity,
  stable,
  type State,
  type Sweep,
  type Ref,
} from "./contracts";

export type RiskBundle = {
  state: State | null;
  sweep: Sweep;
  manifest: ReplayManifest;
  stateRef: string | null;
  sweepRef: string;
};
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
  const manifest = await loadReplayManifest();
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
  if (sweepId && sweep.payload.sweep_id !== sweepId) throw new Error("Sweep selector substituted.");
  if (signal?.aborted) throw new DOMException("Risk selection cancelled.", "AbortError");
  return { state, sweep, manifest, stateRef, sweepRef };
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
    page.payload.sweep_fingerprint !== bundle.state?.payload.sweep_fingerprint
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
  await readReplayArtifact(ref.artifact_id);
  return (
    "Original artifact verified · " +
    entry.scope +
    " · " +
    entry.available_at +
    " · derived publication permission retained."
  );
}
