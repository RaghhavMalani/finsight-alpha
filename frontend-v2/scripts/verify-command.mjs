// F1 Command and the seven-workspace layout.
// Static: workspace registry, route ownership, mnemonics and the live-record contract.
// Browser (--url): F1 with the live spine absent says so and shows no numbers; with a
// TEST-ONLY mocked /live/* (Playwright route interception) records land and link to their workspaces.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  activeWorkspace,
  CAPTURED_FUNCTION_KEYS,
  findSection,
  RESERVED_KEYS,
  SECTIONS,
  WORKSPACES,
} from "../src/app/workspaces.ts";
import { destination, freshness, parseLiveEvent, summary } from "../src/command/records.ts";

let checks = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};

// ---- Seven workspaces; F5/F7 stay with the browser.
eq(
  WORKSPACES.map((w) => [w.id, w.key, w.label]),
  [
    ["command", "F1", "COMMAND"],
    ["research", "F2", "RESEARCH"],
    ["world", "F3", "GLOBAL EYE"],
    ["agents", "F4", "FORGE"],
    ["dynamics", "Alt 5", "DYNAMICS"],
    ["market", "F6", "MARKETS"],
    ["risk", "Alt 7", "RISK"],
  ],
  "workspace order and key labels",
);
eq(CAPTURED_FUNCTION_KEYS, ["F1", "F2", "F3", "F4", "F6"], "captured function keys");
for (const key of RESERVED_KEYS) ok(!CAPTURED_FUNCTION_KEYS.includes(key), `${key} is captured`);
for (const [path, id] of [
  ["/", "command"],
  ["/command", "command"],
  ["/research", "research"],
  ["/globe", "world"],
  ["/forge", "agents"],
  ["/runs/x", "agents"],
  ["/bench/forge-v0.2.5", "agents"],
  ["/worlds", "agents"],
  ["/reality/forge-v0.2.4.1", "agents"],
  ["/artifacts", "agents"],
  ["/dynamics", "dynamics"],
  ["/observatory", "dynamics"],
  ["/markets", "market"],
  ["/markets/RELIANCE.NS", "market"],
  ["/factors", "market"],
  ["/regimes", "market"],
  ["/execution", "market"],
  ["/risk", "risk"],
  ["/data", "risk"],
])
  eq(activeWorkspace(path), id, `${path} belongs to ${id}`);
for (const s of SECTIONS) eq(findSection(s.command)?.id, s.id, `mnemonic ${s.command}`);
for (const [word, id] of [
  ["MARKETS", "market"],
  ["DYNAMICS", "regimes"],
  ["FORGE", "agents"],
  ["EXECUTION", "execution"],
])
  eq(findSection(word)?.id, id, `word ${word}`);
eq(findSection("NOPE"), undefined, "unknown word");

