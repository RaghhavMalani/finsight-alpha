import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium, firefox } from "playwright";
import ts from "typescript";

const option = (key) => {
  const i = process.argv.indexOf(key);
  return i < 0 ? undefined : process.argv[i + 1];
};
// CI uses the same build and initial-journey verifier, with no added Vite plugin.
if (process.argv.includes("--verify-initial-packaging")) {
  await verifyInitialPackagingBuild();
  process.exit(0);
}
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
    /^\/(?:assets|fonts)\/[a-zA-Z0-9_./~-]+$/.test(p) ||
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
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
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
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      at: Date.now(),
    });
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
        gzipDefaultBytes: js ? gzipSync(body).length : null,
        sha256: sha(body),
        ...(mime.includes("text/html")
          ? {
              htmlPreloads: [
                ...body
                  .toString("utf8")
                  .matchAll(
                    /<link\b[^>]*\brel=["\'](?:modulepreload|preload|prefetch)["\'][^>]*>/gi,
                  ),
              ].flatMap(([tag]) => {
                const href = /\bhref=["\']([^"\']+)["\']/i.exec(tag)?.[1];
                return href ? [new URL(href, response.url()).href] : [];
              }),
            }
          : {}),
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

function paletteUsable() {
  const results = document.getElementById("forge-command-results");
  return (
    results?.getAttribute("aria-busy") === "false" &&
    results.querySelectorAll('[role="option"]').length > 0 &&
    document.querySelector('[role="dialog"] [role="combobox"]') === document.activeElement
  );
}
function paletteReadinessSelfTest() {
  const prior = globalThis.document;
  const cases = [
    { busy: "false", focused: true, optionCount: 0, expected: false },
    { busy: "true", focused: true, optionCount: 1, expected: false },
    { busy: "false", focused: false, optionCount: 1, expected: false },
    { busy: "false", focused: true, optionCount: 1, expected: true },
    { busy: "false", focused: true, optionCount: 9, expected: true },
    { absent: true, busy: "false", focused: true, optionCount: 0, expected: false },
  ];
  try {
    for (const fixture of cases) {
      const input = {};
      globalThis.document = {
        getElementById: () =>
          fixture.absent
            ? null
            : {
                getAttribute: () => fixture.busy,
                querySelectorAll: () => Array.from({ length: fixture.optionCount }, () => ({})),
              },
        querySelector: () => input,
        activeElement: fixture.focused ? input : {},
      };
      assert.equal(Boolean(paletteUsable()), fixture.expected, JSON.stringify(fixture));
    }
  } finally {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  }
  return {
    status: "PASS_ENGINEERING_PREDICATE_SELF_TEST",
    cases: cases.length,
    actualBrowserCases: 0,
  };
}

if (process.argv.includes("--guard-self-test")) {
  const paletteReadiness = paletteReadinessSelfTest();
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
    paletteReadiness,
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

/**
 * Engineering-only helper for the approved capacity verifier, never product runtime.
 * Dependencies are injected from existing Node built-ins and the installed TypeScript parser.
 * This reports all transport bytes and candidate attributable code separately.
 * The user confirmed 64KiB route attribution excludes established framework/common code, while32KiB interaction includes code plus metadata combined.
 */
function collectClientBudgetGraph({
  directory,
  journeys,
  readFileSync,
  readdirSync,
  createHash,
  gzipSync,
  ts,
}) {
  const sha = (raw) => createHash("sha256").update(raw).digest("hex");
  const base = (value) => {
    const url = typeof value === "string" ? value : value.url;
    return new URL(url, "https://local.invalid").pathname.split("/").at(-1);
  };
  const uniq = (list) => [...new Set(list)];
  const join = (name) => directory.replace(/[\\/]$/, "") + "/" + name;
  const generated =
    /^(?:seed|market|regimes|risk|factors|data|recordings|history|history-archive|observatory-window|search)\.generated-/;
  const owned =
    /^(?:TerminalShell|ContextBar|CommandLine|ForgeCommandPalette|mnemonics|context|compatibility|links|capabilities|catalog|search|commands|reader|changes|preferences|exports|CapabilityAction|EvidenceLink)-/;
  const common =
    /^(?:jsx-runtime|react-dom|react|Match|link|useMatch|useSelector|useParams|useNavigate|useQuery|QueryClientProvider|lazyRouteComponent|preload-helper|root|mode|instruments|factor-series|api|contracts|useReducedMotion|index|query)-/;
  const newTerminalMarker =
    /terminal-navigation-seed\/1|Investigation URL|Investigation context|Malformed terminal|Terminal shard|Terminal entity|terminal-command|terminal-shard\/1|terminal-generator\/1/;
  const scientificPayload = (code) =>
    code.includes("terminal-display/1") &&
    code.includes("selectedFields") &&
    /market-week-window|regime-timeline-window|observatory-trace-window/.test(code);
  const classify = (name, code) => {
    if (generated.test(name)) return "generated_metadata_JS";
    if (owned.test(name)) return "terminal_code";
    if (/^risk-/.test(name)) return "risk_feature_code";
    if (
      /^(?:factors|RetainedDiagnostics|LineageDrawer)-/.test(name) ||
      /factor-metadata|factor-retained/.test(code)
    )
      return "factor_feature_code";
    if (newTerminalMarker.test(code)) return "terminal_code";
    if (/^(?:root|index)-/.test(name)) return "UNCLASSIFIED_COUNT_CONSERVATIVELY";
    if (common.test(name)) return "existing_common_candidate";
    return "UNCLASSIFIED_COUNT_CONSERVATIVELY";
  };
  const assets = new Map(
    readdirSync(directory)
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map((name) => {
        const raw = readFileSync(join(name)),
          code = raw.toString("utf8");
        const sf = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const imports = [],
          dynamicImports = [];
        const visit = (node) => {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          )
            imports.push(base(node.moduleSpecifier.text));
          if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments[0] &&
            (ts.isStringLiteral(node.arguments[0]) ||
              ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
          )
            dynamicImports.push(base(node.arguments[0].text));
          ts.forEachChild(node, visit);
        };
        visit(sf);
        return [
          name,
          {
            name,
            decodedBytes: raw.length,
            gzipDefaultBytes: gzipSync(raw).length,
            sha256: sha(raw),
            category: classify(name, code),
            newTerminalMarker: newTerminalMarker.test(code),
            scientificDisplayPayload: generated.test(name) && scientificPayload(code),
            fullCapabilityRuntime:
              code.includes("Observed 401 authentication boundary only") ||
              code.includes("No installed tenant-local assessment exists"),
            imports: uniq(imports),
            dynamicImports: uniq(dynamicImports),
          },
        ];
      }),
  );
  const closure = (roots) => {
    const seen = new Set(),
      pending = [...roots];
    while (pending.length) {
      const name = pending.pop();
      if (seen.has(name)) continue;
      seen.add(name);
      const item = assets.get(name);
      if (item) pending.push(...item.imports);
    }
    return [...seen].sort();
  };
  const metrics = (names) => {
    const values = uniq(names)
      .map((name) => assets.get(name))
      .filter(Boolean);
    return {
      assets: values.map((x) => x.name),
      count: values.length,
      decodedBytes: values.reduce((n, x) => n + x.decodedBytes, 0),
      gzipDefaultBytes: values.reduce((n, x) => n + x.gzipDefaultBytes, 0),
    };
  };
  const roots = (re) => [...assets.keys()].filter((name) => re.test(name));
  const forbiddenInitial = roots(
    /^(?:ForgeCommandPalette|search|commands|search\.generated|history-archive\.generated|history\.generated)-/,
  );
  const forbiddenCurrentSearch = roots(/^history-archive\.generated-/);
  const phases = [];
  for (const journey of journeys) {
    const initial = journey.phases.find((phase) => phase.name === "initial");
    const initialAssets = new Set(
      (initial?.responses ?? [])
        .filter(
          (r) =>
            r.js ||
            String(r.mime).includes("javascript") ||
            new URL(r.url, "https://local.invalid").pathname.endsWith(".js"),
        )
        .map(base),
    );
    const cumulativeInteractionAssets = new Set();
    let historyScopeInvoked = false;
    for (const phase of journey.phases) {
      if (phase.name === "history") historyScopeInvoked = true;
      const responses = phase.responses ?? [];
      const observed = uniq(
        responses
          .filter(
            (r) =>
              r.js ||
              String(r.mime).includes("javascript") ||
              new URL(r.url, "https://local.invalid").pathname.endsWith(".js"),
          )
          .map(base),
      );
      const names = observed.filter((name) => assets.has(name));
      const firstRequired = names.filter((name) => !initialAssets.has(name));
      if (
        !historyScopeInvoked &&
        ["palette", "current-search", "command", "warm-palette"].includes(phase.name)
      )
        for (const name of firstRequired) cumulativeInteractionAssets.add(name);
      const cumulativeInteractionRequiredJS = metrics([...cumulativeInteractionAssets]);
      const scientificDisplayPayloads = names.filter(
        (name) => assets.get(name).scientificDisplayPayload,
      );
      const requests = uniq((phase.requests ?? []).map(base));
      const preloads = uniq((phase.htmlPreloads ?? []).map(base));
      const executed = uniq((phase.executedScripts ?? []).map(base));
      const feature = journey.workspace === "risk" ? "risk_feature_code" : "factor_feature_code";
      const attributable = names.filter((name) =>
        [
          "terminal_code",
          "generated_metadata_JS",
          feature,
          "UNCLASSIFIED_COUNT_CONSERVATIVELY",
        ].includes(assets.get(name).category),
      );
      const alwaysOn = names.filter(
        (name) =>
          assets.get(name).category === "terminal_code" ||
          /^seed\.generated-/.test(name) ||
          assets.get(name).category === "UNCLASSIFIED_COUNT_CONSERVATIVELY",
      );
      const checks = [];
      if (["palette", "current-search", "metadata-search"].includes(phase.name))
        checks.push({
          name: "no_full_business_capability_runtime_in_metadata_discovery",
          pass: !names.some((name) => assets.get(name).fullCapabilityRuntime),
        });
      if (["palette", "current-search", "metadata-search", "command"].includes(phase.name))
        checks.push({
          name: "no_workspace_scientific_display_payload_in_interaction",
          pass: scientificDisplayPayloads.length === 0,
        });
      if (["palette", "current-search", "metadata-search", "command"].includes(phase.name))
        checks.push({
          name: "no_workspace_evidence_shard_requested_merely_for_search",
          pass: !requests.some((name) =>
            /^(?:market|regimes|risk|factors|data|recordings|observatory-window)\.generated-/.test(
              name,
            ),
          ),
        });
      if (phase.name === "initial") {
        checks.push({
          name: "no_initial_interaction_or_archive_request",
          pass: !requests.some((name) => forbiddenInitial.includes(name)),
        });
        checks.push({
          name: "no_initial_interaction_or_archive_preload",
          pass: !preloads.some((name) => forbiddenInitial.includes(name)),
        });
        checks.push({
          name: "no_initial_interaction_or_archive_execution",
          pass: !executed.some((name) => forbiddenInitial.includes(name)),
        });
      }
      if (["initial", "current-search", "metadata-search"].includes(phase.name))
        checks.push({
          name: "no_archive_without_history_scope",
          pass: !requests.some((name) => forbiddenCurrentSearch.includes(name)),
        });
      const observedBodyChecks = responses
        .filter((r) => names.includes(base(r)))
        .map((r) => ({
          asset: base(r),
          sha256Matches: r.sha256 === assets.get(base(r)).sha256,
          decodedBytesMatch: r.bytes === undefined || r.bytes === assets.get(base(r)).decodedBytes,
        }));
      phases.push({
        journey: journey.name,
        workspace: journey.workspace,
        phase: phase.name,
        url: journey.url,
        allJS: metrics(names),
        attributableWorkspaceIncludingMetadata: metrics(attributable),
        alwaysOnCandidateIncludingSeed: metrics(alwaysOn),
        terminalCode: metrics(
          names.filter((name) => assets.get(name).category === "terminal_code"),
        ),
        metadataJS: metrics(
          names.filter((name) => assets.get(name).category === "generated_metadata_JS"),
        ),
        firstRequiredJS: metrics(firstRequired),
        cumulativeInteractionRequiredJS,
        scientificDisplayPayloads,
        numericGates:
          phase.name === "initial"
            ? {
                alwaysOnCore: {
                  gzip: metrics(alwaysOn).gzipDefaultBytes,
                  limit: 24576,
                  pass: metrics(alwaysOn).gzipDefaultBytes <= 24576,
                },
                initialWorkspace: {
                  gzip: metrics(attributable).gzipDefaultBytes,
                  limit: 65536,
                  pass: metrics(attributable).gzipDefaultBytes <= 65536,
                },
              }
            : ["palette", "current-search", "metadata-search", "command"].includes(phase.name)
              ? {
                  firstInvocationCodeAndMetadata: {
                    gzip:
                      phase.name === "current-search"
                        ? cumulativeInteractionRequiredJS.gzipDefaultBytes
                        : metrics(firstRequired).gzipDefaultBytes,
                    limit: 32768,
                    pass:
                      (phase.name === "current-search"
                        ? cumulativeInteractionRequiredJS.gzipDefaultBytes
                        : metrics(firstRequired).gzipDefaultBytes) <= 32768,
                  },
                }
              : {},
        firstRequiredTerminalCode: metrics(
          firstRequired.filter((name) => assets.get(name).category === "terminal_code"),
        ),
        firstRequiredMetadataJS: metrics(
          firstRequired.filter((name) => assets.get(name).category === "generated_metadata_JS"),
        ),
        commonCandidates: names.filter(
          (name) => assets.get(name).category === "existing_common_candidate",
        ),
        unclassified: names.filter(
          (name) => assets.get(name).category === "UNCLASSIFIED_COUNT_CONSERVATIVELY",
        ),
        unknownObservedAssets: observed.filter((name) => !assets.has(name)),
        requests,
        htmlPreloads: preloads,
        executedScripts: executed,
        latency: phase.latency,
        checks,
        observedBodyChecks,
      });
    }
  }
  const coreRoots = roots(/^TerminalShell-/),
    paletteRoots = roots(/^ForgeCommandPalette-/);
  const coreClosure = closure(coreRoots);
  return {
    schema_version: "phase75-capacity-client-asset-graph/1",
    method:
      "Sum each unique actual emitted client JSbody with node:zlib gzipSync default options. All networkJS, generatedmetadataJS, ownedcode, commoncandidates and unknowns remain separately visible.",
    assetFingerprint: sha(
      Buffer.from(
        JSON.stringify([...assets.values()].map(({ name, sha256 }) => ({ name, sha256 }))),
      ),
    ),
    assets: [...assets.values()],
    coreRoots,
    paletteRoots,
    coreClosure,
    forbiddenInitial,
    forbiddenCurrentSearch,
    coreStaticAllJS: metrics(coreClosure),
    coreStaticOwnedCode: metrics(
      coreClosure.filter((name) => assets.get(name)?.category === "terminal_code"),
    ),
    phases,
    classificationStatus:
      "User confirmed64KiB route-attributable initial cap with established framework/common excluded;32KiB first interaction counts code+metadata combined. All totalJS remains visible, unknowns conservatively count; first-interaction charges the cumulative union of every new JSasset acrosspalette/currentsearch/command beforeexplicithistory, even a common candidate. Genericroot/index assets and commonnames containingnewterminalmarkers are not filename-free. Othercommoncandidates still requireauditor baseline-content review.",
    networkAssertionsStatus: phases.length
      ? phases.every(
          (p) =>
            p.checks.every((c) => c.pass) &&
            p.observedBodyChecks.every((c) => c.sha256Matches && c.decodedBytesMatch) &&
            p.unknownObservedAssets.length === 0,
        )
        ? "PASS"
        : "FAIL"
      : "NOT_RUN",
  };
}

const INITIAL_LOCK_SHA = "547adfe24ac710f657915a3af141ff94d9adc2cb19f3b4c69802ccf4a8aae5f4";
// Whole bodies only. Rendered-module provenance covers compiler glue that a
// source map leaves unmapped; virtual/unresolved modules are charged in full.
function classifyInitialBodies(directory, moduleProof, mapDirectory) {
  const lockBytes = readFileSync(path.join(frontend, "package-lock.json"));
  const lock = JSON.parse(lockBytes);
  assert.equal(
    sha(lockBytes.toString().replaceAll("\r\n", "\n")),
    INITIAL_LOCK_SHA,
    "Approved package-lock must remain unchanged",
  );
  const packageProof = (file) => {
    let folder = path.dirname(path.resolve(file));
    while (folder.startsWith(path.resolve(frontend))) {
      const candidate = path.join(folder, "package.json");
      const key = path.relative(frontend, folder).replaceAll("\\", "/");
      if (existsSync(candidate) && lock.packages[key]?.version) break;
      folder = path.dirname(folder);
    }
    const key = path.relative(frontend, folder).replaceAll("\\", "/");
    const packageJSON = existsSync(path.join(folder, "package.json"))
      ? JSON.parse(readFileSync(path.join(folder, "package.json")))
      : null;
    assert(
      key.startsWith("node_modules/") &&
        packageJSON &&
        lock.packages[key]?.version === packageJSON.version,
      "Installed vendor package identity must match unchanged lock: " + file,
    );
    return { key, name: packageJSON.name, version: packageJSON.version };
  };
  return moduleProof.chunks.map((chunk) => {
    const filename = path.basename(chunk.fileName),
      bytes = readFileSync(path.join(directory, filename));
    assert.equal(sha(bytes), chunk.sha256, "Module proof must describe actual emitted body");
    const moduleList = Object.entries(chunk.modules)
      .filter(([, m]) => m.renderedLength > 0)
      .map(([id, m]) => ({
        id,
        renderedLength: m.renderedLength,
        codeSha256: m.code ? sha(m.code) : null,
      }));
    const modules = moduleList.map((module) => {
      const physical = module.id.replace(/\?.*$/, "");
      const vendor =
        physical.replaceAll("\\", "/").includes("/node_modules/") && existsSync(physical);
      return {
        ...module,
        owner: vendor ? "VENDOR" : "PROJECT_OR_CONSERVATIVELY_CHARGED",
        ...(vendor ? { package: packageProof(physical) } : {}),
      };
    });
    const mapPath = path.join(mapDirectory, filename + ".map");
    if (!existsSync(mapPath))
      return {
        filename,
        sha256: sha(bytes),
        decodedBytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
        ownership:
          modules.length && modules.every((m) => m.owner === "PROJECT_OR_CONSERVATIVELY_CHARGED")
            ? "PROJECT_OWNED"
            : "UNKNOWN",
        reason:
          "No map is emitted for this virtual/compiler helper. Complete body charged as project when rendered module provenance is exclusively project/virtual; vendor exclusion is forbidden without the independent map.",
        modules,
      };
    const map = JSON.parse(readFileSync(mapPath));
    assert.equal(map.sources.length, map.sourcesContent.length);
    const sources = map.sources.map((source, i) => {
      const physical = path.resolve(directory, source.replace(/\?.*$/, ""));
      const vendor = physical.replaceAll("\\", "/").includes("/node_modules/");
      const content = map.sourcesContent[i];
      const exact =
        existsSync(physical) &&
        typeof content === "string" &&
        readFileSync(physical, "utf8").replaceAll("\r\n", "\n") ===
          content.replaceAll("\r\n", "\n");
      return {
        source,
        contentSha256: typeof content === "string" ? sha(content) : null,
        owner: vendor && exact ? "VENDOR" : "PROJECT_OR_CONSERVATIVELY_CHARGED",
        diskContentMatch: exact,
        ...(vendor && exact ? { package: packageProof(physical) } : {}),
      };
    });
    const owners = [...modules, ...sources].map((m) => m.owner);
    const vendor = owners.includes("VENDOR"),
      project = owners.includes("PROJECT_OR_CONSERVATIVELY_CHARGED") || !owners.length;
    const ownership = vendor ? (project ? "MIXED" : "VENDOR_ONLY") : "PROJECT_OWNED";
    return {
      filename,
      sha256: sha(bytes),
      decodedBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
      ownership,
      modules,
      sources,
      imports: chunk.imports,
      dynamicImports: chunk.dynamicImports,
      mapSha256: sha(readFileSync(mapPath)),
      reason:
        ownership === "VENDOR_ONLY"
          ? "Every rendered module and every mapped source is installed lock-verified third-party code; exact map source contents verified. Full unmodified emitter module provenance independently covers unmapped compiler glue. No project source or project/unknown virtual module. No gzip allocation or filename exemption."
          : ownership === "MIXED"
            ? "Vendor plus project/virtual/unresolved source in the same emitted body. Attribution rejected."
            : "Complete body conservatively charged, including all virtual, bootstrap, unresolved and unmapped code.",
    };
  });
}
function terminalStaticClosure() {
  const visited = new Set();
  const visit = (file) => {
    file = path.resolve(file);
    if (visited.has(file) || !existsSync(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (node.isTypeOnly || node.importClause?.isTypeOnly) continue;
      const bindings = node.importClause?.namedBindings;
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        !node.importClause.name &&
        bindings.elements.every((e) => e.isTypeOnly)
      )
        continue;
      const name = node.moduleSpecifier?.text;
      if (typeof name !== "string") continue;
      const base = name.startsWith("@/")
        ? path.join(frontend, "src", name.slice(2))
        : name.startsWith(".")
          ? path.resolve(path.dirname(file), name)
          : null;
      if (!base) continue;
      const resolved = [
        base,
        base + ".ts",
        base + ".tsx",
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
      ].find((p) => existsSync(p) && /\.[cm]?[jt]sx?$/.test(p));
      if (resolved) visit(resolved);
    }
  };
  visit(path.join(frontend, "src/app/terminal/TerminalShell.tsx"));
  visit(path.join(frontend, "src/app/terminal/context.ts"));
  return [...visited].map((f) => f.replaceAll("\\", "/")).sort();
}
function exactInitialGate(journeys, assets, baseline) {
  const bySHA = new Map(assets.map((a) => [a.sha256, a]));
  const totals = journeys.map((journey) => {
    const bodies = [...new Set(journey.bodies.map((b) => b.sha256))].map((digest) => {
      const body = bySHA.get(digest);
      assert(body, "Initial browser body absent from ownership build");
      return body;
    });
    const before = baseline.initialOwnership.journeys.find(
      (j) => j.workspace === journey.workspace,
    );
    assert(before);
    const project = bodies.filter((b) => b.ownership === "PROJECT_OWNED"),
      vendor = bodies.filter((b) => b.ownership === "VENDOR_ONLY");
    const invalid = bodies.filter((b) => ["MIXED", "UNKNOWN"].includes(b.ownership));
    const forbidden = bodies.flatMap((b) =>
      b.modules
        .filter((m) =>
          /(?:\/node_modules\/(?:three|@react-three|three-stdlib|world-atlas|satellite\.js)\/|\/components\/globe\/|\/app\/command\/(?:ForgeCommandPalette|mnemonics)|\/app\/terminal\/(?:search|commands|generated\/(?:search|history)|reader)|\/risk-manager\/LocalRiskLab)/.test(
            m.id.replaceAll("\\", "/"),
          ),
        )
        .map((m) => ({ body: b.filename, module: m.id })),
    );
    const gzip = bodies.reduce((n, b) => n + b.gzipBytes, 0),
      projectGzip = project.reduce((n, b) => n + b.gzipBytes, 0),
      vendorGzip = vendor.reduce((n, b) => n + b.gzipBytes, 0);
    return {
      workspace: journey.workspace,
      bodies,
      projectGzip,
      vendorGzip,
      totalGzip: gzip,
      requestCount: journey.requestCount,
      invalid,
      forbidden,
      regression: {
        baselineGzip: before.gzip,
        baselineRequests: before.requestCount,
        deltaGzip: gzip - before.gzip,
        allowedGzip: Math.min(before.gzip * 0.05, 8192),
        deltaRequests: journey.requestCount - before.requestCount,
      },
      behaviorEquivalent: journey.behaviorEquivalent === true,
      projectCap: {
        gzip: invalid.length ? null : projectGzip,
        knownProjectGzip: projectGzip,
        status: invalid.length ? "INDETERMINATE" : projectGzip <= 65536 ? "PASS" : "FAIL",
        limit: 65536,
        pass: invalid.length ? null : projectGzip <= 65536,
      },
    };
  });
  assert.deepEqual(totals.map((t) => t.workspace).sort(), ["factors", "risk"]);
  const r = totals.find((t) => t.workspace === "risk"),
    f = totals.find((t) => t.workspace === "factors");
  const shared = r.bodies.filter(
    (a) =>
      a.ownership === "PROJECT_OWNED" &&
      f.bodies.some((b) => b.sha256 === a.sha256 && b.ownership === "PROJECT_OWNED"),
  );
  const closure = terminalStaticClosure();
  const terminalSpecific = [
    ...new Map(
      [...r.bodies, ...f.bodies]
        .filter(
          (b) =>
            b.ownership === "PROJECT_OWNED" &&
            b.modules.some((m) =>
              closure.includes(m.id.replace(/\?.*$/, "").replaceAll("\\", "/")),
            ),
        )
        .map((b) => [b.sha256, b]),
    ).values(),
  ];
  const core = [...new Map([...shared, ...terminalSpecific].map((b) => [b.sha256, b])).values()];
  const terminalGzip = core.reduce((n, b) => n + b.gzipBytes, 0);
  const unresolved = totals.some((t) => t.invalid.length > 0);
  const failures = [];
  for (const t of totals) {
    if (t.invalid.length) failures.push(t.workspace + ": mixed/unknown initial ownership");
    if (t.projectCap.pass === false) failures.push(t.workspace + ": project initial exceeds65536");
    if (t.forbidden.length) failures.push(t.workspace + ": eager optional dependency");
    if (t.regression.deltaGzip > t.regression.allowedGzip)
      failures.push(t.workspace + ": total gzip regression");
    if (t.regression.deltaRequests > 4) failures.push(t.workspace + ": request-count regression");
    if (!t.behaviorEquivalent) failures.push(t.workspace + ": behavior/evidence not equivalent");
  }
  if (!unresolved && terminalGzip > 24576) failures.push("terminal core exceeds24576");
  return {
    status: failures.length ? "FAIL" : "PASS",
    method:
      "Actual emitted whole-body SHA unions; default deterministic gzip. Conservative shared initial project set plus complete always-on terminal closure bodies. No proportional, fragment or filename accounting.",
    routes: totals,
    terminal: {
      gzip: unresolved ? null : terminalGzip,
      knownProjectGzip: terminalGzip,
      status: unresolved ? "INDETERMINATE" : terminalGzip <= 24576 ? "PASS" : "FAIL",
      limit: 24576,
      pass: unresolved ? null : terminalGzip <= 24576,
      shared: shared.map((b) => b.filename),
      terminalSpecific: terminalSpecific.map((b) => b.filename),
      bodies: core.map((b) => ({ filename: b.filename, sha256: b.sha256, gzipBytes: b.gzipBytes })),
      staticModuleClosure: closure,
    },
    failures,
  };
}
function initialGateSelfTest() {
  const module = (id) => ({ id: path.join(frontend, id).replaceAll("\\", "/") });
  const fixture = () => {
    const assets = [
      {
        filename: "core.js",
        sha256: "core",
        gzipBytes: 24576,
        ownership: "PROJECT_OWNED",
        modules: [module("src/app/terminal/TerminalShell.tsx")],
      },
      {
        filename: "risk.js",
        sha256: "risk",
        gzipBytes: 40960,
        ownership: "PROJECT_OWNED",
        modules: [module("src/risk-manager/RiskWorkspace.tsx")],
      },
      {
        filename: "factors.js",
        sha256: "factors",
        gzipBytes: 40960,
        ownership: "PROJECT_OWNED",
        modules: [module("src/factors/FactorsWorkspace.tsx")],
      },
      {
        filename: "arbitrary-name.js",
        sha256: "vendor",
        gzipBytes: 20000,
        ownership: "VENDOR_ONLY",
        modules: [module("node_modules/react/index.js")],
      },
    ];
    const journeys = ["risk", "factors"].map((workspace) => ({
      workspace,
      bodies: ["core", workspace, "vendor"].map((sha256) => ({ sha256 })),
      requestCount: 3,
      behaviorEquivalent: true,
    }));
    const baseline = {
      initialOwnership: {
        journeys: ["risk", "factors"].map((workspace) => ({
          workspace,
          gzip: 85536,
          requestCount: 3,
        })),
      },
    };
    return { assets, journeys, baseline };
  };
  const run = (change) => {
    const f = fixture();
    change?.(f);
    return exactInitialGate(f.journeys, f.assets, f.baseline);
  };
  const checks = [];
  const test = (name, action) => {
    action();
    checks.push({ name, pass: true });
  };
  test("exact whole-body boundaries include core and pass without filename exemptions", () =>
    assert.equal(run().status, "PASS"));
  for (const [index, name] of [
    [0, "terminal"],
    [1, "risk"],
    [2, "factors"],
  ])
    test(name + " one-byte excess rejected", () =>
      assert.equal(run((f) => f.assets[index].gzipBytes++).status, "FAIL"),
    );
  for (const ownership of ["MIXED", "UNKNOWN"])
    test(ownership + " rejected", () =>
      assert.equal(run((f) => (f.assets[3].ownership = ownership)).status, "FAIL"),
    );
  test("request increase5 rejected", () =>
    assert.equal(run((f) => (f.journeys[0].requestCount += 5)).status, "FAIL"));
  test("total regression beyond stricter bound rejected", () =>
    assert.equal(run((f) => (f.assets[3].gzipBytes += 8193)).status, "FAIL"));
  test("eager visualization caught by module provenance regardless of chunk name", () =>
    assert.equal(
      run((f) => (f.assets[3].modules = [module("node_modules/three/build/three.module.js")]))
        .status,
      "FAIL",
    ));
  test("behavior mismatch rejected", () =>
    assert.equal(run((f) => (f.journeys[1].behaviorEquivalent = false)).status, "FAIL"));
  test("duplicated always-on terminal code charged in both route-specific bodies", () => {
    const f = fixture();
    f.assets[1].modules = [module("src/app/terminal/context.ts")];
    f.assets[2].modules = [module("src/app/terminal/context.ts")];
    const result = exactInitialGate(f.journeys, f.assets, f.baseline);
    assert.equal(result.terminal.gzip, 106496);
    assert.equal(result.terminal.bodies.length, 3);
    assert.equal(result.status, "FAIL");
  });
  return checks;
}

async function verifyInitialPackagingBuild() {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    front = path.join(root, "frontend-v2"),
    out = path.join(front, ".vercel/output/static/assets"),
    proof = path.join(root, process.env.TERMINAL_BROWSER_PROOF_DIR ?? ".tmp/phase75/initial-ci");
  mkdirSync(proof, { recursive: true });
  const maps = path.join(proof, "hidden-maps");
  mkdirSync(maps, { recursive: true });
  const { createBuilder, version } = await import("vite");
  const capture = async (hidden) => {
    const builder = await createBuilder({ build: hidden ? { sourcemap: "hidden" } : {} }, false),
      original = builder.build.bind(builder),
      chunks = [];
    builder.build = async (environment) => {
      const result = await original(environment);
      if (environment.name === "client")
        for (const value of Array.isArray(result) ? result : [result])
          for (const c of value.output ?? [])
            if (c.type === "chunk")
              chunks.push({
                name: c.name,
                fileName: c.fileName,
                sha256: createHash("sha256").update(c.code).digest("hex"),
                modules: c.modules,
                moduleIds: c.moduleIds,
                imports: c.imports,
                dynamicImports: c.dynamicImports,
              });
      return result;
    };
    await builder.buildApp();
    return {
      viteVersion: version,
      moduleCapture:
        "Unmodified ViteBuilder.build return value; no added plugin or rendering hook.",
      chunks,
    };
  };
  const previous = process.cwd();
  let hidden, normal;
  try {
    process.chdir(front);
    hidden = await capture(true);
    for (const name of readdirSync(out).filter((n) => n.endsWith(".map")))
      copyFileSync(path.join(out, name), path.join(maps, name));
  } finally {
    // Normal output is restored even when ownership analysis fails; maps stay private QA.
    process.chdir(front);
    normal = await capture(false);
    process.chdir(previous);
  }
  const signature = (proof) =>
    proof.chunks.map(({ modules, ...rest }) => ({
      ...rest,
      modules: Object.entries(modules).map(([id, m]) => ({
        id,
        renderedLength: m.renderedLength,
        renderedExports: m.renderedExports,
      })),
    }));
  assert(
    JSON.stringify(signature(hidden)) === JSON.stringify(signature(normal)),
    "Two complete builds must preserve emitted body digests, module ownership, families and dependency graph",
  );
  assert(
    !readdirSync(out).some((n) => n.endsWith(".map")),
    "Normal output must not publish source maps",
  );
  writeFileSync(path.join(proof, "normal-modules.json"), JSON.stringify(normal));
  const child = spawn(process.execPath, [path.join(front, "scripts/preview-built.mjs")], {
    cwd: front,
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("Preview readiness timeout")), 20000);
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(Error("Preview exited"));
      });
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Production build:")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    const args = [
      fileURLToPath(import.meta.url),
      "--url",
      "http://127.0.0.1:4174",
      "--initial-only",
      "--initial-baseline",
      "docs/qa/phase7-5-connected-quant-terminal-proof.json",
      "--ownership-dir",
      proof,
    ];
    const code = await new Promise((resolve, reject) => {
      const run = spawn(process.execPath, args, {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, TERMINAL_BROWSER_PROOF_DIR: proof },
      });
      run.once("error", reject);
      run.once("exit", resolve);
    });
    assert.equal(code, 0, "Exact initial packaging gate failed");
  } finally {
    child.kill();
  }
}

