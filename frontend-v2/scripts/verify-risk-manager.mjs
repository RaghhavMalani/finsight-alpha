import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { PINNED_POLICY, REPLAY_BINDINGS, FILE_BINDINGS } from "../src/risk-manager/bindings.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { generateMonitoringCatalog } from "./generate-risk-monitoring.mjs";
import { verifyFutureMonitoringAdmission } from "./verify-risk-monitoring.mjs";
import { verifyRiskReadProjection } from "./risk-read-manifest.mjs";

// Regenerate before importing consumers, including local static checks after new Data commits.
const MONITORING_CATALOG = await generateMonitoringCatalog();
const { filterIssues, sortIssues, displayText } = await import("../src/risk-manager/filters.ts");
const {
  strictJSON,
  validateRisk,
  verifyRiskIdentity,
  stable,
  partition,
  reviewedMonitoringBundle,
  utcMicros,
} = await import("../src/risk-manager/contracts.ts");

const publicRoot = new URL("../public/", import.meta.url);
const repo = new URL("../../", import.meta.url);
const manifestBytes = readFileSync(new URL("replay-manifest.json", publicRoot));
const manifest = validateReplayManifest(strictJSON(manifestBytes.toString("utf8")));
const projectionBytes = readFileSync(new URL("risk-read-manifest.json", publicRoot));
const projection = validateReplayManifest(strictJSON(projectionBytes.toString("utf8")));
verifyRiskReadProjection(manifest, projection);
const { checkRiskReadManifest } = await import("../src/risk-manager/manifest.ts");
await checkRiskReadManifest(Uint8Array.from(projectionBytes).buffer);
await assert.rejects(() =>
  checkRiskReadManifest(Uint8Array.from(Buffer.concat([projectionBytes, Buffer.from(" ")])).buffer),
);
const corruptProjection = structuredClone(projection);
corruptProjection.artifacts[projection.routes["/risk-manager/state"]].licence.dataset_key =
  "unreviewed:subject";
assert.throws(() => verifyRiskReadProjection(manifest, corruptProjection));
await assert.rejects(() =>
  checkRiskReadManifest(Uint8Array.from(Buffer.from(JSON.stringify(corruptProjection))).buffer),
);
const futureMonitoring = verifyFutureMonitoringAdmission(manifest, (url) =>
  readFileSync(new URL(url.slice(1), publicRoot)),
);
const { checkedIssueReferences } = await import("../src/risk-manager/evidence.ts");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let checks = futureMonitoring.rejection_checks + 3;
const values = new Map();
for (const [id, entry] of Object.entries(manifest.artifacts)) {
  if (!["risk-state", "risk-sweep"].includes(entry.kind)) continue;
  assert.match(id, /^risk:(state|sweep):[a-f0-9]{64}$/);
  assert.equal(entry.url, "/artifacts/replay/" + id.replaceAll(":", "-") + ".json");
  const bytes = readFileSync(new URL(entry.url.slice(1), publicRoot));
  assert(bytes.length <= 128 * 1024);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(entry.sha256, id.split(":").at(-1));
  const value = validateRisk(strictJSON(bytes.toString("utf8")), entry.kind);
  await verifyRiskIdentity(value);
  assert.equal(value.input_hash, entry.input_hash);
  assert.equal(value.published_at, entry.available_at);
  values.set(id, value);
  checks++;
}
assert(values.size >= 3, "Genuine retained artifacts must exist before UI acceptance");
const state = values.get(manifest.routes["/risk-manager/state"]);
const sweep = values.get(manifest.routes["/risk-manager/sweep"]);
assert.equal(state.kind, "risk-state");
assert.equal(sweep.kind, "risk-sweep");
assert.equal(sweep.payload.state_ref, manifest.routes["/risk-manager/state"]);
assert.equal(state.payload.sweep_fingerprint, sweep.payload.fingerprint);
const selectedBytes =
  manifest.artifacts[manifest.routes["/risk-manager/state"]].bytes +
  manifest.artifacts[manifest.routes["/risk-manager/sweep"]].bytes;