// ---- Live record contract: incomplete records are dropped, never repaired.
const T0 = "2026-11-16T12:00:00.000000Z";
const at = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace(".000Z", ".000000Z");
function rec(seq, type, source, payload, delay = "TEST FIXTURE: not a real feed") {
  return {
    schema_version: "live-observation/1",
    seq,
    id: `test-${seq}`.padEnd(64, "0"),
    type,
    source,
    source_id: `${source}:${seq}`,
    revision: "r1",
    observed_at: at(seq - 1),
    available_at: at(seq),
    effective_at: null,
    licence: {
      status: "TEST_FIXTURE",
      attribution: "verify-command.mjs test fixture",
      terms_url: "about:blank",
      redistribution: "NONE",
    },
    confidence: "DERIVED",
    provenance: {
      feed: source,
      url: "test:verify-command",
      fetched_at: at(seq),
      content_sha256: "0".repeat(64),
      parser: "test",
      delay,
    },
    payload,
  };
}
// TEST-ONLY fixture records. They exist only inside this verifier's intercepted responses.
const FIXTURE = [
  rec(101, "geo.event", "usgs", {
    kind: "earthquake",
    mag: 6.4,
    place: "TEST fixture quake off Honshu",
    lat: 35.1,
    lon: 141.2,
  }),
  rec(
    102,
    "market.tick",
    "yfinance_us",
    { kind: "bar", ticker: "SPY", close: 600.25 },
    "DELAYED, unofficial (test fixture)",
  ),
  rec(
    103,
    "market.tick",
    "nse",
    {
      kind: "eod",
      ticker: "RELIANCE.NS",
      close: 1400.5,
      currency: "INR",
    },
    "end of day; operator-imported bhavcopy (test fixture)",
  ),
  rec(104, "risk.alert", "finsight:risk-live", {
    check_id: "R-DATA-ATTEMPT:usgs",
    severity: "HIGH",
    outcome: "FAIL",
    subject: "usgs",
    reason: "TEST fixture: feed DOWN",
  }),
  rec(105, "research.progress", "finsight:exposure", {
    kind: "research_suggestion",
    status: "SUGGESTED",
    question: "TEST fixture: did a M6.4 quake near Tokyo move 8035.T beyond a matched control?",
    exposure: { securities: [{ ticker: "8035.T" }, { ticker: "6857.T" }] },
  }),
];
const LATE = rec(106, "geo.event", "gdelt", {
  kind: "gdelt_event",
  event_code: "190",
  place: "TEST fixture place",
  lat: 22.3,
  lon: 114.2,
});
const MALFORMED = { ...rec(107, "market.tick", "yfinance_us", { ticker: "QQQ", close: 1 }) };
delete MALFORMED.available_at;
for (const r of [...FIXTURE, LATE]) ok(parseLiveEvent(r), `fixture ${r.seq} parses`);
ok(parseLiveEvent(MALFORMED) === null, "missing available_at is dropped");
ok(parseLiveEvent({ ...LATE, type: "made.up" }) === null, "unknown type is dropped");
ok(
  parseLiveEvent({ ...LATE, provenance: { feed: "x" } }) === null,
  "missing delay label is dropped",
);
eq(destination(FIXTURE[0]).to, "/globe", "geo → F3");
eq(destination(FIXTURE[1]), { to: "/markets", search: { ticker: "SPY" } }, "tick → F6");
eq(destination(FIXTURE[3]).to, "/risk", "risk.alert → Risk");
eq(destination(FIXTURE[4]).to, "/research", "research.progress → F2");
eq(destination(FIXTURE[4]).search.q, FIXTURE[4].payload.question, "question travels as ?q=");
ok(summary(FIXTURE[0]).startsWith("M6.4 "), "quake summary from its own magnitude");
eq(
  summary(rec(9, "market.tick", "yfinance_us", { ticker: "QQQ" })),
  "QQQ close n/a",
  "no close, no number",
);
eq(
  freshness({ feed: "a", status: "UP", lag_s: 30, cadence_s: 120, last_success_at: T0 }),
  "fresh",
  "fresh",
);
eq(
  freshness({ feed: "a", status: "UP", lag_s: 900, cadence_s: 120, last_success_at: T0 }),
  "stale",
  "stale by lag",
);
eq(
  freshness({ feed: "a", status: "DEGRADED", lag_s: 1, cadence_s: 120, last_success_at: T0 }),
  "stale",
  "degraded",
);
eq(
  freshness({ feed: "a", status: "DOWN", lag_s: 1, cadence_s: 120, last_success_at: T0 }),
  "dead",
  "down",
);
eq(
  freshness({ feed: "a", status: "UP", lag_s: null, cadence_s: 120, last_success_at: null }),
  "dead",
  "never succeeded",
);
console.log(`Command: ${checks} workspace, route, mnemonic and live-record checks passed.`);

