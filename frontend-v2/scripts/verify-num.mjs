// Usage: node scripts/verify-num.mjs [--url http://127.0.0.1:4174] [--route /markets]
// U2 invariant: the UI states only what the evidence states, and every displayed number carries
// its provenance. This checker is independent of the page code: it does not import Num.tsx.
//
// Static stage (always): self-test of the numeric token rule below.
// Browser stage (--url): Playwright Chromium, Replay mode, 1440 px wide. Every route is visited and
// each visible text node holding a numeric token is collected unless it sits inside
// [data-num] (rendered by <Num>, <Hash>, <Stamp>, <Src>) or inside a documented exemption
// [data-num-exempt="<reason>"]. ENFORCED routes fail on any raw number; every other route is
// report-only and prints its count. A sabotage step injects a raw number into a converted page
// and requires the checker to flag it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// A numeric token: a currency amount, a percent, a decimal, or an integer of two or more digits.
// Inside prose a single digit ("F1", "1 of 3") is not a token.
export const TOKEN = /[$€£¥₹]\s?\d|\d+(?:\.\d+)?\s?%|\d*\.\d+|\d{2,}/;
// A text node that is nothing but a number is a value, however short: a count in a tile or cell.
export const ALONE = /^\s*[+\u2212-]?\d+(?:[.,]\d+)*\s?%?\s*$/;
// What a missing value may render as. Never a zero.
export const MISSING = /^(unavailable|n\/a)$/;
// Why a number may appear without an origin. Each reason is documented in docs/u2-num-provenance.md.
export const EXEMPT = new Set([
  "key-label", // keyboard / workspace key labels (F1 … F12, Alt 7)
  "ticker", // instrument identifiers such as 8035.T or ^N225
  "date", // calendar labels that are UI state (a chosen range, a period name), not evidence values
  "id", // identifiers and versions (forge-v0.2.5, sweep ids, schema names)
  "copy", // fixed product prose and verbatim record text (a headline, a place name)
  "axis", // chart axis tick labels: scale marks, not values
  "input", // a value the reader typed or chose (a slider position, a form field)
]);
// Origin kinds a [data-num] element may declare (see src/visual/Num.tsx).
export const KINDS = new Set(["sealed", "replay", "live"]);
// Chrome rendered by sealed files (which may not change, so cannot carry an attribute). Listed
// here by selector, with the file and the reason; counted and printed, never silently dropped.
export const SEALED_CHROME = [
  // src/app/shell/ForgeShell.tsx: the checked Replay manifest cutoff (date) in the shell header.
  ".shell-cutoff",
];
// Routes that must have zero raw numbers.
export const ENFORCED = [
  "/",
  "/research",
  "/markets",
  "/markets/:ticker",
  "/risk",
  "/data",
  "/regimes",
  "/observatory",
  "/globe",
];
// Report-only because their remaining numbers are rendered by components that cannot be edited:
// /forge … /runs by frontend-v2/src/forge, which scripts/research_archive.py protects as closed
// phase evidence (SHARED_PATHS); /dynamics by the sealed src/replay/FactorRegimeEvidence.tsx
// (eval/factors/v0.1/phase5-freeze.json). Everything else on /dynamics is provenanced.
export const PROTECTED = ["/forge", "/worlds", "/artifacts", "/bench", "/runs", "/dynamics"];

function tokens(s) {
  const g = new RegExp(TOKEN.source, "g");
  return s.match(g) ?? [];
}

// --- Static stage -------------------------------------------------------------------------------
const hits = {
  12.34: true,
  "-0.5%": true,
  "50 %": true,
  $5: true,
  "₹ 1,250": true,
  ".25": true,
  "1,024": true,
  "2026-11-15": true,
  "seq 42": true,
  F1: false,
  "Alt 7": false,
  "1 of 3": false,
  "no numbers here": false,
  x: false,
};
for (const [s, want] of Object.entries(hits))
  assert.equal(
    TOKEN.test(s),
    want,
    `token rule: ${JSON.stringify(s)} should ${want ? "" : "not "}match`,
  );
