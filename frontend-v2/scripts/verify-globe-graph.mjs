// Usage: node scripts/verify-globe-graph.mjs [--url http://127.0.0.1:4174] [--screenshots]
// Global Eye v2, checked without importing the page code.
// Static: the pinned projection's bytes, its seed and Replay input hashes, every node and edge
// against the seed, and every propagate() answer recomputed here from the seed (radius, sites,
// distances, statuses, best chains and scores). The Python exporter is rerun in --check mode.
// Browser (--url): layers toggle by keyboard, a scenario draws arcs and lists securities with
// sources, all five statuses render in words, tampered/missing/oversized projections render
// UNAVAILABLE, Replay makes no non-origin or API request, and no horizontal scroll at 1440/390.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(frontend, "..");
const urlFlag = process.argv.indexOf("--url");
const base = urlFlag > 0 ? process.argv[urlFlag + 1].replace(/\/$/, "") : null;
const shots = process.argv.includes("--screenshots");
const sha = (b) => createHash("sha256").update(b).digest("hex");

// 1. Pin and bytes -------------------------------------------------------------------------
const pinText = readFileSync(
  resolve(frontend, "src/components/globe/geo-pin.generated.ts"),
  "utf8",
);
const pin = {
  file: pinText.match(/file: "([^"]+)"/)[1],
  sha256: pinText.match(/sha256: "([0-9a-f]{64})"/)[1],
  bytes: Number(pinText.match(/bytes: (\d+)/)[1]),
  maxBytes: Number(pinText.match(/maxBytes: (\d+)/)[1]),
};
// Bundled from src (Vite ?url), not served from public/: public/ holds only reviewed publications.
const geoDir = resolve(frontend, "src/components/globe/data");
assert.deepEqual(
  readdirSync(geoDir).filter((f) => f.startsWith("projection.")),
  [pin.file],
  "exactly one projection, the pinned one",
);
assert.match(
  pinText,
  new RegExp(`import url from "\\./data/${pin.file.replace(/\./g, "\\.")}\\?url";`),
);
const bytes = readFileSync(resolve(geoDir, pin.file));
assert.equal(bytes.length, pin.bytes, "projection length matches the pin");
assert.equal(sha(bytes), pin.sha256, "projection SHA-256 matches the pin");
assert.ok(pin.bytes <= pin.maxBytes);
assert.equal(pin.file, `projection.${pin.sha256.slice(0, 16)}.json`, "content-addressed name");
// The emitted asset keeps the content-addressed name, plus Vite's own hash.
const assetRoute = new RegExp(
  `/assets/${pin.file.replace(/\.json$/, "").replace(/\./g, "\\.")}-[^/]+\\.json$`,
);
const P = JSON.parse(bytes.toString("utf8"));
assert.equal(P.schema_version, "geo-projection/1");

