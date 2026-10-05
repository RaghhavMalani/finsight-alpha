import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateManifest, validateTrace } from "../src/components/observatory/types.ts";

const root = new URL("../public/", import.meta.url);
const manifest = validateManifest(
  JSON.parse(readFileSync(new URL("artifacts/observatory/manifest.json", root))),
);
let count = 1;
for (const mutate of [
  (x) => delete x.artifacts["SPY:hmm"].sha256,
  (x) => (x.artifacts["SPY:hmm"].url = "https://example.test/unchecked.json"),
  (x) => (x.artifacts["SPY:hmm"].input_hash = "unchecked"),
  (x) => delete x.artifacts["IWM:signal"],
  (x) => (x.as_of = "invalid-date"),
]) {
  const copy = structuredClone(manifest);
  mutate(copy);
  assert.throws(() => validateManifest(copy));
  count++;
}
for (const [key, entry] of Object.entries(manifest.artifacts)) {
  const bytes = readFileSync(new URL(entry.url.slice(1), root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  const [ticker, kind] = key.split(":"),
    request = { ticker, kind, asOf: manifest.as_of };
  const data = JSON.parse(bytes);
  assert.equal(validateTrace(data, request), data);
  const reject = (mutate) => {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateTrace(copy, request));
    count++;
  };
  reject((x) => {
    x.claims.validated_alpha = true;
  });
  reject((x) => {
    x.provenance.latest_availability = "2099-01-01T00:00:00Z";
  });
  reject((x) => {
    x.provenance.evidence_quality.push("RECEIVE_TIMESTAMP_CAPTURED");
  });
  reject((x) => {
    x.ticker = "NVDA";
  });
  if (kind === "hmm") {
    reject((x) => {
      x.frames[0].covariance_diagonal.pop();
    });
    reject((x) => {
      x.frames[0].posterior_tail[0][0] = 1.5;
    });
    reject((x) => {
      x.dates_tail[0] = "2099-01-01T00:00:00Z";
    });
  } else {
    reject((x) => {
      x.folds[0].model = "xgboost";
    });
    reject((x) => {
      x.folds[0].fit_indices.push(x.holdout.indices[0]);
    });
    reject((x) => {
      x.folds[0].training_target_information_end = x.folds[0].validation_feature_start;
    });
    reject((x) => {
      x.folds[0].frames[0].feature_importance[0] = -1;
    });
    reject((x) => {
      x.folds[0].validation_end = "2099-01-01T00:00:00Z";
    });
    reject((x) => {
      x.inference.included_in_labeled_rows = true;
    });
  }
  count++;
}
console.log(`${count} artifact integrity and evidence sabotage checks passed`);
