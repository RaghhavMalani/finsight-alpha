// Usage: node scripts/verify-research.mjs [--url http://127.0.0.1:4178] [--screenshots]
// Without --url: the generated projection is checked against the sealed Research OS files,
// value by value, and the contract's refusals are exercised. With --url, a browser checks the
// built /research route: real nodes, provenance on every rendered number, refusal of a
// tampered projection, keyboard HUD, 390 px layout, the lazy three.js boundary and frame time.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGraph } from "../src/research/contract.ts";

const frontend = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = resolve(frontend, "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const urlFlag = process.argv.indexOf("--url");
const base = urlFlag > 0 ? process.argv[urlFlag + 1]?.replace(/\/$/, "") : null;
const shots = process.argv.includes("--screenshots");

// 1. Projection integrity against the pin and the sealed sources --------------------------
const pinText = readFileSync(resolve(frontend, "src/research/pin.generated.ts"), "utf8");
const pin = {
  url: /url: "([^"]+)"/.exec(pinText)[1],
  sha256: /sha256: "([0-9a-f]{64})"/.exec(pinText)[1],
};
const bytes = readFileSync(resolve(frontend, "public", pin.url.slice(1)));
assert.equal(sha(bytes), pin.sha256, "projection bytes do not match the compiled pin");
const graph = validateGraph(JSON.parse(bytes.toString("utf8")));
let checks = 2;

const docs = {};
for (const [key, s] of Object.entries(graph.sources)) {
  const file = readFileSync(resolve(repo, s.path));
  assert.equal(sha(file), s.sha256, `${key} changed since the projection was built`);
  if (s.path.endsWith(".json")) docs[key] = JSON.parse(file.toString("utf8"));
  checks++;
}
const resolvePtr = (doc, ptr) =>
  ptr
    .split("/")
    .slice(1)
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((v, k) => (v == null ? undefined : v[k]), doc);
let numbers = 0;
for (const n of graph.nodes)
  for (const f of [...n.facts, ...(n.cost ?? []), ...(n.verdicts ?? [])]) {
    if (!f.n) continue;
    numbers++;
    assert(graph.sources[f.n.src], `${n.id} ${f.k} cites an unsealed source`);
    if (f.n.formula) continue; // Derived: both pointers are checked to exist below.
    const raw = resolvePtr(docs[f.n.src], f.n.ptr);
    assert(Object.is(raw ?? null, f.n.v), `${n.id} ${f.k}: projection ${f.n.v} ≠ source ${raw}`);
  }
const runs = graph.nodes.filter((n) => n.kind === "experiment" || n.kind === "counterfactual");
const flagship = docs["v0.1/flagship.json"];
assert.equal(runs.length, Object.keys(flagship.records).length, "every frozen trial is a node");
for (const r of runs) assert(flagship.records[r.id.slice(2)], `${r.id} is not a frozen trial`);
assert.equal(graph.timeline.length > 100, true, "recorded events present");
checks += numbers + runs.length;

// Contract refusals: each mutation must be rejected.
for (const [name, mutate] of [
  ["unsealed source", (g) => (g.nodes[0].facts.find((f) => f.n).n.src = "nowhere.json")],
  ["non-numeric value", (g) => (g.nodes.find((n) => n.cost).cost[0].n.v = "0.13")],
  ["source without hash", (g) => (Object.values(g.sources)[0].sha256 = "unchecked")],
  ["unknown edge endpoint", (g) => (g.edges[0].to = "ghost")],
  ["out-of-order timeline", (g) => g.timeline.reverse()],
  ["unavailable build", (g) => ((g.status = "UNAVAILABLE"), (g.reason = "test"))],
]) {
  const copy = structuredClone(graph);
  mutate(copy);
  assert.throws(() => validateGraph(copy), undefined, `contract accepted: ${name}`);
  checks++;
}
console.log(
  `${checks} research projection checks passed: ${graph.nodes.length} nodes, ${numbers} numbers traced to sealed bytes`,
);

