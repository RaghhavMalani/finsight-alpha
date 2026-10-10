import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { validateEnvelope } from "../src/regimes/contracts.ts";

// Phase 5 public regime evidence: every /regimes/* Replay route is byte-bound,
// validates, and fails closed under semantic sabotage. --root reads another
// public directory (for example a scratch fixture export) instead of public/.
const at = process.argv.indexOf("--root");
const root =
  at > 0
    ? pathToFileURL(process.argv[at + 1].replace(/\/?$/, "/"))
    : new URL("../public/", import.meta.url);
const manifest = validateReplayManifest(
  JSON.parse(readFileSync(new URL("replay-manifest.json", root))),
);
const routes = Object.entries(manifest.routes).filter(([route]) => route.startsWith("/regimes/"));
if (!routes.length) {
  console.log("Regimes: NO_PUBLICATION_YET — no /regimes/* route in the Replay manifest.");
  process.exit(0);
}

const kindOf = (route) => route.slice("/regimes/".length).split("?")[0];
const values = new Map();
let checks = 0;
for (const [route, id] of routes) {
  const entry = manifest.artifacts[id];
  assert.equal(entry.status, "AVAILABLE", route);
  assert.ok(id.startsWith(`regimes:${kindOf(route)}:`), `${route} is not content addressed`);
  assert.equal(id.split(":").pop(), entry.sha256, `${route} identity is not its SHA-256`);
  const bytes = readFileSync(new URL(entry.url.slice(1), root));
  assert.equal(bytes.length, entry.bytes, route);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, route);
  assert.ok(entry.licence.permitted_uses.includes("publish_derived"), route);
  assert.ok(
    entry.sources.every((s) => ["ken-french:daily-factors", "iima:daily-factors"].includes(s)),
    `${route} publishes a source without a derived-publication grant`,
  );
  const value = JSON.parse(bytes);
  validateEnvelope(value, kindOf(route));
  values.set(route, value);
  checks++;
}
for (const asset of ["US-MKT", "IN-MKT"])
  for (const kind of ["snapshot", "timeline", "factors", "lineage", "history"])
    assert.ok(values.has(`/regimes/${kind}?asset=${asset}`), `missing ${kind} for ${asset}`);
assert.ok(values.has("/regimes/matrix"), "missing matrix");

for (const asset of ["US-MKT", "IN-MKT"]) {
  const snapshot = values.get(`/regimes/snapshot?asset=${asset}`).payload;
  const history = values.get(`/regimes/history?asset=${asset}`).payload;
  const lineage = values.get(`/regimes/lineage?asset=${asset}`).payload;
  // Sealed history is append-only and every entry resolves to a checked snapshot.
  const cutoffs = history.entries.map((e) => e.as_of);
  assert.deepEqual([...cutoffs].sort(), cutoffs, `${asset} history is not chronological`);
  assert.equal(new Set(cutoffs).size, cutoffs.length, `${asset} history repeats a cutoff`);
  for (const e of history.entries) {
    const sealed = manifest.artifacts[e.snapshot_artifact];
    assert.ok(sealed?.status === "AVAILABLE", `${asset} history entry ${e.as_of} is unbound`);
    checks++;
  }
  assert.equal(history.entries.at(-1).as_of, snapshot.requested_as_of);
  // Every run in the current snapshot has a verified evidence chain.
  for (const [key, chain] of Object.entries(lineage.runs)) {
    assert.equal(chain.status, "VERIFIED", `${asset} ${key} lineage is ${chain.status}`);
    checks++;
  }
  if (asset === "IN-MKT") {
    assert.equal(snapshot.observation_unit, "observation");
    assert.ok(snapshot.badges.includes("CALENDAR_UNAVAILABLE"));
    assert.ok(snapshot.module_statuses.hmm.status !== "AVAILABLE");
  }
}