assert(selectedBytes <= 256 * 1024);
assert(selectedBytes + projectionBytes.length <= 512 * 1024);
const coverageRef = state.payload.evidence_index.find((ref) => ref.selector_id === "risk_coverage");
const coverage = values.get(coverageRef.artifact_id);
assert.equal(coverage.payload.issues.length, 0);
assert.equal(coverage.payload.sweep_fingerprint, state.payload.sweep_fingerprint);
assert(coverage.payload.coverage.length > 0, "Selected receipt retains explicit coverage slots");
for (const slot of coverage.payload.coverage.filter((slot) => slot.category === "PORTFOLIO")) {
  assert.equal(slot.availability, "UNAVAILABLE");
  assert.equal(slot.outcome, "NOT_EVALUATED");
}
// Existing typed observation links must retain the full source evidence without substitutions.
const sourceIssue = state.payload.issues.find((issue) =>
  sweep.payload.observations.some(
    (observation) => observation.observation_id === issue.last_observation_id,
  ),
);
assert(sourceIssue);
const pointerIssue = structuredClone(sourceIssue);
pointerIssue.evidence_refs = [
  {
    type: "RISK_OBSERVATION",
    observation_id: sourceIssue.last_observation_id,
    sweep_fingerprint: sweep.payload.fingerprint,
  },
];
const sourceObservation = sweep.payload.observations.find(
  (row) => row.observation_id === sourceIssue.last_observation_id,
);
assert.equal(
  stable(checkedIssueReferences(pointerIssue, sweep)),
  stable(sourceObservation.evidence_refs),
);
const pointerSubstitutions = [
  (issue) => {
    issue.evidence_refs[0].sweep_fingerprint = "0".repeat(64);
  },
  (issue) => {
    issue.evidence_refs[0].observation_id = "0".repeat(64);
  },
  (issue) => {
    issue.issue_id = "0".repeat(64);
  },
  (issue) => {
    issue.rule_id = "R-SYSTEM-SWEEP";
  },
  (issue) => {
    issue.scope.stable_scope_key = "substituted";
  },
  (issue) => {
    issue.policy_sha256 = "0".repeat(64);
  },
  (issue) => {
    issue.evidence_cutoff = "2026-10-13T07:48:05Z";
  },
  (issue) => {
    issue.evidence_at = null;
  },
  (issue) => {
    issue.evidence_refs.push({
      type: "POLICY_ASSERTION",
      policy_sha256: issue.policy_sha256,
      check_id: "SYSTEM_SWEEP:x",
    });
  },
  (_issue, owner) => {
    owner.payload.observations = [];
  },
  (_issue, owner) => {
    owner.payload.status = "FAILED";
  },
  (issue, owner) => {
    owner.payload.observations.find(
      (row) => row.observation_id === issue.last_observation_id,
    ).evidence_refs = structuredClone(issue.evidence_refs);
  },
  (issue, owner) => {
    owner.payload.observations.find(
      (row) => row.observation_id === issue.last_observation_id,
    ).issue_id = "0".repeat(64);
  },
];
for (const substitute of pointerSubstitutions) {
  const issue = structuredClone(pointerIssue),
    owner = structuredClone(sweep);
  substitute(issue, owner);
  assert.throws(
    () => checkedIssueReferences(issue, owner),
    "Compact source substitutions fail closed",
  );
}
for (const substitute of [
  (owner) => {
    owner.payload.observations.push(structuredClone(sourceObservation));
  },
  (owner) => {
    owner.payload.observations.find(
      (row) => row.observation_id === sourceIssue.last_observation_id,
    ).witnessed_at = "2020-01-01T00:00:00Z";
  },
]) {
  const owner = structuredClone(sweep);
  substitute(owner);
  assert.throws(
    () => checkedIssueReferences(pointerIssue, owner),
    "Source witness or uniqueness substituted",
  );
  checks++;
}
const mixedWrongSource = structuredClone(pointerIssue);
mixedWrongSource.evidence_refs[0].observation_id = "0".repeat(64);
mixedWrongSource.evidence_refs.push(structuredClone(sourceObservation.evidence_refs[0]));
assert.throws(
  () => checkedIssueReferences(mixedWrongSource, sweep),
  "Mixed Issue observation links cannot bypass source validation",
);
checks++;
const clearOwner = structuredClone(sweep);
clearOwner.payload.observations.find(
  (row) => row.observation_id === sourceIssue.last_observation_id,
).outcome = "CLEAR";
assert.throws(
  () => checkedIssueReferences(pointerIssue, clearOwner),
  "Resolved Issues keep their original finding references",
);
checks++;
const directIssue = structuredClone(pointerIssue);
directIssue.evidence_refs = structuredClone(sourceObservation.evidence_refs);
assert.equal(
  stable(checkedIssueReferences(directIssue, sweep)),
  stable(sourceObservation.evidence_refs),
);
checks += pointerSubstitutions.length + 2;
// Each state joins its own immutable Data Organ bundle, including historical receipts.
const originProofs = [];
for (const [id, item] of values) {
  if (item.kind !== "risk-state" || !item.payload.issues.length) continue;
  const owner = [...values.values()].find(
    (value) =>
      value.kind === "risk-sweep" &&
      value.payload.status !== "FAILED" &&
      value.payload.state_ref === id,
  );
  assert(owner, "State source receipt retained");
  const issueRefs = item.payload.issues.flatMap((issue) => checkedIssueReferences(issue, owner));
  const selectedRef = issueRefs.find(
    (ref) =>
      ref.type === "REPLAY_ARTIFACT" &&
      ref.selector_id === "data_issues" &&
      ref.available_at === item.evidence_cutoff,
  );
  assert(selectedRef, "State has its epoch-specific Data Organ issues binding");
  const originalEntry = manifest.artifacts[selectedRef.artifact_id];
  assert(originalEntry && originalEntry.kind === "data-organ-issues");
  const originalRaw = readFileSync(new URL(originalEntry.url.slice(1), publicRoot));
  assert.equal(originalRaw.length, selectedRef.bytes);
  assert.equal(hash(originalRaw), selectedRef.sha256);
  const original = strictJSON(originalRaw.toString("utf8"));
  const origins = item.payload.issues
    .filter((issue) => issue.category === "DATA")
    .flatMap((issue) => issue.origin_records);
  assert.equal(origins.length, original.payload.items.length);
  assert.equal(new Set(origins.map((origin) => origin.id)).size, origins.length);
  const sorted = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    sorted(origins),
    sorted(original.payload.items),
    "Every upstream origin field is conserved",
  );
  originProofs.push({ state_ref: id, cutoff: item.evidence_cutoff, origins: origins.length });
}
const policyBytes = readFileSync(new URL("eval/risk_manager/v0.1/policy.json", repo));
assert.equal(hash(policyBytes), PINNED_POLICY.sha256);
const evidence = JSON.parse(
  readFileSync(new URL("eval/risk_manager/v0.1/evidence-map.json", repo)),
);
for (const [selector, binding] of Object.entries(REPLAY_BINDINGS)) {
  const source =
    evidence.artifacts[selector]?.entry ?? evidence.health_history[binding.artifact_id];
  assert(source, "Pinned selector exists");
  assert.deepEqual(
    [
      binding.kind,
      binding.sha256,
      binding.bytes,
      binding.as_of,
      binding.available_at,
      binding.sources,
    ],
    [source.kind, source.sha256, source.bytes, source.as_of, source.available_at, source.sources],
  );
}
for (const [pathId, binding] of Object.entries(FILE_BINDINGS)) {
  assert.deepEqual(binding, {
    sha256: evidence.files[pathId].sha256,
    bytes: evidence.files[pathId].bytes,
  });
}
assert.equal(MONITORING_CATALOG.schema_version, "risk-monitoring-catalog/1");
const currentAliases = {
  data_issues: "/data/issues",
  data_health: "/data/health",
  data_coverage: "/data/coverage",
  data_disagreement: "/data/disagreement",
  data_lineage: "/data/lineage",
};
let currentBundle;
for (const bundle of MONITORING_CATALOG.bundles) {
  assert.deepEqual(Object.keys(bundle.artifacts).sort(), Object.keys(currentAliases).sort());
  let cutoff = null;
  for (const [selector, binding] of Object.entries(bundle.artifacts)) {
    const entry = manifest.artifacts[binding.artifact_id];
    assert.deepEqual(
      binding.entry,
      entry,
      "Admitted alias metadata matches immutable manifest entry",
    );
    assert.equal(entry.kind, "data-organ-" + selector.slice("data_".length));
    assert.equal(entry.status, "AVAILABLE");
    assert.deepEqual(entry.sources, [
      "alfred:UNRATE",
      "bls:LNS14000000",
      "iima:daily-factors",
      "ken-french:daily-factors",
    ]);
    assert.equal(entry.licence.dataset_key, "project:data-organ-diagnostics");
    assert.deepEqual(entry.licence.permitted_uses, ["publish_derived"]);
    for (const clock of [entry.as_of, entry.available_at])
      if (cutoff === null || Date.parse(clock) > Date.parse(cutoff)) cutoff = clock;
  }
  assert.equal(
    bundle.evaluation_cutoff,
    cutoff,
    "Evidence-only epoch derives from selected five-kind bundle",
  );
  for (const [id, entry] of Object.entries(bundle.health_history)) {
    assert.deepEqual(entry, manifest.artifacts[id]);
    assert.equal(entry.kind, "data-organ-health");
    assert(Date.parse(entry.available_at) <= Date.parse(cutoff));
  }
  if (
    Object.entries(currentAliases).every(
      ([selector, route]) => bundle.artifacts[selector].artifact_id === manifest.routes[route],
    )
  )
    currentBundle = bundle;
}
assert(currentBundle, "Reviewed catalog admits all five current routes from the checked snapshot");
assert.equal(
  stable(sweep.payload.inputs),
  stable(reviewedMonitoringBundle(sweep.evidence_cutoff).inputs),
);
const otherBundle = MONITORING_CATALOG.bundles.find(
  (bundle) => bundle.evaluation_cutoff !== state.evidence_cutoff,
);
if (otherBundle) {
  const crossEpoch = structuredClone(state);
  const ref = crossEpoch.payload.issues
    .flatMap((issue) => issue.evidence_refs)
    .find((item) => item.selector_id === "data_issues");
  assert(ref, "Data origin evidence binding is explicit");
  const { artifact_id, entry } = otherBundle.artifacts.data_issues;
  Object.assign(ref, {
    artifact_id,
    kind: entry.kind,
    sha256: entry.sha256,
    bytes: entry.bytes,
    as_of: entry.as_of,
    available_at: entry.available_at,
    source_ids: entry.sources,
  });
  assert.throws(
    () => validateRisk(crossEpoch, "risk-state"),
    "A different admitted epoch cannot replace selected monitoring evidence",
  );
  const crossedInputs = structuredClone(sweep);
  crossedInputs.payload.inputs = structuredClone(otherBundle.inputs);
  assert.throws(
    () => validateRisk(crossedInputs, "risk-sweep"),
    "A different admitted inventory cannot replace this receipt's inputs",
  );
  checks += 2;
}
// SYNTHETIC_TEST_ONLY chronology probes preserve every retained microsecond.
const shiftUTC = (value, delta) => {
  const micros = utcMicros(value) + delta;
  return (
    new Date(Number(micros / 1000000n) * 1000).toISOString().slice(0, 19) +
    "." +
    String(micros % 1000000n).padStart(6, "0") +
    "Z"
  );
};
assert.equal(utcMicros("2026-10-19T06:20:06.85Z"), utcMicros("2026-10-19T06:20:06.850000Z"));
const preciseClock = "2026-10-21T06:09:58.066349Z",
  preciseMicros = utcMicros(preciseClock),
  invalidClocks = [
    "0000-01-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-10-21T24:00:00Z",
    "2026-10-21T06:09:58.0663490Z",
    "2026-10-21T06:09:58.066349+00:00",
    "\uFEFF2026-10-21T06:09:58.066349Z",
  ];