// Fresh, no-interaction production journeys for the physical ownership amendment.
// This is part of the existing verifier; it never opens palette/search/history.
async function initialOwnershipStage() {
  report.initialGateSelfTests = initialGateSelfTest();
  report.mode = "INITIAL_OWNERSHIP_PRODUCTION_STAGE";
  report.initialOwnership = { journeys: [], baseline: option("--initial-baseline") ?? null };
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const [workspace, route] of [
      ["risk", "/risk"],
      ["factors", "/factors"],
    ]) {
      const fixture = await pageFor(browser, { width: 1440, height: 1000 });
      try {
        await fixture.page.coverage.startJSCoverage({ resetOnNavigation: false });
        const startedAt = Date.now();
        await fixture.page.goto(urlFor(workspace, route), { waitUntil: "domcontentloaded" });
        await fixture.page.waitForFunction(
          () =>
            document.querySelector('[data-testid="terminal-shell"]')?.getAttribute("data-ready") ===
            "true",
        );
        await fixture.page
          .getByRole("region", { name: "Investigation context", exact: true })
          .waitFor();
        if (workspace === "risk") {
          await fixture.page.getByRole("region", { name: "Immune status", exact: true }).waitFor();
          await fixture.page
            .getByRole("region", { name: "Risk issue feed", exact: true })
            .waitFor();
          await fixture.page.getByTestId("risk-issue-select").first().waitFor();
          await fixture.page.getByRole("button", { name: "Issue console", exact: true }).waitFor();
        } else {
          await fixture.page.locator('[data-factor-workspace][data-state="ready"]').waitFor();
          await fixture.page.locator('.factor-source-row[aria-pressed="true"]').waitFor();
          await fixture.page
            .getByRole("heading", { name: "Source library", exact: true })
            .waitFor();
        }
        await fixture.page.waitForLoadState("networkidle");
        await Promise.all(fixture.pending);
        const usableAt = Date.now(),
          idleRequests = fixture.requests.length;
        await fixture.page.waitForTimeout(1200);
        await Promise.all(fixture.pending);
        assert.equal(fixture.requests.length, idleRequests, "No delayed initial optional prefetch");
        assert.deepEqual(fixture.responseErrors, []);
        const coverage = await fixture.page.coverage.stopJSCoverage();
        const snapshot = await fixture.page.evaluate(() => ({
          url: location.pathname + location.search,
          text: document.body.innerText,
          inputs: [...document.querySelectorAll("select,input")].map((e) => ({
            tag: e.tagName,
            label: e.getAttribute("aria-label"),
            value: e.value,
            disabled: e.disabled,
          })),
          links: [...document.querySelectorAll("a[href]")].map((e) => ({
            text: e.textContent,
            href: e.getAttribute("href"),
          })),
          issueRows: [...document.querySelectorAll("[data-risk-feed] tbody tr")].map(
            (e) => e.innerText,
          ),
          selectedFactor:
            document.querySelector('.factor-source-row[aria-pressed="true"]')?.textContent ?? null,
          context:
            document.querySelector('[aria-label="Investigation context"]')?.textContent ?? null,
        }));
        const bodies = [
          ...new Map(fixture.responses.filter((r) => r.js).map((r) => [r.sha256, r])).values(),
        ].sort((a, b) => a.url.localeCompare(b.url));
        for (const body of bodies) {
          const filename = path.basename(new URL(body.url).pathname);
          assert.equal(
            sha(readFileSync(path.join(frontend, ".vercel/output/static/assets", filename))),
            body.sha256,
            "Browser body equals local production body",
          );
        }
        const requests = fixture.requests.filter((r) => /\.m?js(?:$|\?)/.test(r.url));
        assert.equal(
          requests.length,
          bodies.length,
          "Every initial JS request has one complete unique body",
        );
        assert(
          !requests.some((r) =>
            /\/(?:ForgeCommandPalette|search\.generated|history(?:-archive)?\.generated|mnemonics|LocalRiskLab)-/.test(
              r.url,
            ),
          ),
          "No interaction/archive/engine tooling initially",
        );
        const evidence = fixture.responses
          .filter((r) => originals.has(new URL(r.url).pathname))
          .map((r) => ({
            artifactId: originals.get(new URL(r.url).pathname).id,
            sha256: r.sha256,
            bytes: r.bytes,
          }))
          .sort((a, b) => a.artifactId.localeCompare(b.artifactId));
        assert(evidence.length > 0, "Genuine checked Replay evidence required");
        report.initialOwnership.journeys.push({
          workspace,
          url: fixture.page.url(),
          startedAt,
          usableAt,
          usableMs: usableAt - startedAt,
          snapshot,
          evidence,
          bodies,
          requestCount: requests.length,
          gzip: bodies.reduce((n, r) => n + r.gzipDefaultBytes, 0),
          decoded: bodies.reduce((n, r) => n + r.bytes, 0),
          requests: fixture.requests,
          executedScripts: coverage
            .filter((e) => e.functions.some((fn) => fn.ranges.some((r) => r.count > 0)))
            .map((e) => e.url),
          htmlPreloads: [...new Set(fixture.responses.flatMap((r) => r.htmlPreloads ?? []))],
        });
      } catch (error) {
        report.failures.push({
          name: workspace + " fresh initial",
          error: error.stack ?? String(error),
        });
      } finally {
        await fixture.context.close();
      }
    }
  } finally {
    await browser.close();
  }
  for (const key of ["blockedRequests", "pageErrors", "consoleErrors"])
    if (report[key].length) report.failures.push({ name: key, error: JSON.stringify(report[key]) });
  if (option("--initial-baseline")) {
    const inputBaseline = JSON.parse(
      readFileSync(path.resolve(repo, option("--initial-baseline"))),
    );
    const baseline = inputBaseline.initial_packaging_amendment_oct31?.baseline ?? inputBaseline;
    for (const journey of report.initialOwnership.journeys) {
      const before = baseline.initialOwnership.journeys.find(
        (j) => j.workspace === journey.workspace,
      );
      try {
        assert(before, "Baseline journey required");
        assert.deepEqual(
          journey.snapshot,
          before.snapshot,
          "Packaging must preserve complete rendered state, typed URL, mode, selections, labels and links",
        );
        assert.deepEqual(
          journey.evidence,
          before.evidence,
          "Exact evidence IDs, bytes and hashes unchanged",
        );
        journey.behaviorEquivalent = true;
        journey.regression = {
          baselineGzip: before.gzip,
          baselineRequests: before.requestCount,
          deltaGzip: journey.gzip - before.gzip,
          allowedGzip: Math.min(before.gzip * 0.05, 8192),
          deltaRequests: journey.requestCount - before.requestCount,
        };
        assert(
          journey.regression.deltaGzip <= journey.regression.allowedGzip,
          "Total initial load regression exceeds stricter5%/8KiB",
        );
        assert(journey.regression.deltaRequests <= 4, "Initial request regression exceeds+4");
      } catch (error) {
        report.failures.push({
          name: journey.workspace + " equivalence/regression",
          error: error.stack ?? String(error),
        });
      }
    }
  }
  if (option("--ownership-dir")) {
    const directory = path.join(frontend, ".vercel/output/static/assets"),
      proof = option("--ownership-dir");
    const modules = JSON.parse(readFileSync(path.join(proof, "normal-modules.json")));
    const inputBaseline = JSON.parse(
      readFileSync(path.resolve(repo, option("--initial-baseline"))),
    );
    const baseline = inputBaseline.initial_packaging_amendment_oct31?.baseline ?? inputBaseline;
    const initialNames = new Set(
      report.initialOwnership.journeys.flatMap((j) =>
        j.bodies.map((b) => path.basename(new URL(b.url).pathname)),
      ),
    );
    const assets = classifyInitialBodies(
      directory,
      {
        ...modules,
        chunks: modules.chunks.filter((c) => initialNames.has(path.basename(c.fileName))),
      },
      path.join(proof, "hidden-maps"),
    );
    report.initialOwnership.exact = exactInitialGate(
      report.initialOwnership.journeys,
      assets,
      baseline,
    );
    for (const error of report.initialOwnership.exact.failures)
      report.failures.push({ name: "exact initial ownership", error });
  }
  report.stageStatus = report.failures.length ? "FAIL" : "PASS_INITIAL_NETWORK_AND_BEHAVIOR";
  report.status = "INCOMPLETE";
  writeFileSync(
    path.join(proofRoot, "terminal-initial-browser-proof.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      stageStatus: report.stageStatus,
      journeys: report.initialOwnership.journeys.map((j) => ({
        workspace: j.workspace,
        gzip: j.gzip,
        requests: j.requestCount,
        regression: j.regression,
      })),
      failures: report.failures,
      proofRoot,
    }),
  );
  assert.equal(
    report.failures.length,
    0,
    "Initial production network/behavior verification failed",
  );
}
if (option("--attribute-recorded-initial")) {
  const saved = JSON.parse(readFileSync(option("--attribute-recorded-initial")));
  const proof = option("--ownership-dir");
  const modules = JSON.parse(readFileSync(path.join(proof, "normal-modules.json")));
  const inputBaseline = JSON.parse(readFileSync(option("--initial-baseline")));
  const baseline = inputBaseline.initial_packaging_amendment_oct31?.baseline ?? inputBaseline;
  const initialNames = new Set(
    saved.initialOwnership.journeys.flatMap((j) =>
      j.bodies.map((b) => path.basename(new URL(b.url).pathname)),
    ),
  );
  const assets = classifyInitialBodies(
    path.join(frontend, ".vercel/output/static/assets"),
    {
      ...modules,
      chunks: modules.chunks.filter((c) => initialNames.has(path.basename(c.fileName))),
    },
    path.join(proof, "hidden-maps"),
  );
  const exact = exactInitialGate(saved.initialOwnership.journeys, assets, baseline);
  writeFileSync(
    path.join(proofRoot, "terminal-exact-initial-proof.json"),
    JSON.stringify(exact, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: exact.status,
      routes: exact.routes.map(
        ({ workspace, projectGzip, vendorGzip, totalGzip, requestCount, invalid, forbidden }) => ({
          workspace,
          projectGzip,
          vendorGzip,
          totalGzip,
          requestCount,
          invalid: invalid.length,
          forbidden: forbidden.length,
        }),
      ),
      terminalGzip: exact.terminal.gzip,
      failures: exact.failures,
    }),
  );
  process.exit(exact.failures.length ? 1 : 0);
}
if (process.argv.includes("--initial-gate-self-test")) {
  const checks = initialGateSelfTest();
  writeFileSync(
    path.join(proofRoot, "initial-gate-self-test.json"),
    JSON.stringify({ status: "PASS", checks }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ status: "PASS_INITIAL_GATE_SELF_TEST", checks: checks.length }));
  process.exit(0);
}
if (process.argv.includes("--initial-only")) {
  await initialOwnershipStage();
  process.exit(0);
}

