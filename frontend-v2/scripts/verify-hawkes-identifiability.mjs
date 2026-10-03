import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual adapter, not a separate schema mock; API calls are never
// needed for this frozen-evidence contract test.
const source = readFileSync(
  new URL("../src/dynamics/hawkes-identifiability-contracts.ts", import.meta.url),
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
const adapt = context.exports.adaptHawkesIdentifiability;
const bytes = readFileSync(
  new URL("../../eval/dynamics/d0_4_1/hawkes_identifiability.json", import.meta.url),
);
const artifact = JSON.parse(bytes.toString("utf8"));
artifact.file_sha256 = createHash("sha256").update(bytes).digest("hex");
const result = adapt(artifact);
assert.equal(result.worldCount, 420);
assert.equal(result.worlds.length, 10);
assert.equal(result.methods.length, 4);
assert.equal(result.frontier.length, 8);
assert.equal(result.status, "PARTIALLY_CHARACTERIZED");
let assertions = 5;
for (const mutate of [
  (v) => {
    v.claim_boundary.market_claim_eligible = true;
  },
  (v) => {
    v.claim_boundary.causal_claim_eligible = true;
  },
  (v) => {
    v.execution.worlds_executed = 419;
  },
  (v) => {
    v.observatory.representative_worlds.pop();
  },
  (v) => {
    v.observatory.representative_worlds[0].fit.branching_matrix[0][0] = -1;
  },
  (v) => {
    v.observatory.representative_worlds[0].uncertainty.event_attribution.edge_support[0][0] ^= 1;
  },
  (v) => {
    v.observatory.representative_worlds[0].uncertainty.event_attribution.bootstrap_support_probability[0][0] = 1.1;
  },
]) {
  const bad = structuredClone(artifact);
  mutate(bad);
  assert.throws(() => adapt(bad));
  assertions += 1;
}
console.log(`D0.4.1 frontend adapter: ${assertions} assertions passed`);