const urlIndex = process.argv.indexOf("--url");
if (urlIndex > 0) {
  const base = process.argv[urlIndex + 1].replace(/\/$/, "");
  const port = new URL(base).port;
  const shots = process.argv.includes("--screenshots")
    ? new URL("../../docs/screenshots/", import.meta.url)
    : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--host-resolver-rules=MAP command-public.test 127.0.0.1",
      "--no-proxy-server",
    ],
  });
  const HEALTH = {
    schema_version: "live-health/1",
    mode: "online",
    now: at(110),
    feeds: [
      {
        feed: "usgs",
        status: "UP",
        event_type: "geo.event",
        cadence_s: 120,
        lag_s: 40,
        last_success_at: at(70),
        delay: "near real time (test fixture)",
      },
      {
        feed: "yfinance_us",
        status: "UP",
        event_type: "market.tick",
        cadence_s: 120,
        lag_s: 2000,
        last_success_at: at(0),
        delay: "DELAYED, unofficial (test fixture)",
      },
      {
        feed: "nse",
        status: "UNAVAILABLE",
        reason: "TEST fixture: no bhavcopy",
        event_type: "market.tick",
        cadence_s: 3600,
        lag_s: null,
        last_success_at: null,
        delay: "end of day (test fixture)",
      },
    ],
  };
  const sse = (records) =>
    "retry: 60000\n\n" +
    records.map((r) => `id: ${r.seq}\nevent: ${r.type}\ndata: ${JSON.stringify(r)}\n\n`).join("");
  // The globe is a lazy WebGL chunk; screenshots wait for its canvas and a few frames.
  const settle = async (page) => {
    await page.locator(".cmd-stage canvas").waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
  };
  const numbersIn = (s) => (s.match(/\d+\.\d{2}\b/g) ?? []).length;
  const pageFor = async (width, url, live) => {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => /\/live\//.test(r.url()) && live.push(r.url()));
    await page.route(/127\.0\.0\.1:8000\/live\//, (route) => route.abort("connectionrefused"));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator('.shell[data-ready="true"][data-workspace="command"]').waitFor();
    return { page, errors };
  };
  try {
    for (const width of [1440, 390]) {
      // 1. Public host: Local Live is not allowed, so F1 says live data is local only.
      {
        const live = [];
        const { page, errors } = await pageFor(width, `http://command-public.test:${port}/`, live);
        await page.locator('.cmd[data-spine="local-only"]').waitFor();
        await page.getByText("Live data is local only", { exact: false }).first().waitFor();
        eq(live, [], `${width}: public build contacted the live spine`);
        eq(errors, [], `${width}: page errors on public F1`);
        await page.close();
      }
      // 2. Local build in Replay: no live request until Local Live; then an absent spine is named.
      {
        const live = [];
        const { page, errors } = await pageFor(width, `${base}/`, live);
        await page.locator('.cmd[data-spine="replay"]').waitFor();
        eq(live, [], `${width}: Replay contacted the live spine`);
        await page.getByRole("button", { name: "Switch to Local Live" }).click();
        await page.locator('.cmd[data-spine="not-running"]').waitFor();
        await page
          .getByText("Live spine not running — start with `python -m finsight live`.")
          .waitFor();
        const hud = await page.locator(".cmd-hud").innerText();
        eq(numbersIn(hud), 0, `${width}: absent spine shows a price-like number`);
        eq(await page.locator(".cmd-list li").count(), 0, `${width}: absent spine shows records`);
        eq(await page.locator(".cmd-stage").getAttribute("data-markers"), "0", "no live markers");
        ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}: horizontal overflow`,
        );
        if (shots) {
          await settle(page);
          await page.screenshot({
            path: fileURLToPath(new URL(`u1-command-absent-${width}.png`, shots)),
          });
        }
        eq(errors, [], `${width}: page errors with absent spine`);
        await page.close();
      }
      // 3. TEST-ONLY mocked spine: backlog from /live/recent, then SSE frames from /live/stream.
      {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: "reduce",
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        let streamCalls = 0;
        await page.route(/127\.0\.0\.1:8000\/live\/health/, (route) =>
          route.fulfill({
            json: HEALTH,
            headers: {
              "access-control-allow-origin": base,
              "access-control-allow-credentials": "true",
            },
          }),
        );
        await page.route(/127\.0\.0\.1:8000\/live\/recent/, (route) =>
          route.fulfill({
            json: { mode: "online", count: 2, last_seq: 102, events: FIXTURE.slice(0, 2) },
            headers: {
              "access-control-allow-origin": base,
              "access-control-allow-credentials": "true",
            },
          }),
        );
        await page.route(/127\.0\.0\.1:8000\/live\/stream/, (route) => {
          streamCalls++;
          const since = Number(new URL(route.request().url()).searchParams.get("since_seq"));
          return route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            headers: {
              "access-control-allow-origin": base,
              "access-control-allow-credentials": "true",
              "cache-control": "no-cache",
            },
            body: sse([...FIXTURE, LATE, MALFORMED].filter((r) => r.seq > since)),
          });
        });
        await page.goto(`${base}/`, { waitUntil: "networkidle" });
        await page.locator('.shell[data-ready="true"][data-workspace="command"]').waitFor();
        await page.getByRole("button", { name: "Switch to Local Live" }).click();
        await page.locator('.cmd-stream li[data-seq="106"]').waitFor({ timeout: 15000 });
        ok(streamCalls >= 1, "stream requested");
        eq(
          await page.locator('.cmd-stream li[data-seq="107"]').count(),
          0,
          "malformed record shown",
        );
        eq(await page.locator(".cmd-stream li").count(), 6, `${width}: stream rows`);
        eq(
          await page.locator(".cmd-stage").getAttribute("data-markers"),
          "2",
          "geo records land on the globe",
        );
        const us = page.locator('.cmd-market[data-market="US"]');
        await us.getByText("600.25").waitFor();
        await us.getByText(/yfinance_us: DELAYED, unofficial/).waitFor();
        const india = page.locator('.cmd-market[data-market="India"]');
        await india.getByText("1,400.50 INR").waitFor();
        await india.getByText(/nse: end of day .* UNAVAILABLE/).waitFor();
        eq(
          await page.locator('.cmd-feeds li[data-feed="usgs"]').getAttribute("data-fresh"),
          "fresh",
          "usgs fresh",
        );
        eq(
          await page.locator('.cmd-feeds li[data-feed="yfinance_us"]').getAttribute("data-fresh"),
          "stale",
          "yfinance stale",
        );
        eq(
          await page.locator('.cmd-feeds li[data-feed="nse"]').getAttribute("data-fresh"),
          "dead",
          "nse dead",
        );
        const title = await page.locator('.cmd-stream li[data-seq="102"] a').getAttribute("title");
        ok(
          title.includes("source yfinance_us") && title.includes(`available_at ${at(102)}`),
          "provenance on hover",
        );
        const href = (seq) =>
          page.locator(`.cmd-stream li[data-seq="${seq}"] a`).getAttribute("href");
        eq(await href(101), "/globe", "geo row → F3");
        ok((await href(102)).startsWith("/markets?ticker=SPY"), "tick row → F6");
        eq(await href(104), "/risk", "risk row → Risk");
        ok((await href(105)).startsWith("/research?q="), "research row → F2");
        await page
          .locator('section[aria-label="Research suggestions"]')
          .locator(".cmd-tickers i", { hasText: "8035.T" })
          .waitFor();
        ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}: horizontal overflow with live records`,
        );
        if (shots) {
          await settle(page);
          await page.screenshot({
            path: fileURLToPath(new URL(`u1-command-live-${width}.png`, shots)),
          });
        }
        if (width === 1440) {
          await page.locator('section[aria-label="Research suggestions"] a').first().click();
          await page.waitForURL(
            (u) =>
              u.pathname === "/research" && u.searchParams.get("q") === FIXTURE[4].payload.question,
          );
          await page.locator('.shell[data-workspace="research"]').waitFor();
          checks++;
        }
        eq(errors, [], `${width}: page errors with mocked spine`);
        await page.close();
      }
    }
    // 4. The new nav: seven workspaces with Alt 5 / Alt 7 labels and Markets tabs.
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`${base}/execution`, { waitUntil: "networkidle" });
      await page.locator('.shell[data-ready="true"][data-workspace="market"]').waitFor();
      const nav = page.getByRole("navigation", { name: "Workspaces" });
      eq(
        (await nav.locator("kbd").allInnerTexts()).map((s) => s.trim()),
        ["F1", "F2", "F3", "F4", "Alt 5", "F6", "Alt 7"],
        "nav key labels",
      );
      const tabs = page.getByRole("navigation", { name: "Markets sections" });
      eq(
        await tabs.locator("a").allInnerTexts(),
        ["Market", "Factors", "Regimes", "Execution"],
        "Markets tabs",
      );
      if (shots)
        await page.screenshot({
          path: fileURLToPath(new URL("u1-nav-1440.png", shots)),
          clip: { x: 0, y: 0, width: 1440, height: 260 },
        });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(
    `Command browser: ${checks} checks passed (absent spine, public host, mocked spine, nav).`,
  );
}