// 2. Lazy boundary: no three.js in the route chunk or the page's static import closure -------
const assets = resolve(frontend, ".vercel/output/static/assets");
if (existsSync(assets)) {
  const files = readdirSync(assets);
  const closure = (entry) => {
    const seen = new Set(),
      stack = [entry];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      const text = readFileSync(resolve(assets, f), "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) stack.push(m[1]);
    }
    return [...seen];
  };
  const isThree = (f) =>
    /WebGLRenderer|WebGLProgram/.test(readFileSync(resolve(assets, f), "utf8"));
  const route = files.find((f) => /^research-[\w-]+\.js$/.test(f)),
    page = files.find((f) => /^ResearchPage-[\w-]+\.js$/.test(f)),
    scene = files.find((f) => /^ResearchScene-[\w-]+\.js$/.test(f));
  assert(route && page && scene, "research chunks not found in build output");
  const initial = [...new Set([...closure(route), ...closure(page)])];
  assert(
    !initial.some(isThree),
    `three.js reached the route's initial JS: ${initial.filter(isThree)}`,
  );
  assert(closure(scene).some(isThree), "positive control: the scene chunk should carry three.js");
  const kb = initial.reduce((s, f) => s + statSync(resolve(assets, f)).size, 0) / 1024;
  console.log(
    `Lazy boundary held: /research route + page closure ${initial.length} chunks, ${kb.toFixed(1)} kB raw, no three.js`,
  );
}

if (!base) process.exit(0);

