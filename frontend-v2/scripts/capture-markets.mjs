// Real-data evidence only. The API must use a scratch auth database, as in the Phase 0 docs.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174";
const apiUrl = process.argv[3] ?? "http://127.0.0.1:8000";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname),
  "scratch auth is local only",
);
const out = new URL("../../docs/ui/markets/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const registered = await context.request.post(`${apiUrl}/auth/register`, {
    data: {
      email: `phase0-${randomBytes(8).toString("hex")}@example.invalid`,
      password: randomBytes(24).toString("hex"),
    },
  });
  assert.equal(registered.status(), 200, "local scratch account registration");
  for (const [ticker, width] of [
    ["SPY", 1440],
    ["SPY", 390],
    ["RELIANCE.NS", 1440],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/markets/${ticker}`, { waitUntil: "domcontentloaded" });
    await page.locator(".mk-candles svg").waitFor({ timeout: 120_000 });
    await page.locator(".mk-quote .mk-kpis").waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => !document.querySelector(".mk-loading"));
    const result = await page.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      unavailable: [...document.querySelectorAll(".mk-unavailable")].map((e) => e.textContent),
      quote: document.querySelector(".mk-quote .mk-panel-meta")?.textContent,
    }));
    assert.equal(result.width, width);
    assert.equal(result.overflow, 0);
    assert.deepEqual(result.unavailable, []);
    assert.deepEqual(errors, []);
    const name = `overview-${ticker.toLowerCase().replace(".", "-")}-${width}.png`;
    await page.screenshot({
      path: new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      fullPage: true,
    });
    console.log(`${name}: ${result.quote}`);
    await page.close();
  }
  await context.close();
} finally {
  await browser.close();
}
