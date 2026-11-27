// Usage: node scripts/verify-forge2.mjs [--url http://127.0.0.1:4174] [--screenshots]
// U4 (Forge v2 stage B): independent checks of the Run Observer debugger, the Bench observed
// relation and the Reality Ladder deltas. This checker does not import the forge2 code: it reads
// the checked Replay artifacts itself and recomputes what each surface must say from their raw
// fields, then compares the page. A sabotage case per surface serves a tampered artifact (with a
// manifest digest to match) and requires the comparison to fail.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicRoot = new URL("../public/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("replay-manifest.json", publicRoot)));
function rawArtifact(id) {
  const entry = manifest.artifacts[id];
  const bytes = readFileSync(new URL(entry.url.slice(1), publicRoot));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, id);
  return JSON.parse(bytes);
}

// ---------------------------------------------------------------- Bench: the relation sentence
const label = (model) => model.replace("gpt-5.6-", "").replace(/^./, (c) => c.toUpperCase());
const pct = (v) => (v * 100).toFixed(1) + "%";
const FIELDS = {
  verified: { key: "verified_research_success_rate", name: "verified research", better: 1, f: pct },
  falseAlpha: { key: "false_alpha_acceptance_rate", name: "false alpha", better: -1, f: pct },
  criticalFail: {
    key: "critical_gate_failure_rate",
    name: "critical failures",
    better: -1,
    f: pct,
  },
  cost: {
    key: "cost_per_verified_finding_usd",
    name: "cost per verified finding",
    better: -1,
    f: (v) => "$" + v.toFixed(5),
  },
  latency: {
    key: "mean_latency_seconds",
    name: "mean latency",
    better: -1,
    f: (v) => v.toFixed(1) + "s",
  },
  tools: { key: "mean_tool_calls", name: "mean tool calls", better: 0, f: (v) => v.toFixed(1) },
  engines: { key: "mean_engine_runs", name: "mean engine runs", better: 0, f: (v) => v.toFixed(1) },
};
const TABS = {
  verified: ["verified"],
  falseAlpha: ["falseAlpha"],
  criticalFail: ["criticalFail"],
  costPerFinding: ["cost"],
  latency: ["latency"],
  toolEngine: ["tools", "engines"],
};
const and = (xs) =>
  xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1);

/**
 * The sentence the Bench must print for a tab, from the raw model summaries. Ties and order are
 * judged on the displayed (rounded) values, so the sentence never contradicts its own numbers.
 */