assert.equal(utcMicros("2026-10-21T06:09:58.066350Z") - preciseMicros, 1n);
for (let pass = 0; pass < 2; pass++) {
  assert.equal(
    utcMicros(preciseClock),
    preciseMicros,
    "Warm or evicted clocks retain microseconds",
  );
  for (const invalid of invalidClocks) assert.throws(() => utcMicros(invalid));
  for (let index = 0; index < 300; index++)
    utcMicros(new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString());
}
assert.equal(utcMicros(preciseClock), preciseMicros);
checks += 18;
const sameEpoch = structuredClone(state);
sameEpoch.payload.issues[0].evidence_at = sameEpoch.payload.issues[0].evidence_cutoff;
validateRisk(sameEpoch, "risk-state");
const sameSweepClock = structuredClone(sweep);
sameSweepClock.payload.started_at = sameSweepClock.payload.completed_at =
  sameSweepClock.payload.published_at;
validateRisk(sameSweepClock, "risk-sweep");
checks += 3;
for (const [source, kind, mutate] of [
  [state, "risk-state", (v) => (v.payload.issues[0].evidence_at = shiftUTC(v.evidence_cutoff, 1n))],
  [state, "risk-state", (v) => (v.payload.issues[0].first_seen_at = shiftUTC(v.published_at, 1n))],
  [state, "risk-state", (v) => (v.payload.issues[0].evidence_at = "0000-01-01T00:00:00Z")],
  [
    coverage,
    "risk-state",
    (v) => (v.payload.coverage[0].evidence_at = shiftUTC(v.evidence_cutoff, 1n)),
  ],
  [sweep, "risk-sweep", (v) => (v.payload.completed_at = shiftUTC(v.published_at, 1n))],
  [sweep, "risk-sweep", (v) => (v.payload.started_at = shiftUTC(v.payload.completed_at, 1n))],
  [
    sweep,
    "risk-sweep",
    (v) => (v.payload.observations[0].witnessed_at = shiftUTC(v.evidence_cutoff, -1n)),
  ],
  [
    sweep,
    "risk-sweep",
    (v) => (v.payload.history_index[0].published_at = shiftUTC(v.published_at, 1n)),
  ],
]) {
  const copy = structuredClone(source);
  mutate(copy);
  assert.throws(() => validateRisk(copy, kind), "Retained microsecond chronology is strict");
  checks++;
}
for (const carrier of [
  "\\\\server\\private\\book",
  "eyJyYXdfcHJpY2VzIjpbMV19",
  "7b2261223a5b315d7d",
  "77u/eyJhIjoxfQ==",
  "efbbbf7b2261223a317d",
  "czM6Ly9wcml2YXRlL3Jvd3M=",
  "ftp://example.invalid/evidence",
  "custom+evidence://payload",
  "MAILTO:private@example.invalid",
  "tel:1234",
  "blob:payload",
  "javascript:alert",
  "FILE:private",
  "data:payload",
  "c:\\private\\evidence",
  "/etc/metadata",
  "evidence at /private/metadata",
]) {
  const copy = structuredClone(state);
  copy.payload.issues[0].reason = carrier;
  assert.throws(() => validateRisk(copy, "risk-state"));
  checks++;
}
for (const mutate of [
  (v) => (v.claim_flags.market_claim_eligible = true),
  (v) => (v.claim_flags.inference_certified = 0),
  (v) => (v.payload.issues[0].scope.unknown_nested_key = "x"),
  (v) => (v.payload.issues[0].claim_flags.trusted_graph = true),
  (v) => (v.payload.issues[0].country = "EU"),
  (v) => {
    const issue = v.payload.issues.find((i) => i.asset === "IN-MKT");
    issue.country = "US";
  },
  (v) => (v.payload.issues[0].evidence_refs[0].selector_id = "unreviewed"),
  (v) => {
    const ref = v.payload.issues
      .flatMap((issue) => issue.evidence_refs)
      .find((ref) => ref.type === "REPLAY_ARTIFACT");
    ref.run_id = "0".repeat(64);
  },
  (v) => {
    const ref = v.payload.issues
      .flatMap((issue) => issue.evidence_refs)
      .find((ref) => ref.type === "POLICY_ASSERTION");
    ref.check_id = "UNKNOWN:public";
  },
  (v) => (v.payload.issues[0].reason = "https://unreviewed.invalid/payload"),
  (v) => (v.payload.issues[0].reason = "api_key=credential"),
  (v) => (v.payload.issues[0].reason = "A".repeat(120)),
  (v) => (v.payload.issues[0].availability = "CLEAR"),
  (v) => {
    v.payload.coverage = [];
    v.payload.evidence_index = [];
  },
  (v) => v.payload.evidence_index.push(v.payload.evidence_index[0]),
  (v) => v.payload.counts[0].count++,
  (v) => v.payload.counts.push(v.payload.counts[0]),
  (v) => v.payload.issues.push(v.payload.issues[0]),
  (v) => (v.payload.issues[0].evidence_class = "LOCAL_REAL"),
  (v) => (v.payload.issues[0].evidence_at = "2099-01-01T00:00:00Z"),
  (v) => (v.payload.issues[0].status = "RESOLVED"),
  (v) => (v.payload.issues[0].first_seen_at = "2026-02-30T00:00:00Z"),
  (v) => (v.payload.policy.rules[0].predicate = "unreviewed policy"),
  (v) => {
    v.evidence_cutoff = v.payload.evaluation_cutoff = "2026-10-18T00:00:00Z";
  },
  (v) => (v.payload.issues[0].first_seen_at = "2099-01-01T00:00:00Z"),
  (v) => (v.licence.permitted_uses = ["display"]),
]) {
  const copy = structuredClone(state);
  mutate(copy);
  assert.throws(() => validateRisk(copy, "risk-state"));
  checks++;
}
for (const mutate of [
  (v) => (v.payload.operation_proofs.provider_captures = false),
  (v) => (v.payload.operation_proofs.model_runs = 1),
  (v) => v.payload.inputs.pop(),
  (v) => v.payload.inputs.push({ input_id: "unreviewed", sha256: "0".repeat(64), bytes: 0 }),
  (v) => (v.payload.inputs[0].sha256 = "0".repeat(64)),
  (v) => v.payload.inputs[0].bytes++,
  (v) => v.payload.inputs.reverse(),
  (v) => (v.payload.operation_proofs.after_inventory_sha256 = "0".repeat(64)),
  (v) => v.payload.transition_counts.new++,
  (v) => (v.payload.transitions[0].observation_id = "0".repeat(64)),
  (v) => (v.payload.observations[0].country = "EU"),
  (v) => (v.payload.status = "FAILED"),
  (v) => (v.payload.completed_at = "2000-01-01T00:00:00Z"),
]) {
  const copy = structuredClone(sweep);
  mutate(copy);
  assert.throws(() => validateRisk(copy, "risk-sweep"));
  checks++;
}
for (const text of [
  '{"x":1,"x":2}',
  '{"x":1,"\\u0078":2}',
  '{"x":NaN}',
  '{"x":1e400}',
  "[1,]",
  '{"x":1}extra',
]) {
  assert.throws(() => strictJSON(text));
  checks++;
}
const identityCopy = structuredClone(state);
identityCopy.payload.issues[0].issue_id = "risk-issue:" + "0".repeat(64);
await assert.rejects(() => verifyRiskIdentity(identityCopy));
checks++;
assert.equal(displayText("IN-MKT Â· retained input age"), "IN-MKT · retained input age");
const defaultFilter = {
  view: "CURRENT_REAL",
  category: "ALL",
  severity: "ALL",
  country: "ALL",
  status: "ALL",
  evidenceClass: "ALL",
  query: "",
};
assert.equal(
  filterIssues(state.payload.issues, defaultFilter).length,
  state.payload.issues.filter((issue) => partition(issue) === "CURRENT_REAL").length,
);
assert(
  filterIssues(state.payload.issues, {
    ...defaultFilter,
    category: "MODEL",
    country: "INDIA",
    query: "R-MODEL",
  }).every((issue) => issue.country === "INDIA" && issue.category === "MODEL"),
);
const fixture = Array.from({ length: 1000 }, (_, index) => ({
  ...state.payload.issues[index % state.payload.issues.length],
  issue_id: "synthetic-performance-" + index,
  title: "SYNTHETIC_TEST_ONLY " + index,
}));
const times = [];
for (let run = 0; run < 20; run++) {
  const start = performance.now();
  const filtered = sortIssues(filterIssues(fixture, defaultFilter));
  filtered.find((issue) => issue.issue_id === "synthetic-performance-990");
  times.push(performance.now() - start);
}
assert(Math.max(...times) <= 100, "1000-Issue filter/sort/selection budget");
const validations = performance
  .getEntriesByName("risk-contract-validation")
  .map((entry) => entry.duration);
