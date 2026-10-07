import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import {
  assertDerivedPayload,
  validateReplayManifest,
  validateMarketReplay,
} from "../src/replay/contracts.ts";
import { WORKSPACES } from "../src/app/workspaces.ts";
import { fileURLToPath } from "node:url";

const root = new URL("../public/", import.meta.url);
const manifest = validateReplayManifest(
  JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
);
let checks = 0;
const urls = new Set();
for (const [id, entry] of Object.entries(manifest.artifacts)) {
  if (entry.status === "UNAVAILABLE") {
    assert.equal(entry.url, null);
    checks++;
    continue;
  }
  assert.ok(!urls.has(entry.url), `Duplicate artifact URL: ${entry.url}`);
  urls.add(entry.url);
  const bytes = readFileSync(new URL(entry.url.slice(1), root));
  assert.equal(bytes.length, entry.bytes, id);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, id);
  const value = JSON.parse(bytes);
  assertDerivedPayload(value);
  if (entry.kind === "market-series") validateMarketReplay(value, id.slice(7), entry.as_of);
  checks++;
}
for (const file of readdirSync(new URL("artifacts/replay/", root)))
  assert.ok(urls.has(`/artifacts/replay/${file}`), `Unlisted public artifact: ${file}`);
for (const change of [
  (m) => (m.claims.validated_alpha = true),
  (m) =>
    (Object.values(m.artifacts).find((e) => e.status === "AVAILABLE").licence.permitted_uses = [
      "display",
    ]),
  (m) =>
    (Object.values(m.artifacts).find((e) => e.status === "AVAILABLE").licence.valid_through =
      "2000-01-01T00:00:00Z"),
  (m) =>
    (Object.values(m.artifacts).find((e) => e.status === "AVAILABLE").available_at =
      "2099-01-01T00:00:00Z"),
  (m) =>
    (Object.values(m.artifacts).find((e) => e.status === "UNAVAILABLE").url =
      "/artifacts/replay/denied.json"),
  (m) => (m.routes["//third-party.example"] = Object.keys(m.artifacts)[0]),
]) {
  const copy = structuredClone(manifest);
  change(copy);
  assert.throws(() => validateReplayManifest(copy));
  checks++;
}
for (const value of [
  { deep: { Close: 10 } },
  { price: "123.45" },
  { bid: 10 },
  { raw_prices: [1, 2] },
  { memo: "ohlcv: [1,2]" },
]) {
  assert.throws(() => assertDerivedPayload(value));
  checks++;
}
console.log(
  `Replay: ${checks} publication, byte-hash, source, cutoff and raw-price checks passed.`,
);

// A derived fixture made from the existing simulated Phase 0 bars is strictly test-only.
const weeklyBytes = readFileSync(
  new URL("./fixtures/market-weekly.TEST_ONLY.json", import.meta.url),
);
const weekly = validateMarketReplay(JSON.parse(weeklyBytes), "SPY", "2026-01-02T22:00:00Z");
assert.ok(
  weekly.weeks.some((w) => w.regime),
  "The checked test HMM must shade some weeks",
);
for (const change of [
  (p) => (p.weeks[0].close = 1),
  (p) => (p.weeks[0].week = "2025-02-30"),
  (p) => (p.weeks[1].week = p.weeks[0].week),
  (p) => (p.weeks[0].relative_performance = 200),
  (p) => (p.latest_level = 123),
]) {
  const copy = structuredClone(weekly);
  change(copy);
  assert.throws(() => validateMarketReplay(copy, "SPY", weekly.as_of));
}