const sabotage = {
  "/regimes/snapshot?asset=US-MKT": [
    (p, v) => (v.claims.validated_alpha = true),
    (p) => (p.claims.market_claim_eligible = true),
    (p) => (p.market = "SPY REGIME"),
    (p) => (p.tier = "LOCAL_ONLY"),
    (p) => (p.evidence_scope = "LOCAL_ONLY"),
    (p) => (p.module_statuses.events.status = "AVAILABLE"),
    (p) => (p.module_statuses.iohmm.status = "PARTIAL"),
    (p) => (p.module_statuses.factors.reason = null),
    (p) => (p.hmm.hmm2.posterior_semantics = "SMOOTHED"),
    (p) => (p.hmm.hmm2.path_semantics = "AS_KNOWN_THEN"),
    (p) => (p.hmm.hmm2.labels = ["BULL", "BEAR"]),
    (p) => (p.hmm.hmm2.transition_matrix[0] = [0.9, 0.2]),
    (p) => (p.hmm.hmm4.current_posterior = p.hmm.hmm4.current_posterior.map(() => 0.5)),
    (p) => (p.hmm.hmm2.duration_unit = "days"),
    (p) => delete p.frozen_research.verdicts.STATISTICAL,
    (p) => (p.frozen_research.sha256 = "unbound"),
    (p) => (p.momentum.verdict = "INCONCLUSIVE"),
    (p) => (p.fracture = { ...p.fracture, score: 0.4, coverage: 0.17 }),
    (p) => (p.input_hash = "0".repeat(63)),
    (p) => (p.hmm.hmm2.smoothed = [0.5, 0.5]),
    (p) => (p.settings = {}),
    (p) => (p.current.close = 1),
    (p) => (p.note = "SYNTHETIC world"),
    (p, v) => (v.sources = ["yfinance"]),
    (p, v) => (v.kind = "timeline"),
    (p, v) => (v.schema_version = "regimes/1"),
  ],
  "/regimes/snapshot?asset=IN-MKT": [
    (p) => (p.observation_unit = "session"),
    (p) => (p.badges = p.badges.filter((b) => b !== "CALENDAR_UNAVAILABLE")),
    (p) => (p.current.volatility.realized_vol_20_annualised = 0.2),
    (p) => (p.market = "NIFTY 50 REGIME"),
  ],
  "/regimes/timeline?asset=US-MKT": [
    (p) => p.hmm2.offset++,
    (p) => p.hmm4.state_codes.push(0),
    (p) => (p.hmm2.state_codes[0] = p.hmm2.labels.length),
    (p) => p.volatility.rv_20.pop(),
    (p) => (p.path_semantics = "AS_KNOWN_THEN"),
    (p) => (p.posterior_semantics = "SMOOTHED"),
  ],
  "/regimes/matrix": [
    (p) => (p.rows[0].tier = "LOCAL_ONLY"),
    (p) => (p.rows[0].asset = "SPY"),
    (p) => (p.rows[0].cells.event_pressure = { status: "AVAILABLE", value: 0 }),
    (p) => (p.rows[1].cells.event_pressure.value = 0),
    (p) => (p.semantics = "Aligned and filled for comparison."),
  ],
};
for (const [route, mutations] of Object.entries(sabotage)) {
  const value = values.get(route);
  for (const mutate of mutations) {
    const changed = structuredClone(value);
    mutate(changed.payload, changed);
    assert.throws(() => validateEnvelope(changed, kindOf(route)), mutate.toString());
    checks++;
  }
}
console.log(
  `Regimes: ${checks} byte, licence, lineage, history, label, semantics and sabotage checks passed.`,
);