assert(Math.max(...validations) <= 50, "Synchronous recursive validation budget");
const workspace = readFileSync(
  new URL("../src/risk-manager/RiskWorkspace.tsx", import.meta.url),
  "utf8",
);
assert.match(workspace, /lazy\(\(\) => import\("@\/components\/risk\/LocalRiskLab"\)\)/);
for (const filename of [
  "client.ts",
  "RiskWorkspace.tsx",
  "RiskShell.tsx",
  "IssueFeed.tsx",
  "IssueInspector.tsx",
  "CoverageMatrix.tsx",
  "SweepHistory.tsx",
]) {
  const text = readFileSync(new URL("../src/risk-manager/" + filename, import.meta.url), "utf8");
  assert(
    !/from ["'][^"']*(?:demoBook|lib\/book|lib\/api)["']|setInterval\(/.test(text),
    filename + " public isolation",
  );
}
console.log(
  JSON.stringify(
    {
      schema_version: "risk-ui-static-proof/1",
      checks,
      risk_artifacts: values.size,
      issues: state.payload.issues.length,
      coverage_slots: coverage.payload.coverage.length,
      origin_proofs: originProofs,
      compact_source_substitution_checks: pointerSubstitutions.length + 4,
      admitted_monitoring_epochs: MONITORING_CATALOG.bundles.map(
        (bundle) => bundle.evaluation_cutoff,
      ),
      initial_risk_bytes: selectedBytes,
      total_initial_bytes: selectedBytes + projectionBytes.length,
      initial_manifest_bytes: projectionBytes.length,
      global_manifest_bytes: manifestBytes.length,
      initial_manifest_sha256: hash(projectionBytes),
      global_manifest_sha256: hash(manifestBytes),
      validation_max_ms: Math.max(...validations),
      synthetic_1000_filter_max_ms: Math.max(...times),
      synthetic_fixture_evidence_class: "SYNTHETIC_TEST_ONLY",
      actual_sweep: sweep.payload.sweep_id,
      future_monitoring: futureMonitoring,
    },
    null,
    2,
  ),
);
