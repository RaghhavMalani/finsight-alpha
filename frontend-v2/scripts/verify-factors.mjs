import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CUTOFFS,
  KNOWN_IDS,
  KNOWN_BUNDLES,
  KNOWN_ENTRIES,
  validateMetadata,
  stable,
} from "../src/factors/contracts.ts";
import { validateFactors } from "../src/regimes/contracts.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";
const root = new URL("../public/", import.meta.url),
  manifest = validateReplayManifest(
    JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
  );
let checks = 0;
for (const country of ["US", "INDIA"])
  for (const cutoff of CUTOFFS) {
    for (const kind of ["catalog", "audit", "ledger", "lineage"]) {
      const id = KNOWN_IDS[country + "|" + cutoff][kind],
        entry = manifest.artifacts[id],
        raw = readFileSync(new URL(entry.url.slice(1), root)),
        value = JSON.parse(raw);
      assert.equal(createHash("sha256").update(raw).digest("hex"), id.split(":").at(-1));
      assert.equal(raw.length, entry.bytes);
      assert(raw.length <= 128 * 1024);
      validateMetadata(value, kind, country, cutoff);
      checks++;
      const route =
        "/factor-evidence/" +
        kind +
        "?" +
        new URLSearchParams({ as_of: cutoff, country }).toString();
      assert.equal(manifest.routes[route], id);
      for (const mutate of [
        (v) => (v.payload.raw = [1, 2, 3]),
        (v) => (v.payload.provider_rows = "encoded"),
        (v) => (v.claims.validated_alpha = 0),
        (v) => (v.claims.market_claim_eligible = true),
        (v) => (v.scope = "SYNTHETIC_REFERENCE"),
        (v) => (v.country = country === "US" ? "INDIA" : "US"),
        (v) => (v.evidence_cutoff = "2000-01-01T00:00:00Z"),
        (v) => (v.schema_version = "unknown"),
        (v) => (v.sources = ["alpaca"]),
      ]) {
        const bad = structuredClone(value);
        mutate(bad);
        assert.throws(() => validateMetadata(bad, kind, country, cutoff));
        checks++;
      }
      function floats(v) {
        if (Array.isArray(v)) v.forEach(floats);
        else if (v && typeof v === "object") Object.values(v).forEach(floats);
        else if (typeof v === "number") assert(Number.isSafeInteger(v));
      }
      floats(value);
      if (kind === "audit") {
        assert.equal(value.payload.items.length, 64);
        assert.equal(
          value.payload.items.filter((r) => r.eligibility_status === "ELIGIBLE_RETAINED").length,
          4,
        );
        const bad = structuredClone(value),
          row = bad.payload.items.find((r) => r.retained_diagnostic_refs.length);
        row.retained_diagnostic_refs[0].json_pointer = "/payload/current/factors";
        assert.throws(() => validateMetadata(bad, kind, country, cutoff));
        checks++;
      }
      if (kind === "ledger") {
        const real = value.payload.candidates[0];
        assert.equal(real.stages.RAW_TEST.status, "PARTIAL");
        assert.equal(real.stages.RAW_TEST.underlying_verdict, "NOT_CALIBRATED");
        assert.equal(real.stages.COSTS.status, "UNAVAILABLE");
      }
    }
    for (const [kind, ref] of Object.entries(KNOWN_BUNDLES[country][cutoff].refs)) {
      assert.equal(
        stable(manifest.artifacts[ref.artifact_id]),
        stable(KNOWN_ENTRIES[ref.artifact_id]),
      );
      const raw = readFileSync(new URL(manifest.artifacts[ref.artifact_id].url.slice(1), root));
      assert.equal(createHash("sha256").update(raw).digest("hex"), ref.sha256);
      if (kind === "factors") validateFactors(JSON.parse(raw).payload);
      checks++;
    }
  }