assert.deepEqual(tokens("M5.2 near 10 km"), ["5.2", "10"]);
assert.equal(TOKEN.test("unavailable"), false);
assert.equal(TOKEN.test("n/a"), false);
for (const s of ["7", " 0 ", "−3", "13", "4%"]) assert(ALONE.test(s), `alone: ${s}`);
for (const s of ["F1", "1 of 3", "#7", "v2"]) assert(!ALONE.test(s), `not alone: ${s}`);
assert(MISSING.test("unavailable") && !MISSING.test("0") && !MISSING.test("0.00"));
console.log(
  `verify-num static: token rule self-test passed (${Object.keys(hits).length + 14} cases)`,
);

// --- Browser stage ------------------------------------------------------------------------------
const urlFlag = process.argv.indexOf("--url");
const base = urlFlag > 0 ? process.argv[urlFlag + 1]?.replace(/\/$/, "") : null;
if (!base) process.exit(0);
const only =
  process.argv.indexOf("--route") > 0 ? process.argv[process.argv.indexOf("--route") + 1] : null;

// Every page route, from the route files. Layout routes, redirects and login are not pages.
const routesDir = fileURLToPath(new URL("../src/routes/", import.meta.url));
const SKIP = new Set(["__root", "markets", "bench", "runs", "command", "login"]);
const allRoutes = readdirSync(routesDir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.slice(0, -4))
  .filter((f) => !SKIP.has(f))
  .map((f) =>
    f === "index"
      ? "/"
      : "/" +
        f
          .replace(/\.index$/, "")
          .split(".")
          .map((p) => (p.startsWith("$") ? ":" + p.slice(1) : p))
          .join("/"),
  )
  .sort();

/** Runs in the page: raw numeric text nodes outside provenance, plus malformed provenance. */
function scan({ source, alone, missing, exempt, kinds, chrome }) {
  const TOKEN = new RegExp(source);
  const ALONE = new RegExp(alone);
  const MISSING = new RegExp(missing);
  const allowed = new Set(exempt);
  const okKind = new Set(kinds);
  const raw = [],
    bad = [],
    sealedChrome = [],
    replay = [];
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement)
      parts.unshift(
        e.tagName.toLowerCase() +
          (e.className && typeof e.className === "string"
            ? "." + e.className.trim().split(/\s+/)[0]
            : ""),
      );
    return parts.join(">");
  };
  const visible = (el) =>
    el.checkVisibility?.({ visibilityProperty: true, opacityProperty: false }) !== false &&
    el.getClientRects().length > 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    if (!TOKEN.test(text) && !ALONE.test(text)) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript,template,title")) continue;
    if (!visible(el)) continue;
    if (el.closest("[data-num]")) continue;
    if (chrome.some((c) => el.closest(c))) {
      sealedChrome.push(text.trim().slice(0, 80));
      continue;
    }
    const ex = el.closest("[data-num-exempt]");
    if (ex) {
      const reason = ex.getAttribute("data-num-exempt");
      if (allowed.has(reason)) continue;
      bad.push({ where: path(ex), why: `unknown exemption "${reason}"`, text: text.trim() });
      continue;
    }
    // Research's pre-U2 convention for fixed prose, checked by verify-research: same as "copy".
    if (el.closest("[data-research-root] [data-copy]")) continue;
    raw.push({ where: path(el), text: text.trim().slice(0, 80) });
  }
  // A provenance element must name its origin kind; only sealed or replay origins may carry a
  // SHA-256, and when they do it is a full 64-hex digest. A live value never claims one.
  for (const el of document.querySelectorAll("[data-num]")) {
    if (!visible(el)) continue;
    const kind = el.getAttribute("data-origin-kind");
    const sha = el.getAttribute("data-sha") ?? "";
    if (!okKind.has(kind))
      bad.push({ where: path(el), why: `origin kind "${kind}"`, text: el.textContent });
    else if (kind === "live" && sha)
      bad.push({ where: path(el), why: `${kind} value claims a SHA-256`, text: el.textContent });
    else if (sha && !/^[0-9a-f]{64}$/.test(sha))
      bad.push({ where: path(el), why: `malformed SHA-256 "${sha}"`, text: el.textContent });
    // A missing value says so; it never renders as a number (least of all zero).
    if (el.getAttribute("data-na") === "true" && !MISSING.test(el.textContent.trim()))
      bad.push({
        where: path(el),
        why: "missing value not shown as unavailable",
        text: el.textContent,
      });
    if (kind === "replay")
      replay.push({
        where: path(el),
        src: el.getAttribute("data-src") ?? "",
        sha,
        text: el.textContent,
      });
  }
  return {
    raw,
    bad,
    sealedChrome,
    replay,
    missing: document.querySelectorAll('[data-num][data-na="true"]').length,
    provenanced: document.querySelectorAll("[data-num]").length,
  };
}
const scanArgs = {
  source: TOKEN.source,
  alone: ALONE.source,
  missing: MISSING.source,
  exempt: [...EXEMPT],
  kinds: [...KINDS],
  chrome: SEALED_CHROME,
};

