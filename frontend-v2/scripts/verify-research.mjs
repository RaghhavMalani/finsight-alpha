// Usage: node scripts/verify-research.mjs [--url http://127.0.0.1:4178] [--screenshots] [--perf]
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

// 1. Projection integrity, checked independently of the page's contract and of the hashes
//    the generator wrote: sources are hashed here and compared with the export manifests,
//    and the manifests with the repository freeze inventory. States and derived values are
//    recomputed from the sealed records with this file's own implementation.
const pinText = readFileSync(resolve(frontend, "src/research/pin.generated.ts"), "utf8");
const pin = {
  url: /url: "([^"]+)"/.exec(pinText)[1],
  sha256: /sha256: "([0-9a-f]{64})"/.exec(pinText)[1],
  bytes: Number(/bytes: (\d+)/.exec(pinText)[1]),
};
const bytes = readFileSync(resolve(frontend, "public", pin.url.slice(1)));
assert.equal(bytes.length, pin.bytes, "projection length does not match the pin");
assert.equal(sha(bytes), pin.sha256, "projection bytes do not match the compiled pin");
const graph = JSON.parse(bytes.toString("utf8"));
let checks = 3;

// Inline structure check (not the page's validateGraph).
assert.equal(graph.schema_version, "research-graph/1");
assert.equal(graph.status, "AVAILABLE", `projection unavailable: ${graph.reason}`);
const ids = new Set(graph.nodes.map((n) => n.id));
assert.equal(ids.size, graph.nodes.length, "duplicate node ids");
for (const e of graph.edges) assert(ids.has(e.from) && ids.has(e.to), `edge ${e.from}→${e.to}`);
for (let i = 1; i < graph.timeline.length; i++)
  assert(
    Date.parse(graph.timeline[i].at) >= Date.parse(graph.timeline[i - 1].at),
    "timeline order",
  );

// Sources: hashed here, against the manifests, and the manifests against the freeze inventory.
const FREEZE = "eval/factors/v0.1/phase5-freeze.json";
const freeze = JSON.parse(readFileSync(resolve(repo, FREEZE), "utf8")).files;
const manifests = {};
for (const dir of ["data/exports/research_os_v0_1", "data/exports/research_os_v0_1_1"]) {
  const m = readFileSync(resolve(repo, dir, "manifest.json"));
  assert.equal(
    sha(m),
    freeze[`${dir}/manifest.json`]?.sha256,
    `${dir}/manifest.json not in ${FREEZE}`,
  );
  manifests[dir] = JSON.parse(m.toString("utf8")).files;
  checks++;
}
const docs = {},
  hashes = {};
for (const [key, s] of Object.entries(graph.sources)) {
  const file = readFileSync(resolve(repo, s.path));
  const digest = sha(file),
    dir = s.path.replace(/\/[^/]+$/, ""),
    name = s.path.slice(dir.length + 1);
  if (s.path === FREEZE) {
    // The inventory is the anchor itself; it is tracked and CI-checked by its own gate.
  } else if (s.path.endsWith("manifest.json"))
    assert.equal(
      digest,
      freeze[s.path]?.sha256,
      `${s.path} is not the manifest sealed in ${FREEZE}`,
    );
  else assert.equal(digest, manifests[dir]?.[name], `${key} is not sealed by its manifest`);
  assert.equal(s.sha256, digest, `${key}: projection names a different SHA-256`);
  hashes[s.path] = digest;
  docs[key] = s.path.endsWith(".json") ? JSON.parse(file.toString("utf8")) : file.toString("utf8");
  checks++;
}
const resolvePtr = (doc, ptr) =>
  ptr
    .split("/")
    .slice(1)
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((v, k) => (v == null ? undefined : v[k]), doc);
const pre = docs["v0.1/preregistration.json"],
  flagship = docs["v0.1/flagship.json"];