async function capacityStage() {
  const coldOnly = process.argv.includes("--cold-palette-only");
  const networkOnly = process.argv.includes("--capacity-network-only");
  report.mode = coldOnly ? "CAPACITY_COLD_PALETTE_STAGE" : "CAPACITY_REPAIR_STAGE";
  report.capacity = {
    schema_version: "phase75-capacity-browser/1",
    accountingStatus: "MEASURED_NETWORK_PENDING_COMPLETE_ASSET_ATTRIBUTION",
    paletteReadinessSelfTest: paletteReadinessSelfTest(),
    warmMeasurementStatus:
      coldOnly || networkOnly
        ? "NOT_RUN_RETAIN_PREVIOUS_USABLE_READINESS_MEASUREMENT"
        : "ACTUAL_CHECKED_OPTIONS_READINESS",
    journeys: [],
    warmPalette: { sampleCount: 0, samples: [], limitMs: 150 },
    limits: {
      coreGzip: 24576,
      workspaceGzip: 65536,
      firstInteractionGzip: 32768,
      coldAfterTransferMs: 400,
      warmMs: 150,
    },
    limitation:
      "Every response is reported as transferred. Numeric executable attribution and framework/generated-data classifications require the companion exact asset graph; no transfer is silently exempted.",
  };
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const archive = /\/history-archive\.generated[-.]/;
  const optional =
    /\/(?:ForgeCommandPalette|search|commands|catalog|reader|search\.generated|history\.generated)-[^/]+\.js(?:$|\?)/;
  const jsAsset = (value) => /\.m?js(?:$|\?)/.test(value);
  const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  const percentile = (phase) => {
    const values = phase.responses.filter((response) => response.js);
    return {
      decodedJSBytes: values.reduce((n, value) => n + value.bytes, 0),
      gzipJSBytes: values.reduce((n, value) => n + value.gzipDefaultBytes, 0),
      assets: values.map((value) => value.url),
    };
  };
  const clean = (fixture) => {
    assert.deepEqual(fixture.responseErrors, []);
    assert.deepEqual(report.blockedRequests, []);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
  };
  const settled = async (fixture) => {
    await fixture.page.waitForLoadState("networkidle");
    await Promise.all(fixture.pending);
    clean(fixture);
  };
  async function phase(fixture, journey, name, action) {
    const requestStart = fixture.requests.length,
      responseStart = fixture.responses.length;
    await fixture.page.coverage.startJSCoverage({ resetOnNavigation: false });
    const start = await fixture.page.evaluate(() => ({
      at: performance.now(),
      timeOrigin: performance.timeOrigin,
    }));
    await action();
    const readyAt = await fixture.page.evaluate(() => performance.now());
    await settled(fixture);
    const coverage = await fixture.page.coverage.stopJSCoverage();
    const resources = await fixture.page.evaluate(
      (startAt) =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => entry.startTime >= startAt && /\.m?js(?:$|\?)/.test(entry.name))
          .map((entry) => ({
            url: entry.name,
            startTime: entry.startTime,
            responseEnd: entry.responseEnd,
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
            duration: entry.duration,
          })),
      start.at,
    );
    const requests = fixture.requests.slice(requestStart),
      responses = fixture.responses.slice(responseStart);
    const value = {
      name,
      requests,
      responses,
      htmlPreloads: [...new Set(responses.flatMap((response) => response.htmlPreloads ?? []))],
      executedScripts: coverage
        .filter((entry) => entry.functions.some((fn) => fn.ranges.some((range) => range.count > 0)))
        .map((entry) => entry.url),
      latency: {
        totalMs: readyAt - start.at,
        afterLastChunkTransferMs:
          readyAt - Math.max(start.at, ...resources.map((entry) => entry.responseEnd)),
        browserStartMs: start.at,
        browserReadyMs: readyAt,
        browserTimeOrigin: start.timeOrigin,
        resources,
      },
    };
    Object.assign(value, percentile(value));
    journey.phases.push(value);
    return value;
  }
  async function initial(fixture, journey, route) {
    const initialPhase = await phase(fixture, journey, "initial", async () => {
      await fixture.page.goto(urlFor(journey.workspace, route), { waitUntil: "domcontentloaded" });
      const shell = fixture.page.getByTestId("terminal-shell");
      await shell.waitFor({ state: "visible" });
      await fixture.page.waitForFunction(
        () =>
          document.querySelector('[data-testid="terminal-shell"]')?.getAttribute("data-ready") ===
          "true",
      );
      assert.equal(await shell.getAttribute("data-ready"), "true");
      await fixture.page
        .getByRole("region", { name: "Investigation context", exact: true })
        .waitFor();
      await settled(fixture);
      const beforeIdle = fixture.requests.length;
      await fixture.page.waitForTimeout(1200);
      assert.equal(
        fixture.requests.length,
        beforeIdle,
        "Initial idle period must not prefetch optional tooling",
      );
      await fixture.page.locator("#terminal-command").fill("RISK HIGH");
    });
    assert(
      !initialPhase.requests.some((entry) => archive.test(entry.url) || optional.test(entry.url)),
      "Optional command/search/catalog/reader or history archive loaded before explicit invocation",
    );
    assert(
      !initialPhase.htmlPreloads.some((url) => archive.test(url) || optional.test(url)),
      "Optional tooling appears in initial HTML preload",
    );
    assert(
      !initialPhase.executedScripts.some((url) => archive.test(url) || optional.test(url)),
      "Optional tooling executed before interaction",
    );
    return initialPhase;
  }
  async function openPalette(page) {
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Terminal command", exact: true }).waitFor();
    await page.waitForFunction(paletteUsable);
  }
  async function closePalette(page, restore) {
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Terminal command", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await restore.evaluate((element) => element === document.activeElement),
      true,
      "Escape must restore the invocation control focus",
    );
  }
  try {
    for (const [workspace, route] of [
      ["risk", "/risk"],
      ["factors", "/factors"],
    ]) {
      const fixture = await pageFor(browser, { width: 1440, height: 1000 });
      const journey = {
        name: workspace + (coldOnly ? "-first-usable-cold-palette" : "-initial-palette-history"),
        workspace,
        url: urlFor(workspace, route),
        phases: [],
      };
      report.capacity.journeys.push(journey);
      try {
        await initial(fixture, journey, route);
        const restore = fixture.page.getByRole("button", {
          name: "Open command palette",
          exact: true,
        });
        await restore.focus();
        const palette = await phase(fixture, journey, "palette", () => openPalette(fixture.page));
        assert(
          !palette.requests.some((entry) => archive.test(entry.url)),
          "First current-only palette must not load history archive",
        );
        assert(
          !palette.responses.some((entry) => originals.has(new URL(entry.url).pathname)),
          "First palette invocation must not fetch scientific originals",
        );
        assert(
          palette.latency.afterLastChunkTransferMs <= 400,
          "Cold first palette usable response exceeds400ms after chunk transfer",
        );
        palette.actualCheckedOptionCount = await fixture.page
          .locator("#forge-command-results [role=option]")
          .count();
        assert(palette.actualCheckedOptionCount > 0, "Usable means actual checked options exist");
        if (coldOnly) {
          await closePalette(fixture.page, restore);
          report.cases.push({
            name: journey.name,
            status: "PASS_COLD_CHECKED_OPTIONS_FOCUS_AND_LATENCY",
            url: fixture.page.url(),
          });
          continue;
        }
        assert(
          !palette.requests.some((entry) =>
            /\/(?:search|catalog|capabilities|commands|mnemonics|factor-series)-|\.generated-/.test(
              entry.url,
            ),
          ),
          "Empty palette requires only static workspace UI/context",
        );
        const dialog = fixture.page.getByRole("dialog", { name: "Terminal command", exact: true });
        const current = await phase(fixture, journey, "current-search", async () => {
          await dialog.getByRole("combobox").fill("IN-MKT");
          await fixture.page.waitForFunction(
            () =>
              document.getElementById("forge-command-results")?.getAttribute("aria-busy") ===
              "false",
          );
        });
        assert(
          !current.requests.some((entry) => archive.test(entry.url)),
          "Current-only metadata search must not load history archive",
        );
        assert(
          ![...palette.requests, ...current.requests].some((entry) =>
            /\/(?:mnemonics|factor-series|commands)-/.test(entry.url),
          ),
          "Ordinary palette and metadata query must not import legacy parser or command resolver",
        );
        const initialAssets = new Set(
          journey.phases
            .find((phase) => phase.name === "initial")
            .requests.map((entry) => entry.url),
        );
        const cold = [...palette.requests, ...current.requests];
        assert.equal(
          cold.filter((entry) => /\/search\.generated-/.test(entry.url)).length,
          1,
          "First query must request exactly one self-contained search envelope",
        );
        assert(
          !cold.some((entry) =>
            /\/(?:capabilities|reader|mnemonics|factor-series|commands)-/.test(entry.url),
          ),
          "No full capabilities/readers/legacy machinery in ordinary cold search",
        );
        assert(
          !cold.some(
            (entry) => /\/seed\.generated-/.test(entry.url) && !initialAssets.has(entry.url),
          ),
          "Search must not request a second seed metadata module",
        );
        assert(
          !cold.some((entry) =>
            /\/(?:market|regimes|risk|factors|data|recordings|observatory-window|history|history-archive)\.generated-/.test(
              entry.url,
            ),
          ),
          "Cold global network whitelist excludes all evidence/history/display shards",
        );
        journey.coldWhitelist = {
          searchProjectionRequests: 1,
          capabilityRequests: 0,
          searchOnlySeedRequests: 0,
          initialSeedRequests: [...initialAssets].filter((url) => /\/seed\.generated-/.test(url))
            .length,
          scientificOrHistoryRequests: 0,
        };
        assert.equal(await dialog.getByRole("combobox").inputValue(), "IN-MKT");
        await fixture.page.waitForFunction(() =>
          [...document.querySelectorAll('#forge-command-results [role="option"]')].some((element) =>
            element.textContent.includes("IN-MKT"),
          ),
        );
        if (workspace === "risk" && !networkOnly) {
          const searchUrl =
            current.responses.find((entry) => /\/search-[^/]+\.js(?:$|\?)/.test(entry.url))?.url ??
            palette.responses.find((entry) => /\/search-[^/]+\.js(?:$|\?)/.test(entry.url))?.url;
          assert(searchUrl, "Use the exact emitted module already requested by the UI");
          const querySet = [
            Object.values(manifest.artifacts).length
              ? JSON.parse(
                  readFileSync(
                    path.join(
                      frontend,
                      "public",
                      manifest.artifacts[manifest.routes["/risk-manager/state"]].url,
                    ),
                  ),
                ).payload.issues.find(
                  (issue) => issue.country === "INDIA" && issue.severity === "HIGH",
                ).issue_id
              : "issue",
            "IN-MKT",
            "india:mom",
            "metadata",
            "tain",
            "regim",
            "factor",
            "capture",
            "source",
            "recorded",
            "US-MKT",
            "IIMA",
          ];
          report.capacity.searchPerformance = await fixture.page.evaluate(
            async ({ url, queries }) => {
              const module = await import(url),
                data = module.terminalSearch.catalog(),
                context = { version: 1, view: { workspace: "risk" } };
              const options = { ...data, scope: "current", limit: 20 };
              for (const query of queries) module.searchLoaded(query, context, options);
              const samples = [],
                materializedTargets = [];
              for (let i = 0; i < 60; i++) {
                const start = performance.now(),
                  response = module.searchLoaded(queries[i % queries.length], context, options);
                samples.push(performance.now() - start);
                materializedTargets.push(response.materializedTargets);
              }
              const ordered = [...samples].sort((a, b) => a - b);
              return {
                samples: 60,
                queries,
                medianMs: (ordered[29] + ordered[30]) / 2,
                p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
                maxMs: ordered.at(-1),
                entityCount: data.navigation.length,
                materializedTargets,
                rawSamplesMs: samples,
                environment: {
                  userAgent: navigator.userAgent,
                  hardwareConcurrency: navigator.hardwareConcurrency,
                  devicePixelRatio,
                  viewport: { width: innerWidth, height: innerHeight },
                },
                method:
                  "Single deterministic60-query run after one12-query warmup; rank before materialization; no repeated profiling to seek green",
              };
            },
            { url: searchUrl, queries: querySet },
          );
          assert(
            report.capacity.searchPerformance.p95Ms <= 30,
            "Loaded browser search p95 exceeds30ms",
          );
        }
        const retained = await phase(fixture, journey, "history", async () => {
          await dialog
            .getByRole("checkbox", { name: "Include retained history", exact: true })
            .check();
          await fixture.page.waitForFunction(
            () =>
              document.getElementById("forge-command-results")?.getAttribute("aria-busy") ===
              "false",
          );
        });
        assert(
          retained.requests.some((entry) => archive.test(entry.url)),
          "Explicit retained-history scope must request its archive shard",
        );
        assert(
          !retained.responses.some((entry) => originals.has(new URL(entry.url).pathname)),
          "History metadata search must not fetch scientific originals",
        );
        await closePalette(fixture.page, restore);
        if (workspace === "risk" && !networkOnly) {
          for (let i = 0; i < 30; i++) {
            await restore.focus();
            const warm = await phase(fixture, journey, "warm-palette", () =>
              openPalette(fixture.page),
            );
            report.capacity.warmPalette.samples.push(warm.latency.totalMs);
            assert(
              !warm.requests.some((entry) => jsAsset(entry.url)),
              "Warm palette invocation must use already loaded executable code",
            );
            await closePalette(fixture.page, restore);
          }
          report.capacity.warmPalette.sampleCount = report.capacity.warmPalette.samples.length;
          report.capacity.warmPalette.p95Ms = p95(report.capacity.warmPalette.samples);
          assert(
            report.capacity.warmPalette.p95Ms <= 150,
            "Warm palette usable response p95 exceeds150ms",
          );
        }
        clean(fixture);
        report.cases.push({
          name: journey.name,
          status: "PASS_NETWORK_FOCUS_AND_LATENCY",
          url: fixture.page.url(),
        });
      } catch (error) {
        report.failures.push({
          name: journey.name,
          error: error instanceof Error ? error.stack : String(error),
        });
      } finally {
        await fixture.context.close();
      }
    }
    if (!coldOnly) {
      const fixture = await pageFor(browser, { width: 1440, height: 1000 });
      const journey = {
        name: "risk-command-first-invocation",
        workspace: "risk",
        url: urlFor("risk", "/risk"),
        phases: [],
      };
      report.capacity.journeys.push(journey);
      try {
        await initial(fixture, journey, "/risk");
        const command = await phase(fixture, journey, "command", async () => {
          await fixture.page.locator("#terminal-command").press("Enter");
          await fixture.page.waitForFunction(
            () =>
              document
                .querySelector('[aria-label="Terminal command"]')
                ?.getAttribute("aria-busy") === "false",
          );
        });
        assert(
          command.requests.some((entry) => /\/commands-[^/]+\.js(?:$|\?)/.test(entry.url)),
          "Command resolution must load only after submission",
        );
        assert(
          !command.requests.some((entry) => archive.test(entry.url)),
          "CurrentRisk command must not request retained archive",
        );
        assert.equal(new URL(fixture.page.url()).searchParams.get("severity"), "HIGH");
        clean(fixture);
        report.cases.push({
          name: journey.name,
          status: "PASS_NETWORK_AND_NO_EXECUTION",
          url: fixture.page.url(),
        });
      } catch (error) {
        report.failures.push({
          name: journey.name,
          error: error instanceof Error ? error.stack : String(error),
        });
      } finally {
        await fixture.context.close();
      }

      const marketFixture = await pageFor(browser, { width: 1440, height: 1000 });
      const marketJourney = {
        name: "market-metadata-first-invocation",
        workspace: "market",
        url: urlFor("market", "/markets"),
        phases: [],
        entryPath: "FIRST_METADATA_SEARCH",
      };
      report.capacity.journeys.push(marketJourney);
      try {
        await initial(marketFixture, marketJourney, "/markets");
        const metadata = await phase(marketFixture, marketJourney, "metadata-search", async () => {
          const input = marketFixture.page.getByRole("combobox", {
            name: "Ticker or company",
            exact: true,
          });
          await input.fill("IN-MKT");
          await marketFixture.page.getByRole("listbox").waitFor();
          await marketFixture.page.waitForFunction(() => {
            const box =
              document.querySelector('[aria-label="Ticker or company"]') ??
              [...document.querySelectorAll('[role="combobox"]')].find(
                (element) => element.value === "IN-MKT",
              );
            const controls = box?.getAttribute("aria-controls");
            return controls && document.getElementById(controls)?.querySelector('[role="option"]');
          });
        });
        assert(
          metadata.requests.some((entry) => /\/search-[^/]+\.js(?:$|\?)/.test(entry.url)),
          "First metadata search must load its machinery only after interaction",
        );
        assert(
          !metadata.requests.some((entry) => archive.test(entry.url)),
          "Current-only first metadata search must not load history archive",
        );
        assert(
          !metadata.responses.some((entry) => originals.has(new URL(entry.url).pathname)),
          "Metadata search may not fetch workspace scientific originals",
        );
        assert(
          !metadata.requests.some((entry) =>
            /\/(?:search|risk|factors|data|regimes|recordings)\.generated-/.test(entry.url),
          ),
          "Market identity search must use only its admitted seed identities",
        );
        const marketInput = marketFixture.page.getByRole("combobox", {
          name: "Ticker or company",
          exact: true,
        });
        const identityReady = async (id) => {
          await marketFixture.page.waitForFunction(
            (id) =>
              [...document.querySelectorAll('.mk-search-popup [role="option"]')].some(
                (element) => element.querySelector("b")?.textContent === id,
              ),
            id,
          );
        };
        await identityReady("IN-MKT");
        await marketInput.fill("US-MKT");
        assert.equal(
          await marketFixture.page
            .locator('.mk-search-popup [role="option"] b')
            .filter({ hasText: "IN-MKT" })
            .count(),
          0,
          "Changing text clears stale Market results immediately",
        );
        await identityReady("US-MKT");
        await marketInput.fill("IN-MKT");
        await marketInput.fill("IN-MKT ");
        await marketInput.fill("IN-MKT");
        await identityReady("IN-MKT");
        assert.equal(
          await marketFixture.page
            .locator('.mk-search-popup [role="option"] b')
            .filter({ hasText: "US-MKT" })
            .count(),
          0,
        );
        const marketTargets = await marketFixture.page
          .locator('.mk-search-popup [role="option"] a')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
        assert(
          marketTargets.length > 0 &&
            marketTargets.every((href) => new URL(href, base).pathname === "/markets"),
        );
        report.capacity.marketIdentityChecks = {
          US_MKT: true,
          IN_MKT: true,
          staleResultsCleared: true,
          rapidReturnToPriorQuery: true,
          targets: marketTargets,
        };
        clean(marketFixture);
        report.cases.push({
          name: marketJourney.name,
          status: "PASS_NETWORK_AND_NO_EXECUTION",
          url: marketFixture.page.url(),
        });
      } catch (error) {
        report.failures.push({
          name: marketJourney.name,
          error: error instanceof Error ? error.stack : String(error),
        });
      } finally {
        await marketFixture.context.close();
      }
    }
  } catch (error) {
    report.failures.push({
      name: "capacity repair browser stage",
      error: error instanceof Error ? error.stack : String(error),
    });
  } finally {
    await browser.close();
  }
  try {
    report.capacity.assetGraph = collectClientBudgetGraph({
      directory: path.join(frontend, ".vercel/output/static/assets"),
      journeys: report.capacity.journeys,
      readFileSync,
      readdirSync,
      createHash,
      gzipSync,
      ts,
    });
    report.capacity.accountingStatus =
      "APPROVED_ROUTE_ATTRIBUTABLE_INITIAL_AND_CODE_PLUS_METADATA_INTERACTION";
    const graph = report.capacity.assetGraph;
    if (graph.networkAssertionsStatus !== "PASS")
      report.failures.push({
        name: "capacity asset graph/network equivalence",
        error: "Observed asset body/preload/import/scope assertions failed; retain exact graph.",
      });
    for (const measured of graph.phases)
      if (measured.phase === "initial")
        for (const gate of Object.values(measured.numericGates)) {
          gate.conservativeCandidate = gate.gzip;
          gate.pass = null;
          gate.status = "INDETERMINATE_SEPARATE_MIXED_ENTRY_ATTRIBUTION_REQUIRED";
        }
    for (const measured of graph.phases)
      for (const gate of Object.values(measured.numericGates))
        if (typeof gate.pass === "boolean")
          assert.equal(
            gate.pass,
            gate.gzip <= gate.limit,
            "Budget pass must match the reported combined required-byte total",
          );
    for (const measured of graph.phases)
      for (const [name, gate] of Object.entries(measured.numericGates))
        if (gate.pass === false)
          report.failures.push({
            name: measured.journey + "/" + measured.phase + "/" + name,
            error:
              (gate.status?.startsWith("INDETERMINATE")
                ? "Initial attribution is INDETERMINATE; conservative upper bound gzip "
                : "gzip ") +
              gate.gzip +
              " exceeds approved " +
              gate.limit +
              " bytes; exact code+metadata/initial closure retained.",
          });
  } catch (error) {
    report.failures.push({
      name: "capacity exact client asset graph",
      error: error instanceof Error ? error.stack : String(error),
    });
  }
  Object.assign(report, {
    status: report.failures.length ? "FAIL" : "INCOMPLETE",
    stageStatus: report.failures.length ? "FAIL" : "PASS_CAPACITY_BROWSER_STAGE",
    completedAreas: [
      "capacity_network",
      "capacity_keyboard_focus",
      "capacity_response_latency",
      "capacity_asset_budget_graph",
    ],
    missingAreas: requiredAreas,
  });
  writeFileSync(
    path.join(proofRoot, "terminal-capacity-browser-proof.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      stageStatus: report.stageStatus,
      journeys: report.capacity.journeys.length,
      warmPalette: report.capacity.warmPalette,
      failures: report.failures.map(({ name, error }) => ({ name, error: error.split("\n")[0] })),
      proofRoot,
    }),
  );
  assert.equal(
    report.failures.length,
    0,
    "Capacity browser network/focus/latency verification failed",
  );
}
if (process.argv.includes("--capacity-only")) {
  await capacityStage();
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