const flag = process.argv.indexOf("--url");
if (flag > 0) {
  const base = process.argv[flag + 1].replace(/\/$/, "");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--host-resolver-rules=MAP terminal-replay.test 127.0.0.1",
      "--no-proxy-server",
    ],
  });
  const shots = new URL("../../docs/screenshots/", import.meta.url);
  if (process.argv.includes("--screenshots")) mkdirSync(shots, { recursive: true });
  let views = 0;
  try {
    const paths = [
      ...WORKSPACES.map((w) => w.to),
      "/markets/RELIANCE.NS",
      "/markets/500325.BO",
      "/markets/options",
      "/markets/fundamentals",
      "/markets/risk",
      "/markets/backtest",
      "/markets/research",
      "/runs",
      "/bench",
      "/worlds",
      "/artifacts",
      "/reality/forge-v0.2.4.1",
      "/observatory?scene=neural&ticker=SPY",
      "/observatory?scene=hmm&ticker=RELIANCE.NS",
      "/",
    ];
    for (const width of [1440, 390])
      for (const path of paths) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: "reduce",
        });
        const errors = [],
          forbidden = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("requestfailed", (r) => errors.push(`${r.failure()?.errorText} ${r.url()}`));
        page.on("response", (r) => {
          if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
        });
        page.on("request", (r) => {
          const u = new URL(r.url());
          if (u.origin !== new URL(base).origin || /^\/api(?:\/|$)/.test(u.pathname))
            forbidden.push(r.url());
        });
        // No route interception: this is the actual built public Replay.
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        if (path !== "/") {
          await page.locator('.shell[data-mode="replay"] #terminal-command').waitFor();
          await page.getByRole("main").waitFor();
        }
        await page.waitForTimeout(400);
        assert.deepEqual(errors, [], `${path} @${width}: failed requests or page errors`);
        assert.deepEqual(forbidden, [], `${path} @${width}: Replay contacted a live source`);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path} @${width}: horizontal overflow`,
        );
        if (path === "/markets/RELIANCE.NS") {
          await page.getByText("NSE · IS · INR", { exact: true }).waitFor();
          assert.match(await page.locator("main").innerText(), /09:15–15:30 IST/);
        }
        if (
          process.argv.includes("--screenshots") &&
          [
            "/markets",
            "/markets/RELIANCE.NS",
            "/globe",
            "/forge",
            "/dynamics",
            "/observatory",
            "/data",
          ].includes(path)
        ) {
          const name =
            path === "/markets/RELIANCE.NS"
              ? "india"
              : path === "/markets"
                ? "market-us"
                : path === "/dynamics"
                  ? "regimes"
                  : path.slice(1);
          await page.screenshot({
            path: fileURLToPath(new URL(`phase1a-${name}-${width}.png`, shots)),
            fullPage: true,
          });
        }
        await page.close();
        views++;
      }
    // A denied source never downloads a payload, even after selecting every GP view.
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(`${base}/markets?view=graph&ticker=SPY`, { waitUntil: "networkidle" });
    for (const name of ["Relative performance", "Drawdown", "Realized volatility", "HMM regimes"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: `${name} unavailable` })
        .waitFor();
    }
    assert.ok(!requests.some((u) => /market-SPY\.json|:8000|\/api\//.test(u)));
    // A changed byte fails closed before the frozen panel renders.
    const id = manifest.routes["/forge/baselines/forge-v0.2.5"],
      entry = manifest.artifacts[id];
    await page.route(`**${entry.url}`, (r) =>
      r.fulfill({ contentType: "application/json", body: '{"sabotaged":true}' }),
    );
    await page.goto(`${base}/bench/forge-v0.2.5`, { waitUntil: "networkidle" });
    await page
      .getByText(/SHA-256 or byte count mismatch/)
      .first()
      .waitFor();
    await page.close();
    // Positive GP rendering is independent of the denied public-source coverage.
    const positive = await browser.newPage();
    const testManifest = structuredClone(manifest);
    testManifest.artifacts["market:SPY"] = {
      status: "AVAILABLE",
      kind: "market-series",
      scope: "TEST_ONLY",
      url: "/artifacts/replay/market-SPY.json",
      sha256: createHash("sha256").update(weeklyBytes).digest("hex"),
      bytes: weeklyBytes.length,
      sources: ["TEST_ONLY · Phase 0 simulated bars"],
      licence: {
        status: "FIRST_PARTY",
        dataset_key: "test:simulated-bars",
        permitted_uses: ["publish_derived"],
        valid_through: null,
      },
      as_of: weekly.as_of,
      observed_at: weekly.as_of,
      available_at: weekly.as_of,
      input_hash: weekly.method.hmm.source_input_hash,
      reason: null,
    };
    await positive.route("**/replay-manifest.json", (r) => r.fulfill({ json: testManifest }));
    await positive.route("**/artifacts/replay/market-SPY.json", (r) =>
      r.fulfill({ body: weeklyBytes, contentType: "application/json" }),
    );
    await positive.goto(`${base}/markets?ticker=SPY&view=graph`, { waitUntil: "networkidle" });
    await positive.getByText("Replay · TEST_ONLY", { exact: true }).waitFor();
    for (const name of ["Relative performance", "Drawdown", "Realized volatility", "HMM regimes"]) {
      await positive.getByRole("button", { name, exact: true }).click();
      await positive.locator(".mk-replay-chart").waitFor();
      assert.ok(!/Infinity|NaN/.test(await positive.locator("main").innerText()));
    }
    assert.ok((await positive.locator(".mk-replay-chart rect").count()) > 0);
    await positive.close();
    const publicPage = await browser.newPage();
    const publicRequests = [];
    publicPage.on("request", (r) => publicRequests.push(r.url()));
    const publicBase = base
      .replace("127.0.0.1", "terminal-replay.test")
      .replace("localhost", "terminal-replay.test");
    await publicPage.addInitScript(() => {
      localStorage.setItem("data-mode", "live");
      localStorage.setItem("mode", "live");
    });
    await publicPage.goto(`${publicBase}/data?mode=live`, { waitUntil: "networkidle" });
    assert.equal(
      await publicPage.getByRole("button", { name: "Local Live", exact: true }).isDisabled(),
      true,
    );
    await publicPage.locator('.shell[data-mode="replay"]').waitFor();
    assert.ok(
      !publicRequests.some((u) => /:8000|\/api\//.test(u)),
      "Public preferences must never enable Live",
    );
    await publicPage.close();
    // Switching mode cancels/removes prior reads before a delayed Live response can render.
    const race = await browser.newPage();
    await race.route(
      (url) => url.port === "8000",
      async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const filename =
          new URL(r.request().url()).pathname === "/tape"
            ? "tape.simulated.json"
            : "quote-bars-1y.simulated.json";
        await r
          .fulfill({
            contentType: "application/json",
            body: readFileSync(new URL(`./fixtures/markets/${filename}`, import.meta.url)),
          })
          .catch(() => {});
      },
    );
    await race.goto(`${base}/markets/SIMF`, { waitUntil: "networkidle" });
    await race.getByRole("button", { name: "Local Live", exact: true }).click();
    await race.locator('.shell[data-mode="live"]').waitFor();
    await race.getByRole("button", { name: "Replay", exact: true }).first().click();
    await race.locator('.shell[data-mode="replay"]').waitFor();
    await race.waitForTimeout(1200);
    assert.equal(await race.locator(".mk-candles").count(), 0);
    await race.getByText("Weekly market evidence", { exact: true }).waitFor();
    await race.close();
    console.log(
      `${views} unmocked Replay views at 1440/390: zero failed requests, zero API/vendor traffic, plus denied-source and SHA sabotage checks.`,
    );
  } finally {
    await browser.close();
  }
}