export function expectedRelation(summaries, tab) {
  const rows = summaries.map((s) => ({ name: label(s.model), s }));
  if (rows.length < 2) return "A relation needs at least two models in the suite.";
  const shown = (F, r) => Number(F.f(r.s[F.key]).replace(/[$%s]/g, ""));
  const out = TABS[tab].map((fk) => {
    const F = FIELDS[fk];
    const v = (r) => shown(F, r);
    const f = (r) => F.f(r.s[F.key]);
    const vals = rows.map(v);
    if (F.better === 0) {
      const lo = Math.min(...vals),
        hi = Math.max(...vals);
      const at = (x) => rows.filter((r) => v(r) === x);
      if (lo === hi) return `All ${rows.length} models record the same ${F.name} (${f(rows[0])}).`;
      const names = (x) => and(at(x).map((r) => r.name));
      const cap = F.name[0].toUpperCase() + F.name.slice(1);
      return `${cap} range from ${f(at(lo)[0])} (${names(lo)}) to ${f(at(hi)[0])} (${names(hi)}).`;
    }
    const best = F.better > 0 ? Math.max(...vals) : Math.min(...vals);
    const top = rows.filter((r) => v(r) === best);
    const rest = rows
      .filter((r) => v(r) !== best)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (F.better > 0 ? v(b.r) - v(a.r) : v(a.r) - v(b.r)) || a.i - b.i)
      .map((x) => x.r);
    if (!rest.length) return `All ${rows.length} models tie on ${F.name} (${f(top[0])}).`;
    const head =
      top.length > 1
        ? `${and(top.map((r) => r.name))} tie on ${F.name} (${f(top[0])}); `
        : `${top[0].name} has the ${F.better > 0 ? "highest" : "lowest"} ${F.name} (${f(top[0])}); `;
    const list = and(rest.map((r) => `${r.name} (${f(r)})`));
    return `${head}${list} ${rest.length > 1 ? "are" : "is"} ${F.better > 0 ? "lower" : "higher"}.`;
  });
  let text = out.join(" ");
  if (tab === "verified") {
    const V = FIELDS.verified;
    const best = Math.max(...rows.map((r) => shown(V, r)));
    const tied = rows.filter((r) => shown(V, r) === best);
    if (tied.length > 1) {
      const word = tied.length === 2 ? "lower" : "lowest";
      const low = (F) => {
        const m = Math.min(...tied.map((r) => shown(F, r)));
        const at = tied.filter((r) => shown(F, r) === m);
        return at.length === 1 ? at[0] : null;
      };
      const c = low(FIELDS.cost),
        l = low(FIELDS.latency);
      const val = (r, F) => F.f(r.s[F.key]);
      if (c && l && c === l)
        text += ` Of the tied models, ${c.name} has the ${word} ${FIELDS.cost.name} (${val(c, FIELDS.cost)}) and the ${word} ${FIELDS.latency.name} (${val(l, FIELDS.latency)}).`;
      else
        for (const [r, F] of [
          [c, FIELDS.cost],
          [l, FIELDS.latency],
        ])
          if (r) text += ` Of the tied models, ${r.name} has the ${word} ${F.name} (${val(r, F)}).`;
    }
  }
  return text;
}

// ------------------------------------------------------------- Reality Ladder: deltas and worst
const LADDER = {
  sharpe: { get: (c) => c.metrics.sharpe, p: 4, unit: "" },
  maxDrawdown: { get: (c) => c.metrics.max_drawdown, p: 4, unit: "" },
  slippage: { get: (c) => c.metrics.slippage, p: 2, unit: "$" },
  latencyCost: { get: (c) => c.metrics.latency_cost, p: 2, unit: "$" },
  runtime: { get: (c) => c.runtime_seconds_total, p: 4, unit: "s" },
};
function fmtDelta(d, { p, unit }) {
  const n = Math.abs(d).toFixed(p);
  const sign = Number(n) === 0 ? "" : d < 0 ? "−" : "+";
  return sign + (unit === "$" ? "$" : "") + n + (unit === "s" ? "s" : "");
}
// The checkpoint pair each recorded decomposition component measures (forge-reality-ladder/0.2.4.1),
// declared here independently of the page and checked against the artifact's decomposition values.
const COMPONENT = {
  idealization_gap: ["L0_ANALYTICAL", "L1_VECTORBT"],
  model_semantic_decay: ["L1_VECTORBT", "L2_NAUTILUS"],
  fee_decay: ["L2_NAUTILUS", "L3_FEES_SLIPPAGE"],
  latency_decay: ["L3_FEES_SLIPPAGE", "L3_LATENCY"],
  stress_decay: ["L3_LATENCY", "L4_COUNTERFACTUAL_STRESS"],
};
/** Whether the artifact's recorded largest degradation names the computed step. */
export function expectedMatch(reality) {
  const { worst } = expectedLadder(reality, "sharpe");
  const rec = reality.aggregate.largest_degradation;
  const pair = COMPONENT[rec.component];
  return (
    !!worst &&
    !!pair &&
    pair[0] === worst.from &&
    pair[1] === worst.to &&
    Math.abs(worst.d - rec.sharpe_change) < 1e-9
  );
}
/** Short x codes (L0…L4, lettered where a level repeats) and the chart's run labels. */
export function expectedChartLabels(reality, metric) {
  const cps = reality.aggregate.checkpoints;
  const pre = cps.map((c) => c.checkpoint.split("_")[0]);
  const code = pre.map((p, i) =>
    pre.filter((q) => q === p).length < 2
      ? p
      : p + "abcdef"[pre.slice(0, i).filter((q) => q === p).length],
  );
  const M = LADDER[metric];
  const fmt = (c) =>
    (M.unit === "$" ? "$" : "") + M.get(c).toFixed(M.p) + (M.unit === "s" ? "s" : "");
  const out = [];
  for (let i = 0; i < cps.length;) {
    let j = i;
    while (j + 1 < cps.length && M.get(cps[j + 1]) === M.get(cps[i])) j++;
    out.push((j > i ? `${code[i]}–${code[j]} = ` : "") + fmt(cps[i]));
    i = j + 1;
  }
  return out;
}
/** Consecutive deltas by checkpoint id, and the most negative Sharpe step. */
export function expectedLadder(reality, metric) {
  const cps = reality.aggregate.checkpoints;
  const M = LADDER[metric];
  const deltas = {};
  let worst = null;
  for (let i = 1; i < cps.length; i++) {
    deltas[cps[i].checkpoint] = fmtDelta(M.get(cps[i]) - M.get(cps[i - 1]), M);
    const ds = cps[i].metrics.sharpe - cps[i - 1].metrics.sharpe;
    if (ds < 0 && (!worst || ds < worst.d))
      worst = { from: cps[i - 1].checkpoint, to: cps[i].checkpoint, d: ds };
  }
  return { deltas, worst: worst && { ...worst, text: fmtDelta(worst.d, LADDER.sharpe) } };
}

