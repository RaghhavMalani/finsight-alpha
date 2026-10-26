import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deriveMonitoringCatalog } from "./generate-risk-monitoring.mjs";

// Isolated in-memory Data publication. No retained bytes, manifest or bindings are written.
export function verifyFutureMonitoringAdmission(manifest, readArtifact) {
  const hash = (raw) => createHash("sha256").update(raw).digest("hex");
  const kinds = ["issues", "health", "coverage", "disagreement", "lineage"];
  const currentCutoff = manifest.artifacts[manifest.routes["/data/issues"]].as_of;
  const futureCutoff = new Date(Date.parse(currentCutoff) + 86400000).toISOString();
  const futureInput = hash("SYNTHETIC_TEST_ONLY future retained monitoring fixture");
  const diagnostic = hash("SYNTHETIC_TEST_ONLY later health diagnostic");
  const origin = hash(JSON.stringify([diagnostic, "health"]));
  const values = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      JSON.parse(readArtifact(manifest.artifacts[manifest.routes["/data/" + kind]].url)),
    ]),
  );
  const health = {
    ...values.health.payload.items.find((row) => row.status === "PARTIAL"),
    diagnostic_id: diagnostic,
  };
  values.health.payload.items.push(health);
  values.issues.payload.items.push({
    id: origin,
    source: health.source,
    severity: "MEDIUM",
    kind: "PARTIAL_SOURCE_HEALTH",
    status: "OPEN",
    reason:
      health.quarantined + " invalid observations quarantined. " + (health.calendar_reason ?? ""),
    first_seen_at: futureCutoff,
    last_seen_at: futureCutoff,
    occurrences: 1,
    evidence: [diagnostic],
  });
  function publication(change = () => {}) {
    const selected = structuredClone(values);
    change(selected);
    const next = structuredClone(manifest);
    next.as_of = futureCutoff;
    const rawByURL = new Map();
    for (const kind of kinds) {
      const value = selected[kind];
      value.as_of = futureCutoff;
      value.input_hash = futureInput;
      const raw = Buffer.from(JSON.stringify(value));
      const sha256 = hash(raw);
      const identity = "data-organ:" + kind + ":" + sha256;
      const entry = {
        ...manifest.artifacts[manifest.routes["/data/" + kind]],
        url: "/artifacts/replay/" + identity.replaceAll(":", "-") + ".json",
        sha256,
        bytes: raw.length,
        input_hash: futureInput,
        as_of: futureCutoff,
        observed_at: futureCutoff,
        available_at: futureCutoff,
      };
      next.artifacts[identity] = entry;
      next.routes["/data/" + kind] = identity;
      rawByURL.set(entry.url, raw);
    }
    return { next, read: (url) => rawByURL.get(url) ?? readArtifact(url) };
  }
  const valid = publication();
  const originalCatalog = deriveMonitoringCatalog(manifest, readArtifact);
  const catalog = deriveMonitoringCatalog(valid.next, valid.read);
  const latest = catalog.bundles.at(-1);
  assert.equal(catalog.bundles.length, originalCatalog.bundles.length + 1);
  assert.equal(latest.evaluation_cutoff, futureCutoff);
  assert.equal(latest.artifacts.data_issues.artifact_id, valid.next.routes["/data/issues"]);
  assert(
    latest.health_history[latest.artifacts.data_health.artifact_id],
    "New diagnostic health artifact discovered without a source binding update",
  );
  let rejectionChecks = 3;
  for (const change of [
    (data) =>
      data.health.payload.items.push({
        ...data.health.payload.items.find((row) => row.source === "bls:LNS14000000"),
        diagnostic_id: "56f095517555152343b851b87cce444fcb7ac48a14bbfb26a4625395296d047e",
      }),
    (data) => (data.issues.payload.items.at(-1).reason = "Unrelated reason"),
    (data) =>
      (data.lineage.payload.items[0].source.captured_at = futureCutoff.replace("Z", "001Z")),

    (data) => (data.issues.payload.items.at(-1).id = "a".repeat(64)),
    (data) => (data.issues.payload.items.at(-1).reason = { hidden: true }),
    (data) => (data.health.payload.items.at(-1).status = "AVAILABLE"),
    (data) => (data.health.payload.items.at(-1).window_start = "2026-02-31"),
    (data) =>
      (data.health.payload.items.at(-1).age_reference = futureCutoff.replace("Z", "+00:00")),
    (data) => (data.health.payload.items.at(-1).window_end = "2023-12-31"),
    (data) => (data.lineage.payload.items[0].licence_resolution_hash = "a".repeat(64)),
    (data) => (data.disagreement.payload.summary.comparison_cutoff = "2026-10-10T00:00:00"),
    (data) => (data.coverage.payload.items[0].reason = { hidden: true }),
    (data) => (data.coverage.payload.items[0].reason = 7),
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      data.disagreement.payload.summary.different = { hidden: true };
    },
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      data.disagreement.payload.summary.max_absolute_delta = -1;
    },
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      data.disagreement.payload.sources = { hidden: true };
    },
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      delete data.disagreement.payload.sources;
    },
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      delete data.disagreement.payload.summary.different;
    },
    (data) => {
      data.disagreement.payload.summary.status = "UNAVAILABLE";
      delete data.disagreement.payload.summary.max_absolute_delta;
    },

    (data) => data.issues.payload.items.at(-1).evidence.push("a".repeat(64)),
    (data) => (data.health.payload.items.at(-1).source = "unreviewed:source"),
    (data) => (data.health.payload.items.at(-1).unknown_field = true),
    (data) => (data.health.claims.market_claim_eligible = true),
    (data) => (data.lineage.payload.items[0].source.licence.permitted_uses = []),
    (data) => (data.lineage.payload.items[0].source.captured_at = "2999-01-01T00:00:00Z"),
    (data) =>
      (data.issues.payload.items.find((row) => row.id.startsWith("8ffbf627")).reason += " changed"),
  ]) {
    const bad = publication(change);
    assert.throws(() => deriveMonitoringCatalog(bad.next, bad.read));
    rejectionChecks++;
  }
  const mixed = publication();
  mixed.next.routes["/data/coverage"] = manifest.routes["/data/coverage"];
  assert.throws(
    () => deriveMonitoringCatalog(mixed.next, mixed.read),
    "Mixed epoch routes rejected",
  );
  const rollback = structuredClone(valid.next);
  for (const kind of kinds) rollback.routes["/data/" + kind] = manifest.routes["/data/" + kind];
  assert.throws(
    () => deriveMonitoringCatalog(rollback, valid.read),
    "Monitoring rollback rejected",
  );
  assert.throws(
    () =>
      deriveMonitoringCatalog(valid.next, (url) => {
        const raw = valid.read(url);
        return url === valid.next.artifacts[valid.next.routes["/data/health"]].url
          ? Buffer.concat([raw, Buffer.from(" ")])
          : raw;
      }),
    "Retained byte substitution rejected",
  );
  return {
    evidence_class: "SYNTHETIC_TEST_ONLY",
    original_epochs: originalCatalog.bundles.length,
    automatically_admitted_epochs: catalog.bundles.length,
    admitted_cutoff: futureCutoff,
    new_diagnostic_resolved: true,
    rejection_checks: rejectionChecks,
    publication_writes: 0,
  };
}