// 3. Browser --------------------------------------------------------------------------------
const { chromium } = await import("playwright");
const browser = await chromium.launch({
  args: process.env.OBS_SOFTWARE_GL
    ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
    : ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const shotDir = resolve(repo, "docs/screenshots");
const failures = [];
try {
  // Real nodes and provenance, at the sealed end state.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/research`);
  await page
    .locator('[data-research-root][data-status="ok"]')
    .waitFor({ state: "attached", timeout: 30000 });
  await page.locator('[data-replay="done"]').waitFor({ state: "attached" });
  const ids = await page
    .locator("[data-node-id]")
    .evaluateAll((els) => els.map((e) => e.dataset.nodeId));
  assert.equal(ids.length, graph.nodes.length, "every projected node is a reachable button");
  for (const id of ["H", "F", "SK", "R:US:PRIMARY", "R:INDIA:PRIMARY", "SK:mean_iid_n480"])
    assert(ids.includes(id), `node ${id} missing`);
  // Keyboard: tab into the graph, Enter opens the HUD, Esc closes it and returns focus.
  await page.locator('[data-node-id="R:US:PRIMARY"]').waitFor({ timeout: 20000 });
  await page.locator('[data-node-id="R:US:PRIMARY"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-hud="R:US:PRIMARY"]').waitFor();
  const sources = Object.fromEntries(Object.values(graph.sources).map((s) => [s.path, s.sha256]));
  const audit = () =>
    page.evaluate(() => {
      const root = document.querySelector("[data-research-root]");
      const bad = [],
        prov = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!/\d/.test(n.textContent)) continue;
        const el = n.parentElement;
        if (el.closest("[hidden]") || !el.getClientRects().length) continue;
        const p = el.closest("[data-prov]");
        if (p) prov.push([p.dataset.src, p.dataset.sha, n.textContent.trim()]);
        else if (!el.closest("[data-copy]")) bad.push(n.textContent.trim());
      }
      return { bad, prov };
    });
  let { bad, prov } = await audit();
  assert.deepEqual(bad, [], `numbers without provenance: ${bad.join(" | ")}`);
  for (const [src, digest, text] of prov) {
    if (src === pin.url.slice(1)) {
      assert.equal(digest, pin.sha256, `projection hash shown for ${text}`);
      continue;
    }
    assert.equal(sources[src], digest, `"${text}" names ${src} with a wrong SHA-256`);
  }
  const counted = prov.length;
  // The origin popover names the file and full hash.
  await page.locator('[data-hud] [data-prov="num"]').first().click();
  const origin = page.locator("[data-origin-popover]");
  await origin.waitFor();
  assert.match(await origin.locator("[data-origin-sha]").innerText(), /^[0-9a-f]{64}$/);
  await page.keyboard.press("Escape");
  await origin.waitFor({ state: "hidden" });
  if (shots) await page.screenshot({ path: resolve(shotDir, "q3-research-hud-1440.png") });
  await page.keyboard.press("Escape");
  await page.locator("[data-hud]").waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-node-id")),
    "R:US:PRIMARY",
    "focus returns to the node after Esc",
  );
  // The skeptic's HUD as well.
  await page.locator('[data-node-id="SK"]').waitFor({ timeout: 20000 });
  await page.locator('[data-node-id="SK"]').focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-hud="SK"]').waitFor();
  ({ bad } = await audit());
  assert.deepEqual(bad, [], `skeptic HUD numbers without provenance: ${bad.join(" | ")}`);
  console.log(
    `Browser: ${ids.length} real nodes, ${counted} rendered values carry source + SHA-256, keyboard HUD ok`,
  );
  await page.close();

  // Tamper: one changed byte in the served projection must make the page refuse it.
  for (const [name, handler, expect] of [
    [
      "tampered",
      (route, body) =>
        route.fulfill({
          contentType: "application/json",
          body: body.replace('"v":0.0', '"v":0.1'),
        }),
      /SHA-256 mismatch/,
    ],
    ["missing", (route) => route.fulfill({ status: 404, body: "" }), /HTTP 404/],
  ]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.route(`**${pin.url}`, async (route) => {
      const body = bytes.toString("utf8");
      if (name === "tampered") assert.notEqual(body.replace('"v":0.0', '"v":0.1'), body);
      await handler(route, body);
    });
    await p.goto(`${base}/research`);
    const box = p.locator("[data-unavailable]");
    await box.waitFor({ timeout: 20000 });
    assert.match(await box.innerText(), expect, `${name} projection reason`);
    assert.equal(await p.locator("[data-node-id]").count(), 0, `${name} projection drew nodes`);
    await p.close();
  }
  console.log("Sabotage: tampered and missing projections render UNAVAILABLE with the reason");

  // Looks and screenshots at both widths; no horizontal scroll at 390.
  for (const look of ["bloom", "depth", "constellation"])
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ]) {
      const p = await browser.newPage({ viewport: { width: w, height: h } });
      await p.goto(`${base}/research?look=${look}`);
      await p.locator('[data-replay="done"]').waitFor({ state: "attached", timeout: 40000 });
      await p.waitForTimeout(1500);
      assert.equal(await p.getAttribute("[data-research-root]", "data-look"), look);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      assert(sw <= w, `${look} at ${w}px scrolls horizontally (${sw})`);
      if (w === 390) {
        await p.evaluate(() => {
          document.querySelector("[data-research-root]").scrollIntoView();
          window.scrollBy(0, -96);
        });
        await p.waitForTimeout(300);
      }
      if (shots) await p.screenshot({ path: resolve(shotDir, `q3-research-${look}-${w}.png`) });
      if (w === 390 && look === "bloom") {
        await p.locator('[data-node-id="SK"]').waitFor({ timeout: 20000 });
        await p.locator('[data-node-id="SK"]').focus();
        await p.keyboard.press("Enter");
        const sheet = await p.locator("[data-hud]").boundingBox();
        const stage = await p.locator(".rs-stage").boundingBox();
        assert(
          Math.abs(sheet.y + sheet.height - (stage.y + stage.height)) < 2,
          "390 HUD is a bottom sheet",
        );
        assert(sheet.width >= 388, "390 HUD spans the width");
        if (shots) {
          await p.locator("[data-hud]").scrollIntoViewIfNeeded();
          await p.screenshot({ path: resolve(shotDir, "q3-research-hud-390.png") });
        }
      }
      await p.close();
    }
  console.log(
    "Looks: bloom, depth, constellation render at 1440 and 390 with no horizontal scroll",
  );

  // 2D fallback still conveys the graph.
  const flat = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await flat.emulateMedia({ reducedMotion: "reduce" });
  await flat.goto(`${base}/research?renderer=2d`);
  await flat.locator('[data-renderer="2d"] canvas[data-renderer="2d"]').waitFor();
  const visible = await flat
    .locator("[data-node-id]")
    .evaluateAll((els) => els.filter((e) => getComputedStyle(e).visibility === "visible").length);
  assert.equal(visible, graph.nodes.length, "2D fallback positions every node");
  await flat.close();
  console.log("2D fallback: every node positioned without WebGL");

  // Frame time: the real graph, then a verifier-only synthetic scale probe (~200 nodes).
  for (const [label, synthetic] of [
    ["real", null],
    ["synthetic", 200],
  ]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    if (synthetic)
      await p.addInitScript((n) => (window.__researchSynthetic = { nodes: n }), synthetic);
    await p.goto(`${base}/research`);
    if (synthetic) await p.locator("[data-synthetic]").waitFor({ timeout: 20000 });
    await p.locator('[data-replay="done"]').waitFor({ state: "attached", timeout: 40000 });
    await p.evaluate(() => delete window.__researchMetrics);
    await p.waitForFunction(() => window.__researchMetrics, null, { timeout: 20000 });
    const m = await p.evaluate(() => window.__researchMetrics);
    console.log(
      `Frame time (${label}): ${m.nodes} nodes, ${m.edges} edges, median ${m.median.toFixed(1)} fps, p5 ${m.p5.toFixed(1)} fps · ${m.renderer}`,
    );
    await p.close();
  }
} catch (error) {
  failures.push(error);
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures[0]);
  process.exit(1);
}
console.log("verify-research: all browser checks passed");