// ------------------------------------------------------------------------- static self-checks
const rawBaseline = rawArtifact("forge:baseline");
const rawIndex = rawArtifact("forge:baselines");
const rawReality = rawArtifact("forge:reality");
const rawRuns = rawArtifact("forge:runs");
const runId = rawRuns.items[0].run_id;
const rawRun = rawArtifact("forge:run:" + runId);
let checks = 0;
assert.equal(
  expectedRelation(rawBaseline.model_summaries, "verified"),
  "Sol and Terra tie on verified research (83.3%); Luna (77.8%) is lower. Of the tied models, Terra has the lower cost per verified finding ($0.01032) and the lower mean latency (15.6s).",
);
checks++;
const ladder = expectedLadder(rawReality, "sharpe");
assert.deepEqual(
  [ladder.worst.from, ladder.worst.to, ladder.worst.text],
  ["L3_LATENCY", "L4_COUNTERFACTUAL_STRESS", "−3.3843"],
);
// The artifact's own record agrees with the recomputation.
assert.ok(Math.abs(ladder.worst.d - rawReality.aggregate.largest_degradation.sharpe_change) < 1e-9);
checks += 2;
// Static sabotage: the expectations follow the data, not a fixed string.
{
  const b = structuredClone(rawBaseline.model_summaries);
  b[2].verified_research_success_rate = b[0].verified_research_success_rate;
  assert.match(expectedRelation(b, "verified"), /^All 3 models tie on verified research/);
  const r = structuredClone(rawReality);
  r.aggregate.checkpoints[3].metrics.sharpe = 0.1;
  assert.equal(expectedLadder(r, "sharpe").worst.to, "L3_FEES_SLIPPAGE");
  checks += 2;
}
for (const [component, [from, to]] of Object.entries(COMPONENT)) {
  const cps = rawReality.aggregate.checkpoints;
  const at = (id) => cps.find((c) => c.checkpoint === id).metrics.sharpe;
  assert.ok(
    Math.abs(at(to) - at(from) - rawReality.aggregate.decomposition[component]) < 1e-9,
    "decomposition component " + component,
  );
  checks++;
}
assert.equal(expectedMatch(rawReality), true);
{
  const r = structuredClone(rawReality);
  r.aggregate.largest_degradation.component = "fee_decay";
  assert.equal(expectedMatch(r), false);
}
assert.deepEqual(expectedChartLabels(rawReality, "sharpe"), [
  "L0–L2 = 4.7991",
  "4.6118",
  "3.7292",
  "0.3449",
]);
checks += 3;
console.log(`Forge2: ${checks} static recomputation and sabotage checks passed.`);