const flag = process.argv.indexOf("--url");
if (flag > 0) {
  const base = process.argv[flag + 1].replace(/\/$/, "");
  const { chromium, firefox } = await import("playwright");
  const shots = new URL("../../docs/screenshots/", import.meta.url);
  const capture = process.argv.includes("--screenshots");
  if (capture) mkdirSync(shots, { recursive: true });
  const local = process.argv.includes("--local-browser");
  const usSha = manifest.artifacts[manifest.routes["/regimes/snapshot?asset=US-MKT"]].sha256;
  let views = 0;
  const engines = local
    ? [["chromium", chromium, { executablePath: "/opt/pw-browsers/chromium" }]]
    : [
        ["chrome", chromium, { channel: "chrome" }],
        ["edge", chromium, { channel: "msedge" }],
        ["firefox", firefox, {}],
      ];
  for (const [name, engine, options] of engines) {
    const browser = await engine.launch({ headless: true, ...options });
    const shot = async (page, file, locator) => {
      if (!capture || !["chrome", "chromium"].includes(name)) return;
      await page.evaluate(async () => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
        await new Promise(requestAnimationFrame);
      });
      const path = fileURLToPath(new URL(`phase5-regimes-${file}.png`, shots));
      // Page-coordinate clip of a full-page capture: the sticky shell never covers the panel.
      const box = await (locator ?? page.locator(".regimes-workspace")).boundingBox();
      await page.screenshot({
        path,
        fullPage: true,
        clip: {
          x: 0,
          y: Math.max(0, box.y - 8),
          width: page.viewportSize().width,
          height: box.height + 16,
        },
      });
    };
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
          if (/\/api\/|:8000|yahoo|alpaca|nseindia|niftyindices/i.test(r.url())) live.push(r.url());
        });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        const open = async (search) => {
          await page.goto(`${base}/dynamics?${search}`, { waitUntil: "networkidle" });
          await page.locator('.regimes-workspace[data-state="ready"]').waitFor();
          assert.equal(await page.locator(".regimes-workspace [role=alert]").count(), 0, search);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
            false,
            `${search} overflows at ${width}px`,
          );
          const text = await page.locator(".regimes-workspace").innerText();
          assert.ok(!/LIVE MODEL RUN|LIVE FEED/.test(text), "Replay must never say live");
          assert.ok(!/LOCAL MODEL RUN/.test(text), "Replay is not a local model run");
          assert.ok(!/\bSPY REGIME\b|ALPACA IEX/.test(text), "Local tier leaked into Replay");
          return text;
        };

        let text = await open("asset=US-MKT");
        assert.ok(text.includes("US MARKET-FACTOR REGIME"));
        assert.ok(text.includes(`REPLAY · sha256 ${usSha.slice(0, 12)}`));
        assert.ok(text.includes("CAPTURE_ONLY"));
        assert.match(text, /FROZEN RESEARCH OS RESULT/i);
        assert.match(text, /MOM FACTOR BY REGIME/i);
        assert.ok(/filtered, not calibrated/.test(text));
        assert.equal(await page.locator("#regimes-matrix tbody tr").count(), 2);
        await shot(page, `us-now-${width}`);
        if (width === 1440) await shot(page, "matrix-1440", page.locator("#regimes-matrix"));
        if (width === 390) await shot(page, "hmm-390", page.locator("#regimes-hmm"));
        await page.locator("#regimes-timeline input[type=range]").fill("0");
        assert.ok(
          /warm-up|filtered confidence/.test(await page.locator(".regimes-readout").innerText()),
        );

        await page.getByRole("button", { name: "Why is this regime state available?" }).click();
        const drawer = page.getByRole("dialog", { name: "Why is this regime state available?" });
        await drawer.getByText("capture", { exact: false }).first().waitFor();
        assert.equal(await drawer.getByText("INPUT_LINEAGE_INVALID").count(), 0);
        await drawer.getByRole("button", { name: "Close lineage" }).click();

        text = await open("asset=IN-MKT");
        assert.ok(text.includes("INDIA MARKET-FACTOR REGIME"));
        assert.ok(text.includes("CALENDAR_UNAVAILABLE"));
        assert.ok(text.includes("observation-index approximation"));
        assert.ok(!/annualised \(√252/.test(text), "India volatility must not be annualised");
        const tiles = await page.locator(".regimes-workspace > .regimes-tiles").innerText();
        assert.match(tiles, /\bobservations\b/, "India persistence is in observations");
        assert.doesNotMatch(tiles, /\bsessions\b/, "India has no evidenced sessions");
        await shot(page, `in-now-${width}`);

        text = await open("asset=US-MKT&mode=replay");
        assert.ok(/SEALED MULTI-CUTOFF TIMELINE/i.test(text));
        assert.ok((await page.locator(".regimes-history li").count()) >= 1);
        if (width === 1440) await shot(page, "us-replay-1440");

        text = await open("asset=US-MKT&mode=compare");
        assert.ok(text.includes("INDIA MARKET-FACTOR REGIME"));
        assert.ok(text.includes("Nothing is aligned, filled or ranked"));
        if (width === 1440) await shot(page, "us-compare-1440");

        text = await open("ticker=RELIANCE.NS");
        assert.ok(text.includes("RELIANCE.NS has no public regime evidence"));

        assert.deepEqual(failed, []);
        assert.deepEqual(errors, []);
        assert.deepEqual(live, []);
        await context.close();
        views++;
      }
      // Byte and semantic boundaries fail closed in the browser too. Semantic
      // sabotage is rehashed into a mocked manifest so only the validator can stop it.
      const id = manifest.routes["/regimes/snapshot?asset=US-MKT"];
      const entry = manifest.artifacts[id];
      for (const kind of ["hash", "missing", "claim", "label", "smoothed", "events"]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const altered = structuredClone(values.get("/regimes/snapshot?asset=US-MKT"));
        if (kind === "claim") altered.claims.validated_alpha = true;
        if (kind === "label") altered.payload.market = "SPY REGIME";
        if (kind === "smoothed") altered.payload.hmm.hmm2.posterior_semantics = "SMOOTHED";
        if (kind === "events") altered.payload.module_statuses.events.status = "AVAILABLE";
        const raw = kind === "hash" ? JSON.stringify(altered) + " " : JSON.stringify(altered);
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
        await page.goto(base + "/dynamics?asset=US-MKT", { waitUntil: "networkidle" });
        await page.locator('.regimes-workspace[data-state="unavailable"] [role=alert]').waitFor();
        assert.equal(await page.locator(".regimes-tile").count(), 0, kind);
        assert.equal(await page.locator("#regimes-timeline").count(), 0, kind);
        await context.close();
        views++;
      }
    } finally {
      await browser.close();
    }
  }
  console.log(
    `Regimes: ${views} ${engines.map(([n]) => n).join("/")} desktop, mobile, mode, lineage and fail-closed views passed.`,
  );
}
