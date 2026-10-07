import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { REGIME_COLORS, regimeStates } from "../src/components/observatory/regime-palette.ts";
import {
  manifestTickers,
  validateManifest,
  validateTrace,
} from "../src/components/observatory/types.ts";

// Usage: node scripts/verify-observatory.mjs [--url http://localhost:5173]
// Without --url only the artifact checks run; with it, a browser also checks label overlap.
const urlFlag = process.argv.indexOf("--url");
const baseUrl = urlFlag > 0 ? process.argv[urlFlag + 1]?.replace(/\/$/, "") : null;

// Preserved real trace bytes are test-only until an explicit public publication grant exists.
const root = new URL("./fixtures/", import.meta.url);
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
    // The verdict must follow from the trace's own interval and validation scores.
    reject((x) => {
      x.verdict = x.verdict === "edge" ? "none" : "edge";
    });
    reject((x) => {
      x.verdict_reason = "holdout_ci_spans_chance";
      x.verdict = "inconclusive";
      x.suppressed = false;
      for (const s of x.selection) s.validation_auc = 0.49;
    });
    reject((x) => {
      x.suppressed = !x.suppressed;
    });
    reject((x) => {
      x.holdout.auc_ci95 = { ...x.holdout.auc_ci95, low: 0.9, high: 0.1 };
    });
    reject((x) => {
      delete x.holdout.auc_ci95;
    });
    reject((x) => {
      x.family.pop();
    });
    reject((x) => {
      x.family[0] = "Astrology";
    });
    reject((x) => {
      x.rho.push(0.5);
    });
    reject((x) => {
      x.schema_version = "model-observatory/1";
    });
  }
  count++;
}

// Regime colours follow the label, never the state index; repeated labels are told apart.
for (const ticker of manifestTickers(manifest)) {
  const trace = JSON.parse(
    readFileSync(new URL(manifest.artifacts[`${ticker}:hmm`].url.slice(1), root)),
  );
  const states = regimeStates(trace);
  for (const s of states) {
    const base = REGIME_COLORS[s.label];
    if (states.filter((t) => t.label === s.label).length === 1)
      assert.equal(s.color, base, `${ticker} state ${s.index} colour`);
  }
  assert.equal(new Set(states.map((s) => s.name)).size, states.length, `${ticker} names unique`);
  count++;
}
{
  const trace = JSON.parse(readFileSync(new URL(manifest.artifacts["QQQ:hmm"].url.slice(1), root)));
  const names = Object.fromEntries(regimeStates(trace).map((s) => [s.index, s.name]));
  // State 1 is calmer on short/medium/long realized vol; state 2 is the choppier one.
  assert.equal(names[1], "Sideways / Choppy · calmer");
  assert.equal(names[2], "Sideways / Choppy · choppier");
  count++;
}
console.log(`${count} artifact integrity, evidence sabotage and palette checks passed`);

/** No two visible scene labels may intersect, at common desktop widths, in either scene. */
if (baseUrl) {
  const { chromium } = await import("playwright");
  // CI runners have no GPU, and Chromium no longer falls back to SwiftShader WebGL on its own.
  // OBS_SOFTWARE_GL=1 forces software rendering locally to reproduce the CI environment.
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      ...(process.env.OBS_SOFTWARE_GL ? ["--use-angle=swiftshader"] : []),
    ],
  });
  let views = 0;
  try {
    for (const width of [1366, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 860 } });
      const shared = {
        schema_version: "terminal-replay/1",
        as_of: manifest.as_of,
        routes: {},
        claims: {
          market_claim_eligible: false,
          causal_claim_eligible: false,
          validated_alpha: false,
        },
        artifacts: {},
      };
      for (const [id, e] of Object.entries(manifest.artifacts))
        shared.artifacts[`observatory:${id}`] = {
          ...e,
          status: "AVAILABLE",
          kind: "observatory-trace",
          scope: "TEST_ONLY",
          as_of: manifest.as_of,
          observed_at: manifest.as_of,
          available_at: manifest.as_of,
          sources: ["ALPACA_IEX · preserved test fixture"],
          licence: {
            status: "ACTIVE",
            permitted_uses: ["publish_derived"],
            dataset_key: "test:observatory",
            valid_through: null,
          },
          reason: null,
        };
      // Explicit test-only permission envelope; production Replay is verified separately without mocking.
      await page.route("**/replay-manifest.json", (route) => route.fulfill({ json: shared }));
      await page.route("**/artifacts/observatory/*.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: readFileSync(new URL(new URL(route.request().url()).pathname.slice(1), root)),
        }),
      );
      for (const ticker of manifestTickers(manifest))
        for (const scene of ["hmm", "signal"]) {
          await page.goto(`${baseUrl}/observatory?scene=${scene}&ticker=${ticker}`, {
            waitUntil: "load",
          });
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll(".observatory .lb")].some(
                (d) => !d.hidden && getComputedStyle(d).visibility === "visible",
              ),
            null,
            { timeout: 60000 },
          );
          await page.waitForTimeout(1500);
          // The regime scene auto-rotates and the feature scene sways: sample several frames.
          for (let sample = 0; sample < 6; sample++) {
            const boxes = await page.evaluate(() =>
              [...document.querySelectorAll(".observatory .lb")]
                .filter((d) => !d.hidden && getComputedStyle(d).visibility === "visible")
                .map((d) => {
                  const r = d.getBoundingClientRect();
                  return { text: d.textContent, x: r.x, y: r.y, w: r.width, h: r.height };
                }),
            );
            assert.ok(boxes.length > 0, `${ticker} ${scene} ${width}: no labels`);
            for (let i = 0; i < boxes.length; i++)
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i],
                  b = boxes[j];
                const hit =
                  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
                assert.ok(!hit, `${ticker} ${scene} @${width}px: "${a.text}" overlaps "${b.text}"`);
              }
            await page.waitForTimeout(500);
          }
          views++;
        }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`${views} scene views checked: no visible labels overlap at 1366, 1440 or 1920px`);
}