// 2. Seed and Replay input -----------------------------------------------------------------
const seedBytes = readFileSync(resolve(repo, P.graph.path));
const seedLf = Buffer.from(seedBytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
assert.equal(sha(seedLf), P.graph.seed_sha256_lf, "projection names the committed seed");
const seed = JSON.parse(seedLf.toString("utf8"));
const src = (s) => ({ excerpt: "", locator: "", ...s });
const seedNodes = Object.fromEntries(
  seed.nodes.map((n) => [
    n.id,
    { lat: null, lon: null, location_precision: null, attrs: {}, ...n, source: src(n.source) },
  ]),
);
const seedEdges = Object.fromEntries(
  seed.edges.map((e) => [e.id, { ...e, source: src(e.source) }]),
);
assert.deepEqual(P.nodes, seedNodes, "every node is the seed's node, nothing added or changed");
assert.deepEqual(P.edges, seedEdges, "every edge is the seed's cited edge, nothing invented");
assert.equal(P.graph.nodes, seed.nodes.length);
assert.equal(P.graph.edges, seed.edges.length);
const avail = [...seed.nodes, ...seed.edges].map((x) => Date.parse(x.source.available_at));
assert.equal(Date.parse(P.graph.knowledge_cutoff), Math.max(...avail), "knowledge cutoff");
// propagate() answers UNAVAILABLE when no located site (facility, port, chokepoint) is known yet.
const firstSite = Math.min(
  ...seed.nodes.filter((n) => n.lat != null).map((n) => Date.parse(n.source.available_at)),
);

const manifest = JSON.parse(readFileSync(resolve(frontend, "public/replay-manifest.json"), "utf8"));
const entry = manifest.artifacts[P.input.artifact];
const worldBytes = readFileSync(resolve(frontend, "public", entry.url.slice(1)));
assert.equal(sha(worldBytes), entry.sha256, "Replay quakes match their manifest");
assert.deepEqual(
  [P.input.url, P.input.sha256, P.input.bytes, P.input.as_of],
  [entry.url, entry.sha256, entry.bytes, entry.as_of],
  "projection names the checked Replay input",
);
const world = JSON.parse(worldBytes.toString("utf8"));
const recorded = P.events.filter((e) => e.origin === "recorded");
assert.equal(recorded.length, world.events.length, "one projected answer per recorded quake");
world.events.forEach((q, i) => {
  const e = recorded[i];
  assert.deepEqual(
    [e.id, e.lat, e.lon, e.magnitude, Date.parse(e.time)],
    [q.stableId, q.lat, q.lon, q.mag, q.time],
    `recorded event ${q.stableId}`,
  );
});

// 3. Independent recomputation of propagate() ----------------------------------------------
const EARTH = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const haversine = (a, b) => {
  const h =
    Math.sin((rad(b[0]) - rad(a[0])) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin((rad(b[1]) - rad(a[1])) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(Math.min(1, h)));
};
const radiusOf = (kind, m) =>
  kind === "earthquake"
    ? m < 5
      ? null
      : Math.min(600, 50 * 2 ** (m - 5))
    : { cyclone: 300, conflict: 200, disruption: 150 }[kind];
const r4 = (x) => Math.round(x * 1e4) / 1e4;

function expected(event, cutoffIso) {
  const cutoff = Date.parse(cutoffIso);
  const radius = radiusOf(event.kind, event.magnitude);
  const nodes = Object.fromEntries(
    Object.entries(P.nodes).filter(([, n]) => Date.parse(n.source.available_at) <= cutoff),
  );
  const edges = Object.values(P.edges).filter(
    (e) => Date.parse(e.source.available_at) <= cutoff && nodes[e.src] && nodes[e.dst],
  );
  if (radius == null) return { status: "BELOW_THRESHOLD", radius };
  const located = Object.values(nodes).filter((n) => n.lat != null);
  if (!located.length) return { status: "UNAVAILABLE", radius };
  const dist = located
    .map((n) => [haversine([event.lat, event.lon], [n.lat, n.lon]), n.id])
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  const inRadius = dist.filter(([d]) => d <= radius);
  const best = new Map();
  const linked = new Set();
  for (const [d, site] of inRadius) {
    for (const link of edges.filter(
      (e) => e.dst === site && ["operates", "ships_through"].includes(e.type),
    )) {
      if (nodes[link.src].type !== "company") continue;
      const reach = [[link.src, link.confidence]];
      for (const s of edges.filter((e) => e.src === link.src && e.type === "supplies"))
        reach.push([s.dst, link.confidence * s.confidence]);
      for (const [company, w] of reach)
        for (const l of edges.filter((e) => e.src === company && e.type === "listed_as")) {
          linked.add(site);
          const score = r4((1 - d / radius) * w * l.confidence);
          best.set(l.dst, Math.max(best.get(l.dst) ?? -1, score));
        }
    }
  }
  return {
    status: best.size ? "AVAILABLE" : inRadius.length ? "PARTIAL" : "NO_COVERAGE",
    radius,
    nearest: Math.round(dist[0][0]),
    sites: inRadius.map(([d, id]) => [id, Math.round(d), linked.has(id)]),
    best,
  };
}

function check(event, answer, cutoffIso, where) {
  const x = expected(event, cutoffIso);
  assert.equal(answer.status, x.status, `${where}: status`);
  if (x.radius == null) assert.equal(answer.radius_km, null, `${where}: radius`);
  else assert.ok(Math.abs(answer.radius_km - x.radius) < 1e-9, `${where}: radius`);
  if (answer.status === "AVAILABLE") assert.ok(answer.securities.length > 0, `${where}: empty`);
  else assert.equal(answer.securities.length, 0, `${where}: securities outside AVAILABLE`);
  if (!x.sites) {
    // Not evaluated: no sites, no nearest distance, no chain count; missing is never zero.
    assert.deepEqual(answer.sites, [], `${where}: sites listed for ${answer.status}`);
    assert.ok(!("nearest_site_km" in answer), `${where}: nearest site for ${answer.status}`);
    assert.ok(!("chains_total" in answer), `${where}: chains counted for ${answer.status}`);
    return;
  }
  assert.equal(answer.nearest_site_km, x.nearest, `${where}: nearest site`);
  assert.deepEqual(
    answer.sites.map((s) => [s.site, s.distance_km, s.linked]).sort(),
    x.sites.sort(),
    `${where}: sites in radius`,
  );
  assert.deepEqual(
    answer.securities.map((s) => s.security).sort(),
    [...x.best.keys()].sort(),
    `${where}: securities`,
  );
  for (const s of answer.securities) {
    assert.ok(Math.abs(s.score - x.best.get(s.security)) <= 1e-4, `${where}: ${s.security} score`);
    // The best chain is connected, cited and scores what it claims.
    const hops = s.best_chain.hops.map((id) => P.edges[id] ?? assert.fail(`${where}: edge ${id}`));
    assert.equal(hops[0].dst, s.best_chain.site, `${where}: chain starts at its site`);
    let at = hops[0].src;
    for (const hop of hops.slice(1)) {
      assert.equal(hop.src, at, `${where}: chain connected`);
      at = hop.dst;
    }
    const listing = hops.find((h) => h.type === "listed_as");
    assert.equal(listing.dst, s.security, `${where}: chain ends at the security`);
    const d = haversine(
      [event.lat, event.lon],
      [P.nodes[s.best_chain.site].lat, P.nodes[s.best_chain.site].lon],
    );
    const product = hops
      .filter((h) => h.type !== "exposed_to")
      .reduce((a, h) => a * h.confidence, 1);
    assert.ok(
      Math.abs(r4((1 - d / x.radius) * product) - s.score) <= 1e-4,
      `${where}: chain score`,
    );
  }
}

const statuses = new Set();
const cutoff = P.graph.knowledge_cutoff;
for (const e of P.events) {
  if (e.origin === "recorded") {
    // Point in time: the answer as of the quake, using only sources available by then.
    check(e, e.point_in_time, e.time, `${e.id} at event time`);
    check(e, e.retrospective, cutoff, `${e.id} retrospective`);
    statuses.add(e.point_in_time.status).add(e.retrospective.status);
  } else {
    assert.equal(e.origin, "scenario");
    assert.equal(e.time, cutoff, "scenarios are dated at the knowledge cutoff");
    assert.match(e.label, /^Scenario: /);
    check(e, e.point_in_time, cutoff, e.id);
    statuses.add(e.point_in_time.status);
  }
}
assert.deepEqual(
  ["AVAILABLE", "BELOW_THRESHOLD", "NO_COVERAGE", "PARTIAL"].filter((x) => !statuses.has(x)),
  [],
  "every evaluated status occurs",
);
// Seed v2 dates sources by evidence of earlier availability. UNAVAILABLE may then occur only for
// a quake that predates every source; when none does, say so instead of requiring it.
if (!statuses.has("UNAVAILABLE"))
  assert.ok(
    recorded.every((e) => Date.parse(e.time) >= firstSite),
    "no UNAVAILABLE answer only because every recorded quake follows the earliest sourced site",
  );
// Recorded quakes reach cited chains at their own time (the point of seed v2).
const recordedReach = recorded.filter((e) => e.point_in_time.status === "AVAILABLE");
assert.ok(recordedReach.length >= 1, "a recorded quake reaches a security at its own time");
const taiwan = P.events.find((e) => e.id === "scenario:taiwan-m6.8");
assert.equal(taiwan.point_in_time.status, "AVAILABLE");

// Sabotage: the recomputation must catch an altered confidence and an invented security.
for (const [name, mutate] of [
  ["altered score", (a) => (a.securities[0].score += 0.05)],
  ["invented security", (a) => a.securities.push({ ...a.securities[0], security: "security:x" })],
  ["empty AVAILABLE", (a) => (a.securities = [])],
  ["dropped site", (a) => a.sites.pop()],
]) {
  const copy = structuredClone(taiwan.point_in_time);
  mutate(copy);
  assert.throws(() => check(taiwan, copy, cutoff, name), undefined, `sabotage ${name} passed`);
}

// 4. Drift: a fresh Python export must reproduce the committed bytes exactly.
if (!process.argv.includes("--no-python")) {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  execFileSync(python, [resolve(repo, "scripts/export_geo_projection.py"), "--check"], {
    cwd: repo,
    stdio: ["ignore", "inherit", "inherit"],
  });
}
console.log(
  `Static: ${P.events.length} answers (${recorded.length} recorded, ${P.events.length - recorded.length} scenarios) recomputed from the seed; ${Object.keys(P.edges).length} cited edges unchanged; 4 sabotage cases caught`,
);

if (!base) process.exit(0);

// 5. Browser -------------------------------------------------------------------------------
const { chromium } = await import("playwright");
const browser = await chromium.launch({
  args: process.env.OBS_SOFTWARE_GL
    ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
    : ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const shotDir = resolve(repo, "docs/screenshots");
const origin = new URL(base).origin;
const seen = new Set();
const open = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
  const forbidden = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin || /^\/api(?:\/|$)/.test(u.pathname)) forbidden.push(r.url());
  });
  return { page, forbidden };
};
const noScroll = async (page, where) =>
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${where}: horizontal scroll`,
  );
const stage = (page, attr) =>
  page.locator(".ge-stage").getAttribute(`data-geo-${attr}`).then(Number);
const word = async (page) => {
  const el = page.locator("[data-geo-status-word]");
  await el.waitFor();
  const code = await el.getAttribute("data-geo-status-word");
  const text = await el.innerText();
  assert.ok(new RegExp(`^${code}\\s*— .{10,}`, "s").test(text), `status in words: ${text}`);
  seen.add(code);
  return code;
};
const activate = async (page, locator) => {
  await locator.focus();
  await page.keyboard.press("Enter");
};

// The arc colour contract, written out here independently of the page: hue per edge type (an
// amber family for scenarios), linear light scaled by 0.12 + 0.88 x value, shown in sRGB.
const HUES = {
  proximity: "#ffd166",
  operates: "#5eead4",
  ships_through: "#5eead4",
  supplies: "#3fe0ff",
  listed_as: "#b794ff",
};
const SCENARIO_HUES = {
  proximity: "#ffe08a",
  operates: "#ffb347",
  ships_through: "#ffb347",
  supplies: "#ff9f43",
  listed_as: "#ffc078",
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const contract = (kind, v, scenario, gain = (x) => 0.12 + 0.88 * x) => {
  const hex = (scenario ? SCENARIO_HUES : HUES)[kind];
  return [1, 3, 5].map((i) =>
    Math.round(srgb(lin(parseInt(hex.slice(i, i + 2), 16) / 255) * gain(v)) * 255),
  );
};
const rgbOf = (css) => css.match(/\d+/g).slice(0, 3).map(Number);
const luminance = ([r, g, b]) =>
  0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
/** Every drawn arc and every legend swatch must show the contract's colour for its value. */
function checkMapping({ arcs, swatches }, scenario, formula = contract) {
  const near = (a, b, what) =>
    assert.ok(
      a.every((x, i) => Math.abs(x - b[i]) <= 1),
      `${what}: ${a} vs ${b}`,
    );
  for (const a of arcs)
    near(rgbOf(a.color), formula(a.kind, a.value, scenario), `arc ${a.kind} ${a.value}`);
  for (const s of swatches)
    near(rgbOf(s.color), formula(s.kind, s.value, scenario), `legend ${s.kind} ${s.value}`);
  const kinds = new Set(swatches.map((s) => s.kind));
  for (const k of kinds) {
    const ramp = swatches.filter((s) => s.kind === k).sort((a, b) => a.value - b.value);
    for (let i = 1; i < ramp.length; i++)
      assert.ok(
        luminance(rgbOf(ramp[i].color)) > luminance(rgbOf(ramp[i - 1].color)),
        `${k} ramp is monotonic`,
      );
  }
  assert.ok(arcs.length > 0 && swatches.length >= 16, "arcs and legend present");
}
const mapping = (page) =>
  page.evaluate(() => ({
    arcs: [...document.querySelectorAll("[data-geo-arc-list] li")].map((li) => ({
      kind: li.dataset.kind,
      value: Number(li.dataset.value),
      color: li.dataset.color,
    })),
    swatches: [...document.querySelectorAll("[data-geo-swatch]")].map((i) => ({
      kind: i.dataset.geoSwatch,
      value: Number(i.dataset.value),
      color: getComputedStyle(i).backgroundColor,
    })),
  }));
const notEvaluated = async (page, where) => {
  for (const k of ["sites", "chains", "arcs"])
    assert.equal(
      await page.locator(`[data-geo-count="${k}"]`).innerText(),
      "not evaluated",
      `${where}: ${k} is missing, not zero`,
    );
  assert.equal(await page.locator(".ge-sites").count(), 0, `${where}: no sites listed`);
};
const fontPx = (locator) => locator.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

try {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const { page, forbidden } = await open(w, h);
    await page.goto(`${base}/globe`, { waitUntil: "networkidle" });
    await page.locator('[data-geo-propagation="ok"]').waitFor({ timeout: 30000 });
    await page.locator(".ge-stage canvas").waitFor({ timeout: 30000 });
    const located = Object.values(P.nodes).filter((n) => n.lat != null).length;
    const companies = Object.values(P.nodes).filter((n) => n.type === "company").length;

    // Layers: keyboard toggles, and the scene's drawn counts follow.
    const sites = page.getByRole("button", { name: `Sites ${located}`, exact: true });
    const cos = page.getByRole("button", { name: `Companies ${companies}`, exact: true });
    assert.equal(await sites.getAttribute("aria-pressed"), "true");
    assert.ok((await stage(page, "sites")) > 0, "sites drawn");
    await activate(page, sites);
    assert.equal(await sites.getAttribute("aria-pressed"), "false");
    assert.equal(await stage(page, "sites"), 0, "sites hidden");
    await activate(page, sites);
    assert.equal(await cos.getAttribute("aria-pressed"), "false");
    await activate(page, cos);
    assert.equal(await cos.getAttribute("aria-pressed"), "true");
    assert.ok((await stage(page, "companies")) > 0 && (await stage(page, "arcs")) > 0, "companies");
    await page.waitForTimeout(1200);
    if (shots) await page.screenshot({ path: resolve(shotDir, `u3-globe-layers-${w}.png`) });
    await activate(page, cos);
    assert.equal(await stage(page, "arcs"), 0, "companies layer off");

    // A scenario reaches securities through cited hops; each is listed with its sources.
    await activate(page, page.locator('[data-geo-scenario="scenario:taiwan-m6.8"]'));
    assert.equal(await word(page), "AVAILABLE");
    assert.ok((await stage(page, "arcs")) > 0, "arcs drawn");
    // A scenario is labelled in the panel and on the globe, at a readable size.
    const tag = page.locator('[data-geo-origin="scenario"]');
    assert.match(await tag.innerText(), /Scenario · hypothetical/i);
    assert.ok((await fontPx(tag)) >= 11, "scenario tag >= 11px");
    const chip = page.locator("[data-geo-hypothetical]");
    assert.ok(await chip.isVisible(), "HYPOTHETICAL chip on the globe");
    assert.match(await chip.innerText(), /hypothetical/i);
    // The companies layer is disabled, with its reason, while the chain is drawn.
    assert.ok(await cos.isDisabled(), "companies layer disabled while a chain is drawn");
    assert.match(await cos.getAttribute("title"), /^Disabled: .*propagation chain/);
    // Arc colours and the legend follow one value -> colour mapping; a changed mapping fails.
    const drawn = await mapping(page);
    checkMapping(drawn, true);
    assert.throws(() =>
      checkMapping(drawn, true, (k, v, s) => contract(k, v, s, (x) => 0.3 + 0.7 * x)),
    );
    assert.throws(() => checkMapping(drawn, false), undefined, "scenario palette must differ");
    // On the globe: tickers only, at a readable size.
    const tickers = new Set(
      Object.values(P.nodes)
        .filter((n) => n.type === "security")
        .map((n) => n.name.split(" ")[0]),
    );
    const globeLabels = page.locator(".ge-labels .lb.sec");
    for (const t of await globeLabels.allInnerTexts())
      assert.ok(tickers.has(t.trim()), `globe label ${t} is a ticker`);
    if (await globeLabels.count())
      assert.ok((await fontPx(globeLabels.first())) >= 11, "ticker labels >= 11px");
    // Above the fold: the status and the reached securities, before any scrolling.
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const sel of ["[data-geo-status-word]", "[data-geo-security]"]) {
      const box = await page.locator(sel).first().boundingBox();
      assert.ok(box && box.y + box.height <= h, `${w}: ${sel} is above the fold`);
    }
    const listed = await page
      .locator("[data-geo-security]")
      .evaluateAll((els) => els.map((e) => e.dataset.geoSecurity));
    assert.deepEqual(
      listed,
      taiwan.point_in_time.securities.map((s) => s.security),
    );
    for (const [i, s] of taiwan.point_in_time.securities.entries()) {
      const row = page.locator("[data-geo-security]").nth(i);
      await row.locator("summary").click();
      for (const id of s.best_chain.hops) {
        const hop = row.locator(`[data-geo-hop="${id}"]`);
        const e = P.edges[id];
        const text = await hop.innerText();
        assert.ok(text.includes(e.mechanism), `${id} mechanism`);
        if (e.confidence < 1)
          assert.ok(text.includes(`confidence ${e.confidence}`), `${id} confidence`);
        else assert.ok(!text.includes("confidence"), `${id}: a confidence of 1 is not repeated`);
        assert.ok(text.includes(`${e.source.date} (${e.source.date_basis})`), `${id} date basis`);
        if (e.source.excerpt) assert.ok(text.includes(e.source.excerpt), `${id} quote`);
        if (e.source.locator) assert.ok(text.includes(e.source.locator), `${id} page`);
        assert.equal(await hop.locator("a").getAttribute("href"), e.source.url, `${id} URL`);
      }
    }
    const precision = await page.locator("[data-geo-precision]").innerText();
    assert.match(precision, /city or passage centroids; distances approximate/);
    // Screenshot state: only the first chain open, the panel scrolled to the propagation section.
    for (let i = 1; i < listed.length; i++)
      await page.locator("[data-geo-security]").nth(i).locator("summary").click();
    await page.evaluate(() => {
      document.querySelector(".ge-panel").scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    if (shots) await page.screenshot({ path: resolve(shotDir, `u3-globe-propagation-${w}.png`) });
    await noScroll(page, `/globe ${w} propagation`);

    // The other statuses, in words.
    await activate(page, page.locator('[data-geo-scenario="scenario:hormuz-conflict"]'));
    assert.equal(await word(page), "PARTIAL");
    assert.ok((await stage(page, "arcs")) > 0, "event to unlinked sites drawn");
    await activate(page, page.locator('[data-geo-scenario="scenario:hsinchu-m4.8"]'));
    assert.equal(await word(page), "BELOW_THRESHOLD");
    assert.equal(await stage(page, "arcs"), 0);
    await notEvaluated(page, "BELOW_THRESHOLD");
    assert.equal(await page.locator("[data-geo-hypothetical]").count(), 0, "no chip without arcs");
    const quake = recorded
      .filter((e) => e.magnitude >= 5)
      .sort((a, b) => b.time.localeCompare(a.time))[0];
    await page.locator("[data-geo-choice]").selectOption(quake.id);
    assert.equal(await word(page), quake.point_in_time.status);
    // Seed v2: every recorded M5+ quake follows the earliest sourced site, so its answer is
    // evaluated. "Not evaluated" counts are exercised by the BELOW_THRESHOLD scenario above; a
    // refused or tampered answer renders UNAVAILABLE without counts (checked further down).
    assert.ok(statuses.has("UNAVAILABLE") || quake.point_in_time.status !== "UNAVAILABLE");
    assert.notEqual(await page.locator('[data-geo-count="sites"]').innerText(), "not evaluated");
    assert.match(await page.locator('[data-geo-origin="recorded"]').innerText(), /recorded/i);
    await activate(page, page.getByRole("radio", { name: /Graph as checked \d{4}-\d{2}-\d{2}/ }));
    assert.equal(await word(page), quake.retrospective.status);
    assert.match(
      await page.locator("[data-geo-retrospective]").innerText(),
      /^Retrospective: .*after the event/,
    );
    assert.notEqual(await page.locator('[data-geo-count="sites"]').innerText(), "not evaluated");
    // A recorded quake that reaches securities at its own time: drawn and listed, never labelled
    // hypothetical, every listed security is the projection's.
    const real = [...recordedReach].sort((a, b) => b.magnitude - a.magnitude)[0];
    await page.locator("[data-geo-choice]").selectOption(real.id);
    await activate(page, page.getByRole("radio", { name: "At event time", exact: true }));
    const realWord = await word(page);
    assert.equal(realWord, "AVAILABLE", "the recorded quake reaches securities at its own time");
    {
      assert.ok((await stage(page, "arcs")) > 0, "a recorded quake draws its cited chain");
      assert.equal(await page.locator("[data-geo-hypothetical]").count(), 0, "recorded is not hypothetical");
      const realListed = await page
        .locator("[data-geo-security]")
        .evaluateAll((els) => els.map((e) => e.dataset.geoSecurity));
      assert.deepEqual(realListed, real.point_in_time.securities.map((x) => x.security));
    }
    await noScroll(page, `/globe ${w}`);
    assert.deepEqual(forbidden, [], `/globe ${w}: Replay contacted a non-origin or API URL`);
    await page.close();
  }
  assert.deepEqual(
    ["AVAILABLE", "BELOW_THRESHOLD", "NO_COVERAGE", "PARTIAL", ...(statuses.has("UNAVAILABLE") ? ["UNAVAILABLE"] : [])]
      .filter((x) => !seen.has(x)),
    [],
    "every status in the projection rendered in words (UNAVAILABLE also below: tampered and refused answers)",
  );
  console.log(
    "Browser: layers toggle by keyboard; arcs, securities and cited hops; every status in words; a recorded quake reaching securities at its own time; scenario and retrospective labels; one arc colour mapping (sabotage caught); answer above the fold; Replay stayed same-origin at 1440 and 390",
  );

  // Local Live, mocked: the page asks POST /geo/graph/propagate for the selected quake. A refused
  // request and a malformed answer each read UNAVAILABLE in words; switching quakes shows each
  // quake's own answer.
  {
    const { page } = await open(1440, 900);
    const usgs = readFileSync(resolve(frontend, "scripts/fixtures/usgs-4.5-week.sample.geojson"));
    await page.route(/earthquake\.usgs\.gov/, (r) =>
      r.fulfill({ contentType: "application/json", body: usgs }),
    );
    await page.route(/celestrak\.org/, (r) => r.fulfill({ status: 503, body: "" }));
    await page.route(/127\.0\.0\.1:8000\//, (r) =>
      r.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"detail":"Not authenticated"}',
      }),
    );
    const t = taiwan.point_in_time;
    const valid = {
      status: t.status,
      reason: null,
      cutoff: P.graph.knowledge_cutoff,
      nearest_site_km: t.nearest_site_km,
      chains_total: t.chains_total,
      event: { radius_km: t.radius_km },
      sites: t.sites,
      securities: t.securities.map((s) => ({
        ...s,
        best_chain: {
          ...s.best_chain,
          hops: s.best_chain.hops.map((id) => {
            const e = P.edges[id];
            return {
              edge: id,
              type: e.type,
              from: e.src,
              to: e.dst,
              confidence: e.confidence,
              mechanism: e.mechanism,
              source: e.source,
            };
          }),
        },
      })),
    };
    const plans = [
      { status: 401, contentType: "application/json", body: '{"detail":"Not authenticated"}' },
      {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...valid,
          securities: [
            {
              ...valid.securities[0],
              best_chain: { ...valid.securities[0].best_chain, hops: [{ edge: "invented" }] },
            },
          ],
        }),
      },
      { status: 200, contentType: "application/json", body: JSON.stringify(valid) },
    ];
    const byQuake = new Map();
    const calls = [];
    await page.route(/127\.0\.0\.1:8000\/geo\/graph\/propagate/, (r) => {
      const body = JSON.parse(r.request().postData());
      calls.push(body);
      const key = `${body.lat},${body.lon}`;
      if (!byQuake.has(key)) byQuake.set(key, plans[byQuake.size % plans.length]);
      return r.fulfill(byQuake.get(key));
    });
    await page.goto(`${base}/globe`);
    await page
      .getByRole("group", { name: "Data mode" })
      .getByRole("button", { name: "Local Live", exact: true })
      .click();
    await page.locator('[data-geo-propagation="ok"]').waitFor({ timeout: 30000 });
    const ids = await page
      .locator("[data-geo-choice] option")
      .evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    assert.ok(ids.length >= 3, "live M5+ quakes listed");
    const pick = async (id, status, text) => {
      await page.locator("[data-geo-choice]").selectOption(id);
      await page.locator(`[data-geo-propagation][data-geo-event="${id}"]`).waitFor();
      await page.locator(`[data-geo-status-word="${status}"]`).waitFor({ timeout: 15000 });
      const words = await page.locator("[data-geo-propagation]").innerText();
      assert.match(words, text, `${id}: ${status}`);
      assert.match(await page.locator('[data-geo-origin="live"]').innerText(), /live/i);
    };
    await pick(
      ids[0],
      "UNAVAILABLE",
      /UNAVAILABLE\s*— POST \/geo\/graph\/propagate failed: Not authenticated/,
    );
    await pick(
      ids[1],
      "UNAVAILABLE",
      /UNAVAILABLE\s*— POST \/geo\/graph\/propagate failed: (?!Not authenticated)\S/,
    );
    await pick(ids[2], "AVAILABLE", /Point-in-time answer from POST \/geo\/graph\/propagate/);
    assert.equal(await page.locator("[data-geo-security]").count(), t.securities.length);
    await pick(ids[0], "UNAVAILABLE", /Not authenticated/);
    assert.equal(
      await page.locator("[data-geo-security]").count(),
      0,
      "switching back drops the other answer",
    );
    for (const c of calls) {
      assert.deepEqual(Object.keys(c).sort(), ["kind", "lat", "lon", "magnitude", "time"]);
      assert.ok(!("as_of" in c), "the request lets the API cut at the quake's own time");
    }
    assert.equal(calls.length, 4, "one request per selection, none on re-render");
    await page.close();
    console.log(
      "Local Live (mocked): 401 and malformed answers read UNAVAILABLE in words; each quake shows its own answer",
    );
  }

  // Tamper: one changed byte, a missing file and an oversized file are each refused.
  for (const [name, handler, expect] of [
    [
      "tampered",
      (route) => {
        const body = Buffer.from(bytes);
        body[body.indexOf('"confidence":0.9') + 15] = "8".charCodeAt(0);
        return route.fulfill({ contentType: "application/json", body });
      },
      /SHA-256 mismatch/,
    ],
    ["missing", (route) => route.fulfill({ status: 404, body: "" }), /HTTP 404/],
    [
      "oversized",
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: Buffer.concat([bytes, Buffer.alloc(pin.maxBytes, 32)]),
        }),
      /Oversized/,
    ],
  ])
    for (const [w, h] of name === "tampered"
      ? [
          [1440, 900],
          [390, 844],
        ]
      : [[1440, 900]]) {
      const { page, forbidden } = await open(w, h);
      await page.route(assetRoute, handler);
      await page.goto(`${base}/globe`);
      const box = page.locator("[data-geo-unavailable]");
      await box.waitFor({ timeout: 30000 });
      const text = await box.innerText();
      assert.match(text, /^UNAVAILABLE/, `${name}: says UNAVAILABLE`);
      assert.match(text, expect, `${name}: names the reason`);
      assert.equal(await stage(page, "sites"), 0, `${name}: drew sites`);
      assert.ok(await page.getByRole("button", { name: /^Sites/ }).isDisabled(), `${name}: layer`);
      assert.equal(await page.locator("[data-geo-security]").count(), 0);
      await noScroll(page, `${name} ${w}`);
      if (shots && name === "tampered") {
        await page.locator(".ge-stage canvas").waitFor({ timeout: 30000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: resolve(shotDir, `u3-globe-unavailable-${w}.png`) });
      }
      assert.deepEqual(forbidden, [], `${name}: non-origin request`);
      await page.close();
    }
  console.log(
    "Sabotage: tampered, missing and oversized projections render UNAVAILABLE with the reason",
  );
} finally {
  await browser.close();
}