// ------------------------------------------------------------------------------ browser stage
const flag = process.argv.indexOf("--url");
if (flag < 0) process.exit(0);
const base = process.argv[flag + 1].replace(/\/$/, "");
const screenshots = process.argv.includes("--screenshots");
const shotDir = new URL("../../docs/screenshots/", import.meta.url);
if (screenshots) mkdirSync(shotDir, { recursive: true });
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const errors = [];

const norm = (s) => s.replace(/\s+/g, " ").trim();
const ready = async (page) => {
  await page.locator('.shell[data-ready="true"]').waitFor();
  await page.locator(".agents-page h1").waitFor();
};
/** A context, optionally serving tampered artifacts (each with a manifest digest to match). */
async function newContext(opts = {}, tamper = {}) {
  const context = await browser.newContext(opts);
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  if (Object.keys(tamper).length) {
    const copy = structuredClone(manifest);
    for (const [id, change] of Object.entries(tamper)) {
      const value = rawArtifact(id);
      change(value);
      const body = JSON.stringify(value);
      copy.artifacts[id].bytes = Buffer.byteLength(body);
      copy.artifacts[id].sha256 = createHash("sha256").update(body).digest("hex");
      await context.route("**" + manifest.artifacts[id].url, (r) =>
        r.fulfill({ contentType: "application/json", body }),
      );
    }
    await context.route("**/replay-manifest.json", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(copy) }),
    );
  }
  return context;
}
async function layout(page, where) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    "horizontal scroll: " + where,
  );
  const small = await page.locator(".agents-page").evaluate((el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out = [];
    while (walk.nextNode()) {
      const n = walk.currentNode,
        p = n.parentElement;
      if (!n.textContent.trim() || !p || p.closest("svg, .sr-only, details:not([open]) > div"))
        continue;
      const s = getComputedStyle(p),
        r = p.getBoundingClientRect();
      if (r.width && r.height && s.visibility !== "hidden" && parseFloat(s.fontSize) < 11)
        out.push(n.textContent.trim().slice(0, 40));
    }
    return out;
  });
  assert.deepEqual(small, [], "text under 11px on " + where + ": " + small.join(", "));
}

// Debugger: every listed step against the raw run artifact.
async function debuggerMismatches(page) {
  const turns = new Map(rawRun.model_turns.map((t) => [t.sequence, t]));
  const want = rawRun.run.actions.map((a) => {
    const t = turns.get(a.sequence);
    return {
      step: String(a.sequence),
      usage: t
        ? `${t.tokens_in.toLocaleString("en-US")} in / ${t.tokens_out.toLocaleString("en-US")} out`
        : "tokens unavailable",
    };
  });
  const got = await page.locator(".f2-step").evaluateAll((els) =>
    els.map((el) => ({
      step: el.getAttribute("data-step"),
      usage: el.querySelector(".f2-step-usage").textContent.replace(/\s+/g, " ").trim(),
    })),
  );
  const bad = [];
  if (got.length !== want.length) bad.push(`steps ${got.length} != ${want.length}`);
  want.forEach((w, i) => {
    if (!got[i] || got[i].step !== w.step || got[i].usage !== w.usage)
      bad.push(`step ${w.step}: ${JSON.stringify(got[i])} != ${JSON.stringify(w)}`);
  });
  return bad;
}
const current = (page) => page.locator('.f2-step[aria-current="step"]').getAttribute("data-step");
const stepInUrl = (page) => new URL(page.url()).searchParams.get("step");

