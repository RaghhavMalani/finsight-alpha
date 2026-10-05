import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function module(name, dependencies) {
  const source = readFileSync(new URL(`../src/dynamics/${name}.ts`, import.meta.url), "utf8");
  const context = {
    exports: {},
    require: (name) =>
      dependencies[name] ?? {
        api: () => {
          throw new Error("No verification network");
        },
      },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return context.exports;
}
const frozen = module("market-regime-contracts", {});
const adapter = module("product-contracts", { "@/dynamics/market-regime-contracts": frozen });
const bundle = JSON.parse(
  readFileSync(
    new URL("../../eval/dynamics/d0_4_2/market_regime_lab.json", import.meta.url),
    "utf8",
  ),
);
const components = {
  volatility: "V",
  correlation: "C",
  liquidity: "L",
  event: "H",
  factor: "F",
  macro: "S",
};
function wrap(analysis) {
  let previous = null;
  const timeline = analysis.timeline.map((state) => {
    const contributions = Object.fromEntries(
      Object.entries(components).map(([name, key]) => [
        name,
        state.vector[key] == null || previous?.[key] == null
          ? null
          : Math.abs(state.vector[key] - previous[key]) / 6,
      ]),
    );
    const values = Object.values(contributions).filter((n) => n !== null),
      complete = values.length === 6;
    const fracture = {
      status: complete ? "COMPLETE" : "UNRESOLVED",
      score: state.fracture,
      available_contribution_sum: values.reduce((a, b) => a + b, 0),
      contributions,
      coverage: values.length / 6,
      state: "UNRESOLVED",
      weights: analysis.policy.fracture_weights,
    };
    previous = state.vector;
    return {
      observed_at: state.observed_at,
      available_at: state.available_at,
      regime: state.regime,
      vector: structuredClone(state.vector),
      fracture,
      transition: state.fracture !== null && state.fracture >= 0.1,
    };
  });
  timeline.at(-1).fracture = analysis.current.fracture;
  return {
    schema_version: "market-regime-product/1",
    analytics_version: analysis.policy.version,
    asset: "DEMO",
    scope: "SYNTHETIC",
    as_of: analysis.world.as_of,
    state_at: analysis.current.available_at,
    input_hash: analysis.world.input_hash,
    snapshot_hash: analysis.artifact_hash,
    status: "AVAILABLE",
    reason: null,
    claims: analysis.claims,
    analysis,
    definitions: {},
    attribution_target: "SYNTHETIC_STRATEGY",
    provenance: [
      {
        stream: "synthetic",
        status: "AVAILABLE",
        observations: analysis.world.observations,
        sources: [analysis.world.source],
        revisions: [analysis.world.revision],
        quality: ["SYNTHETIC"],
        available_through: analysis.world.as_of,
        source_as_of: analysis.world.as_of,
        publication_evidence: ["Explicit frozen demo"],
      },
    ],
    timeline,
    cache_identity: {
      input_hash: analysis.world.input_hash,
      as_of: analysis.world.as_of,
      asset: "DEMO",
      analytics_version: analysis.policy.version,
    },
    note: "Synthetic contract verification, not market evidence",
  };
}
const full = wrap(structuredClone(bundle.worlds["demo-full"].projection));
const sparse = wrap(structuredClone(bundle.worlds["demo-sparse"].projection));
assert.equal(adapter.adaptProductSnapshot(full).analysis.landscape.cells.length, 121);
assert.equal(adapter.adaptProductSnapshot(sparse).analysis.landscape.status, "UNAVAILABLE");
let assertions = 2;
for (const mutate of [
  (v) => {
    v.claims.market_claim_eligible = true;
  },
  (v) => {
    v.claims.precise_edge_confidence = true;
  },
  (v) => {
    v.schema_version = "future";
  },
  (v) => {
    v.analytics_version = "tuned-on-market";
  },
  (v) => {
    v.scope = "REAL_PIT";
  },
  (v) => {
    v.asset = "SPY";
  },
  (v) => {
    v.cache_identity.input_hash = "0".repeat(64);
  },
  (v) => {
    v.cache_identity.asset = "QQQ";
  },
  (v) => {
    v.cache_identity.as_of = "2099-01-01T00:00:00Z";
  },
  (v) => {
    v.state_at = "2099-01-01T00:00:00Z";
  },
  (v) => {
    v.as_of = v.as_of.slice(0, 19);
  },
  (v) => {
    v.provenance[0].source_as_of = "2000-01-01T00:00:00Z";
  },
  (v) => {
    v.provenance[0].quality = ["REAL_MARKET_CERTIFIED"];
  },
  (v) => {
    v.provenance[0].publication_evidence = [];
  },
  (v) => {
    v.provenance[0].observations = 0;
  },
  (v) => {
    v.provenance.push(v.provenance[0]);
  },
  (v) => {
    v.timeline.pop();
  },
  (v) => {
    v.timeline[2].available_at = "2099-01-01T00:00:00Z";
  },
  (v) => {
    v.timeline[2].vector.V = 0.999;
  },
  (v) => {
    v.timeline[100].fracture.contributions.volatility += 0.01;
  },
  (v) => {
    v.timeline[0].fracture.score = 0;
  },
  (v) => {
    v.timeline[100].fracture.weights.event = 0.8;
  },
  (v) => {
    v.timeline[100].transition = !v.timeline[100].transition;
  },
  (v) => {
    v.analysis.landscape.cells[0].objective += 10;
  },
]) {
  const value = structuredClone(full);
  mutate(value);
  assert.throws(() => adapter.adaptProductSnapshot(value), /failed closed/, mutate.toString());
  assertions++;
}
const compare = {
  schema_version: "regime-compare/1",
  asset: "DEMO",
  claims: full.claims,
  left: full,
  right: sparse,
  vector_delta: Object.fromEntries(
    Object.keys(full.analysis.current.vector).map((key) => [
      key,
      full.analysis.current.vector[key] == null || sparse.analysis.current.vector[key] == null
        ? null
        : sparse.analysis.current.vector[key] - full.analysis.current.vector[key],
    ]),
  ),
};
assert.equal(adapter.adaptProductComparison(compare).asset, "DEMO");
assertions++;
const invalid = structuredClone(compare);
invalid.vector_delta.H = 0;
assert.throws(() => adapter.adaptProductComparison(invalid), /failed closed/);
assertions++;
const catalog = {
  schema_version: "regime-product-catalog/1",
  read_only: true,
  network_downloads: false,
  provider_requirements: ["Actual publication times required"],
  assets: [
    ...["SPY", "QQQ", "IWM"].map((asset) => ({
      asset,
      source: "real",
      scope: "REAL_PIT",
      available: false,
      reason: "UNAVAILABLE",
      cutoffs: [],
    })),
    ...["demo-full", "demo-sparse"].map((source) => ({
      asset: "DEMO",
      source,
      scope: "SYNTHETIC",
      available: true,
      reason: "Not market history",
      cutoffs: [full.as_of],
    })),
  ],
};
assert.equal(adapter.adaptProductCatalog(catalog).assets.length, 5);
assertions++;
const missing = structuredClone(catalog);
missing.assets.shift();
assert.throws(() => adapter.adaptProductCatalog(missing), /failed closed/);
assertions++;
console.log("Market Regime product contract assertions passed:", assertions);