const { chromium } = await import("playwright");
const browser = await chromium.launch({
  // No software WebGL: the checker reads text, and a software-rendered globe starves the page.
  args: ["--no-proxy-server"],
});
const origin = new URL(base).origin;
let failed = 0;
try {
  // Replay mode, deterministic: nothing leaves the preview host (no live spine, no public feeds).
  // One context per page: a second tab of the same app would share its cross-tab state.
  const newContext = async () => {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await c.route(
      (u) => u.origin !== origin,
      (route) => route.abort("connectionrefused"),
    );
    return c;
  };
  const context = await newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // A ticker the checked Replay manifest actually carries.
  const manifest = await (await context.request.get(base + "/replay-manifest.json")).json();
  const ticker = Object.keys(manifest.artifacts)
    .filter((k) => k.startsWith("market:") && manifest.artifacts[k].status === "AVAILABLE")
    .map((k) => k.slice(7))
    .sort()[0];
  assert(ticker, "replay manifest carries no market artifact");
  // Digests the checker reads itself: every artifact entry of the checked Replay manifest and of
  // the Risk read manifest (its URL is taken from the generated read plan, not from the page).
  const plan = readFileSync(
    fileURLToPath(new URL("../src/risk-manager/read-plan.generated.ts", import.meta.url)),
    "utf8",
  );
  const riskManifestUrl = /projection:\s*\{\s*url:\s*"([^"]+)"/.exec(plan)[1];
  const riskManifest = await (await context.request.get(base + riskManifestUrl)).json();
  // The Factor read manifest, which /factors reads its artifacts through (URL from its read plan).
  const factorPlan = readFileSync(
    fileURLToPath(new URL("../src/factors/read-plan.generated.ts", import.meta.url)),
    "utf8",
  );
  const factorManifestUrl = /projection:\s*\{\s*url:\s*"([^"]+)"/.exec(factorPlan)[1];
  const factorManifest = await (await context.request.get(base + factorManifestUrl)).json();
  const MANIFEST_FILES = new Set(["/replay-manifest.json", riskManifestUrl, factorManifestUrl]);
  // The Global Eye graph projection is not in a manifest: it is pinned at build time by
  // src/components/globe/geo-pin.generated.ts (file name and SHA-256). Its served URL is a hashed
  // build asset, so a value may name any URL whose file stem is the pinned file's, with exactly the
  // pinned SHA-256; each such URL is fetched and its bytes hashed against the pin before PASS.
  const geoPin = readFileSync(
    fileURLToPath(new URL("../src/components/globe/geo-pin.generated.ts", import.meta.url)),
    "utf8",
  );
  const pinFile = /file:\s*"([^"]+)"/.exec(geoPin)[1];
  const pinSha = /sha256:\s*"([0-9a-f]{64})"/.exec(geoPin)[1];
  const pinStem = pinFile.replace(/\.json$/, "").replace(/[.]/g, "\\.");
  const pinUrl = new RegExp(`^/(?:[\\w-]+/)*${pinStem}(?:-[\\w-]+)?\\.json$`);
  const pinSeen = new Set();
  const digests = new Map();
  for (const m of [manifest, riskManifest, factorManifest])
    for (const e of Object.values(m.artifacts)) if (e.url) digests.set(e.url, e.sha256);
  /** A replay value must name a checked artifact and exactly the digest its manifest names. */
  const judge = (r) => {
    for (const x of r.replay) {
      if (pinUrl.test(x.src)) {
        pinSeen.add(x.src);
        if (x.sha !== pinSha)
          r.bad.push({ ...x, why: `replay SHA ${x.sha || "(none)"} is not the geo pin's` });
      } else if (MANIFEST_FILES.has(x.src)) {
        if (x.sha) r.bad.push({ ...x, why: `manifest file ${x.src} given a SHA-256` });
      } else if (!digests.has(x.src))
        r.bad.push({
          ...x,
          why: `replay source ${JSON.stringify(x.src)} is in no checked manifest`,
        });
      else if (digests.get(x.src) !== x.sha)
        r.bad.push({
          ...x,
          why: `replay SHA ${x.sha || "(none)"} is not the manifest's for ${x.src}`,
        });
    }
    return r;
  };
  const concrete = (r) => (r === "/markets/:ticker" ? `/markets/${encodeURIComponent(ticker)}` : r);

  // Timer polling, not animation frames: the globe can keep a software-rendered frame loop busy.
  const until = (p, sel, timeout = 30000) =>
    p.waitForFunction((q) => !!document.querySelector(q), sel, { polling: 250, timeout });
  const visit = async (route) => {
    await page.goto(base + concrete(route), { waitUntil: "networkidle", timeout: 60000 });
    await until(page, '.shell[data-ready="true"]').catch(() => {});
    await page.waitForTimeout(1500);
    return judge(await page.evaluate(scan, scanArgs));
  };

  const routes = only ? [only] : [...new Set([...ENFORCED, ...allRoutes])];
  const report = [];
  for (const route of routes) {
    if (route.includes(":") && route !== "/markets/:ticker") {
      report.push({ route, skipped: "needs an id; not visited" });
      continue;
    }
    const enforced = ENFORCED.includes(route);
    let r;
    try {
      r = await visit(route);
    } catch (e) {
      report.push({ route, enforced, error: String(e.message).split("\n")[0] });
      if (enforced) failed++;
      continue;
    }
    const fail = enforced && (r.raw.length > 0 || r.bad.length > 0);
    if (fail) failed++;
    // Malformed provenance is never acceptable, even on a report-only route.
    if (!enforced && r.bad.length) failed++;
    report.push({ route, enforced, ...r });
    const tag = enforced ? (fail ? "FAIL   " : "PASS   ") : r.bad.length ? "FAIL   " : "REPORT ";
    console.log(
      `${tag}${route.padEnd(22)} raw ${String(r.raw.length).padStart(3)} · provenanced ${String(r.provenanced).padStart(4)}${r.bad.length ? ` · malformed ${r.bad.length}` : ""}${r.sealedChrome.length ? ` · sealed chrome ${r.sealedChrome.length}` : ""}`,
    );
    if (enforced || process.argv.includes("--verbose"))
      for (const x of [...r.raw, ...r.bad].slice(0, process.argv.includes("--verbose") ? 1e9 : 15))
        console.log(
          `         ${x.why ? `[${x.why}] ` : ""}${JSON.stringify(x.text)} at ${x.where}`,
        );
  }
  for (const r of report) if (r.skipped) console.log(`SKIP   ${r.route.padEnd(22)} ${r.skipped}`);
  for (const r of report) if (r.error) console.log(`ERROR  ${r.route.padEnd(22)} ${r.error}`);

  // Further views of enforced routes, each in a fresh page: what a reader reaches by clicking.
  const VIEWS = [
    {
      route: "/",
      name: "Local Live (TEST-ONLY mocked spine)",
      run: async (p) => {
        const T = "2026-11-16T12:00:00.000000Z";
        const at = (s) => new Date(Date.parse(T) + s * 1000).toISOString();
        const rec = (seq, type, source, payload) => ({
          schema_version: "live-observation/1",
          seq,
          id: `u2-${seq}`.padEnd(64, "0"),
          type,
          source,
          source_id: `${source}:${seq}`,
          revision: "r1",
          observed_at: at(seq - 1),
          available_at: at(seq),
          effective_at: null,
          licence: {
            status: "TEST_FIXTURE",
            attribution: "verify-num.mjs test fixture",
            terms_url: "about:blank",
            redistribution: "NONE",
          },
          confidence: "DERIVED",
          provenance: { feed: source, url: "test:verify-num", fetched_at: at(seq), delay: "TEST" },
          payload,
        });
        // TEST-ONLY records: they exist only inside this checker's intercepted responses.
        const events = [
          rec(12, "market.tick", "yfinance_us", { ticker: "SPY", close: 600.25 }),
          rec(11, "geo.event", "gdelt", { kind: "gdelt_event", event_code: "190", lat: 1, lon: 2 }),
          rec(10, "macro.release", "fred", { series: "UNRATE", value: 4.1, units: "%" }),
          rec(9, "market.tick", "yfinance_us", { ticker: "QQQ" }),
        ];
        const cors = {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        };
        const health = {
          schema_version: "live-health/1",
          mode: "online",
          now: at(20),
          feeds: [
            { feed: "yfinance_us", status: "UP", cadence_s: 60, lag_s: 45, delay: "TEST 15 min" },
          ],
        };
        await p.route(/127\.0\.0\.1:8000\/live\/health/, (r) =>
          r.fulfill({ json: health, headers: cors }),
        );
        await p.route(/127\.0\.0\.1:8000\/live\/recent/, (r) => {
          const since = new URL(r.request().url()).searchParams.get("since");
          const body = since === null ? events : [];
          return r.fulfill({
            json: { mode: "online", count: body.length, last_seq: 12, events: body },
            headers: cors,
          });
        });
        await p.route(/127\.0\.0\.1:8000\/live\/stream/, (r) => r.abort("connectionrefused"));
        await p.goto(base + "/", { waitUntil: "networkidle" });
        await until(p, '.cmd[data-spine="replay"] .cmd-button');
        await p.evaluate(() => document.querySelector(".cmd-button").click());
        await until(p, '.cmd-stream li[data-seq="12"]', 20000);
        await p.waitForTimeout(1000);
        // A live value names its endpoint and record, and never a SHA-256.
        const close = p.locator('.cmd-market [data-num][data-origin-kind="live"]').first();
        assert.equal(await close.innerText(), "600.25", "live close not provenanced");
        assert.equal(await close.getAttribute("data-sha"), "", "live close claims a SHA-256");
        const title = await close.getAttribute("title");
        assert.match(title, /live API, not sealed/);
        // The record behind the value: its seq, clocks, source and licence.
        assert.match(title, /seq 12/, "live value hides its seq");
        assert.match(title, /available_at 2026-11-16T12:00:12/, "live value hides available_at");
        assert.match(title, /observed_at 2026-11-16T12:00:11/, "live value hides observed_at");
        assert.match(
          title,
          /source yfinance_us .* licence TEST_FIXTURE/,
          "live value hides source",
        );
        assert.equal(await close.getAttribute("data-seq"), "12");
        // The row link keeps the record's full provenance title.
        assert.match(
          await p.locator('.cmd-market a[title*="seq 12"]').first().getAttribute("title"),
          /available_at/,
        );
        // A known-missing value (no close in the record) says unavailable, not 0.
        const qqq = p.locator('.cmd-market li:has-text("QQQ") [data-num][data-na="true"]');
        assert.equal(
          await qqq.innerText(),
          "unavailable",
          "missing close not shown as unavailable",
        );
        // Keyboard path: the origin button beside the row opens the popover with seq and clocks.
        const prov = p.locator('.cmd-stream li[data-seq="12"] button.cmd-prov');
        await prov.focus();
        await p.keyboard.press("Enter");
        await until(p, '[data-origin-popover][data-origin-kind="live"]', 5000);
        const pop = await p.locator("[data-origin-popover]").innerText();
        for (const want of [
          /ORIGIN · LIVE/,
          /Seq\s*12/,
          /Available\s*2026-11-16T12:00:12/,
          /none · a live/,
        ])
          assert.match(pop, want, `live popover lacks ${want}`);
        await p.keyboard.press("Escape");
      },
    },
    {
      route: "/markets",
      name: "origin popover",
      run: async (p) => {
        await p.goto(base + "/markets", { waitUntil: "networkidle" });
        const first = p
          .locator('button[data-num][data-origin-kind="replay"]:not([data-src$="manifest.json"])')
          .first();
        await first.waitFor({ timeout: 20000 });
        const src = await first.getAttribute("data-src");
        const entry = Object.values(manifest.artifacts).find((e) => e.url === src);
        await first.focus();
        await p.keyboard.press("Enter");
        const pop = p.locator("[data-origin-popover]");
        await pop.waitFor();
        await p.waitForFunction(
          () =>
            getComputedStyle(document.querySelector("[data-origin-popover]")).visibility ===
            "visible",
          null,
          { polling: 100, timeout: 5000 },
        );
        // Independent of the page: the digest shown is the one the manifest names for the file.
        if (entry) {
          assert.equal(await first.getAttribute("data-sha"), entry.sha256, "replay SHA mismatch");
          // Wait until the field is rendered visible (innerText is empty for unrendered or
          // visibility:hidden text) instead of reading once; the assertion below stays exact.
          // A timeout prints the popover's actual state, so a truly empty hash is told apart.
          const shown = await p
            .waitForFunction(
              () => {
                const el = document.querySelector("[data-origin-popover] [data-origin-sha]");
                return el && el.innerText.trim() ? el.innerText : null;
              },
              null,
              { polling: 100, timeout: 10000 },
            )
            .then((h) => h.jsonValue())
            .catch(async () => {
              const state = await p.evaluate(() => {
                const pop = document.querySelector("[data-origin-popover]");
                const el = pop?.querySelector("[data-origin-sha]");
                return {
                  popovers: document.querySelectorAll("[data-origin-popover]").length,
                  kind: pop?.getAttribute("data-origin-kind"),
                  visibility: pop && getComputedStyle(pop).visibility,
                  textContent: el?.textContent ?? null,
                };
              });
              assert.fail(`popover SHA field never rendered: ${JSON.stringify(state)}`);
            });
          assert.match(shown, new RegExp(entry.sha256));
        } else assert.fail(`replay value names ${src}, which the manifest does not carry`);
        // The popover sits beside or below its value, never over it.
        const [a, b] = [await first.boundingBox(), await pop.boundingBox()];
        assert(
          b.y >= a.y + a.height ||
            b.y + b.height <= a.y ||
            b.x >= a.x + a.width ||
            b.x + b.width <= a.x,
          "popover covers its value",
        );
        assert.match(await pop.innerText(), /checked Replay artifact · not a seal/);
        await p.keyboard.press("Escape");
      },
    },
    {
      route: "/risk",
      name: "issue selected",
      run: async (p) => {
        await p.goto(base + "/risk", { waitUntil: "networkidle" });
        await p.locator('[data-testid="risk-issue-select"]').first().click();
        await p.waitForTimeout(800);
      },
    },
    {
      route: "/risk",
      name: "sweep history",
      run: async (p) => {
        await p.goto(base + "/risk", { waitUntil: "networkidle" });
        await p.getByRole("button", { name: "Sweep history", exact: true }).click();
        await p.waitForTimeout(800);
      },
    },
    ...["revisions", "lineage", "costs", "issues"].map((section) => ({
      route: "/data",
      name: section,
      run: async (p) => {
        await p.goto(base + "/data", { waitUntil: "networkidle" });
        await until(p, '.data-workspace[data-state="ready"]');
        await p.getByRole("button", { name: section, exact: false }).first().click();
        await until(p, `.data-workspace[data-view="${section}"]`, 10000);
        await p.waitForTimeout(800);
      },
    })),
    {
      route: "/risk",
      name: "coverage",
      run: async (p) => {
        await p.goto(base + "/risk", { waitUntil: "networkidle" });
        await p.getByRole("button", { name: "Coverage", exact: true }).click();
        const open = p.getByRole("button", { name: "Inspect complete coverage" });
        if (await open.count()) await open.click();
        await p.waitForTimeout(800);
      },
    },
  ];
  for (const v of only ? VIEWS.filter((x) => x.route === only) : VIEWS) {
    const viewContext = await newContext();
    const p = await viewContext.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    let r;
    try {
      await v.run(p);
      r = judge(await p.evaluate(scan, scanArgs));
    } catch (e) {
      console.log(
        `FAIL   ${v.route} · ${v.name}: ${String(e.message).split("\n").slice(0, 3).join(" ")}`,
      );
      failed++;
      await viewContext.close();
      continue;
    }
    await viewContext.close();
    const fail = r.raw.length > 0 || r.bad.length > 0;
    if (fail) failed++;
    console.log(
      `${fail ? "FAIL   " : "PASS   "}${`${v.route} · ${v.name}`.padEnd(22)} raw ${String(r.raw.length).padStart(3)} · provenanced ${String(r.provenanced).padStart(4)}${r.bad.length ? ` · malformed ${r.bad.length}` : ""}`,
    );
    for (const x of [...r.raw, ...r.bad].slice(0, 25))
      console.log(`         ${x.why ? `[${x.why}] ` : ""}${JSON.stringify(x.text)} at ${x.where}`);
  }

  // Sabotage: a raw number injected into a converted page must be flagged, and so must an
  // undocumented exemption and a live value that claims a SHA-256.
  if (!only) {
    await visit("/markets");
    const s = await page.evaluate((args) => {
      const host = document.querySelector("main") ?? document.body;
      const a = document.createElement("span");
      a.textContent = "Sharpe 1.37";
      const b = document.createElement("span");
      b.setAttribute("data-num-exempt", "because");
      b.textContent = "42";
      const c = document.createElement("span");
      c.setAttribute("data-num", "");
      c.setAttribute("data-origin-kind", "live");
      c.setAttribute("data-sha", "a".repeat(64));
      c.textContent = "99.10";
      const d = document.createElement("p");
      d.textContent = "7";
      const real = document.querySelector(
        '[data-origin-kind="replay"]:not([data-src$="manifest.json"])',
      );
      const e = real.cloneNode(true);
      e.setAttribute("data-sha", "b".repeat(64));
      const f = document.createElement("span");
      f.setAttribute("data-num", "");
      f.setAttribute("data-origin-kind", "live");
      f.setAttribute("data-na", "true");
      f.textContent = "0";
      host.prepend(a, b, c, d, e, f);
      return args;
    }, scanArgs);
    const r = judge(await page.evaluate(scan, s));
    assert(
      r.raw.some((x) => x.text === "7"),
      "sabotage: single-digit value not flagged",
    );
    assert(
      r.bad.some((x) => /replay SHA b{64} is not the manifest/.test(x.why)),
      "sabotage: swapped replay SHA not flagged",
    );
    assert(
      r.bad.some((x) => /missing value not shown as unavailable/.test(x.why)),
      "sabotage: missing value shown as 0 not flagged",
    );
    assert(
      r.raw.some((x) => x.text.includes("1.37")),
      "sabotage: injected raw number not flagged",
    );
    assert(
      r.bad.some((x) => /unknown exemption/.test(x.why)),
      "sabotage: bogus exemption not flagged",
    );
    assert(
      r.bad.some((x) => /claims a SHA-256/.test(x.why)),
      "sabotage: live SHA claim not flagged",
    );
    console.log(
      "SABOTAGE raw number, single digit, bogus exemption, live SHA claim, swapped replay SHA and missing-as-0 were all flagged",
    );
  }
  for (const src of pinSeen) {
    const bytes = await (await context.request.get(base + src)).body();
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== pinSha) {
      console.log(`FAIL   geo pin ${src} hashes to ${digest}, not the pinned ${pinSha}`);
      failed++;
    } else console.log(`PIN    ${src} matches the pinned SHA-256`);
  }
  if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(" | ")}`);
  const reportOnly = report.filter((r) => !r.enforced && r.raw);
  console.log(
    `verify-num: ${ENFORCED.length} enforced routes, ${reportOnly.length} report-only routes (${reportOnly.reduce((a, r) => a + r.raw.length, 0)} raw numbers)`,
  );
} finally {
  await browser.close();
}
if (failed) {
  console.error(`verify-num: FAILED (${failed} route checks)`);
  process.exit(1);
}
console.log("verify-num: PASS");