const alpha = pre.tests.find((t) => t.method === "HAC").alpha;
// Normal quantiles by bisection on a series erf, independent of the generator's method.
const erf = (x) => {
  let sum = 0,
    term = x;
  for (let n = 0; n < 80; n++) {
    sum += term / (2 * n + 1);
    term *= (-x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
};
const quantile = (p) => {
  let lo = -6,
    hi = 6;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (0.5 * (1 + erf(mid / Math.SQRT2)) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
assert(Math.abs(graph.study.z_crit.v - quantile(1 - alpha)) < 1e-6, "critical z recomputed");
let numbers = 0;
const allFacts = (n) => [
  ...n.facts,
  ...(n.cost ?? []),
  ...(n.verdicts ?? []),
  ...(n.rule?.inputs ?? []),
];
for (const n of graph.nodes)
  for (const f of allFacts(n)) {
    if (!f.n) continue;
    numbers++;
    assert(hashes[graph.sources[f.n.src]?.path], `${n.id} ${f.k} cites an unsealed source`);
    if (f.n.formula) continue;
    const raw = resolvePtr(docs[f.n.src], f.n.ptr);
    assert(Object.is(raw ?? null, f.n.v), `${n.id} ${f.k}: projection ${f.n.v} ≠ source ${raw}`);
  }
// Re-derive every trial's state, rule result, t and wall time from the sealed record.
const z975 = quantile(0.975);
const runs = graph.nodes.filter((n) => n.kind === "experiment" || n.kind === "counterfactual");
assert.equal(runs.length, Object.keys(flagship.records).length, "every frozen trial is a node");
for (const r of runs) {
  const rec = flagship.records[r.id.slice(2)];
  assert(rec, `${r.id} is not a frozen trial`);
  const res = rec.payload.result,
    holm = rec.payload.correction.HOLM;
  // Kind from the sealed DAG edge, not from the projection.
  const dagNode = flagship.dag.nodes.find((n) => n.trial_id === r.id.slice(2));
  const edgeKind = flagship.dag.edges.find((e) => e.to === dagNode.id).kind;
  assert.equal(r.kind, edgeKind === "PLACEBO" ? "counterfactual" : "experiment", `${r.id} kind`);
  const variant = r.id.split(":")[2];
  const rule =
    res.status === "UNAVAILABLE"
      ? null
      : variant === "PRIMARY"
        ? "acceptance"
        : variant === "HMM" || variant === "VOL_CLUSTER"
          ? "regime"
          : variant === "WRONG_DIRECTION" || variant.startsWith("SHUFFLED_REGIME")
            ? "specificity"
            : null;
  const passes = holm != null && holm <= alpha;
  const met = rule === "acceptance" ? passes && res.ci_lower > 0 : rule ? passes : null;
  const expected =
    res.status === "UNAVAILABLE"
      ? "unavailable"
      : rule === "specificity"
        ? met
          ? "falsified"
          : "held"
        : rule
          ? met
            ? "verified"
            : "inconclusive"
          : "recorded";
  assert.equal(r.state, expected, `${r.id} state`);
  assert.equal(r.rule ? r.rule.met : null, met, `${r.id} rule applicability`);
  if (res.status !== "UNAVAILABLE") {
    const t = res.estimate / ((res.ci_upper - res.ci_lower) / (2 * z975));
    assert(Math.abs(r.t.v - t) < 1e-6, `${r.id} t`);
    // Sidedness, independently: which tail formula reproduces the sealed p.
    const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
    const one = Math.abs(res.p_value - (1 - phi(t))),
      two = Math.abs(res.p_value - 2 * (1 - phi(Math.abs(t))));
    const sided = Math.min(one, two) > 2e-3 ? null : one < two ? "one-sided" : "two-sided";
    assert.equal(r.sided?.t ?? null, sided, `${r.id} sidedness`);
  } else assert.equal(r.t ?? null, null, `${r.id} has no t`);
  const ev = flagship.attempts.filter((a) => a.attempt === rec.attempt);
  const wall =
    (Date.parse(ev.find((a) => a.kind === "SUCCESS").at) -
      Date.parse(ev.find((a) => a.kind === "START").at)) /
    1000;
  assert(Math.abs(r.cost[0].n.v - wall) < 1e-9, `${r.id} wall time`);
  checks += 3;
}
// Verdicts that are not plain fields, re-derived here.
const node = (id) => graph.nodes.find((n) => n.id === id);
const suite = docs["v0.1/tests.json"],
  cal = docs["v0.1/calibration.json"],
  rep = docs["v0.1/repeatability.json"],
  summary = docs["v0.1.1/summary.json"],
  guard = docs["v0.1.1/pre-confirmation-guard-repair.json"],
  conf = docs["v0.1.1/confirmation.json"];
assert.equal(
  node("TESTS").state,
  suite.failures !== 0 || suite.errors !== 0
    ? "falsified"
    : /pending|do not claim green/i.test(String(suite.full_regression))
      ? "recorded"
      : "verified",
);
assert.equal(
  node("TESTS").verdict.t,
  `focused run: ${suite.total_passed} passed · ${suite.failures} failures · ${suite.errors} errors`,
);
assert.equal(node("CAL").state, cal.status === "NOT_CALIBRATED" ? "uncalibrated" : "verified");
for (const [name, c] of Object.entries(cal.cases)) {
  const word = (v) => (v ? "accepted" : "rejected");
  assert.equal(
    node(`CAL:${name}`).verdict.t,
    `null size ${word(c.null_accepted)} · power ${word(c.power_accepted)}`,
  );
}
assert.equal(
  node("REP").state,
  rep.status == null ? "unavailable" : rep.status === "IDENTICAL" ? "verified" : "falsified",
);
const logged = /Selection does not match frozen discovery/.test(
  docs["v0.1.1/pre-confirmation-rejection.log"],
);
const reproduced = conf.selection_hash === guard.old_selection_sha256;
assert.equal(
  node("SK:guard").verdict.t,
  `${logged ? "rejected" : "no rejection recorded"} · selection ${reproduced ? "reproduced" : "not reproduced"}`,
);
const dims = ["STATISTICAL", "CROSS_MARKET", "REGIME_DEPENDENCE", "ECONOMIC"];
assert.equal(
  node("F").state,
  dims.some((d) => flagship.scorecard[d] === "SUPPORTED") ? "verified" : "inconclusive",
);
assert.equal(
  node("F").finalState,
  summary.old_gate === "PERMANENTLY_CLOSED" ? "challenged" : undefined,
);
checks += 8;

// The page's own contract must refuse these mutations too (defence in depth).
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
  `${checks} research projection checks passed: ${graph.nodes.length} nodes, ${numbers} numbers traced to sealed bytes; states, t, wall time and verdicts recomputed`,
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
  const probe = files.filter(
    (f) =>
      f.endsWith(".js") &&
      readFileSync(resolve(assets, f), "utf8").includes("synthetic scale probe"),
  );
  if (!process.argv.includes("--perf"))
    assert.deepEqual(probe, [], `production build carries the perf probe: ${probe}`);
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
    : [
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        ...(process.env.RESEARCH_GPU ? ["--use-angle=d3d11", "--enable-gpu"] : []),
      ],
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
  for (const look of ["bloom"])
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
  // Retired looks fall back to Bloom.
  {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(`${base}/research?look=depth`);
    await p
      .locator('[data-research-root][data-look="bloom"]')
      .waitFor({ state: "attached", timeout: 30000 });
    await p.close();
  }
  console.log(
    "Bloom renders at 1440 and 390 with no horizontal scroll; retired looks fall back to it",
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

  // Frame time needs a build made with VITE_PERF_PROBE=true (sampler and synthetic probe
  // exist only there); run with --perf against such a build.
  if (process.argv.includes("--perf"))
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
