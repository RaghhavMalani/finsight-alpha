import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    /^(?:seed|market|regimes|risk|factors|data|recordings|history|history-archive|observatory-window)\.generated-/;
  const owned =
    /^(?:TerminalShell|ContextBar|CommandLine|ForgeCommandPalette|mnemonics|context|compatibility|links|capabilities|catalog|search|commands|reader|changes|preferences|exports|CapabilityAction|EvidenceLink)-/;
  const common =
    /^(?:jsx-runtime|react-dom|react|Match|link|useMatch|useSelector|useParams|useNavigate|useQuery|QueryClientProvider|lazyRouteComponent|preload-helper|root|mode|instruments|factor-series|api|contracts|useReducedMotion|index|query)-/;
  const newTerminalMarker =
    /terminal-navigation-seed\/1|Investigation URL|Investigation context|Malformed terminal|Terminal shard|Terminal entity|terminal-command|terminal-shard\/1|terminal-generator\/1/;
  const scientificPayload = (code) =>
    code.includes("terminal-display/1") &&
    code.includes("selectedFields") &&
    /market-week-window|regime-timeline-window/.test(code);
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
    /^(?:ForgeCommandPalette|search|commands|history-archive\.generated)-/,
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
      if (["palette", "current-search", "metadata-search", "command"].includes(phase.name))
        checks.push({
          name: "no_workspace_scientific_display_payload_in_interaction",
          pass: scientificDisplayPayloads.length === 0,
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
            : ["palette", "metadata-search", "command"].includes(phase.name)
              ? {
                  firstInvocationCodeAndMetadata: {
                    gzip: metrics(firstRequired).gzipDefaultBytes,
                    limit: 32768,
                    pass: metrics(firstRequired).gzipDefaultBytes <= 32768,
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

async function capacityStage() {
  const coldOnly = process.argv.includes("--cold-palette-only");
  report.mode = coldOnly ? "CAPACITY_COLD_PALETTE_STAGE" : "CAPACITY_REPAIR_STAGE";
  report.capacity = {
    schema_version: "phase75-capacity-browser/1",
    accountingStatus: "MEASURED_NETWORK_PENDING_COMPLETE_ASSET_ATTRIBUTION",
    paletteReadinessSelfTest: paletteReadinessSelfTest(),
    warmMeasurementStatus: coldOnly ? "NOT_RUN_COLD_ONLY" : "ACTUAL_CHECKED_OPTIONS_READINESS",
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
  const optional = /\/(?:ForgeCommandPalette|search|commands|catalog|reader)-[^/]+\.js(?:$|\?)/;
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
        if (workspace === "risk") {
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
    for (const measured of graph.phases) {
      if (measured.phase === "initial") {
        if (!["risk", "factors"].includes(measured.workspace))
          delete measured.numericGates.initialWorkspace;
        for (const gate of Object.values(measured.numericGates)) {
          gate.conservativeUpperBound = true;
          gate.unclassifiedAssets = measured.unclassified;
          gate.status = gate.pass
            ? "PASS_CONSERVATIVE_BOUND"
            : measured.unclassified.length
              ? "INDETERMINATE_MIXED_OR_UNCLASSIFIED_ASSETS"
              : "FAIL";
        }
      }
    }
    for (const measured of graph.phases)
      for (const [name, gate] of Object.entries(measured.numericGates))
        if (!gate.pass)
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
