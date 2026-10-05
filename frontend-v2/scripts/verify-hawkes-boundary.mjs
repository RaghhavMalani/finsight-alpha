import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/dynamics/hawkes-boundary-contracts.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: () => ({
    api: () => {
      throw new Error("No network allowed in adapter test");
    },
  }),
};
vm.runInNewContext(code, context);
const adapt = context.exports.adaptHawkesBoundary;
const bytes = readFileSync(
  new URL("../../eval/dynamics/d0_4_1_1/hawkes_boundary_decomposition.json", import.meta.url),
);
const artifact = JSON.parse(bytes.toString("utf8"));
artifact.file_sha256 = createHash("sha256").update(bytes).digest("hex");
artifact.representatives = artifact.observatory.representatives.map((record) => {
  const { latent, truth } = record;
  return {
    id: latent.spec.id,
    seed: latent.spec.seed,
    family: latent.spec.family,
    information: latent.spec.information,
    regime: latent.spec.regime,
    counts: latent.counts,
    horizon: latent.horizon,
    half_life: latent.half_life,
    hash: latent.hash,
    truth,
    protocols: record.protocols.map((row) => ({
      ...row,
      protocol: row.protocol.name,
      methods: Object.fromEntries(
        Object.entries(row.uncertainty).map(([name, value]) => [
          name,
          { available: value.available, reason: value.reason ?? null },
        ]),
      ),
    })),
  };
});
const result = adapt(artifact);
assert.equal(result.worldCount, 200);
assert.equal(result.fitCount, 1800);
assert.equal(result.worlds.length, 10);
assert.equal(result.curves.length, 45);
assert.equal(result.confusion.length, 9);
assert.equal(result.decision.value, artifact.summary.decision.decision);
let assertions = 6;
for (const mutate of [
  (v) => {
    v.claims.market_claim_eligible = true;
  },
  (v) => {
    v.claims.causal_claim_eligible = true;
  },
  (v) => {
    v.claims.estimator_repair_implemented = true;
  },
  (v) => {
    v.execution.latent_worlds = 199;
  },
  (v) => {
    v.protocol_names.pop();
  },
  (v) => {
    v.representatives.pop();
  },
  (v) => {
    v.representatives[0].protocols.pop();
  },
  (v) => {
    v.representatives[0].protocols[0].fit.branching_matrix[0][0] = -1;
  },
  (v) => {
    v.representatives[0].protocols[0].structural_identifiability = "CERTIFIED";
  },
  (v) => {
    v.uncertainty_policy.fixed_attribution_history = "REPAIRED";
  },
  (v) => {
    v.summary.failure_categories_are_causal = true;
  },
  (v) => {
    v.summary.decision.repair_implemented = true;
  },
  (v) => {
    v.summary.decision.decision = "FORCED_PASS";
  },
  (v) => {
    v.summary.confusion[0].matrix[0][0] += 1;
  },
  (v) => {
    v.summary.coverage[0].coverage = 1.1;
  },
  (v) => {
    v.summary.coverage[0].covered = v.summary.coverage[0].parameters + 1;
  },
  (v) => {
    v.summary.rho_curves.pop();
  },
  (v) => {
    v.artifact_hash = "not-a-seal";
  },
  (v) => {
    const row = v.representatives.flatMap((w) => w.protocols).find((r) => r.edge_failures.length);
    row.edge_failures[0].support_fraction = null;
  },
]) {
  const bad = structuredClone(artifact);
  mutate(bad);
  assert.throws(() => adapt(bad));
  assertions += 1;
}
console.log(`D0.4.1.1 frontend adapter: ${assertions} assertions passed`);
