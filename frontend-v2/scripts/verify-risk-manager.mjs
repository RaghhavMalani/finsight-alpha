import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  strictJSON,
  validateRisk,
  verifyRiskIdentity,
  stable,
  partition,
} from "../src/risk-manager/contracts.ts";
import { filterIssues, sortIssues, displayText } from "../src/risk-manager/filters.ts";
import { PINNED_POLICY, REPLAY_BINDINGS, FILE_BINDINGS } from "../src/risk-manager/bindings.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";

const publicRoot = new URL("../public/", import.meta.url);
const repo = new URL("../../", import.meta.url);
const manifestBytes = readFileSync(new URL("replay-manifest.json", publicRoot));
const manifest = validateReplayManifest(strictJSON(manifestBytes.toString("utf8")));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let checks = 0;
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
assert(selectedBytes + manifestBytes.length <= 512 * 1024);
const coverageRef = state.payload.evidence_index.find((ref) => ref.selector_id === "risk_coverage");
const coverage = values.get(coverageRef.artifact_id);
assert.equal(coverage.payload.issues.length, 0);
assert.equal(coverage.payload.sweep_fingerprint, state.payload.sweep_fingerprint);
assert.equal(coverage.payload.coverage.length, 75);
for (const slot of coverage.payload.coverage.filter((slot) => slot.category === "PORTFOLIO")) {
  assert.equal(slot.availability, "UNAVAILABLE");
  assert.equal(slot.outcome, "NOT_EVALUATED");
}
assert.equal(
  state.payload.issues
    .filter((issue) => issue.category === "DATA")
    .flatMap((issue) => issue.origin_records).length,
  27,
);
assert.equal(
  new Set(
    state.payload.issues
      .filter((issue) => issue.category === "DATA")
      .flatMap((issue) => issue.origin_records.map((origin) => origin.id)),
  ).size,
  27,
);
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
for (const carrier of [
  "\\\\server\\private\\book",
  "eyJyYXdfcHJpY2VzIjpbMV19",
  "7b2261223a5b315d7d",
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
  (v) => v.payload.counts[0].count++,
  (v) => v.payload.counts.push(v.payload.counts[0]),
  (v) => v.payload.issues.push(v.payload.issues[0]),
  (v) => (v.payload.coverage[0].outcome = "CLEAR"),
  (v) => (v.payload.issues[0].evidence_at = "2099-01-01T00:00:00Z"),
  (v) => (v.payload.issues[0].status = "RESOLVED"),
  (v) => (v.payload.issues[0].first_seen_at = "2026-02-30T00:00:00Z"),
  (v) => (v.payload.policy.rules[0].predicate = "unreviewed policy"),
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
      initial_risk_bytes: selectedBytes,
      total_initial_bytes: selectedBytes + manifestBytes.length,
      validation_max_ms: Math.max(...validations),
      synthetic_1000_filter_max_ms: Math.max(...times),
      synthetic_fixture_evidence_class: "SYNTHETIC_TEST_ONLY",
      actual_sweep: sweep.payload.sweep_id,
    },
    null,
    2,
  ),
);
