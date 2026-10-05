import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/dynamics/market-regime-contracts.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  require: () => ({
    api: () => {
      throw new Error("No adapter network");
    },
  }),
};
vm.runInNewContext(code, context);
const adapt = context.exports.adaptMarketRegime;
const bundle = JSON.parse(
  readFileSync(
    new URL("../../eval/dynamics/d0_4_2/market_regime_lab.json", import.meta.url),
    "utf8",
  ),
);
const full = structuredClone(bundle.worlds["demo-full"].projection);
const sparse = structuredClone(bundle.worlds["demo-sparse"].projection);
assert.equal(adapt(full).landscape.cells.length, 121);
assert.equal(adapt(sparse).landscape.status, "UNAVAILABLE");
let assertions = 2;
for (const mutate of [
  (v) => {
    v.claims.market_claim_eligible = true;
  },
  (v) => {
    v.claims.causal_claim_eligible = true;
  },
  (v) => {
    v.claims.trusted_graph = true;
  },
  (v) => {
    v.schema_version = "other";
  },
  (v) => {
    v.world.scope = "LIVE_PROFIT";
  },
  (v) => {
    v.artifact_hash = "fabricated";
  },
  (v) => {
    v.current.vector.H = 2;
  },
  (v) => {
    v.current.vector.V = Number.NaN;
  },
  (v) => {
    v.current.factors.rows.pop();
  },
  (v) => {
    v.current.factors.rows[0].status = "CERTIFIED_ALPHA";
  },
  (v) => {
    v.current.events.criticality_status = "CERTIFIED";
  },
  (v) => {
    v.current.events.graph_status = "TRUSTED";
  },
  (v) => {
    v.timeline.pop();
  },
  (v) => {
    v.timeline[2].available_at = "2099-01-01T00:00:00Z";
  },
  (v) => {
    v.current.fracture.score = 0.999;
  },
  (v) => {
    v.seasonality.cells[0].metrics.volume.percentile = 2;
  },
  (v) => {
    v.seasonality.cells[0].baseline_end = "2099-01-01T00:00:00Z";
  },
  (v) => {
    v.factor_pnl[0].raw += 0.5;
  },
  (v) => {
    v.momentum_regimes[0].n = 11;
    v.momentum_regimes[0].sharpe = 2;
  },
  (v) => {
    v.landscape.cells[0].objective += 2;
  },
  (v) => {
    v.landscape.cells.pop();
  },
  (v) => {
    v.landscape.cells[1] = structuredClone(v.landscape.cells[0]);
  },
  (v) => {
    v.current.vector_complete = false;
  },
  (v) => {
    v.landscape.optimum.objective += 2;
  },
  (v) => {
    v.optimizer_path[0].as_of = "2099-01-01T00:00:00Z";
  },
]) {
  const value = structuredClone(full);
  mutate(value);
  assert.throws(() => adapt(value), /failed closed/);
  assertions++;
}
assert.equal(full.claims.market_claim_eligible, false);
console.log("Market Regime real-adapter assertions passed:", assertions);
