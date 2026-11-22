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
  url: pinText.match(/url: "([^"]+)"/)[1],
  sha256: pinText.match(/sha256: "([0-9a-f]{64})"/)[1],
  bytes: Number(pinText.match(/bytes: (\d+)/)[1]),
  maxBytes: Number(pinText.match(/maxBytes: (\d+)/)[1]),
};
const geoDir = resolve(frontend, "public/geo");
assert.deepEqual(
  readdirSync(geoDir).filter((f) => f.startsWith("projection.")),
  [pin.url.split("/").pop()],
  "exactly one projection, the pinned one",
);
const bytes = readFileSync(resolve(frontend, "public", pin.url.slice(1)));
assert.equal(bytes.length, pin.bytes, "projection length matches the pin");
assert.equal(sha(bytes), pin.sha256, "projection SHA-256 matches the pin");
assert.ok(pin.bytes <= pin.maxBytes);
assert.equal(pin.url, `/geo/projection.${pin.sha256.slice(0, 16)}.json`, "content-addressed name");
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
  if (!x.sites) return;
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
    // Point in time: the answer as of the quake, which predates every checked source.
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
  [...statuses].sort(),
  ["AVAILABLE", "BELOW_THRESHOLD", "NO_COVERAGE", "PARTIAL", "UNAVAILABLE"],
  "every status occurs",
);
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
  assert.ok(
    text.startsWith(`${code} — `) && text.length > code.length + 12,
    `status in words: ${text}`,
  );
  seen.add(code);
  return code;
};
const activate = async (page, locator) => {
  await locator.focus();
  await page.keyboard.press("Enter");
};

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
        assert.ok(text.includes(`confidence ${e.confidence}`), `${id} confidence`);
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
      const top =
        innerWidth > 1100
          ? 0
          : document.querySelector("[data-geo-propagation]").getBoundingClientRect().top +
            scrollY -
            60;
      window.scrollTo(0, top);
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
    const quake = recorded
      .filter((e) => e.magnitude >= 5)
      .sort((a, b) => b.time.localeCompare(a.time))[0];
    await page.locator("[data-geo-choice]").selectOption(quake.id);
    assert.equal(await word(page), quake.point_in_time.status);
    assert.equal(quake.point_in_time.status, "UNAVAILABLE");
    await activate(page, page.getByRole("radio", { name: /Graph as checked/ }));
    assert.equal(await word(page), quake.retrospective.status);
    await noScroll(page, `/globe ${w}`);
    assert.deepEqual(forbidden, [], `/globe ${w}: Replay contacted a non-origin or API URL`);
    await page.close();
  }
  assert.deepEqual(
    [...seen].sort(),
    ["AVAILABLE", "BELOW_THRESHOLD", "NO_COVERAGE", "PARTIAL", "UNAVAILABLE"],
    "all five statuses rendered in words",
  );
  console.log(
    "Browser: layers toggle by keyboard; arcs, securities and cited hops; five statuses in words; Replay stayed same-origin at 1440 and 390",
  );

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
      await page.route(`**${pin.url}`, handler);
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
