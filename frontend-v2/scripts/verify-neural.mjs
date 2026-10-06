import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateManifest, validateTrace } from "../src/components/observatory/types.ts";
import { openLabHoldout, trainLab } from "../src/components/observatory/neural/lab.ts";
import {
  architectureErrors,
  auc,
  DEFAULT_ARCHITECTURE,
  Network,
  mat,
} from "../src/components/observatory/neural/mlp.ts";
import {
  defaultFamilies,
  GEO_FAMILY,
  GEO_NEGATIVE_CONTROL,
  LAB_FEATURES,
  makeWorld,
  splitWorld,
  WORLDS,
} from "../src/components/observatory/neural/world.ts";

// Usage: node scripts/verify-neural.mjs
// Checks the neural trace validator against a simulated backend trace and its sabotage, the
// in-browser network's gradients, and the lab's planted-vs-null behaviour.
let count = 0;
const check = (fn) => {
  fn();
  count++;
};

/* 1. The backend contract: a simulated trace from src/observatory/neural.py validates. */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/neural-trace.simulated.json", import.meta.url)),
);
const request = { kind: "neural", ticker: "SPY", asOf: fixture.as_of };
check(() => assert.equal(validateTrace(fixture, request), fixture));
const reject = (name, mutate) =>
  check(() => {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(() => validateTrace(copy, request), undefined, name);
  });
reject("stronger claim", (x) => (x.claims.validated_alpha = true));
reject("future evidence", (x) => (x.provenance.latest_availability = "2099-01-01T00:00:00Z"));
reject("seed not the architecture's", (x) => (x.seed = 7));
reject("layer sizes", (x) => x.layer_sizes.splice(1, 1));
reject("parameter count", (x) => (x.parameter_count += 1));
reject("weight shape", (x) => x.snapshots.at(-1).weights[0].pop());
reject("missing epoch", (x) => x.epochs.pop());
reject("snapshot epochs", (x) => (x.snapshot_epochs[1] += 1));
reject("holdout leaks into fit", (x) => x.fit.fit_indices.push(x.holdout.indices[0]));
reject("holdout leaks into validation", (x) => x.validation.indices.push(x.holdout.indices[0]));
reject("training information crosses validation", (x) => {
  x.fit.training_target_information_end = x.validation.feature_start;
});
reject("validation status", (x) => (x.validation.status = "above_chance"));
reject("verdict disagrees", (x) => (x.holdout.verdict = "edge"));
reject("sealed holdout with a score", (x) => {
  x.holdout.sealed = true;
});
reject("attribution does not sum to one", (x) => (x.attribution[0] += 0.5));
reject("unknown family", (x) => (x.families[0] = "Astrology"));
reject("geo inputs without a catalog", (x) => {
  x.families.push("Geo events");
});
reject("probe inside labeled rows", (x) => (x.probe.included_in_labeled_rows = true));
reject("feature start after cutoff", (x) => (x.validation.feature_start = "2099-01-01T00:00:00Z"));

/* 2. A manifest may declare a neural replay, and must check it like any other. */
const manifest = JSON.parse(
  readFileSync(new URL("../public/artifacts/observatory/manifest.json", import.meta.url)),
);
check(() => {
  const copy = structuredClone(manifest);
  copy.artifacts["SPY:neural"] = {
    url: "/artifacts/observatory/spy-neural.json",
    sha256: "a".repeat(64),
    input_hash: "b".repeat(64),
  };
  validateManifest(copy);
});
check(() => {
  const copy = structuredClone(manifest);
  copy.artifacts["SPY:neural"] = {
    url: "https://example.test/x.json",
    sha256: "a".repeat(64),
    input_hash: "b".repeat(64),
  };
  assert.throws(() => validateManifest(copy));
});