async function checkDebugger(width) {
  const seqs = rawRun.run.actions.map((a) => String(a.sequence));
  const ctx = await newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/runs/${runId}?step=${seqs[0]}&tab=action`, { waitUntil: "networkidle" });
  await ready(page);
  assert.deepEqual(await debuggerMismatches(page), []);
  await layout(page, `debugger ${width}`);
  // Keyboard stepping, with the URL following every step.
  await page.locator(`.f2-step[data-step="${seqs[0]}"]`).focus();
  const press = async (key, expected) => {
    await page.keyboard.press(key);
    await page.waitForFunction(
      (s) => new URL(location.href).searchParams.get("step") === s,
      expected,
    );
    assert.equal(await current(page), expected, key);
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("data-step")),
      expected,
      "focus follows " + key,
    );
  };
  await press("ArrowDown", seqs[1]);
  await press("j", seqs[2]);
  await press("k", seqs[1]);
  await press("ArrowUp", seqs[0]);
  await press("End", seqs.at(-1));
  await press("Home", seqs[0]);
  // Reduced motion: playback is static.
  assert.equal(await page.getByRole("button", { name: /Play/ }).isDisabled(), true);
  // Deep link survives a reload.
  await page.goto(`${base}/runs/${runId}?step=${seqs[2]}&tab=action`, { waitUntil: "networkidle" });
  await ready(page);
  await page.reload({ waitUntil: "networkidle" });
  await ready(page);
  assert.equal(await current(page), seqs[2]);
  assert.equal(stepInUrl(page), seqs[2]);
  assert.match(
    norm(await page.locator(".agents-card-head h2").nth(1).innerText()),
    new RegExp(`Selected action · 0?${seqs[2]}$`),
  );
  if (screenshots) {
    await page.evaluate(() => {
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    await page.screenshot({
      path: fileURLToPath(new URL(`u4-debugger-${width}.png`, shotDir)),
      fullPage: true,
    });
  }
  // The selected graph node, the graph legend and its axis key are on screen at every width.
  const onScreen = (sel) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 0.5;
      });
  for (const sel of [
    `[data-testid="trajectory-2d"] button[data-node="${seqs[2]}"]`,
    ".f2-graph-legend",
    ".f2-graph-axis",
    '[data-testid="step-summary"]',
  ])
    assert.equal(await onScreen(sel), true, `${sel} on screen at ${width}`);
  // Next onto the last step disables Next; focus stays in the stepper, on that step.
  await page.goto(`${base}/runs/${runId}?step=${seqs.at(-2)}`, { waitUntil: "networkidle" });
  await ready(page);
  await page.getByRole("button", { name: /Next/ }).click();
  await page.waitForFunction(
    (s) => new URL(location.href).searchParams.get("step") === s,
    seqs.at(-1),
  );
  await page.waitForFunction(
    (s) => document.activeElement?.getAttribute("data-step") === s,
    seqs.at(-1),
  );
  // An unparseable step falls back to the legacy node; a step not in the run is announced.
  await page.goto(`${base}/runs/${runId}?step=abc&node=${seqs[1]}`, { waitUntil: "networkidle" });
  await ready(page);
  assert.equal(await current(page), seqs[1], "?step=abc&node= selects node");
  assert.equal(await page.getByTestId("step-notice").count(), 0);
  for (const bad of ["999", "0", "-1", "abc"]) {
    await page.goto(`${base}/runs/${runId}?step=${bad}`, { waitUntil: "networkidle" });
    await ready(page);
    assert.equal(await current(page), seqs[0], "fallback for ?step=" + bad);
    assert.match(
      norm(await page.getByTestId("step-notice").innerText()),
      new RegExp(`^Step ${bad} is not in this run; showing step 0?${seqs[0]}\\.$`),
    );
  }
  await ctx.close();
}

async function checkPlayback() {
  const seqs = rawRun.run.actions.map((a) => String(a.sequence));
  const ctx = await newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/runs/${runId}?step=${seqs[0]}`, { waitUntil: "networkidle" });
  await ready(page);
  const seen = [seqs[0]];
  await page.exposeFunction("__step", (s) => {
    if (s && s !== seen.at(-1)) seen.push(s);
  });
  await page.evaluate(() => {
    new MutationObserver(() =>
      window.__step(new URL(location.href).searchParams.get("step")),
    ).observe(document.body, { subtree: true, attributes: true, childList: true });
  });
  await page.getByRole("button", { name: /Play/ }).click();
  await page.waitForFunction(
    (s) => new URL(location.href).searchParams.get("step") === s,
    seqs.at(-1),
    { timeout: 20000 },
  );
  await page.waitForTimeout(1500);
  assert.deepEqual(seen, seqs, "playback visits the recorded order exactly");
  assert.equal(await page.locator('.f2-replay [data-playing="true"]').count(), 0, "stops at end");
  await ctx.close();
}

