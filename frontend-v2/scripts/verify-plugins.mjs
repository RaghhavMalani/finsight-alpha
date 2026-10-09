import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { validatePluginReplay } from "../src/plugins/contracts.ts";

const root = new URL("../public/", import.meta.url);
const manifest = validateReplayManifest(
  JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
);
const id = manifest.routes["/plugins/momentum-fixture"];
const entry = manifest.artifacts[id];
const bytes = readFileSync(new URL(entry.url.slice(1), root));
assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
const value = JSON.parse(bytes);
const run = await validatePluginReplay(value, entry);
let checks = 1;
for (const mutate of [
  (r) => (r.claims.inference_certified = true),
  (r) => (r.claims.market_claim_eligible = true),
  (r) => (r.inference_capability.supported_domains = ["the two passing settings"]),
  (r) => (r.inference_capability.confirmation_status = "CERTIFIED"),
  (r) => (r.scope = "REAL"),
  (r) => (r.tenant_id = "another-tenant"),
  (r) => (r.contract.tenant_id = "another-tenant"),
  (r) => (r.contract.code.dirty_computation = true),
  (r) => (r.contract.code.plugin = "other.Model"),
  (r) => r.contract.seed++,
  (r) => (r.sources = ["yfinance"]),
  (r) => (r.holdout_openings = 0),
  (r) => (r.accounting.counts.HOLDOUT_OPENED = 0),
  (r) => (r.accounting.counts.CANDIDATE_STARTED = 0),
  (r) => (r.arena.selected.candidate = 99),
  (r) => (r.contract.splits.fit_information_end = r.contract.splits.validation_start),
  (r) => (r.predictions[0].decision_at = "2099-01-01T00:00:00Z"),
  (r) => (r.predictions[0].signals.momentum_signal = "0.1"),
  (r) => (r.predictions[0].signals.price = 100),
  (r) => r.predictions.pop(),
  (r) => (r.observatory.frames[0].stage = "holdout"),
  (r) => (r.observatory.frames[0].metrics.mse = 0),
  (r) => (r.metrics.mse = 0),
  (r) => (r.metrics.rows = 1),
  (r) => (r.honesty.null_world.certificate = true),
  (r) => (r.honesty.planted_effect.type_i_error_estimated = true),
  (r) => (r.honesty.leakage_sabotage.status = "PASSED"),
  (r) => (r.honesty.factor_neutrality.coefficients.mkt = "unknown"),
]) {
  const changed = structuredClone(value);
  mutate(changed);
  await assert.rejects(validatePluginReplay(changed, entry));
  checks++;
}
const source = readFileSync(new URL("../../examples/momentum_plugin.py", import.meta.url), "utf8");
assert.equal(source.trimEnd().split(/\r?\n/).length, 30);
console.log(
  `Plugins: ${checks} source, identity, chronology, type, claim and accounting checks passed.`,
);

const flag = process.argv.indexOf("--url");
if (flag > 0) {
  const base = process.argv[flag + 1].replace(/\/$/, "");
  const { chromium, firefox } = await import("playwright");
  const shots = new URL("../../docs/screenshots/", import.meta.url);
  if (process.argv.includes("--screenshots")) mkdirSync(shots, { recursive: true });
  let views = 0;
  for (const [name, engine, options] of [
    ["chrome", chromium, { channel: "chrome" }],
    ["edge", chromium, { channel: "msedge" }],
    ["firefox", firefox, {}],
  ]) {
    const browser = await engine.launch({ headless: true, ...options });
    try {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          reducedMotion: "reduce",
        });
        const failed = [],
          errors = [],
          live = [];
        context.on("requestfailed", (r) => failed.push(r.url()));
        context.on("request", (r) => {
          if (/\/api\/|:8000|yahoo|alpaca|nseindia/i.test(r.url())) live.push(r.url());
        });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(base + "/observatory?scene=plugin", { waitUntil: "networkidle" });
        await page.getByText("COMPUTATION", { exact: false }).first().waitFor();
        assert.equal(await page.locator(".plugin-page [role=alert]").count(), 0);
        assert.equal(await page.locator(".plugin-status").getByText("NOT_CONFIRMED").count(), 1);
        assert.equal(await page.locator(".plugin-chart").count(), 1);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        await page.locator("#plugin-step").fill("0");
        assert.equal(await page.locator(".plugin-readout strong").textContent(), "VALIDATION");
        assert.equal(await page.locator(".plugin-chart").count(), 0);
        await page.locator("#plugin-step").fill(String(run.observatory.frames.length - 1));
        assert.equal(await page.locator(".plugin-readout strong").textContent(), "HOLDOUT");
        if (name === "chrome" && process.argv.includes("--screenshots")) {
          await page.evaluate(async () => {
            document.activeElement?.blur();
            window.scrollTo(0, 0);
            await new Promise(requestAnimationFrame);
          });
          await page.screenshot({
            path: fileURLToPath(new URL(`phase2-plugin-replay-${width}.png`, shots)),
            fullPage: true,
          });
        }
        await page.getByText("Identity and source", { exact: true }).click();
        assert.ok(await page.getByText("Run / " + run.run_id, { exact: true }).count());
        assert.deepEqual(failed, []);
        assert.deepEqual(errors, []);
        assert.deepEqual(live, []);
        await context.close();
        views++;
      }
      // Independently exercise the byte boundary and semantic boundary. For
      // semantic sabotage, rehash the altered bytes in a mocked manifest.
      for (const kind of ["hash", "scope", "claim", "tenant", "opening", "missing"]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        let altered = structuredClone(value);
        if (kind === "scope") altered.scope = "REAL";
        if (kind === "claim") altered.claims.validated_alpha = true;
        if (kind === "tenant") altered.tenant_id = "other";
        if (kind === "opening") altered.holdout_openings = 0;
        const raw = JSON.stringify(altered);
        const fake = structuredClone(manifest);
        if (!["hash", "missing"].includes(kind)) {
          fake.artifacts[id].sha256 = createHash("sha256").update(raw).digest("hex");
          fake.artifacts[id].bytes = Buffer.byteLength(raw);
        }
        await context.route("**/replay-manifest.json", (route) => route.fulfill({ json: fake }));
        await context.route("**" + entry.url, (route) =>
          kind === "missing"
            ? route.fulfill({ status: 404, body: "unavailable" })
            : route.fulfill({ contentType: "application/json", body: raw }),
        );
        const page = await context.newPage();
        await page.goto(base + "/observatory?scene=plugin", { waitUntil: "networkidle" });
        await page.locator(".plugin-page [role=alert]").waitFor();
        assert.equal(await page.locator(".plugin-status").count(), 0);
        assert.equal(await page.locator(".plugin-chart").count(), 0);
        await context.close();
        views++;
      }
    } finally {
      await browser.close();
    }
  }
  console.log(
    `Plugins: ${views} Chrome/Edge/Firefox desktop, mobile, scrub and fail-closed views passed.`,
  );
}
