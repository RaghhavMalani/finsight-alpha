import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DATA_KINDS,
  validateDataEnvelope,
  validateDataBinding,
} from "../src/data-organ/contracts.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";

const root = new URL("../public/", import.meta.url);
const manifest = validateReplayManifest(
  JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
);
let checks = 0;
for (const kind of DATA_KINDS) {
  const id = manifest.routes["/data/" + kind],
    entry = manifest.artifacts[id];
  const raw = readFileSync(new URL(entry.url.slice(1), root));
  assert.equal(createHash("sha256").update(raw).digest("hex"), entry.sha256);
  const value = JSON.parse(raw);
  validateDataEnvelope(value, kind);
  validateDataBinding(value, entry);
  for (const change of [
    { scope: "LOCAL_ONLY" },
    { input_hash: "a".repeat(64) },
    { sources: ["yfinance"] },
  ]) {
    assert.throws(() => validateDataBinding({ ...value, ...change }, entry));
    checks++;
  }
  for (const mutate of [
    (r) => (r.claims.validated_alpha = true),
    (r) => (r.kind = "other"),
    (r) => (r.input_hash = "fake"),
    (r) => (r.as_of = "2020-01-01"),
    (r) => (r.payload.licensed_prices_encoded = "1,2,3"),
    (r) => (r.payload.price = 100),
  ]) {
    const bad = structuredClone(value);
    mutate(bad);
    assert.throws(() => validateDataEnvelope(bad, kind));
    checks++;
  }
  const nested = structuredClone(value);
  if (kind === "health") {
    nested.payload.items[0].calendar_status = "UNAVAILABLE";
    nested.payload.items[0].missing_sessions = 0;
  }
  if (kind === "coverage") {
    const item = nested.payload.items.find((r) => r.source === "yfinance");
    item.licence = { status: "ACTIVE", permitted_uses: ["publish_derived"] };
  }
  if (kind === "revisions") nested.payload.summary.yearly[0].periods = 1;
  if (kind === "disagreement") nested.payload.summary.pairs = 1;
  if (kind === "lineage") nested.payload.items[0].source.calendar.sessions = ["2025-01-01"];
  if (kind === "issues") nested.payload.items[0].raw_price_pairs = [[1, 2]];
  if (kind === "costs") nested.payload.example.all_in_estimated_trading_cost = "0";
  assert.throws(() => validateDataEnvelope(nested, kind));
  checks++;
}
console.log("Data Organ: " + checks + " publication/clock/claim sabotage checks passed.");
const flag = process.argv.indexOf("--url");
if (flag >= 0) {
  const base = process.argv[flag + 1];
  const { chromium, firefox } = await import("playwright");
  const shots = new URL("../../docs/screenshots/", import.meta.url);
  mkdirSync(shots, { recursive: true });
  for (const [name, type, options] of [
    ["chrome", chromium, { channel: "chrome" }],
    ["edge", chromium, { channel: "msedge" }],
    ["firefox", firefox, {}],
  ]) {
    const browser = await type.launch({ headless: true, ...options });
    try {
      for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const requests = [],
          errors = [];
        page.on("request", (r) => requests.push(r.url()));
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(base + "/data", { waitUntil: "networkidle" });
        await page.locator('.data-workspace[data-state="ready"]').waitFor();
        await page.getByRole("heading", { name: "Captured source health" }).waitFor();
        if (name === "chrome")
          await page.screenshot({
            path: fileURLToPath(new URL("phase3-data-" + width + ".png", shots)),
            fullPage: true,
          });
        for (const view of ["Revisions", "Lineage", "Costs", "Issues", "Health"]) {
          await page.getByRole("button", { name: view, exact: true }).click();
          await page.locator('.data-workspace[data-view="' + view.toLowerCase() + '"]').waitFor();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
            true,
            `${name}/${width}/${view}: horizontal page overflow`,
          );
        }
        await page.getByRole("button", { name: "INDIA", exact: true }).click();
        assert.match(await page.locator(".data-workspace").innerText(), /iima:daily-factors/);
        await page.getByRole("button", { name: "ALL", exact: true }).click();
        await page.getByLabel("Command", { exact: true }).fill("US-MKT DATA");
        await page.getByLabel("Command", { exact: true }).press("Enter");
        await page.waitForURL(
          (u) => u.pathname === "/data" && u.searchParams.get("ticker") === "US-MKT",
        );
        await page.getByLabel("Command", { exact: true }).blur();
        await page.keyboard.press("F10");
        await page.locator('.shell[data-workspace="data"]').waitFor();
        assert.ok(
          !requests.some((u) => /:8000|\/api\//.test(u)),
          "public Replay attempted backend access",
        );
        assert.deepEqual(errors, []);
        await page.close();
      }
      const page = await browser.newPage();
      await page.route("**/artifacts/replay/data-organ-health-*.json", async (route) => {
        const response = await route.fetch();
        const raw = await response.body();
        raw[raw.length - 2] ^= 1;
        await route.fulfill({ response, body: raw });
      });
      await page.goto(base + "/data", { waitUntil: "networkidle" });
      await page.locator('.data-workspace[data-state="unavailable"]').waitFor();
      assert.match(await page.getByRole("alert").innerText(), /SHA-256|byte count/);
      await page.close();
      // Rehash a semantic forgery and its manifest to cross the independent byte gate.
      const attacked = structuredClone(manifest),
        id = attacked.routes["/data/health"],
        entry = attacked.artifacts[id];
      const forged = JSON.parse(readFileSync(new URL(entry.url.slice(1), root)));
      forged.payload.items[0].calendar_status = "UNAVAILABLE";
      forged.payload.items[0].missing_sessions = 0;
      const raw = JSON.stringify(forged);
      entry.sha256 = createHash("sha256").update(raw).digest("hex");
      entry.bytes = Buffer.byteLength(raw);
      const semantic = await browser.newPage();
      await semantic.route("**/replay-manifest.json", (route) => route.fulfill({ json: attacked }));
      await semantic.route("**" + entry.url, (route) =>
        route.fulfill({ body: raw, contentType: "application/json" }),
      );
      await semantic.goto(base + "/data", { waitUntil: "networkidle" });
      await semantic.locator('.data-workspace[data-state="unavailable"]').waitFor();
      assert.match(await semantic.getByRole("alert").innerText(), /manufactured calendar/);
      await semantic.close();
      console.log(
        name +
          ": desktop/mobile DATA views, factor command, F10, offline Replay and changed-byte failure passed",
      );
    } finally {
      await browser.close();
    }
  }
}