async function benchMismatches(page) {
  const bad = [];
  for (const tab of Object.keys(TABS)) {
    await page.locator(`.f2-tabs a[data-metric="${tab}"]`).click();
    await page.waitForFunction(
      (t) =>
        document.querySelector(`.f2-tabs a[data-metric="${t}"]`)?.getAttribute("aria-current") ===
        "page",
      tab,
    );
    const got = norm(await page.getByTestId("bench-relation").innerText());
    const want = expectedRelation(rawBaseline.model_summaries, tab);
    if (got !== want) bad.push(`${tab}: "${got}" != "${want}"`);
    const scope = norm(await page.getByTestId("bench-scope").innerText());
    if (!/in this suite/.test(scope) || !/not a global ranking/.test(scope))
      bad.push(`${tab}: scope "${scope}"`);
  }
  return bad;
}
async function checkBench(width) {
  const ctx = await newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/${rawIndex.items[0].artifact_id}`, { waitUntil: "networkidle" });
  await ready(page);
  await layout(page, `bench ${width}`);
  assert.deepEqual(await benchMismatches(page), []);
  // Releases the index has no verified artifact for read UNAVAILABLE, never a value.
  const listed = new Set(rawIndex.items.map((i) => i.artifact_id));
  for (const id of ["forge-v0.2.5.1", "forge-v0.3"]) {
    const card = page.locator(`[data-release="${id}"]`);
    assert.equal(await card.count(), listed.has(id) ? 0 : 1, id);
    if (!listed.has(id)) assert.match(await card.innerText(), /UNAVAILABLE/);
  }
  await page.locator('.f2-tabs a[data-metric="verified"]').click();
  await page.waitForURL(/metric=verified/);
  // Key state first: on narrow screens the relation sits above the table (beside it when wide).
  const top = (sel) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
  if (width < 900)
    assert.ok((await top('[data-testid="bench-relation"]')) < (await top(".f2-bench-table")));
  // The Model column stays pinned when the table scrolls sideways.
  const pinned = await page.locator(".f2-scroll .overflow-x-auto").evaluate((box) => {
    box.scrollLeft = box.scrollWidth;
    const cell = box.querySelector("tbody th");
    return Math.abs(cell.getBoundingClientRect().left - box.getBoundingClientRect().left) < 2;
  });
  assert.equal(pinned, true, "model column pinned at " + width);
  await page.locator(".f2-scroll .overflow-x-auto").evaluate((box) => (box.scrollLeft = 0));
  if (width < 900) assert.equal(await page.locator(".f2-scroll-hint").isVisible(), true);
  if (screenshots)
    await page.screenshot({
      path: fileURLToPath(new URL(`u4-bench-${width}.png`, shotDir)),
      fullPage: true,
    });
  await ctx.close();
}

async function ladderMismatches(page, artifactId) {
  const bad = [];
  for (const metric of Object.keys(LADDER)) {
    await page.goto(`${base}/reality/${artifactId}?metric=${metric}&view=table`, {
      waitUntil: "networkidle",
    });
    await ready(page);
    const want = expectedLadder(rawReality, metric);
    const rows = await page
      .locator("[data-delta-for]")
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((e) => [
            e.getAttribute("data-delta-for"),
            e.textContent.replace(/\s+/g, " ").trim(),
          ]),
        ),
      );
    const first = rawReality.aggregate.checkpoints[0].checkpoint;
    if (rows[first] !== "—") bad.push(`${metric}: first checkpoint delta "${rows[first]}"`);
    delete rows[first];
    for (const [id, d] of Object.entries(want.deltas))
      if (rows[id] !== d) bad.push(`${metric} ${id}: "${rows[id]}" != "${d}"`);
    if (metric === "sharpe") {
      const box = page.getByTestId("largest-degradation");
      const got = [
        await box.getAttribute("data-from"),
        await box.getAttribute("data-to"),
        norm(await page.getByTestId("largest-delta").innerText()),
      ];
      const exp = [want.worst.from, want.worst.to, want.worst.text];
      if (JSON.stringify(got) !== JSON.stringify(exp))
        bad.push(`largest degradation ${JSON.stringify(got)} != ${JSON.stringify(exp)}`);
      const match = await box.getAttribute("data-match");
      if (match !== String(expectedMatch(rawReality)))
        bad.push(`match ${match} != ${expectedMatch(rawReality)}`);
    }
  }
  return bad;
}
async function checkLadder(width) {
  const artifactId = rawReality.artifact_id;
  const ctx = await newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  // Chart and table show the same records.
  await page.goto(`${base}/reality/${artifactId}`, { waitUntil: "networkidle" });
  await ready(page);
  await layout(page, `ladder chart ${width}`);
  const sharpe = rawReality.aggregate.checkpoints.map((c) => c.metrics.sharpe.toFixed(4));
  assert.deepEqual(
    (await page.locator(".f2-chart-label").allInnerTexts()).map(norm),
    expectedChartLabels(rawReality, "sharpe"),
    "chart labels are the recorded Sharpe values, an equal run labelled once",
  );
  assert.equal(await page.locator(".f2-chart-point").count(), sharpe.length);
  assert.equal(
    await page.locator('.f2-chart-point[aria-current="step"]').count(),
    0,
    "no default ring",
  );
  assert.equal(
    await page.getByTestId("worst-segment").count(),
    expectedLadder(rawReality, "sharpe").worst ? 1 : 0,
  );
  const banner = page.getByTestId("largest-degradation");
  assert.equal(await banner.getAttribute("data-match"), String(expectedMatch(rawReality)));
  assert.match(
    await banner.innerText(),
    expectedMatch(rawReality) ? /MATCHES THE ARTIFACT/ : /DOES NOT MATCH/,
  );
  assert.ok(
    (await banner.evaluate((el) => el.getBoundingClientRect().top)) < 1000,
    "degradation above the fold at " + width,
  );
  const legendFits = await page.getByTestId("ladder-legend").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5;
  });
  assert.equal(legendFits, true, "ladder legend on screen at " + width);
  if (screenshots)
    await page.screenshot({
      path: fileURLToPath(new URL(`u4-ladder-${width}.png`, shotDir)),
      fullPage: true,
    });
  await page.locator('.f2-tabs a[data-view="table"]').click();
  await page.waitForURL(/view=table/);
  await layout(page, `ladder table ${width}`);
  const tableSharpe = await page
    .locator("[data-checkpoint]")
    .evaluateAll((rows) => rows.map((r) => r.querySelectorAll("td")[1].textContent.trim()));
  assert.deepEqual(tableSharpe, sharpe, "table holds the same Sharpe records");
  assert.deepEqual(await ladderMismatches(page, artifactId), []);
  // An unknown checkpoint is announced and nothing is selected.
  await page.goto(`${base}/reality/${artifactId}?checkpoint=BOGUS`, { waitUntil: "networkidle" });
  await ready(page);
  assert.match(
    await page.getByTestId("checkpoint-notice").innerText(),
    /BOGUS is not in this artifact/,
  );
  assert.equal(await page.locator('.f2-chart-point[aria-current="step"]').count(), 0);
  await ctx.close();
}

let views = 0;
try {
  for (const width of [1440, 390]) {
    await checkDebugger(width);
    await checkBench(width);
    await checkLadder(width);
    views += 3;
  }
  await checkPlayback();
  console.log(
    `Forge2: ${views} surface views at 1440/390 passed (keyboard stepping, ?step deep link and reload, reduced-motion static playback, relation sentences, UNAVAILABLE releases, ladder deltas and largest degradation, no horizontal scroll, text >= 11px); playback replays the recorded order.`,
  );

  // Sabotage, one per surface: a tampered artifact (re-hashed, so it loads) must be caught by
  // the comparison against the genuine artifact.
  const sab = [];
  {
    const ctx = await newContext(
      {},
      {
        ["forge:run:" + runId]: (d) => {
          d.model_turns[0].tokens_in += 7;
        },
      },
    );
    const page = await ctx.newPage();
    await page.goto(`${base}/runs/${runId}?step=1`, { waitUntil: "networkidle" });
    await ready(page);
    const bad = await debuggerMismatches(page);
    assert.ok(bad.length > 0, "sabotage: tampered run tokens not detected");
    sab.push("debugger tokens");
    await ctx.close();
  }
  {
    const ctx = await newContext(
      {},
      {
        "forge:baseline": (d) => {
          const luna = d.model_summaries.find((m) => m.model.endsWith("luna"));
          luna.verified_research_success_rate = 0.9;
          luna.mean_latency_seconds = 99;
        },
      },
    );
    const page = await ctx.newPage();
    await page.goto(`${base}/bench/${rawIndex.items[0].artifact_id}`, { waitUntil: "networkidle" });
    await ready(page);
    const bad = await benchMismatches(page);
    assert.ok(
      bad.some((b) => b.startsWith("verified")),
      "sabotage: tampered bench not detected",
    );
    sab.push("bench relation");
    await ctx.close();
  }
  {
    const ctx = await newContext(
      {},
      {
        "forge:reality": (d) => {
          d.aggregate.checkpoints[3].metrics.sharpe = 0.1;
        },
      },
    );
    const page = await ctx.newPage();
    const bad = await ladderMismatches(page, rawReality.artifact_id);
    assert.ok(
      bad.some((b) => b.startsWith("largest degradation")),
      "sabotage: tampered ladder not detected",
    );
    // The page itself flags that its computation no longer matches the artifact's record.
    assert.match(await page.getByTestId("largest-degradation").innerText(), /DOES NOT MATCH/);
    sab.push("ladder delta");
    await ctx.close();
  }
  {
    // The recorded component names a different step: the number alone must not pass as a match.
    const ctx = await newContext(
      {},
      {
        "forge:reality": (d) => {
          d.aggregate.largest_degradation.component = "fee_decay";
        },
      },
    );
    const page = await ctx.newPage();
    const bad = await ladderMismatches(page, rawReality.artifact_id);
    assert.ok(
      bad.some((b) => b.startsWith("match")),
      "sabotage: tampered degradation component not detected",
    );
    assert.match(await page.getByTestId("largest-degradation").innerText(), /DOES NOT MATCH/);
    sab.push("ladder component");
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log(`Forge2: SABOTAGE detected for ${sab.join(", ")}.`);
} finally {
  await browser.close();
}
console.log("verify-forge2: PASS");
