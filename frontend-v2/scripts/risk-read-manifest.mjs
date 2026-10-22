import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { strictJSON } from "../src/risk-manager/strict-json.ts";

const hash = (raw) => createHash("sha256").update(raw).digest("hex");

/** A bounded read view only; the retained global manifest remains authoritative and unchanged. */
export function deriveRiskReadManifest(manifest, readArtifact) {
  validateReplayManifest(manifest);
  const wanted = new Set();
  const readRisk = (identity, kind) => {
    assert(
      new RegExp("^risk:" + kind + ":[a-f0-9]{64}$").test(identity),
      "Unreviewed risk read identity",
    );
    const entry = manifest.artifacts[identity];
    assert(entry && entry.kind === "risk-" + kind && entry.status === "AVAILABLE");
    assert.equal(entry.url, "/artifacts/replay/" + identity.replaceAll(":", "-") + ".json");
    const raw = readArtifact(entry.url);
    assert.equal(raw.length, entry.bytes);
    assert.equal(hash(raw), entry.sha256);
    assert.equal(entry.sha256, identity.split(":").at(-1), "Risk read identity suffix changed");
    const value = strictJSON(raw.toString("utf8"));
    assert.equal(value.kind, entry.kind);
    wanted.add(identity);
    // Traversal discovers only already sealed typed public references, never a filesystem path.
    const refs = (item) => {
      if (!item || typeof item !== "object") return;
      if (item.type === "REPLAY_ARTIFACT") {
        assert(
          manifest.artifacts[item.artifact_id],
          "Projection reference absent from global manifest",
        );
        wanted.add(item.artifact_id);
      }
      if (Array.isArray(item)) item.forEach(refs);
      else Object.values(item).forEach(refs);
    };
    refs(value);
    return value;
  };
  const stateRef = manifest.routes["/risk-manager/state"] ?? null;
  const sweepRef = manifest.routes["/risk-manager/sweep"];
  assert(sweepRef, "Current risk receipt absent");
  const sweep = readRisk(sweepRef, "sweep");
  assert.equal(sweep.payload.state_ref, stateRef, "Current risk pair substituted");
  if (stateRef) {
    const state = readRisk(stateRef, "state");
    const coverage = state.payload.evidence_index.find(
      (ref) => ref.selector_id === "risk_coverage",
    );
    assert(coverage?.artifact_id, "Current coverage page absent");
    readRisk(coverage.artifact_id, "state");
  } else
    assert.equal(sweep.payload.status, "FAILED", "A successful sweep needs its retained state");
  for (const input of sweep.payload.inputs) {
    if (manifest.artifacts[input.input_id]) wanted.add(input.input_id);
  }
  // A failed receipt keeps a prior compact state; retain metadata for its exact source receipt.
  if (sweep.payload.status === "FAILED" && stateRef) {
    let parent = sweep.payload.prior_sweep_ref;
    const visited = new Set([sweepRef]);
    let found = false;
    while (parent) {
      assert(!visited.has(parent), "Risk source receipt history cycle");
      visited.add(parent);
      const ancestor = readRisk(parent, "sweep");
      assert.equal(ancestor.payload.state_ref, stateRef, "Failure lost its prior valid state");
      if (ancestor.payload.status !== "FAILED") {
        found = true;
        break;
      }
      parent = ancestor.payload.prior_sweep_ref;
    }
    assert(found, "Failure source receipt missing");
  }
  const currentHistory = sweep.payload.history_index.slice(0, 20);
  for (const row of currentHistory) {
    assert(manifest.artifacts[row.sweep_ref], "Retained history receipt absent");
    wanted.add(row.sweep_ref);
    if (row.state_ref) {
      assert(manifest.artifacts[row.state_ref], "Retained history state absent");
      wanted.add(row.state_ref);
    }
  }
  const selected = {
    ...manifest,
    artifacts: Object.fromEntries(
      Object.entries(manifest.artifacts).filter(([identity]) => wanted.has(identity)),
    ),
    routes: Object.fromEntries(
      Object.entries(manifest.routes).filter(([route, identity]) => {
        if (!wanted.has(identity)) return false;
        if (!route.startsWith("/risk-manager/")) return true;
        return (
          route === "/risk-manager/state" ||
          route === "/risk-manager/sweep" ||
          currentHistory.some((row) => route.endsWith("?sweep_id=" + row.sweep_id))
        );
      }),
    ),
  };
  validateReplayManifest(selected);
  return selected;
}

export function verifyRiskReadProjection(manifest, projection) {
  validateReplayManifest(projection);
  assert.equal(projection.as_of, manifest.as_of);
  for (const [identity, entry] of Object.entries(projection.artifacts))
    assert.deepEqual(
      entry,
      manifest.artifacts[identity],
      "Read projection changed immutable metadata",
    );
  for (const [route, identity] of Object.entries(projection.routes))
    assert.equal(identity, manifest.routes[route], "Read projection substituted a route");
  for (const route of ["/risk-manager/state", "/risk-manager/sweep"])
    assert.equal(projection.routes[route], manifest.routes[route]);
  return true;
}