/* 3. The in-browser network's backprop matches finite differences. */
for (const activation of ["relu", "tanh", "gelu", "silu"])
  check(() => {
    const net = new Network({ ...DEFAULT_ARCHITECTURE, hidden: [4, 3], activation, dropout: 0 }, 5);
    const x = mat(9, 5),
      y = Float64Array.from({ length: 9 }, (_, i) => i % 2);
    x.data.forEach((_, k) => (x.data[k] = Math.sin(k * 1.7) * 1.3));
    const loss = () => {
      const p = net.forward(x).p;
      let s = 0;
      for (let i = 0; i < 9; i++) s -= y[i] * Math.log(p[i]) + (1 - y[i]) * Math.log(1 - p[i]);
      return s / 9;
    };
    const cache = net.forward(x);
    const { gw, gx } = net.backward(
      cache,
      cache.p.map((p, i) => (p - y[i]) / 9),
    );
    const eps = 1e-6;
    for (const [w, g] of net.weights.map((w, l) => [w.data, gw[l].data]))
      for (const k of [0, w.length - 1]) {
        const old = w[k];
        w[k] = old + eps;
        const up = loss();
        w[k] = old - eps;
        const down = loss();
        w[k] = old;
        assert.ok(Math.abs((up - down) / (2 * eps) - g[k]) < 1e-6, `${activation} weight gradient`);
      }
    const old = x.data[7];
    x.data[7] = old + eps;
    const up = loss();
    x.data[7] = old - eps;
    const down = loss();
    x.data[7] = old;
    assert.ok(
      Math.abs((up - down) / (2 * eps) - gx.data[7]) < 1e-6,
      `${activation} input gradient`,
    );
  });
check(() => assert.equal(auc([0, 0, 1, 1], [0.1, 0.4, 0.35, 0.8]), 0.75));
check(() => assert.deepEqual(architectureErrors(DEFAULT_ARCHITECTURE), []));
check(() => assert.ok(architectureErrors({ ...DEFAULT_ARCHITECTURE, hidden: [65] }).length));

/* 4. Lab worlds: deterministic, leakage-free split, a planted rule is found, noise is not. */
const families = LAB_FEATURES.map(([f]) => f);
check(() => {
  const a = makeWorld({ kind: "interaction", strength: 1, seed: 7, days: 400 }),
    b = makeWorld({ kind: "interaction", strength: 1, seed: 7, days: 400 });
  assert.deepEqual(Array.from(a.x.data), Array.from(b.x.data));
  assert.deepEqual(Array.from(a.y), Array.from(b.y));
});
check(() => {
  const s = splitWorld(1600);
  assert.ok(s.fit[1] < s.validation[0] && s.validation[1] < s.holdout[0], "purged boundaries");
});
const quick = { ...DEFAULT_ARCHITECTURE, epochs: 40 };
const planted = trainLab(
  { kind: "interaction", strength: 1, seed: 7, days: 1600 },
  quick,
  families,
);
check(() => {
  assert.equal(planted.validation.status, "above_chance");
  assert.ok(planted.holdout.sealed && planted.holdout.auc === null, "lab holdout starts sealed");
  assert.ok(planted.truth.validation_auc_ceiling > planted.validation.auc, "below the ceiling");
});
check(() => {
  const opened = openLabHoldout(planted);
  assert.equal(opened.sealed, false);
  assert.ok(opened.auc > 0.6, `planted holdout AUC ${opened.auc}`);
});
const noise = trainLab({ kind: "null", strength: 1, seed: 7, days: 1600 }, quick, families);
check(() => assert.notEqual(noise.validation.status, "above_chance"));
const geo = trainLab({ kind: "geo", strength: 1.5, seed: 7, days: 1600 }, quick, families);
check(() => {
  const top = Object.entries(geo.family_attribution).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(top, "Geo events", "the geo world's network leans on geo inputs");
});

// Geo events are an exogenous negative control on real data: opt-in there, labelled everywhere.
check(() => assert.ok(defaultFamilies("lab").includes(GEO_FAMILY), "lab worlds include geo"));
check(() => assert.ok(!defaultFamilies("live").includes(GEO_FAMILY), "live runs leave geo off"));
check(() => assert.ok(!defaultFamilies("replay").includes(GEO_FAMILY)));
check(() =>
  assert.deepEqual(
    defaultFamilies("live"),
    families.filter((f) => f !== GEO_FAMILY),
    "only the control is dropped",
  ),
);
check(() => assert.match(GEO_NEGATIVE_CONTROL, /negative control/));
check(() => assert.match(WORLDS.geo.rule, /synthetic planted signal.*negative control/));

console.log(`${count} neural contract, gradient and lab checks passed`);
