import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  adaptBaseline,
  adaptRunIndex,
  adaptRun,
  adaptReality,
} from "../src/forge/data/forge-adapters.ts";
import {
  assertRunPreview,
  buildAgentOverview,
  recordedOutcome,
} from "../src/forge/command-center/overview-model.ts";

const publicRoot = new URL("../public/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("replay-manifest.json", publicRoot)));
function rawArtifact(id) {
  const entry = manifest.artifacts[id];
  const bytes = readFileSync(new URL(entry.url.slice(1), publicRoot));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  return JSON.parse(bytes);
}
const rawBaseline = rawArtifact("forge:baseline");
const rawRuns = rawArtifact("forge:runs");
const baseline = adaptBaseline(rawBaseline);
const runs = adaptRunIndex(rawRuns);
const overview = buildAgentOverview(baseline, runs);
assert.deepEqual(
  [overview.verified, overview.correctVerdicts, overview.falseAlpha, overview.failures.length],
  [44, 53, 0, 10],
);
assert.deepEqual(
  overview.models.map((m) => m.label),
  ["Luna", "Sol", "Terra"],
);
assert.equal(runs.items.filter((r) => recordedOutcome(r) === "partial").length, 9);
assert.equal(runs.items.filter((r) => recordedOutcome(r) === "failed").length, 1);
let checks = 4;
for (const summary of runs.items) {
  const detail = adaptRun(rawArtifact("forge:run:" + summary.runId));
  assertRunPreview(summary, detail);
  assert.equal(
    summary.verifiedResearchSuccess,
    Object.values(detail.verificationChecks).every(Boolean),
  );
  checks++;
}
for (const change of [
  (r) => {
    r.items[0].verification.checks.budget = false;
  },
  (r) => {
    r.items[0].verification.verified_research_success = "true";
  },
  (r) => {
    r.items[0].verification.expected_verdict = "APPROVED";
  },
  (r) => {
    r.items[0].decision.verdict = "APPROVED";
  },
  (r) => {
    r.items[0].verification.false_alpha_acceptance = true;
  },
  (r) => {
    r.items[0].verification.checks = {};
  },
  (r) => {
    delete r.items[0].verification.checks.verdict;
  },
]) {
  const value = structuredClone(rawRuns);
  change(value);
  assert.throws(() => adaptRunIndex(value));
  checks++;
}
for (const change of [
  (r) => {
    r.items.push(r.items[0]);
    r.matched++;
  },
  (r) => {
    r.items[1] = { ...r.items[0], run_id: r.items[1].run_id };
  },
  (r) => {
    r.items[0].model = "unbound-model";
  },
  (r) => {
    r.matched--;
  },
  (r) => {
    r.artifact_hash = "0".repeat(64);
  },
]) {
  const value = structuredClone(rawRuns);
  change(value);
  assert.throws(() => buildAgentOverview(baseline, adaptRunIndex(value)));
  checks++;
}
for (const change of [
  (b) => {
    b.overall.verified_research_success_rate = 1;
  },
  (b) => {
    b.integrity.status = "UNVERIFIED";
  },
  (b) => {
    b.source_schema_version = "synthetic-reference/1";
  },
  (b) => {
    b.tag = "SIMULATED_RUNS";
  },
  (b) => {
    b.model_summaries[0].verified_research_success_rate = 1;
  },
]) {
  const value = structuredClone(rawBaseline);
  change(value);
  assert.throws(() => buildAgentOverview(adaptBaseline(value), runs));
  checks++;
}
const firstRawDetail = rawArtifact("forge:run:" + runs.items[0].runId);
for (const change of [
  (d) => {
    d.verification.checks.budget = false;
  },
  (d) => {
    d.run.decision.verdict = "APPROVED";
  },
  (d) => {
    d.verification.checks = {};
  },
]) {
  const value = structuredClone(firstRawDetail);
  change(value);
  assert.throws(() => adaptRun(value));
  checks++;
}
assert.throws(() => assertRunPreview(runs.items[1], adaptRun(firstRawDetail)));
checks++;
assert.equal(adaptReality(rawArtifact("forge:reality")).checkpoints.length, 6);
checks++;
for (const change of [
  (d) => {
    d.aggregate.regime_matrix[0].seeds = 0;
  },
  (d) => {
    d.aggregate.regime_matrix[0].sharpe.L4_COUNTERFACTUAL_STRESS = "NaN";
  },
]) {
  const value = rawArtifact("forge:reality");
  change(value);
  assert.throws(() => adaptReality(value));
  checks++;
}
console.log(
  "Agents: " + checks + " recorded-grade, identity, source-binding and sabotage checks passed.",
);

const flag = process.argv.indexOf("--url");
if (flag > 0) {
  const base = process.argv[flag + 1].replace(/\/$/, "");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const screenshots = process.argv.includes("--screenshots");
  const shotDir = new URL("../../docs/screenshots/", import.meta.url);
  if (screenshots) mkdirSync(shotDir, { recursive: true });
  const firstId = runs.items[0].runId;
  const routes = [
    ["overview", "/forge"],
    ["runs", "/runs"],
    ["run", "/runs/" + firstId],
    ["bench", "/bench"],
    ["baseline", "/bench/forge-v0.2.5"],
    ["worlds", "/worlds"],
    ["artifacts", "/artifacts"],
    ["reality", "/reality/forge-v0.2.4.1"],
  ];
  let views = 0;
  async function assertLayout(page) {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      page.url(),
    );
    assert.equal(await page.locator(".agents-page [role=alert]").count(), 0, page.url());
    assert.ok(
      await page
        .locator(".agents-state")
        .getByText(/Replay · recorded artifacts/)
        .count(),
    );
    const textIssues = await page.locator(".agents-page").evaluate((el) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const issues = [];
      while (walk.nextNode()) {
        const node = walk.currentNode,
          p = node.parentElement;
        if (!node.textContent.trim() || !p || p.closest("svg, .sr-only, details:not([open]) > div"))
          continue;
        const style = getComputedStyle(p),
          rect = p.getBoundingClientRect();
        if (
          rect.width &&
          rect.height &&
          style.visibility !== "hidden" &&
          parseFloat(style.fontSize) < 11
        )
          issues.push(node.textContent.slice(0, 60));
      }
      return issues;
    });
    assert.deepEqual(textIssues, [], "Sub-11px readable text: " + textIssues.join(", "));
  }
  async function shot(page, name, width) {
    if (screenshots)
      await page.screenshot({
        path: fileURLToPath(new URL("phase1b-agents-" + name + "-" + width + ".png", shotDir)),
        fullPage: name !== "drawer",
      });
  }
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const failed = [],
      apiCalls = [],
      errors = [];
    context.on("requestfailed", (request) => failed.push(request.url()));
    context.on("request", (request) => {
      if (/\/api\/|:8000|celestrak|yahoo|alpaca|nseindia/i.test(request.url()))
        apiCalls.push(request.url());
    });
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(page.url() + "\n" + error.stack)),
    );
    const page = await context.newPage();
    for (const [name, path] of routes) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.locator('.shell[data-ready="true"]').waitFor();
      await page.locator(".agents-page h1").waitFor();
      await assertLayout(page);
      if (name === "overview") {
        assert.equal(await page.locator(".agents-seed").count(), 54);
        assert.equal(await page.locator('[data-outcome="verified"]').count(), 44);
        assert.equal(await page.locator('[data-outcome="partial"]').count(), 9);
        assert.equal(await page.locator('[data-outcome="failed"]').count(), 1);
        assert.deepEqual(
          (await page.locator(".agents-kpi output").allTextContents())
            .slice(0, 3)
            .map((t) => t.replace(/\s+/g, "")),
          ["44/54", "53/54", "0"],
        );
        await page.getByText(/Real API execution · synthetic research tasks/).waitFor();
        await shot(page, name, width);
        await page.locator('[data-outcome="failed"]').click();
        const drawer = page.getByRole("dialog", { name: "Recorded run detail" });
        const failedRecord = rawRuns.items.find((r) => !r.verification.checks.verdict);
        const checkValues = Object.values(failedRecord.verification.checks);
        await drawer
          .getByText(
            "Checks · " +
              checkValues.filter(Boolean).length +
              " of " +
              checkValues.length +
              " passed",
          )
          .waitFor();
        assert.equal(
          await drawer.locator('[data-passed="false"]').count(),
          checkValues.filter((v) => !v).length,
        );
        await shot(page, "drawer", width);
        await page.keyboard.press("Tab");
        assert.equal(await drawer.evaluate((el) => el.contains(document.activeElement)), true);
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "detached" });
        assert.equal(new URL(page.url()).searchParams.has("run"), false);
        await page.getByRole("link", { name: "Show recorded runs →" }).first().click();
        await page.waitForURL(/verified=failed/);
        await page.getByRole("heading", { name: "Runs", exact: true }).waitFor();
        assert.match(page.url(), /task=v025_case_/);
        await page.goto(base + "/forge", { waitUntil: "networkidle" });
        await page.locator(".agents-seed").first().focus();
        await page.keyboard.press("Enter");
        await page.getByRole("dialog").waitFor();
        await page.getByRole("button", { name: "Close run detail" }).click();
        await page.getByRole("dialog").waitFor({ state: "detached" });
      } else {
        if (name === "run") {
          await page.getByRole("button", { name: /action 2,/ }).click();
          await page.waitForURL(/node=2/);
          const tabs = page.getByRole("navigation", { name: "Run observer views" });
          await tabs.getByRole("link", { name: "checks", exact: true }).click();
          await page.waitForURL(/tab=checks/);
          await page
            .getByText("The browser does not rerun or reinterpret", { exact: false })
            .waitFor();
          await tabs.getByRole("link", { name: "turns", exact: true }).click();
          await page.waitForURL(/tab=turns/);
          await page.getByText("Model turn 1", { exact: true }).waitFor();
          await tabs.getByRole("link", { name: "action", exact: true }).click();
          for (let cycle = 0; cycle < 2; cycle++) {
            await page.getByRole("button", { name: "3D", exact: true }).click();
            await page.locator("canvas").waitFor();
            const nodes = page.getByTestId("trajectory-3d").getByRole("button");
            await nodes.first().waitFor();
            await nodes.nth(cycle).click();
            await page.waitForURL(new RegExp("node=" + (cycle + 1)));
            await page.getByRole("button", { name: "2D", exact: true }).click();
            await page.getByTestId("trajectory-2d").waitFor();
          }
        }
        if (name === "reality")
          await page.getByText(/Synthetic reference experiment · not market evidence/).waitFor();
        await shot(page, name, width);
      }
      views++;
    }
    assert.deepEqual(failed, []);
    assert.deepEqual(apiCalls, []);
    assert.deepEqual(errors, []);
    await context.close();
  }

  async function sabotage(id, change, path, alertScope = ".agents-page") {
    const context = await browser.newContext();
    const entry = manifest.artifacts[id];
    const changed = rawArtifact(id);
    change(changed);
    const body = JSON.stringify(changed);
    const copy = structuredClone(manifest);
    copy.artifacts[id].bytes = Buffer.byteLength(body);
    copy.artifacts[id].sha256 = createHash("sha256").update(body).digest("hex");
    await context.route("**/replay-manifest.json", (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify(copy) }),
    );
    await context.route("**" + entry.url, (r) =>
      r.fulfill({ contentType: "application/json", body }),
    );
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.locator(alertScope + " [role=alert]").waitFor();
    if (alertScope === ".agents-page")
      assert.equal(await page.locator(".agents-kpi, .agents-seed").count(), 0);
    await context.close();
  }
  await sabotage(
    "forge:runs",
    (d) => {
      d.items[0].verification.checks.budget = false;
    },
    "/forge",
  );
  await sabotage(
    "forge:runs",
    (d) => {
      d.items[0].verification.expected_verdict = "APPROVED";
    },
    "/forge",
  );
  await sabotage(
    "forge:baseline",
    (d) => {
      d.source_schema_version = "synthetic-reference/1";
    },
    "/forge",
  );
  await sabotage(
    "forge:baseline",
    (d) => {
      d.overall.verified_research_success_rate = 1;
    },
    "/forge",
  );
  await sabotage(
    "forge:run:" + firstId,
    (d) => Object.assign(d, rawArtifact("forge:run:" + runs.items[1].runId)),
    "/forge?run=" + firstId + "&node=1",
    ".agents-drawer",
  );
  await sabotage(
    "forge:runs",
    (d) => {
      d.items[0].model = "unbound-model";
    },
    "/runs",
  );

  for (const signedOut of [false, true]) {
    const context = await browser.newContext();
    let calls = 0;
    await context.route("http://127.0.0.1:8000/**", (route) => {
      calls++;
      if (signedOut)
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"detail":"Local session is signed out"}',
        });
      const url = new URL(route.request().url());
      const key = manifest.routes[url.pathname + url.search] ?? manifest.routes[url.pathname];
      assert.ok(key, "Unexpected local API path: " + url.pathname);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(rawArtifact(key)),
      });
    });
    const page = await context.newPage();
    await page.goto(base + "/forge", { waitUntil: "networkidle" });
    const live = page.getByRole("button", { name: "Local Live", exact: true });
    await live.waitFor();
    assert.equal(
      await live.isEnabled(),
      true,
      "Build with VITE_ENABLE_LOCAL_LIVE=true for local transport QA",
    );
    await live.click();
    await page.getByText("Local Live API · frozen records", { exact: true }).waitFor();
    if (signedOut) {
      await page.getByRole("alert").waitFor();
      assert.equal(await page.locator(".agents-kpi, .agents-seed").count(), 0);
    } else {
      await page.locator(".agents-seed").first().waitFor();
      assert.equal(await page.locator(".agents-seed").count(), 54);
    }
    assert.ok(calls > 0);
    await context.close();
  }
  await browser.close();
  console.log(
    "Agents: " +
      views +
      " genuine production Replay views at 1440/390; drawer, keyboard, URL filters, source/grade/identity sabotage and separate mocked Local Live/signed-out checks passed. Zero Replay API/vendor requests.",
  );
}
