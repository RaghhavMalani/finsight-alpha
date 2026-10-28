import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, firefox } from "playwright";

const option = (key) => {
  const i = process.argv.indexOf(key);
  return i < 0 ? undefined : process.argv[i + 1];
};
assert(option("--url"), "Pass --url for the built preview or source-verified deployment");
const input = new URL(option("--url"));
assert(
  ["http:", "https:"].includes(input.protocol) &&
    !input.username &&
    !input.password &&
    !input.search &&
    !input.hash,
);
const base = input.origin,
  smoke = process.argv.includes("--smoke"),
  matrixOnly = process.argv.includes("--matrix-only");
const repo = fileURLToPath(new URL("../../", import.meta.url)),
  frontend = fileURLToPath(new URL("../", import.meta.url));
const proofRoot = path.resolve(
  repo,
  process.env.TERMINAL_BROWSER_PROOF_DIR ?? ".tmp/phase75/browser",
);
mkdirSync(path.join(proofRoot, "screenshots"), { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = readFileSync(path.join(frontend, "public/replay-manifest.json")),
  manifest = JSON.parse(manifestBytes);
const originals = new Map(
  Object.entries(manifest.artifacts)
    .filter(([, e]) => e.status === "AVAILABLE")
    .map(([id, e]) => [e.url, { id, entry: e }]),
);
const workspaces = [
  ["market", "/markets"],
  ["regimes", "/dynamics"],
  ["factors", "/factors"],
  ["risk", "/risk"],
  ["data", "/data"],
  ["research", "/research"],
  ["observatory", "/observatory"],
];
const primary = new Set(["market", "regimes", "factors", "risk", "data"]);
const requiredAreas = [
  "matrix",
  "network",
  "initial_budget",
  "basic_accessibility",
  "continuity",
  "identity",
  "evidence_links",
  "tables",
  "charts",
  "search_commands",
  "capabilities",
  "exports",
  "private_isolation",
  "preferences",
  "bundle_performance",
  "two_tabs",
  "accessibility",
];
const completedAreas = new Set(),
  browsers = smoke ? ["chrome"] : ["chrome", "msedge", "firefox"];
const report = {
  schema_version: "phase75-terminal-browser-proof/1",
  evidence_class: "ENGINEERING_QA_READ_ONLY",
  base,
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(),
  deploymentSha: option("--deployment-sha") ?? null,
  worktreePaths: execFileSync("git", ["status", "--short"], { cwd: repo })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean),
  manifest: { sha256: sha(manifestBytes), bytes: manifestBytes.length, asOf: manifest.as_of },
  mode: smoke ? "INTEGRATION_SMOKE" : matrixOnly ? "MATRIX_STAGE" : "FULL_TERMINAL_BROWSER",
  cases: [],
  failures: [],
  blockedRequests: [],
  pageErrors: [],
  consoleErrors: [],
  originalChecks: [],
  limitations: [
    "Deployment identity is recorded from the independently verified argument; this script does not invent deployment provenance.",
    "A matrix-stage pass does not establish the remaining context/action/table/privacy/accessibility/bundle gates.",
  ],
};
async function check(name, action) {
  try {
    return await action();
  } catch (error) {
    report.failures.push({ name, error: error instanceof Error ? error.stack : String(error) });
    return null;
  }
}
function allowed(request) {
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return false;
  }
  if (["data:", "blob:", "about:"].includes(url.protocol)) return true;
  if (
    url.origin !== base ||
    url.username ||
    url.password ||
    !["GET", "HEAD"].includes(request.method())
  )
    return false;
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (
    /\/(?:api|auth|paper|accounts?|books?|providers?|compute|train|refresh|sweep)(?:\/|$)/i.test(p)
  )
    return false;
  return (
    /^\/(?:$|markets(?:\/[A-Za-z0-9^][A-Za-z0-9.^=-]{0,24})?|dynamics|factors|risk|data|research|observatory|globe|forge|runs(?:\/[a-f0-9]{64})?|bench(?:\/[A-Za-z0-9:_.-]{1,128})?|worlds|artifacts|reality\/[A-Za-z0-9:_.-]{1,180}|execution|login)\/?$/.test(
      p,
    ) ||
    /^\/(?:assets|fonts)\/[a-zA-Z0-9_./-]+$/.test(p) ||
    /^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(p) ||
    /^\/(?:replay-manifest|risk-read-manifest|factor-read-manifest)\.json$/.test(p) ||
    /^\/(?:favicon\.(?:ico|svg|png)|robots\.txt)$/.test(p)
  );
}
function urlFor(workspace, route) {
  const url = new URL(route, base);
  url.searchParams.set("ctx", "1");
  url.searchParams.set("market", "INDIA");
  url.searchParams.set("subject", "market-factor:IN-MKT");
  if (workspace === "observatory") {
    url.searchParams.set("scene", "hmm");
    url.searchParams.set("trace", "observatory:IN-MKT:hmm");
    url.searchParams.set("traceStep", "99");
  }
  return url.href;
}
async function pageFor(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" }),
    page = await context.newPage();
  const requests = [],
    responses = [],
    pending = [],
    responseErrors = [];
  page.on("pageerror", (error) =>
    report.pageErrors.push({ url: page.url(), error: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      report.consoleErrors.push({ url: page.url(), error: message.text() });
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      entry = originals.get(new URL(request.url()).pathname)?.entry;
    requests.push({ url: request.url(), method: request.method(), at: Date.now() });
    if (!allowed(request) || (entry && entry.bytes > 2 * 1024 * 1024)) {
      report.blockedRequests.push({
        url: request.url(),
        method: request.method(),
        reason:
          entry?.bytes > 2 * 1024 * 1024
            ? "Original exceeds2MiB beforefetch"
            : "Only anonymous static Replay GET/HEAD is authorized",
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("response", (response) => {
    const operation = (async () => {
      const url = new URL(response.url());
      if (!["http:", "https:"].includes(url.protocol) || response.request().method() === "HEAD")
        return;
      const body = await response.body(),
        mime = response.headers()["content-type"] ?? "",
        js = /javascript/.test(mime) || /\.m?js$/.test(url.pathname);
      const data =
        /json/.test(mime) ||
        /\.json$/.test(url.pathname) ||
        (js && /terminal-(?:shard|display)\/1/.test(body.toString("utf8")));
      responses.push({
        url: response.url(),
        status: response.status(),
        mime,
        bytes: body.length,
        gzipBytes: js ? gzipSync(body, { level: 9 }).length : null,
        js,
        data,
      });
      assert(
        response.status() < 400,
        `Static Replay response failed: ${response.status()} ${url.pathname}`,
      );
      const original = originals.get(url.pathname);
      if (original) {
        assert.equal(body.length, original.entry.bytes, original.id);
        assert.equal(sha(body), original.entry.sha256, original.id);
        report.originalChecks.push({
          artifactId: original.id,
          sha256: sha(body),
          bytes: body.length,
        });
      }
      if (url.pathname === "/replay-manifest.json")
        assert.equal(
          sha(body),
          sha(manifestBytes),
          "Deployment manifest differs from reviewed source",
        );
    })();
    pending.push(operation.catch((error) => responseErrors.push(error.stack ?? String(error))));
  });
  return { context, page, requests, responses, pending, responseErrors };
}
async function layoutOf(page, workspace) {
  const shell = page.getByTestId("terminal-shell");
  await shell.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await shell.getAttribute("data-workspace"), workspace);
  await page
    .getByRole("region", { name: "Investigation context", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  const result = await page.evaluate(() => {
    const visible = (e) => {
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      return (
        r.width > 1 &&
        r.height > 1 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth &&
        s.clipPath !== "inset(50%)" &&
        s.visibility !== "hidden" &&
        s.display !== "none"
      );
    };
    const root = document.querySelector('[data-testid="terminal-shell"]'),
      fonts = [...root.querySelectorAll("*")]
        .filter(
          (e) =>
            visible(e) &&
            [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()),
        )
        .map((e) => parseFloat(getComputedStyle(e).fontSize));
    const rows = [...root.querySelectorAll('[aria-label="Risk issue feed"] tbody tr')].filter(
      (e) => {
        const r = e.getBoundingClientRect();
        return visible(e) && r.top >= 0 && r.bottom <= innerHeight;
      },
    );
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      minVisibleFont: fonts.length ? Math.min(...fonts) : null,
      visibleRows: rows.length,
      chromeHeight:
        root.querySelector("main")?.getBoundingClientRect().top - root.getBoundingClientRect().top,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  assert(result.scrollWidth <= result.innerWidth + 1, "Unintended page-level horizontal overflow");
  assert(
    result.minVisibleFont !== null && result.minVisibleFont >= 11,
    "Visible text/metadata must remain at least11px",
  );
  assert(result.reducedMotion, "Reducedmotion context was not applied");
  if (workspace === "risk" && result.innerWidth >= 1440) {
    assert(
      result.visibleRows >= (result.innerWidth >= 1920 ? 12 : 10),
      "Risk desktop complete-row target is unmet",
    );
    assert(result.chromeHeight <= 120, "Complete terminal chrome exceeds120px");
  }
  return result;
}
function budgets(workspace, responses) {
  const js = responses.filter((r) => r.js).reduce((n, r) => n + r.gzipBytes, 0),
    data = responses.filter((r) => r.data).reduce((n, r) => n + r.bytes, 0);
  if (primary.has(workspace)) assert(js <= 224 * 1024, `${workspace} initialJS ${js}>224KiBgzip`);
  if (["market", "regimes", "data"].includes(workspace))
    assert(data <= 256 * 1024, `${workspace} initialdata ${data}>256KiBtarget`);
  if (["risk", "factors"].includes(workspace))
    assert(data <= 512 * 1024, `${workspace} initialdata ${data}>512KiB`);
  if (workspace === "risk") {
    const urls = new Set([
      manifest.artifacts[manifest.routes["/risk-manager/state"]].url,
      manifest.artifacts[manifest.routes["/risk-manager/sweep"]].url,
    ]);
    const pair = responses
      .filter((r) => urls.has(new URL(r.url).pathname))
      .reduce((n, r) => n + r.bytes, 0);
    assert(pair > 0 && pair <= 256 * 1024, "SelectedRisk state/receipt fetch must stay≤256KiB");
  }
  return {
    initialJSGzipBytes: js,
    initialDataBytes: data,
    compiledMetadataCountsInBothDataAndJSTransfer: true,
  };
}
function matrix(browser) {
  if (smoke) return [[{ width: 1440, height: 1000 }, "risk", "/risk"]];
  const result = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
  ])
    for (const [w, r] of workspaces) result.push([viewport, w, r]);
  for (const [w, r] of workspaces.filter(([w]) => ["risk", "regimes"].includes(w)))
    result.push([{ width: 1440, height: 900 }, w, r]);
  if (browser !== "firefox")
    for (const [w, r] of workspaces) result.push([{ width: 2560, height: 1080 }, w, r]);
  for (const [w, r] of [
    ["world", "/globe"],
    ["agents", "/forge"],
  ])
    result.push([{ width: 1440, height: 1000 }, w, r]);
  return result;
}
if (process.argv.includes("--guard-self-test")) {
  const probes = [
    ["Replay UI", base + "/risk?ctx=1", "GET", true],
    ["static module", base + "/assets/TerminalShell-abc.js", "GET", true],
    ["manifest", base + "/replay-manifest.json", "GET", true],
    ["HEAD static", base + "/assets/terminal.css", "HEAD", true],
    ["provider origin", "https://query1.finance.yahoo.com/v8/finance/chart/SPY", "GET", false],
    ["private API", base + "/api/auth/me", "GET", false],
    ["business compute GET", base + "/risk-manager/state", "GET", false],
    ["private paper", base + "/paper/book", "GET", false],
    ["mutation", base + "/risk", "POST", false],
    ["API under encoded slash", base + "/assets/%2fapi%2fhealth", "GET", false],
    ["path traversal", base + "/assets/../api/health", "GET", false],
    ["backend origin", new URL("http://127.0.0.1:8080/api/health").href, "GET", false],
    ["oversized original", base + manifest.artifacts["observatory:IN-MKT:hmm"].url, "GET", false],
  ];
  for (const [name, url, method, expected] of probes) {
    const request = { url: () => url, method: () => method },
      entry = originals.get(new URL(url).pathname)?.entry;
    assert.equal(allowed(request) && !(entry && entry.bytes > 2 * 1024 * 1024), expected, name);
  }
  const selfTest = {
    schema_version: report.schema_version,
    status: "INCOMPLETE",
    stageStatus: "PASS",
    mode: "BROWSER_GUARD_SELF_TEST",
    probes: probes.length,
    actualBrowserCases: 0,
    note: "Only the harness request guard was tested; no product, integration or browser acceptance claim.",
    missingAreas: requiredAreas,
  };
  writeFileSync(
    path.join(proofRoot, "browser-guard-proof.json"),
    JSON.stringify(selfTest, null, 2) + "\n",
  );
  console.log(JSON.stringify(selfTest));
  process.exit(0);
}
const expectedCases = browsers.reduce((n, name) => n + matrix(name).length, 0);
for (const name of browsers) {
  const browser = await check("launch " + name, () =>
    (name === "firefox" ? firefox : chromium).launch(
      name === "firefox" ? { headless: true } : { headless: true, channel: name },
    ),
  );
  if (!browser) continue;
  try {
    for (const [viewport, workspace, route] of matrix(name)) {
      const caseName = `${name}-${viewport.width}x${viewport.height}-${workspace}`,
        fixture = await pageFor(browser, viewport),
        start = Date.now(),
        before = {
          blocked: report.blockedRequests.length,
          page: report.pageErrors.length,
          console: report.consoleErrors.length,
        };
      await check(caseName, async () => {
        await fixture.page.goto(urlFor(workspace, route), { waitUntil: "domcontentloaded" });
        const layout = await layoutOf(fixture.page, workspace),
          settled = fixture.requests.length;
        await fixture.page.waitForTimeout(1200);
        assert.equal(
          fixture.requests.length,
          settled,
          "Unexpected delayed read or polling after initial evidence settled",
        );
        await Promise.all(fixture.pending);
        assert.deepEqual(fixture.responseErrors, []);
        const metrics = budgets(workspace, fixture.responses);
        assert.equal(report.blockedRequests.length, before.blocked);
        assert.equal(report.pageErrors.length, before.page);
        assert.equal(report.consoleErrors.length, before.console);
        const screenshot = path.join(proofRoot, "screenshots", caseName + ".png");
        await fixture.page.screenshot({
          path: screenshot,
          fullPage: false,
          animations: "disabled",
        });
        report.cases.push({
          caseName,
          browser: name,
          viewport,
          workspace,
          url: fixture.page.url(),
          elapsedMs: Date.now() - start,
          layout,
          ...metrics,
          requests: fixture.requests,
          responses: fixture.responses,
          screenshot,
        });
      });
      if (report.failures.at(-1)?.name === caseName) {
        const failedShot = path.join(proofRoot, "screenshots", caseName + "-FAILED.png");
        try {
          await fixture.page.screenshot({
            path: failedShot,
            fullPage: false,
            animations: "disabled",
          });
          report.failures.at(-1).screenshot = failedShot;
        } catch {}
      }
      await Promise.allSettled(fixture.pending);
      await fixture.context.close();
      writeFileSync(
        path.join(proofRoot, "browser-progress.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          caseName,
          completed: report.cases.length,
          expectedCases,
          failures: report.failures.length,
        }),
      );
    }
  } finally {
    await browser.close();
  }
}
if (
  !report.failures.length &&
  report.cases.length === expectedCases &&
  !report.blockedRequests.length &&
  !report.pageErrors.length &&
  !report.consoleErrors.length
) {
  completedAreas.add("network");
  completedAreas.add("initial_budget");
  completedAreas.add("basic_accessibility");
  if (!smoke) completedAreas.add("matrix");
}
const missingAreas = requiredAreas.filter((area) => !completedAreas.has(area));
if (!smoke && !matrixOnly)
  await check("complete approved browser verification coverage", async () =>
    assert.deepEqual(
      missingAreas,
      [],
      "Fullacceptance requires every action/context/table/privacy/performance gate; --matrix-only is an explicitly incomplete integrationstage",
    ),
  );
Object.assign(report, {
  expectedCases,
  completedAreas: [...completedAreas],
  missingAreas,
  stageStatus: report.failures.length ? "FAIL" : "PASS",
  status: report.failures.length ? "FAIL" : missingAreas.length ? "INCOMPLETE" : "PASS",
});
writeFileSync(
  path.join(proofRoot, "terminal-browser-proof.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    stageStatus: report.stageStatus,
    cases: report.cases.length,
    expectedCases,
    failures: report.failures.map(({ name, error }) => ({ name, error: error.split("\n")[0] })),
    missingAreas,
    proofRoot,
  }),
);
assert.equal(
  report.failures.length,
  0,
  "Terminalbrowser verification failed; inspect engineeringproof",
);
