import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, firefox } from "playwright";
import { stable, validateRisk } from "../src/risk-manager/contracts.ts";
import { checkedIssueReferences } from "../src/risk-manager/evidence.ts";
const at = process.argv.indexOf("--url");
assert(at >= 0 && process.argv[at + 1], "Pass --url for the built preview");
const base = process.argv[at + 1].replace(/\/$/, "");
const root = new URL("../public/", import.meta.url);
const repo = fileURLToPath(new URL("../../", import.meta.url));
const shots = new URL("../../docs/screenshots/", import.meta.url);
mkdirSync(shots, { recursive: true });
const manifestRaw = readFileSync(new URL("replay-manifest.json", root));
const manifest = JSON.parse(manifestRaw);
const readProjectionRaw = readFileSync(new URL("risk-read-manifest.json", root));
const readProjection = JSON.parse(readProjectionRaw);
const stateId = manifest.routes["/risk-manager/state"];
const sweepId = manifest.routes["/risk-manager/sweep"];
const rawAt = (id) => readFileSync(new URL(manifest.artifacts[id].url.slice(1), root));
const state = JSON.parse(rawAt(stateId));
const sweep = JSON.parse(rawAt(sweepId));
const coverageRef = state.payload.evidence_index.find((ref) => ref.selector_id === "risk_coverage");
assert(coverageRef?.artifact_id, "Selected state retains coverage binding");
const coverageState = JSON.parse(rawAt(coverageRef.artifact_id));
const coverageSlots = coverageState.payload.coverage.length;
const portfolioSlots = coverageState.payload.coverage.filter(
  (slot) => slot.category === "PORTFOLIO",
);
const real = state.payload.issues.filter(
  (i) => i.status === "OPEN" && i.currency === "CURRENT" && i.evidence_class === "REAL_RETAINED",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const measureFile = new URL("../../.tmp/risk-browser-proof.json", import.meta.url);
const report = {
  schema_version: "risk-browser-proof/1",
  evidence_class: "ENGINEERING_QA",
  base,
  manifest_sha256: sha(manifestRaw),
  state_ref: stateId,
  sweep_ref: sweepId,
  real: [],
  synthetic: [],
};
// Isolated engineering contexts replace the trusted build anchor as well as sealed fixture bytes.
// Production has no runtime override. Real contexts below never install this response handler.
async function syntheticReadView(context, changed) {
  const needed = new Set([
    ...Object.keys(readProjection.artifacts),
    changed.routes["/risk-manager/state"],
    changed.routes["/risk-manager/sweep"],
  ]);
  const fixture = {
    ...changed,
    artifacts: Object.fromEntries(
      Object.entries(changed.artifacts).filter(([identity]) => needed.has(identity)),
    ),
    routes: Object.fromEntries(
      Object.keys(readProjection.routes).map((route) => [route, changed.routes[route]]),
    ),
  };
  const raw = Buffer.from(JSON.stringify(fixture) + "\n");
  await context.route("**/risk-read-manifest.json", (route) =>
    route.fulfill({ body: raw, contentType: "application/json" }),
  );
  await context.route("**/*.js", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    if (body.includes(sha(readProjectionRaw))) {
      body = body.replaceAll(sha(readProjectionRaw), sha(raw));
      const pattern = new RegExp(
        '(["\x27]?bytes["\x27]?\\s*:\\s*)' + readProjectionRaw.length + "(?=\\s*[,}])",
        "g",
      );
      assert(pattern.test(body), "Synthetic build-anchor byte binding located");
      pattern.lastIndex = 0;
      body = body.replace(pattern, (_match, prefix) => prefix + raw.length);
    }
    await route.fulfill({ response, body });
  });
}
const channels = process.env.RISK_BROWSER_CHANNELS?.split(",") ?? ["chrome", "msedge", "firefox"];
for (const name of channels) {
  const browser = await (name === "firefox" ? firefox : chromium).launch(
    name === "firefox" ? { headless: true } : { headless: true, channel: name },
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  // Deliberate private cache injection must have zero influence in public Replay.
  await context.addInitScript(() => {
    localStorage.setItem(
      "finsight-paper-book-v1",
      JSON.stringify([{ ticker: "PRIVATE_SENTINEL", qty: 123, entry: 456 }]),
    );
  });
  const page = await context.newPage();
  const bad = [],
    failed = [],
    errors = [],
    responses = [],
    requested = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    requested.push(u.pathname);
    if (
      u.origin !== new URL(base).origin ||
      /\/api(?:\/|$)|:8000|\/paper(?:\/|$)|\/tape(?:\/|$)|\/auth(?:\/|$)|\/risk\/dashboard|\/montecarlo/.test(
        u.href,
      )
    )
      bad.push(u.href);
  });
  page.on("requestfailed", (r) => {
    if (!r.failure()?.errorText?.includes("ABORTED")) failed.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let measuring = true;
  page.on("response", (r) => {
    if (
      measuring &&
      /\/(?:replay-manifest|risk-read-manifest)\.json|\/artifacts\/replay\//.test(r.url())
    )
      responses.push(
        r.body().then((body) => ({ url: r.url(), bytes: body.length, hash: sha(body) })),
      );
  });
  const start = Date.now();
  await page.goto(base + "/risk");
  await page.getByRole("heading", { name: "RISK MANAGER", exact: true }).waitFor();
  await page.getByRole("region", { name: "Risk issue feed", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const coldMs = Date.now() - start;
  measuring = false;
  const bodies = await Promise.all(responses);
  const riskBytes = bodies
    .filter((r) => /risk-(state|sweep)-/.test(r.url))
    .reduce((n, r) => n + r.bytes, 0);
  const totalBytes = bodies.reduce((n, r) => n + r.bytes, 0);
  assert(riskBytes <= 256 * 1024, "Initial selected risk data budget");
  assert(totalBytes <= 512 * 1024, "Initial total data budget");
  assert(
    !bodies.some((body) => body.url.endsWith("/replay-manifest.json")),
    "Global history metadata is deferred until explicit interaction",
  );
  assert.equal(bodies.filter((body) => body.url.endsWith("/risk-read-manifest.json")).length, 1);
  assert.equal(
    bodies.find((body) => body.url.endsWith("/risk-read-manifest.json")).hash,
    sha(readProjectionRaw),
  );
  assert.equal(
    bodies.filter((r) => /risk-(state|sweep)-/.test(r.url)).length,
    2,
    "Only selected primary state and receipt initially",
  );
  for (const id of [stateId, sweepId]) {
    const response = bodies.find((r) => r.url.endsWith(manifest.artifacts[id].url));
    assert(response, "Actual selected artifact response");
    assert.equal(
      response.hash,
      manifest.artifacts[id].sha256,
      "Served artifact bytes match checked publication",
    );
  }
  const feed = page.getByRole("region", { name: "Risk issue feed", exact: true });
  assert.equal(await feed.locator("tbody tr").count(), real.length);
  assert(await page.getByText("PARTIAL COVERAGE", { exact: true }).isVisible());
  assert(!(await page.getByText("PRIVATE_SENTINEL", { exact: false }).count()));
  assert(
    !requested.some((path) => /LocalRiskLab|\/book\.|demoBook/.test(path)),
    "Local lab is excluded from Replay requests",
  );
  assert(
    !(await page.getByRole("button", { name: "Local paper book / risk lab", exact: true }).count()),
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Desktop page stays within viewport",
  );
  if (name === "chrome")
    await page.screenshot({
      path: fileURLToPath(new URL("phase7-risk-real-desktop.png", shots)),
      fullPage: true,
    });
  await page.getByLabel("Issue category", { exact: true }).selectOption("MODEL");
  await page.getByLabel("Issue country", { exact: true }).selectOption("INDIA");
  assert.equal(await feed.locator("tbody tr").count(), 1);
  const interaction = await page.evaluate(async () => {
    const input = document.querySelector('[aria-label="Search risk issues"]');
    const start = performance.now();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "IN-MKT");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
  assert(
    interaction <= 100,
    "Actual filter interaction budget: " + interaction + " ms (limit 100 ms)",
  );
  await feed.getByRole("button", { name: /retained input age/i }).click();
  await page.locator('[aria-label="Issue evidence inspector"]').waitFor();
  assert(await page.getByText("STALE_INPUT", { exact: true }).count());
  if (name === "chrome")
    await page.screenshot({
      path: fileURLToPath(new URL("phase7-risk-inspector.png", shots)),
      fullPage: true,
    });
  await page.getByLabel("Search risk issues").fill("");
  await page.getByLabel("Issue category", { exact: true }).selectOption("ALL");
  await page.getByLabel("Issue country", { exact: true }).selectOption("ALL");
  await page.getByRole("button", { name: "Coverage", exact: true }).click();
  await page.getByRole("region", { name: "Risk coverage matrix", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Risk coverage matrix" }).locator("tbody tr").count(),
    coverageSlots,
  );
  await page.getByLabel("Coverage category", { exact: true }).selectOption("PORTFOLIO");
  const coverage = page.getByRole("region", { name: "Risk coverage matrix" });
  assert.equal(await coverage.locator("tbody tr").count(), portfolioSlots.length);
  assert.equal(
    await coverage.getByText("UNAVAILABLE", { exact: true }).count(),
    1 + portfolioSlots.filter((slot) => slot.availability === "UNAVAILABLE").length,
  );
  if (name === "chrome")
    await page.screenshot({
      path: fileURLToPath(new URL("phase7-risk-coverage.png", shots)),
      fullPage: true,
    });
  await page.getByRole("button", { name: "Sweep history", exact: true }).click();
  const history = page.getByRole("region", { name: "Sealed risk sweep history", exact: true });
  await history.waitFor();
  assert.equal(await history.locator("button").count(), 1 + sweep.payload.history_index.length);
  if (name === "chrome")
    await page.screenshot({
      path: fileURLToPath(new URL("phase7-risk-history.png", shots)),
      fullPage: true,
    });
  let historicalSelection = null;
  if (sweep.payload.history_index.length) {
    const selected = sweep.payload.history_index.at(-1);
    const historicalState = JSON.parse(rawAt(selected.state_ref));
    const historicalSweep = JSON.parse(rawAt(selected.sweep_ref));
    const historicalReal = historicalState.payload.issues.filter(
      (issue) =>
        issue.status === "OPEN" &&
        issue.currency === "CURRENT" &&
        issue.evidence_class === "REAL_RETAINED",
    );
    const observedHistory = [];
    const recordHistory = (response) => {
      if (
        [
          manifest.artifacts[selected.state_ref].url,
          manifest.artifacts[selected.sweep_ref].url,
        ].some((path) => response.url().endsWith(path))
      )
        observedHistory.push(
          response.body().then((bytes) => ({ url: response.url(), hash: sha(bytes) })),
        );
    };
    page.on("response", recordHistory);
    await history.locator("button").last().click();
    await feed.waitFor();
    assert.equal(await feed.locator("tbody tr").count(), historicalReal.length);
    await page.getByRole("button", { name: "Sweep history", exact: true }).click();
    const selectedHistory = page.getByRole("region", { name: "Sealed risk sweep history" });
    await selectedHistory.waitFor();
    assert.equal(
      await selectedHistory.locator("button").count(),
      1 + historicalSweep.payload.history_index.length,
    );
    assert(
      await selectedHistory
        .locator("time[title=" + JSON.stringify(historicalSweep.evidence_cutoff) + "]")
        .count(),
      "Historical receipt keeps its own evidence cutoff",
    );
    page.off("response", recordHistory);
    const selectedBodies = await Promise.all(observedHistory);
    for (const id of [selected.state_ref, selected.sweep_ref]) {
      assert(
        selectedBodies.some(
          (body) =>
            body.url.endsWith(manifest.artifacts[id].url) &&
            body.hash === manifest.artifacts[id].sha256,
        ),
        "History selection serves exact historical bytes",
      );
    }
    historicalSelection = {
      sweep_id: selected.sweep_id,
      state_ref: selected.state_ref,
      evidence_cutoff: historicalSweep.evidence_cutoff,
      current_real: historicalReal.length,
      result: "PASS",
    };
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const warmStart = Date.now();
  await page.reload();
  await feed.waitFor();
  const warmMs = Date.now() - warmStart;
  assert.equal(
    await page.locator('[role="dialog"]').count(),
    0,
    "Initial mobile inspector stays closed",
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Mobile page stays within viewport",
  );
  if (name === "chrome")
    await page.screenshot({
      path: fileURLToPath(new URL("phase7-risk-real-mobile.png", shots)),
      fullPage: true,
    });
  const row = feed.getByRole("button").first();
  await row.focus();
  await page.keyboard.press("Enter");
  const inspector = page.locator('[aria-label="Issue evidence inspector"]');
  await inspector.waitFor();
  assert.equal(await inspector.getAttribute("role"), "dialog");
  for (let j = 0; j < 12; j++) {
    await page.keyboard.press("Tab");
    assert(
      await inspector.evaluate((node) => node.contains(document.activeElement)),
      "Mobile focus stays in inspector",
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(), 0);
  assert(
    await row.evaluate((node) => node === document.activeElement),
    "Close returns focus to selected row",
  );
  const requestsBefore = requested.length;
  await page.waitForTimeout(1100);
  assert.equal(requested.length, requestsBefore, "No Replay polling");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await feed.waitFor();
  await page.keyboard.press("F3");
  assert(new URL(page.url()).pathname === "/risk", "F3 native route");
  assert.deepEqual(bad, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(errors, []);
  const validation = await page.evaluate(() =>
    performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("risk-"))
      .map((m) => ({ name: m.name, duration: m.duration })),
  );
  assert(
    validation.every((m) => m.duration <= 50),
    "Synchronous risk validation budget: " + JSON.stringify(validation),
  );
  report.real.push({
    browser: name,
    viewport: [1440, 390, 1920],
    currentReal: real.length,
    totalIssues: state.payload.issues.length,
    coverageSlots,
    historicalSelection,
    initialRiskBytes: riskBytes,
    initialTotalDataBytes: totalBytes,
    coldLoadMs: coldMs,
    warmLoadMs: warmMs,
    filterInteractionMs: interaction,
    validation,
    apiProviderPaperTapeRequests: bad.length,
    pageErrors: errors.length,
    privateCacheIsolation: "PASS",
    noPolling: "PASS",
    screenshots:
      name === "chrome" ? "real unmodified responses" : "verified, no screenshots retained",
  });
  await context.close();
  // The unchanged legacy shell must still read the complete global view on ordinary routes.
  const ordinary = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const normal = await ordinary.newPage();
  const normalMetadata = [];
  normal.on("response", (response) => {
    if (/\/(?:replay-manifest|risk-read-manifest)\.json$/.test(response.url()))
      normalMetadata.push(
        response
          .body()
          .then((body) => ({ url: response.url(), bytes: body.length, hash: sha(body) })),
      );
  });
  await normal.goto(base + "/markets");
  await normal.waitForLoadState("networkidle");
  const globalReads = await Promise.all(normalMetadata);
  assert.equal(globalReads.length, 1, "Ordinary shell reads one complete global manifest");
  assert(globalReads[0].url.endsWith("/replay-manifest.json"));
  assert.equal(globalReads[0].bytes, manifestRaw.length);
  assert.equal(globalReads[0].hash, sha(manifestRaw));
  report.real.at(-1).normalGlobalRead = {
    route: "/markets",
    bytes: manifestRaw.length,
    result: "PASS",
  };
  await ordinary.close();
  // All following response mutations are separate engineering contexts, never the real screenshots.
  for (const sabotage of [
    "checksum",
    "permission",
    "monitoring-permission",
    "monitoring-sources",
    "monitoring-clock",
    "monitoring-url",
    "nested-payload",
    "claim-promotion",
    "duplicate-key",
    "invalid-utf8",
  ]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    let raw = rawAt(stateId);
    const m = structuredClone(manifest);
    if (sabotage === "permission") m.artifacts[stateId].licence.status = "LOCAL_ONLY";
    else if (sabotage.startsWith("monitoring-")) {
      const ref = state.payload.issues
        .flatMap((issue) => checkedIssueReferences(issue, sweep))
        .find((item) => item.selector_id === "data_issues");
      assert(ref?.artifact_id);
      const entry = m.artifacts[ref.artifact_id];
      if (sabotage === "monitoring-permission")
        entry.licence.dataset_key = "project:unreviewed-monitoring";
      if (sabotage === "monitoring-sources") entry.sources = ["unreviewed:source"];
      if (sabotage === "monitoring-clock") entry.observed_at = "2026-10-01T00:00:00Z";
      if (sabotage === "monitoring-url") entry.url = "/artifacts/replay/substituted-evidence.json";
    } else if (sabotage !== "checksum") {
      const v = JSON.parse(raw);
      if (sabotage === "nested-payload")
        v.payload.issues[0].source_quality.provider_rows = [1, 2, 3];
      if (sabotage === "claim-promotion") v.claim_flags.validated_alpha = true;
      if (sabotage === "invalid-utf8") {
        v.payload.issues[0].reason = "\uFFFD\uFFFD";
        const { state_id: _stateId, ...bare } = v.payload;
        v.payload.state_id = sha(Buffer.from(stable(bare)));
      }
      raw = Buffer.from(JSON.stringify(v) + "\n");
      if (sabotage === "duplicate-key")
        raw = Buffer.from(raw.toString().replace(/^{/, '{"kind":"risk-state",'));
      if (sabotage === "invalid-utf8") {
        const marker = Buffer.from("\uFFFD\uFFFD");
        const position = raw.indexOf(marker);
        assert(position >= 0);
        raw = Buffer.concat([
          raw.subarray(0, position),
          Buffer.from([0xc0, 0xaf]),
          raw.subarray(position + marker.length),
        ]);
      }
      const id = "risk:state:" + sha(raw);
      const entry = structuredClone(m.artifacts[stateId]);
      entry.sha256 = sha(raw);
      entry.bytes = raw.length;
      entry.url = "/artifacts/replay/" + id.replaceAll(":", "-") + ".json";
      m.artifacts[id] = entry;
      m.routes["/risk-manager/state"] = id;
      const vSweep = JSON.parse(rawAt(sweepId));
      vSweep.payload.state_ref = id;
      const r = Buffer.from(JSON.stringify(vSweep) + "\n");
      const rid = "risk:sweep:" + sha(r);
      const re = structuredClone(m.artifacts[sweepId]);
      re.sha256 = sha(r);
      re.bytes = r.length;
      re.url = "/artifacts/replay/" + rid.replaceAll(":", "-") + ".json";
      m.artifacts[rid] = re;
      m.routes["/risk-manager/sweep"] = rid;
      await c.route("**" + re.url, (route) =>
        route.fulfill({ body: r, contentType: "application/json" }),
      );
      await c.route("**" + entry.url, (route) =>
        route.fulfill({ body: raw, contentType: "application/json" }),
      );
    } else
      await c.route("**" + m.artifacts[stateId].url, (route) =>
        route.fulfill({ body: raw.toString() + " ", contentType: "application/json" }),
      );
    await syntheticReadView(c, m);
    await c.route("**/replay-manifest.json", (route) => route.fulfill({ json: m }));
    await p.goto(base + "/risk");
    await p.getByRole("alert").waitFor();
    assert.equal(
      await p.getByRole("region", { name: "Risk issue feed" }).count(),
      0,
      "Malformed assessment never appears clear",
    );
    report.synthetic.push({
      browser: name,
      evidence_class: "SYNTHETIC_TEST_ONLY",
      case: sabotage,
      result: "FAILED_CLOSED",
    });
    await c.unrouteAll({ behavior: "wait" });
    await c.close();
  }
  if (name === "chrome") {
    const python =
      process.env.RISK_PYTHON ||
      (existsSync(repo + "/.venv/Scripts/python.exe")
        ? repo + "/.venv/Scripts/python.exe"
        : "python");
    const fixture = spawnSync(python, ["scripts/risk_browser_failure_fixture.py"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(fixture.status, 0, fixture.stderr + fixture.stdout);
    const wrapper = JSON.parse(fixture.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(wrapper.evidence_class, "SYNTHETIC_TEST_ONLY");
    const value = wrapper.receipt;
    validateRisk(value, "risk-sweep");
    let witnessAttacks = 0;
    for (const mutate of [
      (v) => (v.payload.failure.issue.category = "DATA"),
      (v) => (v.payload.failure.issue.scope.subject_id = "ordinary-data"),
      (v) => (v.payload.failure.issue.evidence_refs[0].check_id = "SYSTEM_SWEEP:unrelated"),
      (v) => (v.payload.failure.issue.last_observation_id = "0".repeat(64)),
      (v) => (v.payload.failure.issue.source_quality.permission_status = "VERIFIED"),
      (v) => (v.payload.failure.subsystem = "unreviewed-source"),
      (v) => (v.payload.observations[0].evidence_at = v.evidence_cutoff),
      (v) => (v.payload.observations[0].assertions[0].value = "VERIFIED"),
      (v) => (v.payload.completed_at = v.payload.started_at),
    ]) {
      const copy = structuredClone(value);
      mutate(copy);
      assert.throws(
        () => validateRisk(copy, "risk-sweep"),
        "Failure witness remains receipt-bound",
      );
      witnessAttacks++;
    }
    for (const [source, kind, item] of [
      [state, "risk-state", (v) => v.payload.issues[0]],
      [sweep, "risk-sweep", (v) => v.payload.observations[0]],
    ]) {
      const copy = structuredClone(source);
      item(copy).evidence_at = item(copy).evidence_cutoff =
        value.payload.failure.issue.evidence_cutoff;
      assert.throws(
        () => validateRisk(copy, kind),
        "Ordinary incidents still require a Data epoch",
      );
      witnessAttacks++;
    }
    report.synthetic.push({
      browser: name,
      evidence_class: "SYNTHETIC_TEST_ONLY",
      case: "receipt-bound-failure-witness-contract",
      result: "PASS",
      rejection_checks: witnessAttacks,
    });
    const raw = Buffer.from(JSON.stringify(value) + "\n");
    const id = "risk:sweep:" + sha(raw);
    const m = structuredClone(manifest);
    const entry = {
      ...m.artifacts[sweepId],
      url: "/artifacts/replay/" + id.replaceAll(":", "-") + ".json",
      sha256: sha(raw),
      bytes: raw.length,
      input_hash: value.input_hash,
      as_of: value.published_at,
      observed_at: value.published_at,
      available_at: value.published_at,
    };
    m.artifacts[id] = entry;
    m.routes["/risk-manager/sweep"] = id;
    m.as_of = value.published_at;
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    const failureReads = [];
    p.on("response", (response) => {
      if (
        /\/(?:risk-read-manifest|replay-manifest)\.json$|\/artifacts\/replay\/risk-(?:state|sweep)-/.test(
          response.url(),
        )
      )
        failureReads.push(
          response.body().then((body) => ({ url: response.url(), bytes: body.length })),
        );
    });
    await syntheticReadView(c, m);
    await c.route("**/replay-manifest.json", (route) => route.fulfill({ json: m }));
    await c.route("**" + entry.url, (route) =>
      route.fulfill({ body: raw, contentType: "application/json" }),
    );
    await p.goto(base + "/risk");
    await p.getByText("FAILED SWEEP · PREVIOUS STATE RETAINED", { exact: true }).waitFor();
    await p.waitForLoadState("networkidle");
    const failedReadRows = await Promise.all(failureReads);
    const failedRiskBytes = failedReadRows
      .filter((row) => row.url.includes("/artifacts/replay/risk-"))
      .reduce((sum, row) => sum + row.bytes, 0);
    const failedTotalBytes = failedReadRows.reduce((sum, row) => sum + row.bytes, 0);
    assert(
      failedRiskBytes <= 256 * 1024,
      "Failed scene counts source receipt within initial Risk budget",
    );
    assert(failedTotalBytes <= 512 * 1024, "Failed scene total initial data budget");
    assert.equal(
      await p.getByRole("region", { name: "Risk issue feed" }).locator("tbody tr").count(),
      real.length + 1,
    );
    await p.evaluate(() => {
      const label = document.createElement("div");
      label.textContent = "SYNTHETIC_TEST_ONLY — ENGINEERING FAILURE SCENE";
      Object.assign(label.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        right: "0",
        background: "#4b1111",
        color: "#fff",
        padding: "12px",
        zIndex: "9999",
        font: "bold 12px monospace",
      });
      document.body.append(label);
    });
    await p.screenshot({
      path: fileURLToPath(new URL("phase7-risk-failure.png", shots)),
      fullPage: true,
    });
    report.synthetic.push({
      browser: name,
      evidence_class: "SYNTHETIC_TEST_ONLY",
      case: "failed-sweep-prior-state",
      result: "PASS",
      priorFeedPreserved: true,
      initialRiskBytes: failedRiskBytes,
      initialTotalDataBytes: failedTotalBytes,
      sourceReceiptIncludedInBudget: true,
    });
    await c.unrouteAll({ behavior: "wait" });
    await c.close();
  }
  await browser.close();
  console.log(
    name +
      ": real Replay, history, filters, mobile keyboard, zero private traffic and isolated failure checks PASS",
  );
}
writeFileSync(measureFile, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
