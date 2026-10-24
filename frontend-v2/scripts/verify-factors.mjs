import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import {
  CUTOFFS,
  KNOWN_IDS,
  KNOWN_BUNDLES,
  KNOWN_ENTRIES,
  KNOWN_METADATA_ENTRIES,
  validateMetadata,
  stable,
} from "../src/factors/contracts.ts";
import { validateFactors } from "../src/regimes/contracts.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import {
  deriveFactorReadManifest,
  generateFactorReadManifest,
  verifyFactorReadProjection,
} from "./generate-factor-read-manifest.mjs";
const { projection: factorProjection, raw: factorProjectionRaw } =
  await generateFactorReadManifest();
const { checkFactorReadManifest } = await import("../src/factors/manifest.ts");
const root = new URL("../public/", import.meta.url),
  manifest = validateReplayManifest(
    JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
  );
let checks = 0;
verifyFactorReadProjection(manifest, factorProjection);
await checkFactorReadManifest(Uint8Array.from(factorProjectionRaw).buffer);
await assert.rejects(() =>
  checkFactorReadManifest(
    Uint8Array.from(Buffer.concat([factorProjectionRaw, Buffer.from(" ")])).buffer,
  ),
);
const sameLengthProjection = Buffer.from(factorProjectionRaw);
sameLengthProjection[sameLengthProjection.length - 1] = 32;
await assert.rejects(() => checkFactorReadManifest(Uint8Array.from(sameLengthProjection).buffer));
const changedProjection = structuredClone(factorProjection);
const firstMetadata = Object.keys(KNOWN_METADATA_ENTRIES)[0];
changedProjection.artifacts[firstMetadata].scope = "LOCAL_ONLY";
await assert.rejects(() =>
  checkFactorReadManifest(Uint8Array.from(Buffer.from(JSON.stringify(changedProjection))).buffer),
);
assert.throws(() => verifyFactorReadProjection(manifest, changedProjection));
for (const mutate of [
  (value) => {
    value.artifacts[firstMetadata].tenant_id = "other";
  },
  (value) => {
    delete value.artifacts[Object.keys(KNOWN_ENTRIES)[0]];
  },
  (value) => {
    delete value.routes[
      Object.keys(value.routes).find((route) => route.startsWith("/factor-evidence/"))
    ];
  },
]) {
  const bad = structuredClone(manifest);
  mutate(bad);
  assert.throws(() => deriveFactorReadManifest(bad));
}
const grown = structuredClone(manifest);
grown.artifacts["engineering:unrelated-history"] = structuredClone(
  Object.values(manifest.artifacts).find((entry) => entry.status === "UNAVAILABLE"),
);
grown.routes["/engineering/unrelated-history"] = "engineering:unrelated-history";
assert.deepEqual(
  stable(deriveFactorReadManifest(grown)),
  stable(factorProjection),
  "Unrelated retained history cannot expand the Factor read view",
);
checks += 10;
for (const country of ["US", "INDIA"])
  for (const cutoff of CUTOFFS) {
    for (const kind of ["catalog", "audit", "ledger", "lineage"]) {
      const id = KNOWN_IDS[country + "|" + cutoff][kind],
        entry = manifest.artifacts[id],
        raw = readFileSync(new URL(entry.url.slice(1), root)),
        value = JSON.parse(raw);
      assert.equal(stable(entry), stable(KNOWN_METADATA_ENTRIES[id]));
      checks++;
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
const built = new URL("../.vercel/output/static/assets/", import.meta.url);
if (existsSync(built)) {
  const feature = readdirSync(built)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({ name, raw: readFileSync(new URL(name, built)) }))
    .filter(
      (item) =>
        /^(factors-|RetainedDiagnostics-|LineageDrawer-)/.test(item.name) ||
        // Shared consumers may validate the factor publication scope without loading this UI.
        /factor-metadata|factor-retained/.test(item.raw.toString()),
    );
  const size = feature.reduce((n, item) => n + gzipSync(item.raw).length, 0);
  assert(size <= 64 * 1024, "Incremental FACTORS JS exceeds 64 KiB gzip");
  console.log(
    `FACTORS production JS: ${size} gzip bytes across ${feature.length} feature-bearing chunks.`,
  );
}
const urlIndex = process.argv.indexOf("--url");
if (urlIndex !== -1) {
  const base = process.argv[urlIndex + 1],
    { chromium, firefox } = await import("playwright"),
    shotIndex = process.argv.indexOf("--screenshots-dir"),
    shots =
      shotIndex === -1
        ? new URL("../../docs/screenshots/", import.meta.url)
        : pathToFileURL(process.argv[shotIndex + 1].replace(/[\\/]?$/, "/"));
  mkdirSync(shots, { recursive: true });
  for (const name of ["chrome", "msedge", "firefox"]) {
    const browser = await (name === "firefox" ? firefox : chromium).launch(
      name === "firefox" ? { headless: true } : { headless: true, channel: name },
    );
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
      page = await context.newPage(),
      bad = [],
      failed = [],
      errors = [],
      requested = [];
    let dataBytes = 0,
      measuring = false;
    const responseWork = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      requested.push(u.pathname);
      if (
        u.origin !== new URL(base).origin ||
        /\/api\/|:8000|\/factor-evidence\/|\/factors\/[^?]/.test(u.href)
      )
        bad.push(u.href);
    });
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (
        measuring &&
        /\/(?:replay-manifest|factor-read-manifest)\.json|\/artifacts\/replay\/factors-|\/artifacts\/replay\/regimes-/.test(
          r.url(),
        )
      )
        responseWork.push(
          r
            .body()
            .then((body) => {
              dataBytes += body.length;
            })
            .catch((e) => {
              errors.push("Initial response measurement failed: " + e.message);
            }),
        );
    });
    for (const country of ["US", "INDIA"]) {
      const before = dataBytes,
        requestStart = requested.length,
        cutoff = CUTOFFS.at(-1),
        metadataUrls = Object.fromEntries(
          ["catalog", "audit", "ledger", "lineage"].map((kind) => [
            kind,
            manifest.artifacts[KNOWN_IDS[country + "|" + cutoff][kind]].url,
          ]),
        ),
        selectedRequests = () => requested.slice(requestStart),
        requestCount = (kind) =>
          selectedRequests().filter((url) => url === metadataUrls[kind]).length;
      responseWork.length = 0;
      measuring = true;
      await page.goto(
        base +
          "/factors?country=" +
          country +
          "&ticker=" +
          (country === "US" ? "US-MKT" : "IN-MKT"),
      );
      await page.locator('[data-factor-workspace][data-state="ready"]').waitFor();
      await page.locator('[data-diagnostics="ready"]').waitFor();
      await page.waitForLoadState("networkidle");
      measuring = false;
      await Promise.all(responseWork);
      assert.equal(requestCount("catalog"), 1, "Catalogue metadata is loaded on selection");
      for (const kind of ["audit", "ledger", "lineage"])
        assert.equal(requestCount(kind), 0, `Hidden ${kind} metadata stays deferred`);
      for (const ref of Object.values(KNOWN_BUNDLES[country][cutoff].refs))
        assert(
          selectedRequests().includes(manifest.artifacts[ref.artifact_id].url),
          "Catalogue loads every retained numerical reference",
        );
      assert(
        !selectedRequests().some((url) => /\/assets\/risk-[^/]+\.js$/.test(url)),
        "Factors does not request the unrelated Risk bundle",
      );
      assert(
        !selectedRequests().includes("/replay-manifest.json"),
        "Unrelated global history metadata stays deferred",
      );
      assert.equal(
        selectedRequests().filter((path) => path === "/factor-read-manifest.json").length,
        1,
        "One checked Factor read view is shared by shell and queries",
      );
      assert(dataBytes - before <= 512 * 1024);
      console.log(
        `${name} ${country} initial selected data: ${dataBytes - before} bytes; no Risk JS requested`,
      );
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
      for (const kind of ["audit", "ledger", "lineage"])
        assert.equal(requestCount(kind), 0, `Browsing cutoffs does not preload ${kind}`);
      await page.getByRole("button", { name: "Output audit", exact: true }).click();
      await page.getByText("Declaration audit", { exact: true }).waitFor();
      assert.equal(requestCount("audit"), 1, "Audit loads when its tab opens");
      assert.equal(requestCount("ledger"), 0, "Ledger remains deferred while audit is open");
      assert.equal(requestCount("lineage"), 0, "Metadata lineage waits for its drawer");
      assert.equal(await page.locator(".factor-audit-list details").count(), 64);
      await page.getByRole("button", { name: "Evidence ledger", exact: true }).click();
      await page.getByText("Read-only stages · no factor-zoo funnel", { exact: true }).waitFor();
      assert.equal(await page.locator(".factor-ledger article").count(), 3);
      assert.equal(requestCount("ledger"), 1, "Ledger loads when its tab opens");
      assert.equal(requestCount("lineage"), 0, "Metadata lineage remains deferred");
      await page.getByRole("button", { name: "Lineage ↗", exact: true }).click();
      await page.locator(".factor-lineage-nodes").waitFor();
      assert.equal(requestCount("lineage"), 1, "Metadata lineage loads with its drawer");
      if (name === "chrome" && country === "US")
        await page.screenshot({
          path: fileURLToPath(new URL("phase6-factors-lineage-1440.png", shots)),
          fullPage: true,
        });
      await page.getByRole("button", { name: "Close lineage" }).click();
      await page.getByRole("button", { name: "Output audit", exact: true }).click();
      await page.getByText("Declaration audit", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Evidence ledger", exact: true }).click();
      await page.getByText("Read-only stages · no factor-zoo funnel", { exact: true }).waitFor();
      await page.waitForLoadState("networkidle");
      for (const kind of ["audit", "ledger", "lineage"])
        assert.equal(requestCount(kind), 1, `Reviewed ${kind} metadata is reused from cache`);
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
      "projection-bytes",
      "projection-checksum",
      "metadata-entry",
      "metadata-source",
      "metadata-clock",
      "metadata-tenant",
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
      if (sabotage === "projection-bytes" || sabotage === "projection-checksum")
        await c.route("**/factor-read-manifest.json", (route) =>
          route.fulfill({
            body:
              sabotage === "projection-bytes"
                ? Buffer.concat([factorProjectionRaw, Buffer.from(" ")])
                : sameLengthProjection,
            contentType: "application/json",
          }),
        );
      else if (
        [
          "metadata-route",
          "reference-licence",
          "metadata-entry",
          "metadata-source",
          "metadata-clock",
          "metadata-tenant",
        ].includes(sabotage)
      )
        await c.route("**/factor-read-manifest.json", async (route) => {
          const value = structuredClone(factorProjection);
          if (sabotage === "metadata-route") {
            for (const key of Object.keys(value.routes))
              if (key.startsWith("/factor-evidence/catalog") && key.includes("country=US"))
                value.routes[key] = KNOWN_IDS["INDIA|" + cutoff].catalog;
          } else if (sabotage === "metadata-entry") value.artifacts[catalogId].scope = "LOCAL_ONLY";
          else if (sabotage === "metadata-source")
            value.artifacts[catalogId].sources = ["yfinance"];
          else if (sabotage === "metadata-clock")
            value.artifacts[catalogId].observed_at = "2026-10-10T00:00:00Z";
          else if (sabotage === "metadata-tenant") value.artifacts[catalogId].tenant_id = "other";
          else value.artifacts[ref.artifact_id].licence.status = "LOCAL_ONLY";
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
    for (const panel of ["audit", "ledger"]) {
      const c = await browser.newContext(),
        p = await c.newPage(),
        id = KNOWN_IDS["US|" + CUTOFFS.at(-1)][panel],
        requests = [];
      p.on("request", (request) => requests.push(new URL(request.url()).pathname));
      await c.route("**" + manifest.artifacts[id].url, (route) =>
        route.fulfill({ status: 404, body: "Unavailable selected metadata" }),
      );
      await p.goto(base + "/factors?country=US&ticker=US-MKT");
      await p.locator('[data-diagnostics="ready"]').waitFor();
      await p.waitForLoadState("networkidle");
      assert(!requests.includes(manifest.artifacts[id].url), `Hidden missing ${panel} is deferred`);
      await p
        .getByRole("button", {
          name: panel === "audit" ? "Output audit" : "Evidence ledger",
          exact: true,
        })
        .click();
      await p.locator('[data-factor-workspace][data-state="unavailable"]').waitFor();
      assert(
        requests.includes(manifest.artifacts[id].url),
        `Selected missing ${panel} is requested`,
      );
      assert.equal(await p.locator('[data-diagnostics="ready"]').count(), 0);
      await c.close();
    }
    await browser.close();
    console.log(
      `${name}: real US/India, three cutoffs, catalogue/audit/ledger/lineage, 1440/390, lazy metadata requests/cache reuse, zero API/vendor traffic and fourteen sabotage cases passed.`,
    );
  }
}