console.log(
  `FACTORS static: ${checks} integrity, schema, reference, ledger and reconstruction checks passed.`,
);
const urlIndex = process.argv.indexOf("--url");
if (urlIndex !== -1) {
  const base = process.argv[urlIndex + 1],
    { chromium, firefox } = await import("playwright"),
    shots = new URL("../../docs/screenshots/", import.meta.url);
  mkdirSync(shots, { recursive: true });
  for (const name of ["chrome", "msedge", "firefox"]) {
    const browser = await (name === "firefox" ? firefox : chromium).launch(
      name === "firefox" ? { headless: true } : { headless: true, channel: name },
    );
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
      page = await context.newPage(),
      bad = [],
      failed = [],
      errors = [];
    let dataBytes = 0;
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (
        u.origin !== new URL(base).origin ||
        /\/api\/|:8000|\/factor-evidence\/|\/factors\/[^?]/.test(u.href)
      )
        bad.push(u.href);
    });
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", async (r) => {
      if (/\/artifacts\/replay\/factors-|\/artifacts\/replay\/regimes-/.test(r.url()))
        dataBytes += (await r.body()).length;
    });
    for (const country of ["US", "INDIA"]) {
      await page.goto(
        base +
          "/factors?country=" +
          country +
          "&ticker=" +
          (country === "US" ? "US-MKT" : "IN-MKT"),
      );
      await page.locator('[data-factor-workspace][data-state="ready"]').waitFor();
      await page.locator('[data-diagnostics="ready"]').waitFor();
      assert(await page.getByText("NOT CALIBRATED", { exact: true }).count());
      assert(await page.getByText("Market factor, not a ticker", { exact: true }).count());
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        );
        if (name === "chrome")
          await page.screenshot({
            path: fileURLToPath(
              new URL(`phase6-factors-${country === "US" ? "us" : "india"}-${width}.png`, shots),
            ),
            fullPage: true,
          });
      }
      await page.setViewportSize({ width: 1440, height: 1050 });
      for (const cutoff of CUTOFFS) {
        await page.getByLabel("Factor cutoff").selectOption(cutoff);
        await page.locator('[data-diagnostics="ready"]').waitFor();
        assert((await page.locator("[data-diagnostics]").innerText()).includes(cutoff));
      }
      await page.getByRole("button", { name: "Output audit", exact: true }).click();
      await page.getByText("Declaration audit", { exact: true }).waitFor();
      assert.equal(await page.locator(".factor-audit-list details").count(), 64);
      await page.getByRole("button", { name: "Evidence ledger", exact: true }).click();
      await page.getByText("Read-only stages · no factor-zoo funnel", { exact: true }).waitFor();
      assert.equal(await page.locator(".factor-ledger article").count(), 3);
      await page.getByRole("button", { name: "Lineage ↗", exact: true }).click();
      await page.locator(".factor-lineage-nodes").waitFor();
      if (name === "chrome" && country === "US")
        await page.screenshot({
          path: fileURLToPath(new URL("phase6-factors-lineage-1440.png", shots)),
          fullPage: true,
        });
      await page.getByRole("button", { name: "Close lineage" }).click();
    }
    assert(dataBytes <= 6 * 512 * 1024, "Bounded selected-cutoff data budget");
    assert.deepEqual(bad, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/factors?country=US&ticker=SPY&at=2000-01-01T00%3A00%3A00Z");
    await page.locator('[data-state="unavailable"]').waitFor();
    assert.equal(await page.locator('[data-diagnostics="ready"]').count(), 0);
    if (name === "chrome")
      await page.screenshot({
        path: fileURLToPath(new URL("phase6-factors-unavailable-390.png", shots)),
        fullPage: true,
      });
    await context.close();
    for (const sabotage of [
      "metadata-bytes",
      "metadata-route",
      "reference-licence",
      "numerical-bytes",
      "synthetic",
      "selector",
    ]) {
      const c = await browser.newContext();
      const p = await c.newPage();
      const cutoff = CUTOFFS.at(-1),
        catalogId = KNOWN_IDS["US|" + cutoff].catalog,
        ref = KNOWN_BUNDLES.US[cutoff].refs.factors;
      if (["metadata-route", "reference-licence"].includes(sabotage))
        await c.route("**/replay-manifest.json", async (route) => {
          const value = structuredClone(manifest);
          if (sabotage === "metadata-route") {
            for (const key of Object.keys(value.routes))
              if (key.startsWith("/factor-evidence/catalog") && key.includes("country=US"))
                value.routes[key] = KNOWN_IDS["INDIA|" + cutoff].catalog;
          } else value.artifacts[ref.artifact_id].licence.status = "LOCAL_ONLY";
          await route.fulfill({ json: value });
        });
      else {
        const entry =
          manifest.artifacts[sabotage === "numerical-bytes" ? ref.artifact_id : catalogId];
        await c.route("**" + entry.url, async (route) => {
          const v = JSON.parse(readFileSync(new URL(entry.url.slice(1), root)));
          if (sabotage === "numerical-bytes") v.payload.rolling_tail[0].mkt += 1;
          else if (sabotage === "selector")
            v.payload.items[0].evidence_refs[0].json_pointer = "/payload/current/factors";
          else if (sabotage === "synthetic") v.scope = "SYNTHETIC_REFERENCE";
          else v.payload.provider_rows = [1, 2, 3];
          await route.fulfill({ json: v });
        });
      }
      await p.goto(base + "/factors?country=US&ticker=US-MKT");
      await p
        .locator(
          '[data-factor-workspace][data-state="unavailable"],[data-diagnostics="unavailable"]',
        )
        .waitFor();
      assert.equal(await p.locator('[data-diagnostics="ready"]').count(), 0);
      await c.close();
    }
    await browser.close();
    console.log(
      `${name}: real US/India, three cutoffs, catalogue/audit/ledger/lineage, 1440/390, zero API/vendor traffic and six sabotage cases passed.`,
    );
  }
}
