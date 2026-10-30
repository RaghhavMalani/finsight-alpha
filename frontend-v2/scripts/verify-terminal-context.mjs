import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ContextError,
  WORKSPACE_PATHS,
  parseInvestigationContext,
  parseRouterContext,
  parseTerminalSearch,
  stringifyTerminalSearch,
  safeParseInvestigationContext,
  serializeInvestigationContext,
  contextQuery,
  subjectMarket,
  subjectTicker,
  workspaceOf,
  isArtifactId,
  isObservationDate,
} from "../src/app/terminal/context.ts";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultParseSearch,
  defaultStringifySearch,
} from "@tanstack/react-router";

import { checkedIssueReferences } from "../src/risk-manager/evidence.ts";
import { adaptContext, anchorAppliesTo } from "../src/app/terminal/compatibility.ts";
import {
  buildInvestigationTarget,
  makeEvidenceTarget,
  targetHref,
  validateRelationProof,
  riskIssueOrigin,
  RELATIONS,
} from "../src/app/terminal/links.ts";

const coreOnly = process.argv.includes("--core-only");
const projectionsOnly = process.argv.includes("--projections-only");
const navigationOnly = process.argv.includes("--navigation-only");
const completedAreas = new Set(["context", "compatibility", "links"]);
const requiredAreas = [
  "context",
  "compatibility",
  "links",
  "projections",
  "index",
  "search",
  "commands",
  "changes",
  "capabilities",
  "preferences",
  "exports",
  "freeze",
];

const frontend = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(frontend, "..");
const manifestRaw = readFileSync(path.join(frontend, "public/replay-manifest.json"));
const manifest = JSON.parse(manifestRaw);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const artifact = (id) =>
  JSON.parse(readFileSync(path.join(frontend, "public", manifest.artifacts[id].url)));
const currentStateId = manifest.routes["/risk-manager/state"];
const currentSweepId = manifest.routes["/risk-manager/sweep"];
const currentState = artifact(currentStateId);
const currentSweep = artifact(currentSweepId);
const issue = currentState.payload.issues.find(
  (i) => i.country === "INDIA" && i.severity === "HIGH",
);
const observationIssue = issue.issue_id;
const sampleHash = "a".repeat(64);
let checks = 0;
const passed = [],
  failures = [];
const performanceProof = {};
const transportProof = {
  typedQueries: [],
  rawRejections: [],
  legacy: [],
  frameworkSsrRawValidation: "REQUIRES_BUILT_BROWSER_CHECKS",
};
function check(name, action) {
  try {
    action();
    passed.push(name);
    checks++;
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.stack : String(error) });
  }
}
const reject = (name, workspace, input) =>
  check(name, () => assert.throws(() => parseInvestigationContext(workspace, input)));
const serialReject = (name, value) =>
  check(name, () => assert.throws(() => serializeInvestigationContext(value)));
const qs = (entries) => new URLSearchParams(entries).toString();
const qRisk = qs({
  ctx: "1",
  market: "INDIA",
  subject: "market-factor:IN-MKT",
  artifact: currentStateId,
  sweep: currentSweep.payload.sweep_id,
  issue: observationIssue,
  panel: "feed",
  severity: "HIGH",
  country: "INDIA",
  partition: "CURRENT_REAL",
  q: "IIMA",
});
const positives = [
  [
    "market",
    qs({
      ctx: "1",
      subject: "reference-listing:SPY:UP",
      panel: "graph",
      chart: "drawdown",
      range: "1Y",
    }),
  ],
  [
    "regimes",
    qs({
      ctx: "1",
      market: "INDIA",
      subject: "market-factor:IN-MKT",
      panel: "timeline",
      mode: "replay",
      at: "2026-10-10T13:59:59.414508Z",
      run: sampleHash,
    }),
  ],
  [
    "factors",
    qs({
      ctx: "1",
      market: "INDIA",
      subject: "market-factor:IN-MKT",
      factor: "india:mom",
      panel: "lineage",
      at: "2026-10-10T13:59:59.414508Z",
    }),
  ],
  ["risk", qRisk],
  [
    "data",
    qs({
      ctx: "1",
      market: "INDIA",
      artifact: manifest.routes["/data/issues"],
      originIssue: observationIssue,
      originState: currentStateId,
      originSweep: currentSweepId,
      source: "iima:daily-factors",
      panel: "issues",
      origin: sampleHash,
      admission: sampleHash,
      sourceVersion: sampleHash,
      dataWindowEnd: "2025-12-31",
    }),
  ],
  ["research", "ctx=1&panel=summary"],
  [
    "observatory",
    qs({
      ctx: "1",
      subject: "market-factor:US-MKT",
      artifact: "observatory:US-MKT:hmm",
      trace: "observatory:US-MKT:hmm",
      traceStep: "3",
      scene: "hmm",
      panel: "stage",
    }),
  ],
  ["world", qs({ ctx: "1", artifact: "world:quakes", panel: "context" })],
  [
    "agents",
    qs({
      ctx: "1",
      run: sampleHash,
      task: "retained-task-1",
      model: "recorded-model",
      verdict: "ACCEPT",
      taskClass: "bounded-reference",
      seed: "7",
      node: "2",
      panel: "turns",
    }),
  ],
  ["execution", "ctx=1&panel=unavailable"],
];
for (const workspace of Object.keys(WORKSPACE_PATHS)) {
  check(`bare ${workspace} has no inferred market or subject`, () => {
    const value = parseInvestigationContext(workspace, "");
    assert.equal(value.version, 1);
    assert.equal(value.view.workspace, workspace);
    assert.equal(value.market, undefined);
    assert.equal(value.subject, undefined);
  });
}
for (const [workspace, input] of positives) {
  check(`${workspace} canonical URL roundtrip`, () => {
    const value = parseInvestigationContext(workspace, input),
      encoded = contextQuery(value),
      again = parseInvestigationContext(workspace, encoded);
    assert.deepEqual(again, value);
    assert.equal(contextQuery(again), encoded);
    assert.equal(new URLSearchParams(encoded).get("ctx"), "1");
    assert.deepEqual(parseRouterContext(workspace, serializeInvestigationContext(value)), value);
  });
}
for (const query of [
  "1",
  "1.0",
  "true",
  "null",
  '{"a": 1}',
  "[1, 2]",
  "0001",
  "ordinary text",
  "  padded text  ",
  "日本語 1.0",
]) {
  check(`typed router transport preserves exact query ${JSON.stringify(query)}`, () => {
    const value = parseInvestigationContext("risk", { ctx: "1", q: query, panel: "feed" });
    const wire = stringifyTerminalSearch(serializeInvestigationContext(value));
    assert.equal(new URLSearchParams(wire).get("ctx"), "1");
    assert(!wire.includes("%221%22"), "Version must not acquire JSON string quotation");
    const transported = parseTerminalSearch(wire);
    assert.equal(transported.ctx, "1");
    assert.equal(transported.q, query);
    assert.deepEqual(parseRouterContext("risk", transported), value);
    transportProof.typedQueries.push({ query, wire });
  });
}
for (const raw of ["?ctx=1&ctx=1", "?ctx=1&q=1&q=2", "?ctx=1&q=1&%71=2"]) {
  check(`typed router transport preserves duplicates for rejection ${raw}`, () => {
    const transported = parseTerminalSearch(raw);
    assert(Array.isArray(transported.ctx) || Array.isArray(transported.q));
    assert.throws(() => parseRouterContext("risk", transported));
    assert.throws(() => parseInvestigationContext("risk", raw));
    assert.throws(() => parseInvestigationContext("risk", stringifyTerminalSearch(transported)));
    transportProof.rawRejections.push(raw);
  });
}
for (const raw of [
  "",
  "?ticker=in-mkt",
  "?ticker=RELIANCE.NS",
  "?q=1.0&n=7&flag=true",
  "?q=%7B%22a%22%3A1%7D",
  "?scene=hmm&ticker=US-MKT&step=3",
]) {
  check(`router legacy parsing remains unchanged ${raw || "bare"}`, () => {
    assert.deepEqual(parseTerminalSearch(raw), defaultParseSearch(raw));
    const legacy = defaultParseSearch(raw);
    assert.equal(stringifyTerminalSearch(legacy), defaultStringifySearch(legacy));
    transportProof.legacy.push(raw);
  });
}
check("central router uses only the approved contextual parser/stringifier hooks", () => {
  const source = readFileSync(path.join(frontend, "src/router.tsx"), "utf8");
  assert(/parseSearch:\s*parseTerminalSearch/.test(source));
  assert(/stringifySearch:\s*stringifyTerminalSearch/.test(source));
  const shell = readFileSync(path.join(frontend, "src/app/terminal/TerminalShell.tsx"), "utf8");
  assert(/createIsomorphicFn\(\)/.test(shell));
  assert(/\.server\(\(\)\s*=>\s*new URL\(getRequest\(\)\.url\)\.search\)/.test(shell));
  assert(/\.client\(\(\)\s*=>\s*undefined\)/.test(shell));
  assert(
    /rawSearch\s*=\s*requestSearch\(\)\s*\?\?\s*router\.history\.location\.search/.test(shell),
  );
  assert(
    shell.indexOf("safeParseInvestigationContext(workspace, rawSearch)") <
      shell.indexOf("new URLSearchParams(rawSearch)"),
  );
});

check("lowercase legacy market factor normalizes before country", () => {
  const v = parseInvestigationContext("factors", "ticker=in-mkt");
  assert.deepEqual(v.subject, { kind: "market-factor", id: "IN-MKT" });
  assert.equal(v.market, "INDIA");
  assert.equal(subjectMarket(v.subject), "INDIA");
  assert.equal(subjectTicker(v.subject), "IN-MKT");
});
check("bare Data stays unfiltered", () =>
  assert.equal(parseInvestigationContext("data", "country=ALL").market, undefined),
);
check("legacy Data annual window stays workspace-owned", () => {
  const v = parseInvestigationContext("data", "country=INDIA&section=revisions&cutoff=2025-12-31");
  assert.equal(v.view.dataWindowEnd, "2025-12-31");
  assert.equal(v.observationDate, undefined);
  assert.equal(v.anchor, undefined);
  assert.equal(v.view.panel, "revisions");
});
check("calendar date is exact, including leap years", () => {
  assert.equal(isObservationDate("2024-02-29"), true);
  for (const d of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-1-01"])
    assert.equal(isObservationDate(d), false);
});
check("workspace namespaces retain recorded run pages", () => {
  assert.equal(workspaceOf("/runs/" + sampleHash), "agents");
  assert.equal(workspaceOf("/dynamics"), "regimes");
  assert.equal(workspaceOf("/unknown"), null);
});
check("artifact ID syntax never accepts URL or path", () => {
  for (const id of [
    "https://example.com/artifact",
    "../secret",
    "file:///tmp/x",
    "risk:state:short",
    "portfolio:book:" + sampleHash,
    "event:" + sampleHash,
  ])
    assert.equal(isArtifactId(id), false);
});
check("Router accepts exact protocol and bounded view numeric literals only", () => {
  assert.equal(parseRouterContext("agents", { ctx: 1, node: 2, seed: 7 }).view.node, 2);
  assert.equal(
    parseRouterContext("observatory", { ctx: 1, artifact: "observatory:US-MKT:hmm", traceStep: 3 })
      .view.traceStep,
    3,
  );
  for (const v of [true, false, null, NaN, Infinity, 1.5, -1])
    assert.throws(() => parseRouterContext("agents", { ctx: 1, node: v }));
  for (const v of [2, 0, "2", true]) assert.throws(() => parseRouterContext("risk", { ctx: v }));
  assert.throws(() => parseRouterContext("risk", { ctx: 1, market: 1 }));
});
for (const [name, workspace, input] of [
  ["duplicate direct key", "risk", "ctx=1&market=US&market=INDIA"],
  ["encoded duplicate key", "risk", "ctx=1&market=US&%6darket=INDIA"],
  ["duplicate URLSearchParams", "risk", new URLSearchParams("ctx=1&severity=HIGH&severity=LOW")],
  ["unknown field", "risk", "ctx=1&whatever=1"],
  ["unknown future version", "risk", "ctx=2"],
  ["malformed percent", "risk", "ctx=1&q=%GG"],
  ["malformed UTF8", "risk", "ctx=1&q=%C0%AF"],
  ["surrogate UTF8", "risk", "ctx=1&q=%ED%A0%80"],
  ["replacement scalar", "risk", "ctx=1&q=%EF%BF%BD"],
  ["control byte", "risk", "ctx=1&q=x%00y"],
  ["fragment carrier", "risk", "ctx=1#book"],
  ["oversized URL", "risk", "ctx=1&q=" + "x".repeat(4097)],
  ["oversized text", "risk", "ctx=1&q=" + "x".repeat(161)],
  ["untyped subject", "regimes", "ctx=1&subject=NIFTY"],
  ["future subject", "regimes", "ctx=1&subject=security:" + sampleHash],
  ["ticker/asset contradiction", "regimes", "ticker=US-MKT&asset=IN-MKT"],
  ["typed/legacy contradiction", "factors", "subject=market-factor:IN-MKT&ticker=US-MKT"],
  ["Factor country contradiction", "factors", "ticker=IN-MKT&country=US"],
  ["Factor identity contradiction", "factors", "market=US&factor=india:mom"],
  ["factor exchange fiction", "factors", "ticker=IN-MKT&exchange=IS"],
  ["conflicting recorded venue", "market", "ticker=SPY&exchange=IS"],
  ["unqualified unknown listing", "market", "ticker=UNINSTALLED-LISTING"],
  ["invalid calendar date", "regimes", "observationDate=2025-02-29"],
  [
    "publication datetime is not observation date",
    "regimes",
    "observationDate=2026-10-26T00:00:00Z",
  ],
  ["invalid evidence artifact", "risk", "artifact=https%3A%2F%2Fexample.com%2Fevil"],
  ["comparison needs two anchors", "risk", "compare=" + encodeURIComponent(currentStateId)],
  ["Issue needs owning sweep", "risk", "issue=" + encodeURIComponent(observationIssue)],
  ["partial Issue origin", "data", "originIssue=" + encodeURIComponent(observationIssue)],
  [
    "wrong Issue origin state namespace",
    "data",
    qs({ originIssue: observationIssue, originState: currentSweepId, originSweep: currentSweepId }),
  ],
  [
    "conflicting origin tuples",
    "data",
    qs({
      originIssue: observationIssue,
      originState: currentStateId,
      originSweep: currentSweepId,
      originKind: "artifact",
      originArtifact: currentStateId,
    }),
  ],
  ["trace step needs trace identity", "observatory", "traceStep=2"],
  [
    "trace step invalid namespace",
    "observatory",
    "trace=" + encodeURIComponent(currentStateId) + "&traceStep=2",
  ],
  ["negative trace step", "observatory", "artifact=observatory%3AUS-MKT%3Ahmm&traceStep=-1"],
  ["fractional trace step", "observatory", "artifact=observatory%3AUS-MKT%3Ahmm&traceStep=1.5"],
  ["trace step overflow", "observatory", "artifact=observatory%3AUS-MKT%3Ahmm&traceStep=1000001"],
  ["agent run is not prefixed scientific run", "agents", "run=regime%3A" + sampleHash],
  [
    "more than twelve columns",
    "risk",
    "columns=" + Array.from({ length: 13 }, (_, i) => "column" + i).join(","),
  ],
  ["duplicate columns", "risk", "columns=severity,severity"],
  ["unpaired sort direction", "risk", "sort=severity"],
  ["unknown severity", "risk", "severity=GREEN"],
  ["Data observation window is not current publication date", "data", "dataWindowEnd=2026-10-26"],
  ["Data window alias contradiction", "data", "cutoff=2025-12-31&dataWindowEnd=2024-12-31"],
  ["panel alias contradiction", "data", "section=health&panel=lineage"],
])
  reject(name, workspace, input);
for (const key of [
  "token",
  "password",
  "session",
  "account",
  "userId",
  "book",
  "holdings",
  "backendUrl",
  "mode",
  "event",
  "facility",
  "company",
  "order",
])
  reject(`private/future field ${key}`, "risk", `${key}=secret`);
for (const value of [1, true, false, null, [], {}])
  reject(`raw object does not coerce ${JSON.stringify(value)}`, "risk", { ctx: value });
check("getter query is rejected without invoking getter", () => {
  let invoked = false;
  const input = { ctx: "1" };
  Object.defineProperty(input, "market", {
    enumerable: true,
    get() {
      invoked = true;
      return "US";
    },
  });
  assert.throws(() => parseInvestigationContext("risk", input));
  assert.equal(invoked, false);
});
check("non-plain query object rejects", () =>
  assert.throws(() =>
    parseInvestigationContext(
      "risk",
      Object.assign(Object.create({ token: "secret" }), { ctx: "1" }),
    ),
  ),
);
for (const [label, patch] of [
  ["version", { version: 2 }],
  ["unknown private property", { token: "secret" }],
  ["future subject", { subject: { kind: "security", id: sampleHash } }],
  ["wrong view property", { view: { workspace: "risk", holdings: [] } }],
  ["changed anchor schema", { anchor: { artifactId: currentStateId, url: "https://example.com" } }],
  ["invalid explicit false market", { market: false }],
  ["invalid explicit zero market", { market: 0 }],
  ["invalid empty market", { market: "" }],
  ["invalid empty observation date", { observationDate: "" }],
  ["invalid null anchor", { anchor: null }],
])
  serialReject(`typed serializer ${label}`, { version: 1, view: { workspace: "risk" }, ...patch });
check("safe parser retains explicit error, never default US", () => {
  const v = safeParseInvestigationContext("factors", "ticker=IN-MKT&country=US");
  assert.equal(v.ok, false);
  assert(v.error instanceof ContextError);
  assert.equal("context" in v, false);
});
check("context codec p95 bound on an admitted 4096-byte URL", () => {
  const parsed = parseInvestigationContext("risk", qRisk);
  const value = {
    ...parsed,
    compare: { artifactId: currentStateId },
    origin: {
      kind: "risk-issue",
      issueId: observationIssue,
      stateArtifactId: currentStateId,
      sweepArtifactId: currentSweepId,
    },
    observationDate: "2026-10-26",
    view: {
      ...parsed.view,
      query: "अ".repeat(160),
      sort: "severity",
      direction: "desc",
      category: "ALL",
      status: "OPEN",
      evidenceClass: "REAL_RETAINED",
      columns: [
        "evidence_cutoff",
        "last_observed_at",
        "first_observed_at",
        "remediation_hint",
        "evidence_class",
        "confidence_basis",
        "origin_count",
        "issue_id",
        "category",
        "severity",
        "country",
        "status",
      ],
    },
  };
  const canonical = contextQuery(value),
    tokens = canonical.match(/%[A-Fa-f0-9]{2}|./g);
  let inputBytes = Buffer.byteLength(canonical);
  for (let i = 0; i < tokens.length && inputBytes + 2 <= 4096; i++)
    if (/^[a-zA-Z0-9_.~-]$/.test(tokens[i])) {
      tokens[i] = "%" + tokens[i].charCodeAt(0).toString(16).toUpperCase();
      inputBytes += 2;
    }
  const input = tokens.join("") + "&".repeat(4096 - inputBytes);
  assert.equal(Buffer.byteLength(input), 4096);
  assert.equal(contextQuery(parseInvestigationContext("risk", input)), canonical);
  const action = () => contextQuery(parseInvestigationContext("risk", input));
  for (let i = 0; i < 30; i++) action();
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    action();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  assert(p95 <= 2, `Context codec p95 ${p95}ms exceeds2ms`);
  performanceProof.codec = {
    samples: samples.length,
    p95_ms: p95,
    limit_ms: 2,
    input_bytes: 4096,
    canonical_bytes: Buffer.byteLength(canonical),
    workload:
      "parse and serialize; exact retained IDs, complete Risk origin,12columns,160code-unit multilingual query",
  };
});

const pinnedRisk = parseInvestigationContext("risk", qRisk);
const declaredDataRefs = checkedIssueReferences(issue, currentSweep).filter(
  (ref) => ref.type === "REPLAY_ARTIFACT" && ref.kind === "data-organ-issues",
);
assert.equal(
  declaredDataRefs.length,
  1,
  "Risk origin fixture needs one exact declared Data container",
);
const dataIssueId = declaredDataRefs[0].artifact_id;
const declaredDataBinding = manifest.artifacts[dataIssueId];
assert.equal(declaredDataRefs[0].sha256, declaredDataBinding.sha256);
assert.equal(declaredDataRefs[0].bytes, declaredDataBinding.bytes);
const dataItems = artifact(dataIssueId).payload.items;
const upstreamOrigin = issue.origin_records.find((o) => dataItems.some((d) => d.id === o.id));
assert(upstreamOrigin, "Current pinned Risk Issue has an exact retained Data origin");
const sourceOrigin = riskIssueOrigin(observationIssue, currentStateId, currentSweepId);
const originContext = { ...pinnedRisk, origin: sourceOrigin };
const dataProof = {
  relation: "ISSUE_ORIGIN",
  source: { artifactId: currentStateId, entityId: observationIssue },
  destination: { artifactId: dataIssueId, entityId: upstreamOrigin.id },
  evidenceArtifactId: currentStateId,
  selector: "risk_issue_origin",
};
const verifyOrigin = (proof) =>
  proof.relation === "ISSUE_ORIGIN" &&
  proof.selector === "risk_issue_origin" &&
  proof.evidenceArtifactId === currentStateId &&
  proof.source.artifactId === currentStateId &&
  proof.source.entityId === observationIssue &&
  proof.destination.artifactId === dataIssueId &&
  checkedIssueReferences(issue, currentSweep).some(
    (ref) =>
      ref.type === "REPLAY_ARTIFACT" &&
      ref.artifact_id === dataIssueId &&
      ref.sha256 === declaredDataBinding.sha256 &&
      ref.bytes === declaredDataBinding.bytes,
  ) &&
  issue.origin_records.some((o) => o.id === proof.destination.entityId) &&
  dataItems.some((o) => o.id === proof.destination.entityId);
const destinationView = {
  workspace: "data",
  panel: "issues",
  originId: upstreamOrigin.id,
  sourceId: upstreamOrigin.source,
};
const knownBindings = {
  artifacts: Object.fromEntries(
    Object.entries(manifest.artifacts).map(([id, e]) => [id, { status: e.status }]),
  ),
  hasOrigin: (o) =>
    o.kind === "risk-issue" &&
    o.issueId === observationIssue &&
    o.stateArtifactId === currentStateId &&
    o.sweepArtifactId === currentSweepId &&
    currentSweep.payload.state_ref === currentStateId &&
    currentState.payload.issues.some((i) => i.issue_id === o.issueId),
  hasSelection: (c) =>
    c.view.workspace === "risk"
      ? c.view.issueId === observationIssue && c.view.sweepId === currentSweep.payload.sweep_id
      : c.view.workspace === "data"
        ? dataItems.some((i) => i.id === c.view.originId)
        : false,
};
check("typed link carries exact declared Risk Data origin and complete starting Issue", () => {
  const t = makeEvidenceTarget(
    originContext,
    "data",
    { artifactId: dataIssueId },
    destinationView,
    dataProof,
    verifyOrigin,
  );
  assert.equal(t.workspace, "data");
  assert.equal(t.context.anchor.artifactId, dataIssueId);
  assert.equal(t.context.view.originId, upstreamOrigin.id);
  assert.deepEqual(t.context.origin, sourceOrigin);
  assert.deepEqual(t.relation, dataProof);
  assert.equal(t.context.compare, undefined);
  assert(targetHref(t).startsWith("/data?ctx=1&market=INDIA&"));
  assert.equal(
    parseInvestigationContext("data", new URL(targetHref(t), "https://local.invalid").search).origin
      .issueId,
    observationIssue,
  );
});
check("ordinary workspace navigation preserves exact identity and anchor until adapted", () => {
  const t = buildInvestigationTarget(originContext, "factors");
  assert.equal(t.to, "/factors");
  assert.equal(t.context.market, "INDIA");
  assert.deepEqual(t.context.subject, { kind: "market-factor", id: "IN-MKT" });
  assert.equal(t.context.anchor.artifactId, currentStateId);
  assert.deepEqual(t.context.origin, sourceOrigin);
  assert.equal(t.context.view.workspace, "factors");
});
check("cross-workspace compatibility parks anchor and own view without latest fallback", () => {
  const r = adaptContext(originContext, "data", knownBindings);
  assert.equal(r.applied.market, "INDIA");
  assert.equal(r.applied.subject.id, "IN-MKT");
  assert.equal(r.applied.anchor, undefined);
  assert.equal(r.parked.anchor.artifactId, currentStateId);
  assert.equal(r.parked.view.issueId, observationIssue);
  assert.deepEqual(r.applied.origin, sourceOrigin);
  assert(
    r.reasons.some(
      (x) => x.code === "ANCHOR_NOT_APPLICABLE" && x.message.includes("CONTEXT NOT APPLICABLE"),
    ),
  );
  assert(r.unavailable.includes("anchor"));
});
check("same-workspace exact verified selection stays pinned", () => {
  const r = adaptContext(originContext, "risk", knownBindings);
  assert.equal(r.applied.anchor.artifactId, currentStateId);
  assert.equal(r.applied.view.issueId, observationIssue);
  assert.deepEqual(r.parked, {});
  assert.deepEqual(r.unavailable, []);
  assert.deepEqual(r.reasons, []);
});
check("syntactically valid missing artifact never substitutes known latest", () => {
  const missing = parseInvestigationContext(
    "risk",
    qs({ ctx: "1", artifact: "risk:state:" + sampleHash }),
  );
  const r = adaptContext(missing, "risk", knownBindings);
  assert.equal(r.applied.anchor, undefined);
  assert.equal(r.parked.anchor.artifactId, "risk:state:" + sampleHash);
  assert(r.reasons.some((x) => x.code === "ANCHOR_NOT_VERIFIED"));
  assert(!JSON.stringify(r.applied).includes(currentStateId));
});
check("explicit UNAVAILABLE binding stays unavailable", () => {
  const id = "observatory:SPY:hmm";
  assert.equal(manifest.artifacts[id].status, "UNAVAILABLE");
  const r = adaptContext(
    parseInvestigationContext("observatory", qs({ artifact: id })),
    "observatory",
    knownBindings,
  );
  assert.equal(r.applied.anchor, undefined);
  assert.equal(r.parked.anchor.artifactId, id);
  assert(r.reasons.some((x) => x.code === "ANCHOR_UNAVAILABLE"));
});
check("all actual neural recording selections remain unavailable", () => {
  for (const ticker of ["US-MKT", "IN-MKT", "SPY", "QQQ", "IWM"]) {
    const id = "observatory:" + ticker + ":neural";
    assert.equal(manifest.artifacts[id].status, "UNAVAILABLE");
    const r = adaptContext(
      parseInvestigationContext("observatory", qs({ artifact: id, scene: "neural" })),
      "observatory",
      knownBindings,
    );
    assert.equal(r.applied.anchor, undefined);
    assert(r.unavailable.includes("anchor"));
  }
});
for (const destination of ["risk", "regimes", "factors", "data", "research", "observatory"])
  check(`reference listing cannot become aggregate ${destination}`, () => {
    const r = adaptContext(
      parseInvestigationContext("market", "subject=reference-listing%3ARELIANCE.NS%3AIS"),
      destination,
      knownBindings,
    );
    assert.equal(r.applied.market, "INDIA");
    assert.equal(r.applied.subject, undefined);
    assert.equal(r.parked.subject.kind, "reference-listing");
    assert(r.reasons.some((x) => x.code === "SUBJECT_NOT_APPLICABLE"));
    assert(!JSON.stringify(r.applied).includes("IN-MKT"));
  });
for (const destination of ["world", "agents", "execution"])
  check(`unrelated ${destination} cannot imply market-subject relationship`, () => {
    const r = adaptContext(originContext, destination, knownBindings);
    assert.equal(r.applied.subject, undefined);
    assert.equal(r.parked.subject.id, "IN-MKT");
    assert.equal(r.applied.market, "INDIA");
    assert.deepEqual(r.applied.origin, sourceOrigin);
  });
check("observation date never becomes Data window or Observatory trace step", () => {
  const c = {
    ...parseInvestigationContext("regimes", "subject=market-factor%3AIN-MKT"),
    observationDate: "2025-12-31",
  };
  for (const destination of ["data", "observatory"]) {
    const r = adaptContext(c, destination, knownBindings);
    assert.equal(r.applied.observationDate, undefined);
    assert.equal(r.parked.observationDate, "2025-12-31");
    assert.equal(r.applied.view.dataWindowEnd, undefined);
    assert.equal(r.applied.view.traceStep, undefined);
    assert(r.reasons.some((x) => x.code === "DATE_AXIS_NOT_APPLICABLE"));
  }
});
check("unproved observation date does not snap to neighboring date", () => {
  const c = parseInvestigationContext(
    "market",
    "artifact=market%3AUS-MKT&subject=market-factor%3AUS-MKT&observationDate=2026-08-30",
  );
  const r = adaptContext(c, "market", { ...knownBindings, hasObservationDate: () => false });
  assert.equal(r.applied.observationDate, undefined);
  assert.equal(r.parked.observationDate, "2026-08-30");
  assert(r.reasons.some((x) => x.code === "DATE_NOT_PROVEN"));
  assert(!JSON.stringify(r.applied).includes("2026-08-31"));
});
check("exact supported observation date remains its own clock", () => {
  const c = parseInvestigationContext(
    "market",
    "artifact=market%3AUS-MKT&subject=market-factor%3AUS-MKT&observationDate=2026-08-31",
  );
  const r = adaptContext(c, "market", {
    ...knownBindings,
    hasObservationDate: (id, date) => id === "market:US-MKT" && date === "2026-08-31",
  });
  assert.equal(r.applied.observationDate, "2026-08-31");
  assert.equal(r.applied.anchor.artifactId, "market:US-MKT");
});
const previousSweep = artifact(currentSweep.payload.prior_sweep_ref);
const previousStateId = previousSweep.payload.state_ref;
check("comparison needs explicit compatible basis, not same namespace", () => {
  const c = parseInvestigationContext(
    "risk",
    qs({ artifact: currentStateId, compare: previousStateId }),
  );
  const r = adaptContext(c, "risk", knownBindings);
  assert.equal(r.applied.anchor.artifactId, currentStateId);
  assert.equal(r.applied.compare, undefined);
  assert.equal(r.parked.compare.artifactId, previousStateId);
  assert(r.reasons.some((x) => x.code === "COMPARISON_NOT_PROVEN"));
});
check("comparison accepts independently verified exact pair only", () => {
  const c = parseInvestigationContext(
    "risk",
    qs({ artifact: currentStateId, compare: previousStateId }),
  );
  const r = adaptContext(c, "risk", {
    ...knownBindings,
    comparisonCompatible: (left, right) => left === currentStateId && right === previousStateId,
  });
  assert.equal(r.applied.compare.artifactId, previousStateId);
});
check("unverified focused selection is surfaced rather than guessed", () => {
  const r = adaptContext(originContext, "risk", { artifacts: knownBindings.artifacts });
  assert(r.unavailable.includes("view"));
  assert(r.reasons.some((x) => x.code === "SELECTION_NOT_VERIFIED"));
  assert.equal(r.applied.view.issueId, undefined);
  assert.equal(r.applied.view.sweepId, undefined);
  assert.equal(r.applied.view.severity, "HIGH");
  assert.equal(r.applied.view.country, "INDIA");
  assert.equal(r.parked.view.issueId, observationIssue);
  assert.equal(r.applied.origin, undefined);
  assert.deepEqual(r.parked.origin, sourceOrigin);
});
check(
  "typed Issue origin remains parked until its complete retained owner tuple is verified",
  () => {
    const r = adaptContext(originContext, "risk", {
      artifacts: knownBindings.artifacts,
      hasSelection: knownBindings.hasSelection,
    });
    assert.equal(r.applied.origin, undefined);
    assert.deepEqual(r.parked.origin, sourceOrigin);
    assert(r.unavailable.includes("origin"));
    assert(r.reasons.some((x) => x.code === "ORIGIN_NOT_VERIFIED"));
  },
);
check("forged origin ownership is not enabled by syntactic IDs", () => {
  const c = {
    ...originContext,
    origin: { ...sourceOrigin, stateArtifactId: "risk:state:" + sampleHash },
  };
  const r = adaptContext(c, "risk", knownBindings);
  assert.equal(r.applied.origin, undefined);
  assert.equal(r.parked.origin.stateArtifactId, "risk:state:" + sampleHash);
  assert(r.unavailable.includes("origin"));
});
check("isolated Risk sweep selector needs exact binding", () => {
  const c = parseInvestigationContext("risk", "sweep=" + currentSweep.payload.sweep_id);
  const r = adaptContext(c, "risk", { artifacts: knownBindings.artifacts });
  assert.equal(r.applied.view.sweepId, undefined);
  assert.equal(r.parked.view.sweepId, currentSweep.payload.sweep_id);
  assert(r.unavailable.includes("view"));
});
check("isolated Data source-version selector needs exact binding", () => {
  const c = parseInvestigationContext("data", "sourceVersion=" + sampleHash);
  const r = adaptContext(c, "data", { artifacts: knownBindings.artifacts });
  assert.equal(r.applied.view.sourceVersionId, undefined);
  assert.equal(r.parked.view.sourceVersionId, sampleHash);
  assert(r.unavailable.includes("view"));
});
check("unproven Regime cutoff is parked instead of accepted as evidence time", () => {
  const c = parseInvestigationContext("regimes", "at=2026-10-10T13%3A59%3A59.414508Z");
  const r = adaptContext(c, "regimes", { artifacts: knownBindings.artifacts });
  assert.equal(r.applied.view.cutoff, undefined);
  assert.equal(r.parked.view.cutoff, "2026-10-10T13:59:59.414508Z");
  assert(r.unavailable.includes("view"));
});
check("cutoff mismatch against actual retained snapshot stays unavailable", () => {
  const i = currentState.payload.issues.find((x) => x.category === "MODEL" && x.country === "US");
  const observation = currentSweep.payload.observations.find(
    (o) => o.observation_id === i.last_observation_id,
  );
  const ref = observation.evidence_refs.find((x) => x.artifact_id?.startsWith("regimes:snapshot:"));
  assert(ref);
  const c = parseInvestigationContext(
    "regimes",
    qs({ subject: "market-factor:US-MKT", artifact: ref.artifact_id, at: "2026-10-09T00:00:00Z" }),
  );
  const r = adaptContext(c, "regimes", {
    ...knownBindings,
    hasSelection: (context) => context.view.cutoff === manifest.artifacts[ref.artifact_id].as_of,
  });
  assert.equal(r.applied.view.cutoff, undefined);
  assert.equal(r.parked.view.cutoff, "2026-10-09T00:00:00Z");
  assert.equal(r.applied.anchor.artifactId, ref.artifact_id);
});
check("unproven Data annual observation window is parked without clock conversion", () => {
  const c = parseInvestigationContext("data", "country=INDIA&dataWindowEnd=2025-12-31");
  const r = adaptContext(c, "data", { artifacts: knownBindings.artifacts });
  assert.equal(r.applied.view.dataWindowEnd, undefined);
  assert.equal(r.parked.view.dataWindowEnd, "2025-12-31");
  assert.equal(r.applied.observationDate, undefined);
  assert.equal(r.applied.anchor, undefined);
  assert.equal(r.applied.market, "INDIA");
  assert(r.unavailable.includes("view"));
});
check("destination view workspace mismatch rejects", () =>
  assert.throws(() =>
    adaptContext(originContext, "data", knownBindings, { workspace: "factors", panel: "catalog" }),
  ),
);
check("unsupported impact destination never applies evidence anchor", () => {
  assert.equal(anchorAppliesTo(currentStateId, "execution"), false);
  assert.equal(anchorAppliesTo("https://provider.invalid", "data"), false);
});
for (const [label, mutate] of [
  ["unknown relation", (p) => (p.relation = "SAME_COUNTRY")],
  ["fuzzy selector", (p) => (p.selector = "name_match")],
  ["arbitrary selector", (p) => (p.selector = "/payload/anything")],
  ["unknown relation property", (p) => (p.confidence = 0.9)],
  ["wrong selector relation", (p) => (p.selector = "declared_capture")],
  ["URL artifact", (p) => (p.evidenceArtifactId = "https://provider.invalid")],
  ["partial source ID", (p) => (p.source.entityId = observationIssue.slice(0, -1))],
  ["unknown nested source field", (p) => (p.source.url = "https://provider.invalid")],
])
  check(`relation proof ${label}`, () => {
    const bad = structuredClone(dataProof);
    mutate(bad);
    assert.throws(() => validateRelationProof(bad));
  });
check("relation enum is exactly the seven approved declared edges", () =>
  assert.deepEqual(RELATIONS, [
    "REFERENCED_ARTIFACT",
    "ISSUE_ORIGIN",
    "DECLARED_PRODUCER",
    "DECLARED_SOURCE_VERSION",
    "DECLARED_ADMISSION",
    "DECLARED_CAPTURE",
    "PRESENT_IN",
  ]),
);
check("syntax alone cannot enable evidence link", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      originContext,
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      () => false,
    ),
  ),
);
check("truthy verifier coercion does not enable link", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      originContext,
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      () => 1,
    ),
  ),
);
check("missing edge verifier cannot enable link", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      originContext,
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      undefined,
    ),
  ),
);
check("wrong selected source artifact rejects relation", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      { ...originContext, anchor: { artifactId: previousStateId } },
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      verifyOrigin,
    ),
  ),
);
check("wrong selected source Issue rejects relation", () => {
  const other = currentState.payload.issues.find((i) => i.issue_id !== observationIssue);
  assert.throws(() =>
    makeEvidenceTarget(
      { ...originContext, view: { ...originContext.view, issueId: other.issue_id } },
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      verifyOrigin,
    ),
  );
});
check("wrong selected destination origin rejects true edge proof", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      originContext,
      "data",
      { artifactId: dataIssueId },
      { ...destinationView, originId: sampleHash },
      dataProof,
      verifyOrigin,
    ),
  ),
);
check("wrong target anchor rejects declared edge", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      originContext,
      "data",
      { artifactId: manifest.routes["/data/health"] },
      destinationView,
      dataProof,
      verifyOrigin,
    ),
  ),
);
check("complete starting Issue tuple is required for cross-workspace evidence link", () =>
  assert.throws(() =>
    makeEvidenceTarget(
      pinnedRisk,
      "data",
      { artifactId: dataIssueId },
      destinationView,
      dataProof,
      verifyOrigin,
    ),
  ),
);
check("null model and container snapshot relation cannot invent a run", () => {
  const modelIssue = currentState.payload.issues.find(
    (i) => i.category === "MODEL" && i.country === "INDIA",
  );
  assert.equal(modelIssue.model, null);
  const observation = currentSweep.payload.observations.find(
    (o) => o.observation_id === modelIssue.last_observation_id,
  );
  const ref = observation.evidence_refs.find((x) => x.artifact_id?.startsWith("regimes:snapshot:"));
  assert(ref, "Actual model Issue points to a retained snapshot");
  assert.equal(ref.run_id, null);
  const c = {
    ...originContext,
    view: {
      workspace: "risk",
      issueId: modelIssue.issue_id,
      sweepId: currentSweep.payload.sweep_id,
    },
    origin: riskIssueOrigin(modelIssue.issue_id, currentStateId, currentSweepId),
  };
  const p = {
    relation: "REFERENCED_ARTIFACT",
    source: { artifactId: currentStateId, entityId: modelIssue.issue_id },
    destination: { artifactId: ref.artifact_id },
    evidenceArtifactId: currentSweepId,
    selector: "risk_issue_evidence",
  };
  const verify = (x) =>
    x.source.entityId === modelIssue.issue_id &&
    x.destination.artifactId === ref.artifact_id &&
    x.destination.entityId === undefined;
  const t = makeEvidenceTarget(
    c,
    "regimes",
    { artifactId: ref.artifact_id },
    { workspace: "regimes", panel: "overview" },
    p,
    verify,
  );
  assert.equal(t.context.view.runId, undefined);
  assert.throws(() =>
    makeEvidenceTarget(
      c,
      "regimes",
      { artifactId: ref.artifact_id },
      { workspace: "regimes", panel: "overview", runId: sampleHash },
      p,
      verify,
    ),
  );
});
check("targetHref preserves query-order neutrality", () => {
  const t = buildInvestigationTarget(originContext, "risk");
  const reversed = Object.fromEntries(Object.entries(t.search).reverse());
  assert.equal(targetHref({ ...t, search: reversed }), targetHref(t));
});
check("targetHref rejects search/context disagreement", () => {
  const t = buildInvestigationTarget(originContext, "risk");
  assert.throws(() => targetHref({ ...t, search: { ...t.search, severity: "LOW" } }));
});
check("targetHref rejects external path", () => {
  const t = buildInvestigationTarget(originContext, "risk");
  assert.throws(() => targetHref({ ...t, to: "https://provider.invalid" }));
});
check("targetHref rejects workspace/view disagreement", () => {
  const t = buildInvestigationTarget(originContext, "factors");
  assert.throws(() => targetHref({ ...t, workspace: "risk", to: "/risk" }));
});
check("recorded run target path must agree with exact typed run", () => {
  const c = parseInvestigationContext("agents", "run=" + sampleHash);
  const t = buildInvestigationTarget(c, "agents");
  assert.equal(t.to, "/runs/" + sampleHash);
  assert.throws(() => targetHref({ ...t, to: "/runs/" + "b".repeat(64) }));
});

// The implementation base is the independently published Data epoch merged by the
// root agent. It grants no permission to modify production publication artifacts.
const ARCHIVE_BASE = "e65e6651ccbe758e490b2b48c240aac514cab7c6";
const FIRST_RECONCILED_MAIN = "49d7e7467181e73a8c5c1d771f226ec87c181961";
const PREVIOUS_RECONCILED_MAIN = "830ea0f02af0cb57fcbfffaddb25693414831713";
const RECONCILED_MAIN = "32c3f827985dd5fbee0354780765e49e679cad57";
const CURRENT_AVAILABLE_BINDINGS = 340;
const APPROVED_MODULE_NAMES = [
  "seed",
  "market",
  "regimes",
  "risk",
  "factors",
  "data",
  "recordings",
  "history",
  "history-archive",
  "observatory-window",
];
const EXCLUDED_LOCAL_COMMIT = "6f99daa7cdb636aae79f3e2d8fa5b99994afdd2d";
const APPROVED_SCOPE_AMENDMENTS = ["frontend-v2/src/router.tsx"];
const APPROVED_PLAN = "docs/phase7-5-connected-quant-terminal-plan.md";
const APPROVED_PLAN_SHA256 = "e116ec8bbebf6790395577110b53c44a8443a2b8bc3d0b564a856916e79218a5";
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const gitText = (...args) =>
  git(...args)
    .toString("utf8")
    .trim();
const splitZ = (bytes) => bytes.toString("utf8").split("\0").filter(Boolean);
const stable = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const canonicalBytes = (bytes) => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
const freezeProof = {
  archiveBase: ARCHIVE_BASE,
  reconciledMain: RECONCILED_MAIN,
  excludedLocalCommit: EXCLUDED_LOCAL_COMMIT,
  operationsPerformedByThisVerifier: 0,
  approvedExactSourceAmendments: APPROVED_SCOPE_AMENDMENTS,
  provenance:
    "ENGINEERING_QA_READ_ONLY; upstream Data publication is independent of this implementation",
};
const freezeFailureStart = failures.length;
let approvedAdd = [],
  approvedChange = [],
  changedPaths = [],
  untrackedPaths = [];
check("exact approved plan has not been rewritten to bless extra scope", () => {
  const raw = readFileSync(path.join(root, APPROVED_PLAN));
  assert.equal(hash(raw), APPROVED_PLAN_SHA256);
  const plan = raw.toString("utf8");
  const pathsIn = (section, next) =>
    [
      ...plan
        .split(`## ${section}.`)[1]
        .split(`## ${next}.`)[0]
        .matchAll(/^\| `([^`]+)`/gm),
    ].map((match) => match[1]);
  approvedAdd = pathsIn(36, 37);
  approvedChange = pathsIn(37, 38);
  assert.equal(approvedAdd.length, 24);
  assert.equal(approvedChange.length, 54);
  assert.equal(new Set([...approvedAdd, ...approvedChange]).size, 78);
});
function verifyScope(changed, untracked, deleted = []) {
  const allowed = new Set([
    ...approvedAdd,
    ...approvedChange,
    APPROVED_PLAN,
    ...APPROVED_SCOPE_AMENDMENTS,
  ]);
  assert.deepEqual(deleted, [], "No original source or history may be deleted");
  assert.deepEqual(
    [...new Set([...changed, ...untracked])].filter((p) => !allowed.has(p)),
    [],
    "Every implementation path must be explicitly approved in sections 36–37",
  );
  assert(
    ![...changed, ...untracked].some((p) =>
      p.startsWith("frontend-v2/src/app/terminal/generated/"),
    ),
    "Generated modules are ignored build products, never tracked source",
  );
}
check("e65 archive and independently admitted current main are ancestors", () => {
  assert.equal(
    spawnSync("git", ["merge-base", "--is-ancestor", ARCHIVE_BASE, RECONCILED_MAIN], { cwd: root })
      .status,
    0,
  );
  assert.equal(
    spawnSync("git", ["merge-base", "--is-ancestor", RECONCILED_MAIN, "HEAD"], { cwd: root })
      .status,
    0,
    "Reconcile current main before claiming this source-bound implementation is current",
  );
});
check("excluded local closure commit is absent from implementation ancestry", () => {
  const object = spawnSync("git", ["cat-file", "-e", EXCLUDED_LOCAL_COMMIT + "^{commit}"], {
    cwd: root,
  });
  const status =
    object.status === 0
      ? spawnSync("git", ["merge-base", "--is-ancestor", EXCLUDED_LOCAL_COMMIT, "HEAD"], {
          cwd: root,
        }).status
      : 1;
  assert.equal(status, 1);
  freezeProof.excludedCommitIsAncestor = false;
  freezeProof.excludedCommitObjectAvailable = object.status === 0;
});
check("implementation uses exact Add/Change scope with no deletions", () => {
  changedPaths = splitZ(git("diff", "--no-renames", "--name-only", "-z", RECONCILED_MAIN, "--"));
  untrackedPaths = splitZ(git("ls-files", "--others", "--exclude-standard", "-z"));
  const deleted = splitZ(
    git("diff", "--no-renames", "--name-only", "--diff-filter=D", "-z", RECONCILED_MAIN, "--"),
  );
  verifyScope(changedPaths, untrackedPaths, deleted);
  freezeProof.implementationChangedPaths = changedPaths;
  freezeProof.untrackedApprovedPaths = untrackedPaths;
});
for (const [label, extra, deleted] of [
  ["new backend file", ["backend/terminal.py"], []],
  ["extra frontend helper", ["frontend-v2/src/app/terminal/shortcut.ts"], []],
  ["new public index artifact", ["frontend-v2/public/terminal-index.json"], []],
  ["generated module tracked", ["frontend-v2/src/app/terminal/generated/seed.generated.ts"], []],
  ["old frozen file deletion", [], ["frontend-v2/src/replay/client.ts"]],
])
  check(`scope sabotage rejects ${label}`, () =>
    assert.throws(() => verifyScope(extra, [], deleted)),
  );
check("central router amendment allows only its one exact path", () => {
  assert.deepEqual(APPROVED_SCOPE_AMENDMENTS, ["frontend-v2/src/router.tsx"]);
  assert.throws(() => verifyScope(["frontend-v2/src/router-helper.ts"], []));
});
check("all nine protected frontend sources retain exact checkout bytes", () => {
  const protectedPaths = [
    "app/shell/ForgeShell.tsx",
    "markets/queries.ts",
    "replay/client.ts",
    "replay/contracts.ts",
    "replay/FactorRegimeEvidence.tsx",
    "replay/SourceCredit.tsx",
    "replay/factor-series.ts",
    "replay/mode.tsx",
    "replay/observatory.ts",
  ].map((name) => "frontend-v2/src/" + name);
  freezeProof.protectedSourceSha256 = Object.fromEntries(
    protectedPaths.map((name) => {
      const actual = readFileSync(path.join(root, name));
      // --filters reproduces platform checkout rules without changing the immutable Git blob.
      const expected = git("cat-file", "--filters", ARCHIVE_BASE + ":" + name);
      assert.equal(hash(actual), hash(expected), name);
      return [name, hash(actual)];
    }),
  );
});
const dataKinds = ["costs", "coverage", "disagreement", "health", "issues", "lineage", "revisions"];
const mirrors = new Set(
  [...dataKinds, "manifest", "receipt"].map(
    (kind) => "data/exports/data_organ_v0_1/" + kind + ".json",
  ),
);
let baseManifest, admittedManifest;
check("admitted main publication preserves every old entry and all non-Data aliases", () => {
  baseManifest = JSON.parse(git("show", ARCHIVE_BASE + ":frontend-v2/public/replay-manifest.json"));
  admittedManifest = JSON.parse(
    git("show", RECONCILED_MAIN + ":frontend-v2/public/replay-manifest.json"),
  );
  assert.equal(Object.keys(baseManifest.artifacts).length, 339);
  assert.equal(Object.keys(baseManifest.routes).length, 146);
  for (const [id, entry] of Object.entries(baseManifest.artifacts))
    assert.deepEqual(admittedManifest.artifacts[id], entry, id);
  for (const [route, id] of Object.entries(baseManifest.routes))
    if (!dataKinds.some((kind) => route === "/data/" + kind))
      assert.equal(admittedManifest.routes[route], id, route);
  const added = Object.keys(admittedManifest.artifacts).filter(
    (id) => !(id in baseManifest.artifacts),
  );
  assert.equal(added.length, 21);
  assert.deepEqual(
    added.map((id) => admittedManifest.artifacts[id].kind).sort(),
    [...dataKinds, ...dataKinds, ...dataKinds].map((kind) => "data-organ-" + kind).sort(),
  );
  const clocks = new Set(added.map((id) => admittedManifest.artifacts[id].as_of));
  assert.equal(clocks.size, 3);
  for (const kind of dataKinds)
    assert(
      added.includes(admittedManifest.routes["/data/" + kind]),
      kind + " complete admitted epoch",
    );
  assert.deepEqual(
    manifest,
    admittedManifest,
    "Implementation may not republish or modify the independently admitted manifest",
  );
  const upstreamPaths = splitZ(
    git("diff", "--no-renames", "--name-only", "-z", ARCHIVE_BASE, RECONCILED_MAIN),
  );
  assert.equal(upstreamPaths.length, 39);
  assert(
    upstreamPaths.every(
      (p) =>
        p === "frontend-v2/public/replay-manifest.json" ||
        mirrors.has(p) ||
        /^data\/exports\/data_organ_v0_1\/(health|issues|lineage|receipt)-[a-f0-9]{64}\.json$/.test(
          p,
        ) ||
        /^frontend-v2\/public\/artifacts\/replay\/data-organ-(costs|coverage|disagreement|health|issues|lineage|revisions)-[a-f0-9]{64}\.json$/.test(
          p,
        ),
    ),
  );
  const previous = JSON.parse(
    git("show", PREVIOUS_RECONCILED_MAIN + ":frontend-v2/public/replay-manifest.json"),
  );
  assert.equal(Object.keys(previous.artifacts).length, 353);
  for (const [id, entry] of Object.entries(previous.artifacts))
    assert.deepEqual(admittedManifest.artifacts[id], entry, "Prior353 entry " + id);
  const mutableDataPaths = ["health", "issues", "lineage", "receipt", "manifest"]
    .map((kind) => "data/exports/data_organ_v0_1/" + kind + ".json")
    .concat("frontend-v2/public/replay-manifest.json")
    .sort();
  const epochs = [
    [ARCHIVE_BASE, FIRST_RECONCILED_MAIN],
    [FIRST_RECONCILED_MAIN, PREVIOUS_RECONCILED_MAIN],
    [PREVIOUS_RECONCILED_MAIN, RECONCILED_MAIN],
  ];
  for (const [from, to] of epochs) {
    assert.deepEqual(
      splitZ(git("diff", "--no-renames", "--name-only", "--diff-filter=MD", "-z", from, to)).sort(),
      mutableDataPaths,
      "Every prior sealed/raw/public file must remain exact",
    );
    const before = JSON.parse(git("show", from + ":frontend-v2/public/replay-manifest.json"));
    const after = JSON.parse(git("show", to + ":frontend-v2/public/replay-manifest.json"));
    assert.deepEqual(Object.keys(after.routes).sort(), Object.keys(before.routes).sort());
    assert.deepEqual(
      Object.keys(before.routes)
        .filter((route) => before.routes[route] !== after.routes[route])
        .sort(),
      dataKinds.map((kind) => "/data/" + kind).sort(),
    );
    const epochIds = Object.keys(after.artifacts).filter(
      (id) => !Object.hasOwn(before.artifacts, id),
    );
    assert.equal(epochIds.length, 7);
    assert.deepEqual(
      epochIds.map((id) => after.artifacts[id].kind).sort(),
      dataKinds.map((kind) => "data-organ-" + kind).sort(),
    );
    assert.equal(new Set(epochIds.map((id) => after.artifacts[id].as_of)).size, 1);
    for (const [id, entry] of Object.entries(before.artifacts))
      assert.deepEqual(after.artifacts[id], entry);
  }
  freezeProof.independentUpstreamPublication = {
    commit: RECONCILED_MAIN,
    paths: upstreamPaths,
    addedArtifacts: added,
    asOf: admittedManifest.as_of,
    publicationEpochs: [...clocks].sort(),
    oldArtifactsPreserved: 339,
    originalRoutes: 146,
  };
});
check("all original public artifact bindings and available bytes remain exact", () => {
  let available = 0,
    risk = 0;
  for (const [id, entry] of Object.entries(manifest.artifacts)) {
    if (entry.status !== "AVAILABLE") continue;
    assert.equal(typeof entry.url, "string");
    assert(entry.url.startsWith("/artifacts/replay/"));
    assert(!entry.url.includes(".."));
    const raw = readFileSync(path.join(frontend, "public", entry.url));
    assert.equal(raw.length, entry.bytes, id + " byte length");
    assert.equal(hash(raw), entry.sha256, id + " sha256");
    available++;
    if (id.startsWith("risk:")) risk++;
  }
  assert.equal(risk, 27);
  assert.equal(available, CURRENT_AVAILABLE_BINDINGS);
  freezeProof.availableOriginalArtifactsChecked = available;
  freezeProof.immutableRiskArtifacts = risk;
});
check(
  "930-file scientific freeze including nine historical mutable mirror snapshots remains exact",
  () => {
    const frozen = JSON.parse(
      readFileSync(path.join(root, "eval/risk_manager/v0.1/phase0-6-freeze.json")),
    );
    assert.equal(Object.keys(frozen.files).length, 930);
    assert.equal(Object.keys(frozen.artifacts).length, 221);
    assert.equal(Object.keys(frozen.routes).length, 126);
    assert.equal(frozen.withdrawals.length, 6);
    const inventory = {};
    for (const [name, expected] of Object.entries(frozen.files)) {
      const target = mirrors.has(name)
        ? "eval/risk_manager/v0.1/frozen-monitoring/" + expected.sha256 + ".json"
        : name;
      let raw = readFileSync(path.join(root, target));
      assert(["canonical_text", "raw", "filtered_raw"].includes(expected.mode));
      if (expected.mode === "canonical_text") raw = canonicalBytes(raw);
      inventory[name] = hash(raw);
      assert.equal(inventory[name], expected.sha256, name);
    }
    assert.equal(
      hash(stable(inventory)),
      "9fc53ec0d8eba8aa16a89838b512ccee7e845e425835ec1e188a786a0bfb3d7d",
    );
    for (const [id, entry] of Object.entries(frozen.artifacts))
      assert.deepEqual(manifest.artifacts[id], entry, id);
    for (const [route, id] of Object.entries(frozen.routes))
      if (!dataKinds.some((kind) => route === "/data/" + kind))
        assert.equal(manifest.routes[route], id, route);
    for (const [key, value] of Object.entries(frozen.manifest_contract))
      assert.deepEqual(manifest[key], value, key);
    for (const withdrawal of frozen.withdrawals) {
      assert(!(withdrawal.withdrawn_artifact in manifest.artifacts));
      assert(
        !existsSync(
          path.join(
            frontend,
            "public/artifacts/replay",
            withdrawal.withdrawn_artifact.replaceAll(":", "-") + ".json",
          ),
        ),
      );
      assert(withdrawal.replacement_artifact in manifest.artifacts);
    }
    freezeProof.phase0Through6 = {
      files: 930,
      originalArtifacts: 221,
      originalRoutes: 126,
      withdrawals: 6,
      scientificInventorySha256: hash(stable(inventory)),
    };
  },
);
check("Phase 5 fixed 684-file metadata and all 33 entries/11 aliases remain exact", () => {
  const frozen = JSON.parse(readFileSync(path.join(root, "eval/factors/v0.1/phase5-freeze.json")));
  assert.equal(Object.keys(frozen.files).length, 684);
  for (const [name, expected] of Object.entries(frozen.files)) {
    let raw = readFileSync(path.join(root, name));
    if (expected.mode === "canonical_text") raw = canonicalBytes(raw);
    assert.equal(hash(raw), expected.sha256, name);
  }
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(manifest.artifacts).filter(([id]) => id.startsWith("regimes:")),
    ),
    frozen.regime_entries,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(manifest.routes).filter(([route]) => route.startsWith("/regimes/")),
    ),
    frozen.regime_routes,
  );
  assert.equal(Object.keys(frozen.regime_entries).length, 33);
  assert.equal(Object.keys(frozen.regime_routes).length, 11);
  freezeProof.phase5 = { files: 684, artifacts: 33, routes: 11 };
});
check("all six public Risk claim flags stay false at every retained nesting level", () => {
  const keys = [
    "causal_claim_eligible",
    "inference_certified",
    "market_claim_eligible",
    "precise_edge_confidence",
    "trusted_graph",
    "validated_alpha",
  ];
  let objects = 0;
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if ("claim_flags" in value) {
      assert.deepEqual(value.claim_flags, Object.fromEntries(keys.map((key) => [key, false])));
      objects++;
    }
    for (const child of Object.values(value)) visit(child);
  }
  for (const [id, entry] of Object.entries(manifest.artifacts))
    if (id.startsWith("risk:") && entry.status === "AVAILABLE") visit(artifact(id));
  assert(objects >= 27);
  assert(Object.values(manifest.claims).every((v) => v === false));
  freezeProof.riskClaimObjectsChecked = objects;
});
check("Risk/regime schedules remain disabled and existing scheduled Data is byte-identical", () => {
  for (const name of [".github/workflows/risk.yml", ".github/workflows/organs.yml"]) {
    assert.equal(
      hash(canonicalBytes(readFileSync(path.join(root, name)))),
      hash(canonicalBytes(git("show", ARCHIVE_BASE + ":" + name))),
      name,
    );
  }
  const risk = readFileSync(path.join(root, ".github/workflows/risk.yml"), "utf8");
  assert(!/^\s*schedule:/m.test(risk));
  const organs = readFileSync(path.join(root, ".github/workflows/organs.yml"), "utf8");
  assert(organs.includes("cron: '20 1 * * *'"));
  assert.equal(
    (
      organs.match(
        /if: github\.event_name == 'workflow_dispatch' && inputs\.scope == 'regimes'/g,
      ) || []
    ).length,
    3,
  );
  freezeProof.schedules = {
    risk: "MANUAL_ONLY",
    regimes: "MANUAL_ONLY_D6_DEFERRED",
    data: "UNCHANGED",
  };
});
if (failures.length === freezeFailureStart) completedAreas.add("freeze");

check(
  "always-on shell and visible command line do not statically import optional interaction tooling",
  () => {
    for (const relative of [
      "src/app/terminal/TerminalShell.tsx",
      "src/app/command/CommandLine.tsx",
    ]) {
      const source = readFileSync(path.join(frontend, relative), "utf8");
      const tree = ts.createSourceFile(
        relative,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const statement of tree.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
          continue;
        const target = statement.moduleSpecifier.text;
        if (/\/(?:ForgeCommandPalette|commands|search|catalog|reader)$/.test(target))
          assert(
            statement.importClause?.isTypeOnly,
            relative + " imports optional runtime " + target,
          );
      }
    }
  },
);
check("always-on navigation seed loads only its exact existing generated seed file", () => {
  const source = readFileSync(path.join(frontend, "src/app/terminal/TerminalShell.tsx"), "utf8");
  const tree = ts.createSourceFile(
    "TerminalShell.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "loadNavigationSeed",
  );
  assert(declaration);
  const imports = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      imports.push(node.arguments[0]?.text);
    ts.forEachChild(node, visit);
  };
  visit(declaration);
  assert.deepEqual(imports, ["./generated/seed.generated.ts"]);
  assert(
    !/\b(?:loadTerminalSeed|validateTerminalShard|verifyDisplayProjection|fetch)\s*\(/.test(
      declaration.getText(tree),
    ),
  );
});

check("Ctrl or Cmd K uses the same focus-capturing palette opener as the visible action", () => {
  const source = readFileSync(path.join(frontend, "src/app/terminal/TerminalShell.tsx"), "utf8");
  const tree = ts.createSourceFile(
    "TerminalShell.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let keyboard;
  const find = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "onKey")
      keyboard = node.initializer;
    ts.forEachChild(node, find);
  };
  find(tree);
  assert(keyboard && ts.isArrowFunction(keyboard));
  const branch = keyboard.body.statements.find(
    (node) =>
      ts.isIfStatement(node) &&
      node.expression.getText(tree).includes('event.key.toLowerCase() === "k"'),
  );
  assert(branch, "Find the actual Ctrl/Cmd+K branch");
  const calls = [];
  const inspect = (node) => {
    if (ts.isCallExpression(node)) calls.push(node.expression.getText(tree));
    ts.forEachChild(node, inspect);
  };
  inspect(branch.thenStatement);
  assert.equal(calls.filter((name) => name === "openPalette").length, 1);
  assert(
    !calls.includes("setPaletteOpen"),
    "A direct state setter bypasses focus capture during lazy loading",
  );
});

const projectionProof = {
  provenance: "ENGINEERING_QA_READ_ONLY_OR_IN_MEMORY_MUTATIONS_OF_ACTUAL_RETAINED_METADATA",
};
async function checkAsync(name, action) {
  try {
    await action();
    passed.push(name);
    checks++;
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.stack : String(error) });
  }
}
const memoryRouter = (raw) => {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/risk",
    validateSearch: (search) => search,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/risk" + raw] }),
    parseSearch: parseTerminalSearch,
    stringifySearch: stringifyTerminalSearch,
    isServer: true,
  });
};
await checkAsync(
  "actual TanStack router generates exact canonical typed links on server",
  async () => {
    const router = memoryRouter("");
    await router.load();
    for (const query of transportProof.typedQueries) {
      const selected = parseInvestigationContext("risk", {
        ctx: "1",
        q: query.query,
        panel: "feed",
      });
      const location = router.buildLocation({
        to: "/risk",
        search: serializeInvestigationContext(selected),
      });
      assert.equal(new URLSearchParams(location.searchStr).get("ctx"), "1");
      assert.deepEqual(parseInvestigationContext("risk", location.searchStr), selected);
      assert.equal(location.search.q, query.query);
    }
    transportProof.actualServerLinkGeneration = true;
  },
);
for (const raw of [
  "?ctx=1&q=%GG",
  "?ctx=1&q=%C0%AF",
  "?ctx=1&q=%ED%A0%80",
  "?ctx=1&q=1&q=2",
  "?ticker=%ZZ",
  "?ticker=%C0%AF",
  "?ticker=US-MKT&ticker=IN-MKT",
]) {
  await checkAsync(
    `TanStack memory history retains rejectable original raw URL ${raw}`,
    async () => {
      const router = memoryRouter(raw);
      await router.load();
      assert.equal(router.history.location.search, raw);
      assert.equal(safeParseInvestigationContext("risk", router.history.location.search).ok, false);
      transportProof.rawRejections.push({
        raw,
        originalHistoryRetained: true,
        normalizedState: router.state.location.searchStr,
      });
    },
  );
}

if (!coreOnly || projectionsOnly) {
  const stageFailureStart = failures.length;
  let generated, rebuilt;
  const generator = await import("./generate-terminal-index.mjs");
  const catalog = await import("../src/app/terminal/catalog.ts");
  const reader = await import("../src/app/terminal/reader.ts");
  const readerReferenceSha = "7d66cd6db874d2bf1e6d4dc4798fa7e2da9c3c5e";
  const parseSource = (name, source) =>
    ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const priorReader = parseSource(
    "reader.before.ts",
    gitText("show", readerReferenceSha + ":frontend-v2/src/app/terminal/reader.ts"),
  );
  const actualReader = parseSource(
    "reader.ts",
    readFileSync(path.join(frontend, "src/app/terminal/reader.ts"), "utf8"),
  );
  const functionNamed = (source, name) =>
    source.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
  const priorClosed = functionNamed(priorReader, "closedOriginal");
  const literal = (node) => {
    assert(node, "Required literal grammar is missing");
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isStringLiteral(node)) return node.text;
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    )
      return -Number(node.operand.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties.map((property) => {
          assert(
            ts.isPropertyAssignment(property),
            "Grammar must remain closed literal schema metadata",
          );
          assert(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
          return [property.name.text, literal(property.initializer)];
        }),
      );
    throw new Error("Grammar contains unreviewed executable or non-literal metadata");
  };
  const constantsIn = (fn) => {
    assert(fn?.body);
    const constants = {};
    for (const statement of fn.body.statements)
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (
            ts.isIdentifier(declaration.name) &&
            ["roots", "nodes"].includes(declaration.name.text)
          )
            constants[declaration.name.text] = literal(declaration.initializer);
    assert(constants.roots && constants.nodes);
    return constants;
  };
  const previousGrammar = constantsIn(priorClosed),
    fullGrammar = constantsIn(functionNamed(actualReader, "fullOriginalGrammar")),
    displayGrammar = constantsIn(functionNamed(actualReader, "displayOriginalGrammar"));
  const displayPaths = {
    "market-series": ["$.method", "$.weeks"],
    "regimes-timeline": ["$.payload"],
    "regimes-snapshot": ["$.payload.frozen_research"],
    "trace-hmm": ["$"],
  };
  const verifyDisplayGrammar = (candidate) => {
    const reachable = new Set();
    const visit = (index) => {
      assert(Number.isInteger(index) && index >= 0 && index < previousGrammar.nodes.length);
      if (reachable.has(index)) return;
      reachable.add(index);
      const rule = previousGrammar.nodes[index];
      for (const child of Object.values(rule[1])) visit(child);
      if (rule[3] >= 0) visit(rule[3]);
    };
    for (const [contract, paths] of Object.entries(displayPaths))
      for (const at of paths) visit(previousGrammar.roots[contract][at]);
    const mapping = [...reachable].sort((left, right) => left - right),
      inverse = new Map(mapping.map((original, index) => [original, index]));
    assert.equal(mapping.length, 35);
    const nodes = mapping.map((original) => {
      const rule = previousGrammar.nodes[original];
      return [
        rule[0],
        Object.fromEntries(
          Object.entries(rule[1]).map(([key, child]) => [key, inverse.get(child)]),
        ),
        rule[2],
        rule[3] < 0 ? rule[3] : inverse.get(rule[3]),
      ];
    });
    const roots = Object.fromEntries(
      Object.entries(displayPaths).map(([contract, paths]) => [
        contract,
        Object.fromEntries(
          paths.map((at) => [at, inverse.get(previousGrammar.roots[contract][at])]),
        ),
      ]),
    );
    assert.deepEqual(candidate, { roots, nodes });
    return mapping;
  };
  check(
    "reader split preserves every complete-original root and all155 closed schema nodes",
    () => {
      assert.equal(previousGrammar.nodes.length, 155);
      assert.deepEqual(fullGrammar, previousGrammar);
    },
  );
  check(
    "display grammar is exactly the independently reached35nodes for five original paths",
    () => {
      const mapping = verifyDisplayGrammar(displayGrammar);
      projectionProof.readerGrammar = {
        referenceCommit: readerReferenceSha,
        originalNodes: fullGrammar.nodes.length,
        displayNodes: displayGrammar.nodes.length,
        paths: displayPaths,
        independentNewToOriginalNodeIndices: mapping,
        fullOriginalUnchanged: true,
      };
    },
  );
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const printed = (node, source) => printer.printNode(ts.EmitHint.Unspecified, node, source);
  check("closed structural visitor body retains the exact pre-split validation semantics", () => {
    const oldVisit = priorClosed.body.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "visit",
    );
    const validator = functionNamed(actualReader, "validateClosedStructure");
    const newVisit = validator.body.statements.find(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "visit",
    );
    assert.equal(printed(newVisit, actualReader), printed(oldVisit, priorReader));
    assert.equal(validator.body.statements.length, 2);
    assert.match(printed(validator.body.statements[1], actualReader), /^visit\(value, root\);$/);
  });
  check("full-original read guards and API functions remain structurally unchanged", () => {
    for (const name of ["fullOriginalGrammar", "displayOriginalGrammar"]) {
      const fn = functionNamed(actualReader, name);
      assert.equal(fn.body.statements.length, 3);
      assert(
        ts.isVariableStatement(fn.body.statements[0]) &&
          ts.isVariableStatement(fn.body.statements[1]),
      );
      assert.equal(printed(fn.body.statements[2], actualReader), "return { roots, nodes };");
    }
    for (const statement of priorReader.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name?.text === "closedOriginal")
        continue;
      const name = statement.name.text,
        actual = functionNamed(actualReader, name);
      assert(actual, name + " was removed");
      const expected = printed(statement, priorReader);
      assert.equal(
        printed(actual, actualReader),
        name === "verifyDisplayProjection"
          ? expected.replaceAll("closedOriginal(", "closedDisplayOriginal(")
          : expected,
        name,
      );
    }
    for (const [name, factory] of [
      ["closedOriginal", "fullOriginalGrammar"],
      ["closedDisplayOriginal", "displayOriginalGrammar"],
    ]) {
      const body = printed(functionNamed(actualReader, name).body, actualReader);
      assert.equal(
        body.replace(/\s+/g, ""),
        `{const{roots,nodes}=${factory}();validateClosedStructure(value,roots[contract]?.[path],nodes);}`,
      );
    }
  });
  for (const [name, mutate] of [
    [
      "type flags",
      (value) => {
        value.nodes[0][0] |= 16;
      },
    ],
    [
      "unknown field",
      (value) => {
        value.nodes.find((node) => Object.keys(node[1]).length)[1].account = 0;
      },
    ],
    [
      "missing required field",
      (value) => {
        value.nodes.find((node) => node[2].length)[2].pop();
      },
    ],
    [
      "array item",
      (value) => {
        value.nodes.find((node) => node[3] > 0)[3] = 0;
      },
    ],
    [
      "missing node",
      (value) => {
        value.nodes.pop();
      },
    ],
    [
      "unreviewed root",
      (value) => {
        value.roots["forge-runs"] = { $: 0 };
      },
    ],
    [
      "wrong root",
      (value) => {
        value.roots["trace-hmm"].$ = 0;
      },
    ],
  ])
    check("display grammar sabotage rejects " + name, () => {
      const changed = structuredClone(displayGrammar);
      mutate(changed);
      assert.throws(() => verifyDisplayGrammar(changed));
    });

  const readArtifactBytes = (_id, entry) => readFileSync(path.join(frontend, "public", entry.url));
  const clone = (v) => structuredClone(v);
  const decode = (shard) =>
    catalog.unpackTerminalPayload(shard.strings, shard.payload, shard.structures, shard.texts);
  const reseal = async (value) => {
    const { payloadDigest: _digest, ...sealed } = value;
    return { ...sealed, payloadDigest: await catalog.terminalDigest(sealed) };
  };
  const repack = async (shard, payload) =>
    reseal({ ...shard, ...catalog.packTerminalPayload(payload) });
  const resealProjection = async (value) => {
    const { projectionDigest: _digest, ...sealed } = value;
    return { ...sealed, projectionDigest: await catalog.terminalDigest(sealed) };
  };
  await checkAsync(
    "pure generator emits the approved nine metadata shards and separate Observatory display module",
    async () => {
      generated = await generator.deriveTerminalCatalog(manifest, {
        manifestBytes: manifestRaw,
        readArtifactBytes,
      });
      assert.deepEqual(
        Object.keys(generated.shards).sort(),
        [
          "seed",
          "market",
          "regimes",
          "risk",
          "factors",
          "data",
          "recordings",
          "history",
          "history-archive",
        ].sort(),
      );
      assert.deepEqual(Object.keys(generated.modules).sort(), [...APPROVED_MODULE_NAMES].sort());
      assert.deepEqual(
        [...generator.TERMINAL_GENERATED_MODULE_NAMES].sort(),
        [...APPROVED_MODULE_NAMES].sort(),
      );
      projectionProof.generation = generated.report;
      projectionProof.scopeAmendment = {
        path: "frontend-v2/src/app/terminal/generated/observatory-window.generated.ts",
        authorization:
          "explicit human approval of the ninth lazy ignored build output; original plan hash unchanged",
      };
      projectionProof.historyCapacityAmendment = {
        path: "frontend-v2/src/app/terminal/generated/history-archive.generated.ts",
        authorization:
          "explicit human approval of semantic current/required navigation versus retained archive; original plan and per-module caps unchanged",
      };
      for (const [name, module] of Object.entries(generated.modules)) {
        assert(
          Buffer.byteLength(module) <= (name === "seed" ? 48 : 128) * 1024,
          name + " decoded module cap",
        );
        assert(
          gzipSync(module, { level: 9 }).length <= (name === "seed" ? 12 : 32) * 1024,
          name + " gzip module cap",
        );
        assert(!module.includes("ENGINEERING_PRIVACY_SENTINEL"));
        if (name === "observatory-window") {
          assert(generated.observatoryWindow);
          await reader.verifyDisplayProjection(
            generated.observatoryWindow,
            manifest.artifacts["observatory:IN-MKT:hmm"],
            generated.observatoryWindow.projectionDigest,
          );
          continue;
        }
        const admitted = await catalog.validateTerminalShard(
          generated.shards[name],
          name,
          generated.shards.seed.manifestBinding,
        );
        assert(admitted.entities.length <= 512);
        assert(admitted.entities.every((e) => e.availability === "AVAILABLE"));
      }
    },
  );
  await checkAsync(
    "independent second pure rebuild is byte-for-byte deterministic across all ten approved modules",
    async () => {
      assert(generated, "Initial generation must pass before determinism can be claimed");
      rebuilt = await generator.deriveTerminalCatalog(manifest, {
        manifestBytes: manifestRaw,
        readArtifactBytes,
      });
      assert.deepEqual(rebuilt.modules, generated.modules);
      assert.deepEqual(rebuilt.shards, generated.shards);
      assert.deepEqual(rebuilt.observatoryWindow, generated.observatoryWindow);
      projectionProof.deterministicModuleSha256 = Object.fromEntries(
        Object.entries(generated.modules).map(([name, module]) => [name, hash(module)]),
      );
    },
  );
  await checkAsync(
    "checked generated files match pure originals without modifying an output",
    async () => {
      assert(generated);
      const generatedRoot = path.join(frontend, "src/app/terminal/generated");
      assert.deepEqual(
        readdirSync(generatedRoot)
          .filter((name) => name.endsWith(".generated.ts"))
          .sort(),
        APPROVED_MODULE_NAMES.map((name) => name + ".generated.ts").sort(),
      );
      assert.deepEqual(
        splitZ(git("ls-files", "-z", "--", "frontend-v2/src/app/terminal/generated")),
        [],
      );
      for (const name of APPROVED_MODULE_NAMES)
        assert.equal(
          gitText(
            "check-ignore",
            "frontend-v2/src/app/terminal/generated/" + name + ".generated.ts",
          ),
          "frontend-v2/src/app/terminal/generated/" + name + ".generated.ts",
        );
      for (const [name, module] of Object.entries(generated.modules))
        assert.equal(
          readFileSync(
            path.join(frontend, "src/app/terminal/generated", name + ".generated.ts"),
            "utf8",
          ),
          module,
        );
    },
  );

  if (generated) {
    const exactValue = (left, right, where = "$") => {
      if (typeof left === "number") {
        assert(Object.is(left, right), where + " numeric identity");
        return;
      }
      if (left && typeof left === "object") {
        assert(right && typeof right === "object", where + " object identity");
        assert.equal(Array.isArray(left), Array.isArray(right), where + " collection type");
        assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort(), where + " keys");
        for (const key of Object.keys(left)) exactValue(left[key], right[key], where + "." + key);
        return;
      }
      assert.equal(left, right, where);
    };
    const independentlyUnionHistory = (parts) => {
      const result = {
        bindings: {},
        routes: {},
        entities: [],
        edges: [],
        projections: [],
        bundles: [],
      };
      for (const field of ["bindings", "routes", "projectionPins"]) {
        const values = new Map();
        for (const part of parts) {
          if (field === "projectionPins" && part[field] === undefined) continue;
          for (const [key, value] of Object.entries(part[field])) {
            if (values.has(key)) exactValue(values.get(key), value, field + "." + key);
            values.set(key, value);
          }
        }
        if (field !== "projectionPins" || parts.some((part) => part[field] !== undefined))
          result[field] = Object.fromEntries(
            [...values].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          );
      }
      const keyFor = {
        entities: (value) => value.key,
        edges: (value) => catalog.stableTerminal(value),
        projections: (value) => value.source.artifactId + "|" + value.selector,
        bundles: (value) => value.anchor,
      };
      for (const field of Object.keys(keyFor)) {
        const values = new Map();
        for (const part of parts)
          for (const value of part[field]) {
            const key = keyFor[field](value);
            if (values.has(key)) exactValue(values.get(key), value, field + "." + key);
            values.set(key, value);
          }
        result[field] = [...values.values()].sort((a, b) => {
          const left = field === "edges" ? catalog.stableTerminal(a) : keyFor[field](a);
          const right = field === "edges" ? catalog.stableTerminal(b) : keyFor[field](b);
          return left < right ? -1 : left > right ? 1 : 0;
        });
      }
      return result;
    };
    const historyParts = [
      decode(generated.shards.history),
      decode(generated.shards["history-archive"]),
    ];
    check(
      "semantic history union exactly preserves every original record, binding, edge, route and version choice",
      () => {
        assert(
          generated.logicalHistory,
          "Pure generator must expose the original logical payload for independent equality",
        );
        const independentlyMerged = independentlyUnionHistory(historyParts);
        exactValue(independentlyMerged, generated.logicalHistory);
        assert.equal(
          catalog.stableTerminal(independentlyMerged),
          catalog.stableTerminal(generated.logicalHistory),
        );
        const merged = generator.unionTerminalHistory(historyParts);
        exactValue(merged, independentlyMerged);
        assert.equal(
          generated.report.historyPartition.originalDigest,
          hash(catalog.stableTerminal(generated.logicalHistory)),
        );
        assert.equal(
          generated.report.historyPartition.unionDigest,
          hash(catalog.stableTerminal(independentlyMerged)),
        );
        projectionProof.historyPartition = {
          ...generated.report.historyPartition,
          independentlyComparedEveryValue: true,
          signedZeroAndIEEEComparison:
            "recursive Object.is on every numeric value; no JSON-only numeric identity claim",
          shards: ["history", "history-archive"].map((name) => ({
            name,
            ...generated.report.shards[name],
            decodedCap: 131072,
            gzipCap: 32768,
            decodedHeadroomBytes: 131072 - generated.report.shards[name].decodedBytes,
            decodedHeadroomFraction: (131072 - generated.report.shards[name].decodedBytes) / 131072,
            tenPercentHeadroomTargetMet: generated.report.shards[name].decodedBytes <= 131072 * 0.9,
          })),
        };
      },
    );
    check(
      "history partition follows current manifest identities and complete declared closure without arbitrary byte buckets",
      () => {
        const ids = new Set(Object.values(manifest.routes));
        const [current, archive] = historyParts;
        for (const [id, binding] of Object.entries(generated.logicalHistory.bindings))
          exactValue(
            (ids.has(id) ? current : archive).bindings[id],
            binding,
            "semantic binding " + id,
          );
        for (const [route, id] of Object.entries(generated.logicalHistory.routes))
          assert.equal((ids.has(id) ? current : archive).routes[route], id, route);
        for (const entity of generated.logicalHistory.entities) {
          const isRequired =
            entity.artifactId === null ||
            ids.has(entity.artifactId) ||
            entity.versionChoices?.some((choice) => ids.has(choice.artifactId));
          const part = isRequired ? current : archive;
          exactValue(
            part.entities.find((item) => item.key === entity.key),
            entity,
            entity.key,
          );
        }
        for (const edge of generated.logicalHistory.edges) {
          const part = ids.has(edge.artifactId) ? current : archive;
          assert(
            part.edges.some(
              (item) => catalog.stableTerminal(item) === catalog.stableTerminal(edge),
            ),
          );
          assert(part.entities.some((item) => item.key === edge.from));
          assert(part.entities.some((item) => item.key === edge.to));
          assert(part.bindings[edge.artifactId]);
        }
        const reversed = clone(generated.logicalHistory);
        for (const key of ["entities", "edges", "projections", "bundles"]) reversed[key].reverse();
        reversed.bindings = Object.fromEntries(Object.entries(reversed.bindings).reverse());
        const again = generator.partitionTerminalHistory(reversed, [...ids].reverse());
        exactValue(again.history, current);
        exactValue(again.archive, archive);
      },
    );
    check(
      "history union rejects conflicting duplicate bindings and IEEE signed-zero substitutions",
      () => {
        const baseline = {
          bindings: { probe: { value: -0 } },
          routes: {},
          entities: [],
          edges: [],
          projections: [],
          bundles: [],
        };
        const identical = clone(baseline),
          conflict = clone(baseline);
        conflict.bindings.probe.value = 0;
        assert(
          Object.is(generator.unionTerminalHistory([baseline, identical]).bindings.probe.value, -0),
        );
        assert.throws(() => generator.unionTerminalHistory([baseline, conflict]));
        for (const value of [
          Number.MIN_VALUE,
          Number.MAX_VALUE,
          -Number.MIN_VALUE,
          Math.PI,
          0,
          -0,
        ]) {
          const unit = { ...clone(baseline), bindings: { probe: { value } } };
          const partition = generator.partitionTerminalHistory(unit, []);
          const union = generator.unionTerminalHistory([partition.history, partition.archive]);
          exactValue(union, unit);
        }
      },
    );
    check(
      "history union independently detects a dropped retained entity, edge, binding or version choice",
      () => {
        const [current, archive] = historyParts;
        for (const [label, mutate] of [
          ["entity", (value) => value.entities.pop()],
          ["edge", (value) => value.edges.pop()],
          ["binding", (value) => delete value.bindings[Object.keys(value.bindings).at(-1)]],
          [
            "version choice",
            (value) => {
              const item = value.entities.find((entity) => entity.versionChoices?.length);
              assert(item);
              item.versionChoices.pop();
            },
          ],
        ]) {
          const altered = clone(archive);
          mutate(altered);
          assert.throws(
            () =>
              exactValue(independentlyUnionHistory([current, altered]), generated.logicalHistory),
            label,
          );
        }
      },
    );
    const shellSource = readFileSync(
      path.join(frontend, "src/app/terminal/TerminalShell.tsx"),
      "utf8",
    );
    const shellTree = ts.createSourceFile(
      "TerminalShell.tsx",
      shellSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const seedValidator = shellTree.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === "validateNavigationSeed",
    );
    assert(seedValidator, "Always-on seed validator must be separately testable");
    const seedJavaScript = ts.transpileModule(seedValidator.getText(shellTree), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const { validateNavigationSeed } = await import(
      "data:text/javascript;base64," + Buffer.from(seedJavaScript).toString("base64")
    );
    const resealNavigation = async (value) => {
      const { payloadDigest: _digest, ...sealed } = value;
      return { ...sealed, payloadDigest: await catalog.terminalDigest(sealed) };
    };
    await checkAsync(
      "compact navigation seed independently matches exact generated default seed and source manifest without any original fetch",
      async () => {
        const seed = generated.navigationSeed;
        assert(seed);
        exactValue(seed.bindings, decode(generated.shards.seed).bindings);
        exactValue(seed.manifestBinding, generated.shards.seed.manifestBinding);
        for (const [id, binding] of Object.entries(seed.bindings))
          exactValue(binding, manifest.artifacts[id]);
        const { payloadDigest, ...sealed } = seed;
        assert.equal(payloadDigest, await catalog.terminalDigest(sealed));
        const priorFetch = globalThis.fetch;
        let attempts = 0;
        globalThis.fetch = async () => {
          attempts++;
          throw new Error("Compact navigation metadata may not fetch a whole original");
        };
        try {
          const snapshot = await validateNavigationSeed(seed);
          exactValue(snapshot.artifacts, seed.bindings);
          assert.equal(snapshot.as_of, seed.manifestBinding.asOf);
          assert.equal(attempts, 0);
        } finally {
          globalThis.fetch = priorFetch;
        }
        projectionProof.compactNavigationSeed = {
          schema_version: seed.schema_version,
          manifestBinding: seed.manifestBinding,
          payloadDigest,
          bindings: Object.keys(seed.bindings),
          validatorSourceSha256: hash(seedValidator.getText(shellTree)),
          sourceModuleSha256: hash(generated.modules.seed),
          wholeOriginalFetches: attempts,
        };
      },
    );
    for (const [label, mutate] of [
      ["schema version", (value) => (value.schema_version = "terminal-navigation-seed/2")],
      ["generator contract", (value) => (value.generator_contract = "terminal-generator/2")],
      ["unknown field", (value) => (value.account = "ENGINEERING_PRIVATE_SENTINEL")],
      ["missing digest", (value) => delete value.payloadDigest],
      ["missing source binding", (value) => delete value.bindings["market:IN-MKT"]],
      [
        "unknown source identity",
        (value) => (value.bindings["market:SPY"] = value.bindings["market:US-MKT"]),
      ],
      [
        "foreign source URL",
        (value) => (value.bindings["market:IN-MKT"].url = "https://provider.invalid/private"),
      ],
      [
        "source swap",
        (value) => {
          const old = value.bindings["market:IN-MKT"];
          value.bindings["market:IN-MKT"] = value.bindings["market:US-MKT"];
          value.bindings["market:US-MKT"] = old;
        },
      ],
      ["wrong source", (value) => (value.bindings["market:IN-MKT"].sources = ["KENNETH_FRENCH"])],
      [
        "wrong dataset",
        (value) =>
          (value.bindings["market:IN-MKT"].licence.dataset_key = "ken-french:daily-factors"),
      ],
      ["unavailable", (value) => (value.bindings["market:IN-MKT"].status = "UNAVAILABLE")],
      ["wrong kind", (value) => (value.bindings["market:IN-MKT"].kind = "risk-state")],
      ["private scope", (value) => (value.bindings["market:IN-MKT"].scope = "PRIVATE_BOOK")],
      ["unknown licence", (value) => (value.bindings["market:IN-MKT"].licence.status = "UNKNOWN")],
      ["missing grant", (value) => (value.bindings["market:IN-MKT"].licence.permitted_uses = [])],
      [
        "expired grant",
        (value) => (value.bindings["market:IN-MKT"].licence.valid_through = "1900-01-01T00:00:00Z"),
      ],
      ["bad hash", (value) => (value.bindings["market:IN-MKT"].sha256 = "not-a-hash")],
      ["invalid bytes", (value) => (value.bindings["market:IN-MKT"].bytes = 0)],
      ["bad clock", (value) => (value.bindings["market:IN-MKT"].as_of = "invalid-date")],
      ["bad manifest hash", (value) => (value.manifestBinding.sha256 = "bad")],
      ["bad manifest bytes", (value) => (value.manifestBinding.bytes = 0)],
      [
        "oversized envelope",
        (value) => (value.bindings["market:IN-MKT"].licence.attribution = "x".repeat(49152)),
      ],
    ])
      await checkAsync(
        "compact navigation seed closed-contract sabotage rejects " + label,
        async () => {
          const changed = clone(generated.navigationSeed);
          mutate(changed);
          const candidate = label === "missing digest" ? changed : await resealNavigation(changed);
          await assert.rejects(() => validateNavigationSeed(candidate));
        },
      );
    await checkAsync("compact navigation digest corruption rejects without resealing", async () => {
      const changed = clone(generated.navigationSeed);
      changed.bindings["market:IN-MKT"].bytes++;
      await assert.rejects(() => validateNavigationSeed(changed));
    });
  }

  await checkAsync("generator rejects complete-original checksum corruption", async () => {
    await assert.rejects(() =>
      generator.deriveTerminalCatalog(manifest, {
        manifestBytes: manifestRaw,
        readArtifactBytes(id, entry) {
          const raw = readArtifactBytes(id, entry);
          if (id === "market:US-MKT") {
            const corrupt = Buffer.from(raw);
            corrupt[corrupt.length - 2] ^= 1;
            return corrupt;
          }
          return raw;
        },
      }),
    );
  });
  await checkAsync("generator rejects complete-original declared byte mismatch", async () => {
    await assert.rejects(() =>
      generator.deriveTerminalCatalog(manifest, {
        manifestBytes: manifestRaw,
        readArtifactBytes(id, entry) {
          const raw = readArtifactBytes(id, entry);
          return id === "market:US-MKT" ? raw.subarray(1) : raw;
        },
      }),
    );
  });
  await checkAsync(
    "generator rejects substituted parsed manifest versus exact raw snapshot",
    async () => {
      const changed = clone(manifest);
      changed.as_of = "2099-01-01T00:00:00Z";
      await assert.rejects(() =>
        generator.deriveTerminalCatalog(changed, { manifestBytes: manifestRaw, readArtifactBytes }),
      );
    },
  );
  for (const field of ["status", "licence", "kind"])
    await checkAsync(`generator rejects unadmitted ${field} source metadata`, async () => {
      const changed = clone(manifest),
        entry = changed.artifacts["market:US-MKT"];
      if (field === "status") entry.status = "UNAVAILABLE";
      if (field === "licence") entry.licence.permitted_uses = [];
      if (field === "kind") entry.kind = "unpublished-experiment";
      const bytes = Buffer.from(JSON.stringify(changed));
      await assert.rejects(() =>
        generator.deriveTerminalCatalog(changed, { manifestBytes: bytes, readArtifactBytes }),
      );
    });
  const sourceIds = [
    "market:US-MKT",
    manifest.routes["/regimes/timeline?asset=IN-MKT"],
    manifest.routes["/data/issues"],
    currentStateId,
    Object.keys(manifest.artifacts).find((id) => id.startsWith("factors:catalog:")),
    "forge:runs",
    Object.keys(manifest.artifacts).find(
      (id) => manifest.artifacts[id].kind === "hmm" && id.includes("US-MKT"),
    ),
  ];
  for (const id of sourceIds) {
    await checkAsync(`full source positive schema ${id}`, async () => {
      assert(id);
      await generator.validateTerminalSource(id, manifest.artifacts[id], artifact(id));
    });
    await checkAsync(`full source rejects unknown private top field ${id}`, async () => {
      assert(id);
      const value = artifact(id);
      value.account = "ENGINEERING_PRIVACY_SENTINEL";
      await assert.rejects(() =>
        generator.validateTerminalSource(id, manifest.artifacts[id], value),
      );
    });
  }
  const representativeSources = new Map();
  for (const [id, entry] of Object.entries(manifest.artifacts)) {
    if (
      entry.status !== "AVAILABLE" ||
      !(
        /^(data-organ-|regimes-|factors-)/.test(entry.kind) ||
        ["risk-state", "risk-sweep", "market-series", "hmm", "signal"].includes(entry.kind) ||
        id === "forge:runs"
      )
    )
      continue;
    const prior = representativeSources.get(entry.kind);
    if (!prior || entry.as_of > prior[1].as_of) representativeSources.set(entry.kind, [id, entry]);
  }
  projectionProof.closedSourceRepresentativePaths = [];
  for (const [kind, [id, entry]] of representativeSources)
    await checkAsync(
      `full original ${kind} rejects every representative nested unknown field`,
      async () => {
        const value = artifact(id),
          paths = [];
        await reader.validateFullOriginal(id, entry, value);
        function walk(node, at = []) {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) {
            if (node.length) walk(node[0], [...at, 0]);
            return;
          }
          paths.push(at);
          for (const [key, child] of Object.entries(node)) walk(child, [...at, key]);
        }
        walk(value);
        assert(
          paths.length <= 200,
          "Representative schema path limit exceeded; review source coverage before increasing it",
        );
        for (const at of paths) {
          const changed = clone(value);
          let target = changed;
          for (const key of at) target = target[key];
          target.engineering_unknown_private_field = "ENGINEERING_PRIVACY_SENTINEL";
          await assert.rejects(
            () => generator.validateTerminalSource(id, entry, changed),
            id + ":" + (at.join(".") || "$"),
          );
          await assert.rejects(
            () => reader.validateFullOriginal(id, entry, changed),
            "runtime " + id + ":" + (at.join(".") || "$"),
          );
        }
        projectionProof.closedSourceRepresentativePaths.push({
          kind,
          id,
          paths: paths.length,
          arrayScope: "one representative per array structural path",
        });
      },
    );
  check(
    "packing preserves exact IEEE-754 values and signed zero inside deduplicated structures",
    () => {
      const values = [
        [-0, 0, Number.MIN_VALUE, Number.MAX_VALUE, Number.EPSILON, 0.1, 1.0000000000000002],
        [{ v: -0 }, { v: 0 }],
        [{ v: [-0, 0, 0.1] }, { v: [0, -0, 0.1] }],
      ];
      function equal(a, b) {
        if (typeof a === "number") {
          assert(Object.is(a, b), "Exact finite IEEE-754 value changed");
          return;
        }
        if (a && typeof a === "object") {
          assert.deepEqual(Object.keys(a), Object.keys(b));
          for (const key of Object.keys(a)) equal(a[key], b[key]);
          return;
        }
        assert.equal(a, b);
      }
      for (const value of values) {
        const packed = catalog.packTerminalPayload(value);
        equal(
          value,
          catalog.unpackTerminalPayload(
            packed.strings,
            packed.payload,
            packed.structures,
            packed.texts,
          ),
        );
      }
    },
  );
  const zeroDigest = "0".repeat(64),
    canonicalHashFragment = "!1" + "A".repeat(43);
  check("hash fragments use canonical version1 encoding for exactly32 bytes", () =>
    assert.deepEqual(catalog.packTerminalPayload(zeroDigest).strings, [canonicalHashFragment]),
  );
  const collisionValues = [
    "",
    zeroDigest,
    "a".repeat(64),
    "A".repeat(64),
    "f".repeat(64) + zeroDigest,
    "prefix:" + zeroDigest + ":suffix",
    canonicalHashFragment,
    "!!" + canonicalHashFragment,
    "!2future",
    "!",
    "!!",
    "!-0",
    "$0",
    "@0",
    "日本語 !1 μ",
    "x".repeat(8192),
    "!" + "x".repeat(8191),
  ];
  for (const [index, value] of collisionValues.entries())
    check("hash-fragment exact collision/Unicode/boundary roundtrip " + index, () => {
      const packed = catalog.packTerminalPayload(value);
      assert.equal(
        catalog.unpackTerminalPayload(
          packed.strings,
          packed.payload,
          packed.structures,
          packed.texts,
        ),
        value,
      );
    });
  for (const [index, value] of [
    "!1",
    "!1" + "A".repeat(42),
    "!1" + "A".repeat(44),
    "!1" + "A".repeat(42) + "=",
    "!1" + "A".repeat(42) + "B",
    "!1" + "A".repeat(42) + "+",
    "!1" + "A".repeat(42) + "/",
    "!1" + "A".repeat(41) + "==",
    "!2" + "A".repeat(43),
    "!x",
    "!",
    "x".repeat(8193),
    "!!" + "x".repeat(8192),
  ].entries())
    check("malformed/noncanonical/oversized hash fragment rejects " + index, () =>
      assert.throws(() => catalog.unpackTerminalPayload([value], "$0", [], [[0]])),
    );
  check("literal marker is escaped and decoded exactly once", () => {
    assert.equal(
      catalog.unpackTerminalPayload(["!!1" + "A".repeat(43)], "$0", [], [[0]]),
      canonicalHashFragment,
    );
    assert.equal(catalog.unpackTerminalPayload(["!!!-0"], "$0", [], [[0]]), "!!-0");
  });
  check("fragment decoding retains dictionary and joined text bounds", () => {
    assert.throws(() => catalog.unpackTerminalPayload(Array(20001).fill("x"), "$0", [], [[0]]));
    assert.throws(() =>
      catalog.unpackTerminalPayload([canonicalHashFragment], "$0", [], [Array(129).fill(0)]),
    );
  });

  for (const value of [NaN, Infinity, -Infinity, undefined])
    check(`packing rejects unsupported nonfinite/undefined ${String(value)}`, () =>
      assert.throws(() => catalog.packTerminalPayload({ value })),
    );
  for (const [name, strings, value, structures, texts] of [
    ["cyclic structure", [], "@0", [[0, "@0"]], undefined],
    ["noncanonical reference", ["x"], "$00", [], undefined],
    ["out-of-bounds string", ["x"], "$1", [], undefined],
    ["out-of-bounds fragment", ["x"], "$0", [], [[1]]],
    ["unsafe object prototype", ["__proto__"], [1, 0, 1], [], undefined],
    ["duplicate field", ["x"], [1, 0, 1, 0, 2], [], undefined],
    ["nonfinite scalar", [], Infinity, [], undefined],
  ])
    check(`packed decoder rejects ${name}`, () =>
      assert.throws(() => catalog.unpackTerminalPayload(strings, value, structures, texts)),
    );
  const indiaTraceId = "observatory:IN-MKT:hmm",
    indiaTrace = artifact(indiaTraceId);
  const indiaSelected = {
    ...indiaTrace,
    dates_tail: indiaTrace.dates_tail.slice(190, 250),
    frames: indiaTrace.frames
      .slice(92, 100)
      .map((frame) => ({ ...frame, posterior_tail: frame.posterior_tail.slice(190, 250) })),
  };
  const indiaWindow = await resealProjection({
    schema_version: "terminal-display/1",
    generator_contract: "terminal-generator/1",
    selector: "observatory-trace-window",
    source: { artifactId: indiaTraceId, entry: manifest.artifacts[indiaTraceId] },
    originalFullRowCount: 250,
    originalFrameCount: 100,
    range: { start: 190, end: 250 },
    iterationRange: { start: 92, end: 100 },
    dateRange: { start: 190, end: 250 },
    limitations: [
      "Engineering QA exact retained India8iteration/60date projection contract; full original remains unchanged.",
    ],
    selectedFields: indiaSelected,
  });
  await checkAsync(
    "approved India HMM8/60 contract verifies exact unchanged source fields",
    async () => {
      await reader.verifyDisplayProjection(
        indiaWindow,
        manifest.artifacts[indiaTraceId],
        indiaWindow.projectionDigest,
      );
      assert.equal(indiaTrace.frames.length, 100);
      assert.equal(indiaTrace.dates_tail.length, 250);
      assert.equal(
        catalog.stableTerminal(indiaSelected.frames),
        catalog.stableTerminal(
          indiaTrace.frames
            .slice(92, 100)
            .map((frame) => ({ ...frame, posterior_tail: frame.posterior_tail.slice(190, 250) })),
        ),
      );
      projectionProof.indiaWindow = {
        source: indiaTraceId,
        originalFrames: 100,
        originalDates: 250,
        iterationRange: { start: 92, end: 100 },
        dateRange: { start: 190, end: 250 },
        fullOriginalUnchanged: true,
        verification:
          "runtimecontract independently tested; approved compiled ninthoutput is separately verified below",
      };
    },
  );
  for (const [name, mutate] of [
    ["iteration offset", (p) => (p.iterationRange.start = 91)],
    ["date offset", (p) => (p.dateRange.start = 189)],
    ["original frame count", (p) => (p.originalFrameCount = 99)],
    ["original date count", (p) => (p.originalFullRowCount = 251)],
    ["global frame identity", (p) => (p.selectedFields.frames[0].iteration = 92)],
    ["posterior date count", (p) => p.selectedFields.frames[0].posterior_tail.pop()],
    ["posterior probability", (p) => (p.selectedFields.frames[0].posterior_tail[0][0] = 2)],
    [
      "unknown private frame field",
      (p) => (p.selectedFields.frames[0].account = "ENGINEERING_PRIVACY_SENTINEL"),
    ],
    ["claim promotion", (p) => (p.selectedFields.claims.validated_alpha = true)],
    ["security factor confusion", (p) => (p.selectedFields.provenance.coverage = "SECURITY")],
    ["source market", (p) => (p.selectedFields.ticker = "US-MKT")],
    ["future selected date", (p) => (p.selectedFields.dates_tail[0] = "2099-01-01T00:00:00Z")],
  ])
    await checkAsync(`approved India HMM rejects resealed wrong ${name}`, async () => {
      const value = clone(indiaWindow);
      mutate(value);
      const sealed = await resealProjection(value);
      await assert.rejects(() =>
        reader.verifyDisplayProjection(
          sealed,
          manifest.artifacts[indiaTraceId],
          sealed.projectionDigest,
        ),
      );
    });
  for (const step of [92, 99])
    check(`India global zero-based traceStep${step} maps to exact original frame`, () =>
      assert.equal(reader.projectedTraceFrame(indiaWindow, step).iteration, step + 1),
    );
  for (const step of [91, 100, -1, 92.1, NaN, Infinity, "92"])
    check(`India omitted/invalid traceStep${String(step)} cannot snap`, () =>
      assert.throws(() => reader.projectedTraceFrame(indiaWindow, step)),
    );
  if (generated) {
    await checkAsync(
      "approved ninth output is the exact whole-field8/60 projection with both original axes",
      async () => {
        const p = generated.observatoryWindow;
        assert(p);
        assert.equal(p.source.artifactId, indiaTraceId);
        assert.deepEqual(p.source.entry, manifest.artifacts[indiaTraceId]);
        assert.equal(
          catalog.stableTerminal(p.selectedFields),
          catalog.stableTerminal(indiaSelected),
        );
        assert.equal(p.originalFrameCount, 100);
        assert.equal(p.originalFullRowCount, 250);
        assert.deepEqual(p.iterationRange, { start: 92, end: 100 });
        assert.deepEqual(p.dateRange, { start: 190, end: 250 });
        assert.deepEqual(p.range, p.dateRange);
        const decodedSeed = decode(generated.shards.seed),
          pin = decodedSeed.projectionPins[indiaTraceId + "|observatory-trace-window"];
        assert.equal(pin, p.projectionDigest);
        assert(
          p.limitations.some((text) => text.includes("8 of 100") && text.includes("60 of 250")),
        );
        assert(
          !Object.values(generated.shards).some((shard) =>
            decode(shard).projections.some((item) => item.selector === "observatory-trace-window"),
          ),
          "Ninth window must stay separately lazy rather than duplicate all trace data into a metadata shard",
        );
        projectionProof.indiaWindow.compiledOutputVerified = true;
        projectionProof.indiaWindow.outputSha256 = hash(generated.modules["observatory-window"]);
        projectionProof.indiaWindow.decodedBytes = Buffer.byteLength(
          generated.modules["observatory-window"],
        );
        projectionProof.indiaWindow.gzipBytes = gzipSync(generated.modules["observatory-window"], {
          level: 9,
        }).length;
      },
    );
    await checkAsync(
      "ninth compiled projection loads through its exact seed pin without any original or API fetch",
      async () => {
        const priorFetch = globalThis.fetch;
        let attempts = 0;
        globalThis.fetch = async () => {
          attempts++;
          throw new Error("Compiled display selection cannot fetch an original, manifest or API");
        };
        try {
          const p = await reader.loadDisplayProjection(
            "observatory-trace-window",
            "IN-MKT",
            indiaTraceId,
          );
          assert.equal(
            catalog.stableTerminal(p),
            catalog.stableTerminal(generated.observatoryWindow),
          );
          assert.equal(reader.projectedTraceFrame(p, 92).iteration, 93);
          assert.equal(reader.projectedTraceFrame(p, 99).iteration, 100);
          assert.equal(attempts, 0);
        } finally {
          globalThis.fetch = priorFetch;
        }
      },
    );
    for (const [asset, id] of [
      ["US-MKT", indiaTraceId],
      ["SPY", indiaTraceId],
      ["IN-MKT", "observatory:IN-MKT:signal"],
      ["IN-MKT", "observatory:IN-MKT:neural"],
      ["IN-MKT", "observatory:IN-MKT:h"],
      ["IN-MKT", null],
    ])
      await checkAsync(`trace module exact selection rejects ${asset}/${String(id)}`, async () =>
        assert.rejects(() => reader.loadDisplayProjection("observatory-trace-window", asset, id)),
      );
    await checkAsync(
      "compiled projection pin substitution rejects without inspecting an original",
      async () => {
        const seed = await catalog.loadTerminalSeed(),
          key = indiaTraceId + "|observatory-trace-window",
          original = seed.projectionPins[key],
          priorFetch = globalThis.fetch;
        let attempts = 0;
        globalThis.fetch = async () => {
          attempts++;
          throw new Error("No original fetch is permitted by this corruption case");
        };
        try {
          seed.projectionPins[key] = sampleHash;
          await assert.rejects(() =>
            reader.loadDisplayProjection("observatory-trace-window", "IN-MKT", indiaTraceId),
          );
          assert.equal(attempts, 0);
        } finally {
          seed.projectionPins[key] = original;
          globalThis.fetch = priorFetch;
        }
      },
    );
    await checkAsync(
      "ninth module content corruption and wrong trusted digest reject",
      async () => {
        const p = clone(generated.observatoryWindow);
        p.selectedFields.frames[0].means[0][0] += 1;
        await assert.rejects(() =>
          reader.verifyDisplayProjection(
            p,
            manifest.artifacts[indiaTraceId],
            generated.observatoryWindow.projectionDigest,
          ),
        );
        await assert.rejects(() =>
          reader.verifyDisplayProjection(
            generated.observatoryWindow,
            manifest.artifacts[indiaTraceId],
            sampleHash,
          ),
        );
      },
    );
    for (const [selector, asset, id] of [
      ["market-week-window", "US-MKT", "market:IN-MKT"],
      ["regime-timeline-window", "US-MKT", manifest.routes["/regimes/timeline?asset=IN-MKT"]],
      ["frozen-research-summary", "US-MKT", manifest.routes["/regimes/snapshot?asset=IN-MKT"]],
    ])
      await checkAsync(`explicit ${selector} artifact cannot bypass subject country`, async () =>
        assert.rejects(() => reader.loadDisplayProjection(selector, asset, id)),
      );
  }
  if (generated) {
    const actualShards = Object.values(generated.shards),
      payloads = actualShards.map(decode),
      allEntities = payloads.flatMap((p) => p.entities),
      allEdges = payloads.flatMap((p) => p.edges);
    await checkAsync(
      "all nine real navigation shards merge without duplicate ownership conflicts",
      async () => {
        const loaded = await Promise.all(catalog.SHARD_NAMES.map(catalog.loadTerminalShard)),
          merged = catalog.catalogEntities(loaded);
        assert(merged.length > 0);
        assert.equal(new Set(merged.map((entity) => entity.key)).size, merged.length);
        assert.equal(
          catalog.stableTerminal(catalog.catalogEntities([...loaded].reverse())),
          catalog.stableTerminal(merged),
          "Global catalogue merge must not depend on shard load order",
        );
        projectionProof.globalCatalog = {
          navigationShards: loaded.length,
          mergedEntities: merged.length,
          exactOwnership: true,
          orderIndependent: true,
        };
      },
    );
    check(
      "cross-shard artifact references retain their owning country, publication and evidence clocks",
      () => {
        const byKey = new Map();
        for (let i = 0; i < payloads.length; i++)
          for (const entity of payloads[i].entities) {
            if (entity.type !== "artifact") continue;
            const entry = manifest.artifacts[entity.artifactId];
            assert(entry);
            assert.equal(entity.id, entity.artifactId);
            assert.equal(entity.namespace, entry.kind);
            assert.equal(entity.cutoff, entry.as_of);
            const source = artifact(entity.artifactId);
            if (entry.kind.startsWith("factors-")) {
              assert.equal(entity.market, source.country);
              assert.equal(entity.workspace, "factors");
              assert.equal(entity.view.workspace, "factors");
              assert.equal(entity.view.cutoff, source.evidence_cutoff);
              assert.equal(entity.view.panel, entry.kind.slice(8));
            }
            if (entry.kind.startsWith("regimes-")) {
              assert.equal(entity.workspace, "regimes");
              assert.equal(entity.view.workspace, "regimes");
              assert.equal(entity.view.cutoff, source.as_of);
              if (["US-MKT", "IN-MKT"].includes(source.payload.asset))
                assert.equal(entity.market, source.payload.asset === "IN-MKT" ? "INDIA" : "US");
            }
            if (entry.kind.startsWith("data-organ-")) {
              assert.equal(entity.workspace, "data");
              assert.equal(entity.view.workspace, "data");
              assert.equal(entity.view.panel, entry.kind.slice(11));
              assert.equal(entity.view.dataWindowEnd, undefined);
            }
            const identity = {
              id: entity.id,
              type: entity.type,
              namespace: entity.namespace,
              market: entity.market,
              artifactId: entity.artifactId,
              cutoff: entity.cutoff,
              workspace: entity.workspace,
              view: entity.view,
            };
            const prior = byKey.get(entity.key);
            if (prior)
              assert.equal(
                catalog.stableTerminal(identity),
                catalog.stableTerminal(prior),
                entity.key + " owner differs between reference shard and owning workspace",
              );
            else byKey.set(entity.key, identity);
          }
      },
    );
    await checkAsync(
      "packed metadata expands without dropping any admitted exact field",
      async () => {
        for (const shard of actualShards) {
          const payload = decode(shard),
            packed = catalog.packTerminalPayload(payload);
          assert.equal(
            catalog.stableTerminal(
              catalog.unpackTerminalPayload(
                packed.strings,
                packed.payload,
                packed.structures,
                packed.texts,
              ),
            ),
            catalog.stableTerminal(payload),
          );
        }
      },
    );
    check(
      "catalogue preserves every original AVAILABLE binding and all current/historical aliases",
      () => {
        const bindings = Object.assign({}, ...payloads.map((p) => p.bindings)),
          routes = Object.assign({}, ...payloads.map((p) => p.routes));
        for (const [id, entry] of Object.entries(manifest.artifacts))
          if (entry.status === "AVAILABLE")
            assert.equal(catalog.stableTerminal(bindings[id]), catalog.stableTerminal(entry), id);
        for (const [route, id] of Object.entries(manifest.routes))
          if (manifest.artifacts[id].status === "AVAILABLE") assert.equal(routes[route], id, route);
      },
    );
    check("exact historical Issue and factor choices preserve owning selection and cutoff", () => {
      const choices = allEntities.filter((e) => e.versionChoices);
      assert(choices.some((e) => e.type === "issue"));
      assert(choices.some((e) => e.type === "factor" || e.type === "factor-definition"));
      for (const entity of choices)
        for (const choice of entity.versionChoices) {
          const entry = manifest.artifacts[choice.artifactId];
          const evidenceClock =
            entity.type === "issue" ||
            entity.type === "sweep" ||
            (entry.kind.startsWith("factors-") && entity.type !== "artifact");
          assert.equal(
            choice.cutoff,
            evidenceClock ? artifact(choice.artifactId).evidence_cutoff : entry.as_of,
          );
          assert.equal(choice.view.workspace, entity.workspace);
          serializeInvestigationContext({
            version: 1,
            ...(entity.market ? { market: entity.market } : {}),
            anchor: { artifactId: choice.artifactId },
            view: choice.view,
          });
          if (choice.view.issueId) {
            assert(choice.view.sweepId);
            assert.equal(
              manifest.routes["/risk-manager/state?sweep_id=" + choice.view.sweepId],
              choice.artifactId,
            );
            const state = artifact(choice.artifactId);
            assert(state.payload.issues.some((i) => i.issue_id === choice.view.issueId));
          }
        }
    });
    check("inherited missing IIMA diagnostic remains absent from AVAILABLE entities", () => {
      assert(!allEntities.some((e) => e.id.includes("56f09551")));
      assert(
        !Object.keys(Object.assign({}, ...payloads.map((p) => p.bindings))).some((id) =>
          id.includes("56f09551"),
        ),
      );
    });
    check(
      "all declared edges use complete actual endpoints and fixed selector relation pairs",
      () => {
        const relations = {
          REFERENCED_ARTIFACT: [
            "risk_issue_evidence",
            "factor_original_ref",
            "recorded_task_artifact",
            "frozen_research_summary",
            "referenced_artifact",
          ],
          ISSUE_ORIGIN: ["risk_issue_origin"],
          DECLARED_PRODUCER: ["declared_producer"],
          DECLARED_SOURCE_VERSION: ["declared_source_version"],
          DECLARED_ADMISSION: ["declared_admission"],
          DECLARED_CAPTURE: ["declared_capture"],
          PRESENT_IN: ["present_in"],
        };
        for (const p of payloads) {
          const keys = new Set(p.entities.map((e) => e.key));
          for (const edge of p.edges) {
            assert(keys.has(edge.from));
            assert(keys.has(edge.to));
            assert(relations[edge.relation]?.includes(edge.selector));
            assert(p.bindings[edge.artifactId]);
          }
        }
        assert(allEdges.length > 0);
      },
    );
    const seed = generated.shards.seed,
      seedPayload = decode(seed);
    for (const [name, mutate] of [
      ["unknown private payload field", (p) => (p.account = "ENGINEERING_PRIVACY_SENTINEL")],
      [
        "unknown private view field",
        (p) => (p.entities[0].view.account = "ENGINEERING_PRIVACY_SENTINEL"),
      ],
      ["invented experiment type", (p) => (p.entities[0].type = "unpublished-experiment")],
      ["private namespace", (p) => (p.entities[0].namespace = "private-account")],
      [
        "unknown private bundle",
        (p) => p.bundles.push({ account: "ENGINEERING_PRIVACY_SENTINEL" }),
      ],
      [
        "unknown projection contract",
        (p) =>
          p.projections.push({
            schema_version: "private-account/1",
            token: "ENGINEERING_PRIVACY_SENTINEL",
          }),
      ],
      [
        "invalid projection pin",
        (p) => (p.projectionPins = { account: "ENGINEERING_PRIVACY_SENTINEL" }),
      ],
      [
        "wrong exact version cutoff",
        (p) => {
          const e = p.entities.find((e) => e.artifactId);
          e.versionChoices = [
            { artifactId: e.artifactId, cutoff: "1900-01-01T00:00:00Z", view: e.view },
          ];
        },
      ],
      ["duplicate entity key", (p) => p.entities.push(clone(p.entities[0]))],
      ["unavailable entity", (p) => (p.entities[0].availability = "UNAVAILABLE")],
      [
        "unknown route binding",
        (p) => (p.routes["/data/health"] = "data-organ:health:" + sampleHash),
      ],
      [
        "entity record overflow",
        (p) =>
          (p.entities = Array.from({ length: 513 }, (_, i) => ({
            ...p.entities[0],
            key: "engineering-overflow-" + i,
          }))),
      ],
    ])
      await checkAsync(`resealed shard schema rejects ${name}`, async () => {
        const p = clone(seedPayload);
        mutate(p);
        await assert.rejects(async () =>
          catalog.validateTerminalShard(await repack(seed, p), "seed", seed.manifestBinding),
        );
      });
    const edgeShard = actualShards.find((s) => decode(s).edges.length),
      edgePayload = decode(edgeShard);
    for (const [name, mutate] of [
      ["arbitrary JSON pointer selector", (p) => (p.edges[0].selector = "/payload/private")],
      ["unknown relationship", (p) => (p.edges[0].relation = "AFFECTS_COMPUTATION")],
      ["same-source fabricated relationship", (p) => (p.edges[0].selector = "same_source_name")],
      ["orphan endpoint", (p) => (p.edges[0].to = "unpublished-experiment|unknown")],
    ])
      await checkAsync(`resealed edge schema rejects ${name}`, async () => {
        const p = clone(edgePayload);
        mutate(p);
        await assert.rejects(async () =>
          catalog.validateTerminalShard(
            await repack(edgeShard, p),
            edgeShard.name,
            seed.manifestBinding,
          ),
        );
      });
    await checkAsync("shard integrity rejects modified dictionary without resealing", async () => {
      const value = clone(seed);
      value.strings[0] += "X";
      await assert.rejects(() =>
        catalog.validateTerminalShard(value, "seed", seed.manifestBinding),
      );
    });
    await checkAsync("shards reject a different pinned manifest snapshot", async () => {
      await assert.rejects(() =>
        catalog.validateTerminalShard(seed, "seed", {
          ...seed.manifestBinding,
          sha256: sampleHash,
        }),
      );
    });
    const projections = payloads.flatMap((p) => p.projections);
    for (const projection of projections)
      await checkAsync(
        `actual projection exact pinned binding/digest ${projection.source.artifactId}|${projection.selector}`,
        async () => {
          await reader.verifyDisplayProjection(
            projection,
            manifest.artifacts[projection.source.artifactId],
            projection.projectionDigest,
          );
          const original = artifact(projection.source.artifactId),
            selected = projection.selectedFields;
          assert.equal(projection.range.end, projection.originalFullRowCount);
          if (projection.selector === "market-week-window")
            assert.equal(
              catalog.stableTerminal(selected.weeks),
              catalog.stableTerminal(original.weeks.slice(projection.range.start)),
            );
          if (projection.selector === "frozen-research-summary")
            assert.equal(
              catalog.stableTerminal(selected),
              catalog.stableTerminal(original.payload.frozen_research),
            );
          if (projection.selector === "regime-timeline-window") {
            assert.deepEqual(selected.dates, original.payload.dates.slice(projection.range.start));
            assert.equal(selected.dates.length, 100);
            for (const name of ["hmm2", "hmm4"]) {
              const from = Math.max(0, projection.range.start - original.payload[name].offset);
              assert.deepEqual(
                selected[name].state_codes,
                original.payload[name].state_codes.slice(from),
              );
              assert.deepEqual(
                selected[name].confidence,
                original.payload[name].confidence.slice(from),
              );
              assert.equal(
                selected[name].offset,
                Math.max(0, original.payload[name].offset - projection.range.start),
              );
            }
          }
        },
      );
    const marketProjection = projections.find(
        (p) => p.selector === "market-week-window" && p.selectedFields.ticker === "US-MKT",
      ),
      regimeProjection = projections.find(
        (p) => p.selector === "regime-timeline-window" && p.selectedFields.asset === "IN-MKT",
      );
    for (const [name, base, mutate] of [
      [
        "nontrace iteration axis",
        marketProjection,
        (p) => (p.iterationRange = { account: "ENGINEERING_PRIVACY_SENTINEL" }),
      ],
      [
        "nontrace frame count",
        marketProjection,
        (p) => (p.originalFrameCount = "ENGINEERING_PRIVACY_SENTINEL"),
      ],
      ["nontrace date axis", marketProjection, (p) => (p.dateRange = { start: 190, end: 250 })],
      [
        "private nested Market method",
        marketProjection,
        (p) => (p.selectedFields.method.account = "ENGINEERING_PRIVACY_SENTINEL"),
      ],
      [
        "unknown Market regime structure",
        marketProjection,
        (p) => (p.selectedFields.weeks[0].regime = { token: "ENGINEERING_PRIVACY_SENTINEL" }),
      ],
      [
        "wrong Market factor for exact source",
        marketProjection,
        (p) => (p.selectedFields.ticker = "IN-MKT"),
      ],
      [
        "unknown Regime run selector",
        regimeProjection,
        (p) => (p.selectedFields.run_ids.token = "ENGINEERING_PRIVACY_SENTINEL"),
      ],
      [
        "Regime probability over one",
        regimeProjection,
        (p) => (p.selectedFields.hmm2.confidence[0] = 1.1),
      ],
      [
        "Regime nonexistent state",
        regimeProjection,
        (p) => (p.selectedFields.hmm2.state_codes[0] = 999),
      ],
      [
        "Regime future momentum date",
        regimeProjection,
        (p) => (p.selectedFields.momentum_signal_tail = [["2099-01-01", 999]]),
      ],
      [
        "Regime unverified calendar promotion",
        regimeProjection,
        (p) => (p.selectedFields.observation_unit = "exchange_sessions"),
      ],
      [
        "Regime asset differs from exact India binding",
        regimeProjection,
        (p) => (p.selectedFields.asset = "US-MKT"),
      ],
      [
        "Regime labels private shape",
        regimeProjection,
        (p) => (p.selectedFields.hmm2.labels = { token: "ENGINEERING_PRIVACY_SENTINEL" }),
      ],
    ])
      await checkAsync(`resealed projection schema rejects ${name}`, async () => {
        assert(base);
        const value = clone(base);
        mutate(value);
        const sealed = await resealProjection(value);
        await assert.rejects(() =>
          reader.verifyDisplayProjection(sealed, sealed.source.entry, sealed.projectionDigest),
        );
      });
    await checkAsync(
      "projection byte corruption rejects the unchanged compiled digest pin",
      async () => {
        const p = clone(marketProjection);
        p.selectedFields.weeks[0].relative_performance += 1;
        await assert.rejects(() =>
          reader.verifyDisplayProjection(p, p.source.entry, p.projectionDigest),
        );
      },
    );
    await checkAsync(
      "projection cannot substitute original entry against exact pinned binding",
      async () => {
        const p = clone(marketProjection);
        p.source.entry = manifest.artifacts["market:IN-MKT"];
        await assert.rejects(() =>
          reader.verifyDisplayProjection(
            p,
            manifest.artifacts["market:US-MKT"],
            p.projectionDigest,
          ),
        );
      },
    );
    await checkAsync(
      "declared traversal rejects bound widening and explicit cancellation",
      async () => {
        for (const options of [
          { depth: 5 },
          { nodes: 257 },
          { edges: 513 },
          { bytes: 512 * 1024 + 1 },
        ])
          await assert.rejects(() =>
            catalog.traverseDeclared("engineering-invalid", ["seed"], options),
          );
        await assert.rejects(() =>
          catalog.traverseDeclared(seedPayload.entities[0].key, ["seed"], {
            signal: AbortSignal.abort(),
          }),
        );
      },
    );
    await checkAsync(
      "bound original reader verifies actual selected bytes and omits credentials",
      async () => {
        const id = manifest.routes["/data/issues"],
          entry = manifest.artifacts[id],
          raw = readArtifactBytes(id, entry),
          priorFetch = globalThis.fetch,
          requests = [];
        globalThis.fetch = async (url, options) => {
          requests.push({ url, credentials: options?.credentials });
          assert.equal(url, entry.url);
          assert.equal(options?.credentials, "omit");
          assert(!options?.method || options.method === "GET");
          return new Response(raw, { status: 200 });
        };
        try {
          const actual = await reader.readBoundArtifact(id);
          assert.equal(catalog.stableTerminal(actual), catalog.stableTerminal(artifact(id)));
          assert.equal(requests.length, 1);
        } finally {
          globalThis.fetch = priorFetch;
        }
        projectionProof.originalReaderUnitTraffic = {
          provenance:
            "actual retained byte response; engineering unit transport, no browser availability claim",
          requests,
        };
      },
    );
    await checkAsync(
      "bound original reader rejects checksum corruption and excess response bytes",
      async () => {
        const id = manifest.routes["/data/issues"],
          entry = manifest.artifacts[id],
          raw = readArtifactBytes(id, entry),
          priorFetch = globalThis.fetch;
        try {
          const corrupt = Buffer.from(raw);
          corrupt[corrupt.length - 2] ^= 1;
          globalThis.fetch = async () => new Response(corrupt, { status: 200 });
          await assert.rejects(() => reader.readBoundArtifact(id));
          globalThis.fetch = async () =>
            new Response(Buffer.alloc(2 * 1024 * 1024 + 1), { status: 200 });
          await assert.rejects(() => reader.readBoundArtifact(id));
        } finally {
          globalThis.fetch = priorFetch;
        }
      },
    );
    await checkAsync(
      "bound original reader rejects caller substitution and oversized India original before fetch",
      async () => {
        const priorFetch = globalThis.fetch;
        let attempted = 0;
        globalThis.fetch = async () => {
          attempted++;
          throw new Error("No original fetch authorized by this negative unit case");
        };
        try {
          const id = manifest.routes["/data/issues"],
            entry = manifest.artifacts[id];
          await assert.rejects(() =>
            reader.readBoundArtifact(id, { binding: { ...entry, as_of: "2099-01-01T00:00:00Z" } }),
          );
          assert(manifest.artifacts["observatory:IN-MKT:hmm"].bytes > 2 * 1024 * 1024);
          await assert.rejects(() => reader.readBoundArtifact("observatory:IN-MKT:hmm"));
          assert.equal(attempted, 0);
        } finally {
          globalThis.fetch = priorFetch;
        }
      },
    );
    await checkAsync(
      "actual declared graph fails visibly when depth frontier leaves an unvisited neighbor",
      async () => {
        const shard = actualShards.find((s) => s.name === "risk"),
          payload = decode(shard);
        assert(payload.edges.length);
        await assert.rejects(
          () => catalog.traverseDeclared(payload.edges[0].from, ["risk"], { depth: 0 }),
          /depth/i,
        );
      },
    );
    await checkAsync(
      "completed real inverse adjacency does not falsely overflow on visited backedges",
      async () => {
        const payload = decode(generated.shards.risk),
          adj = new Map(payload.entities.map((e) => [e.key, new Set()]));
        for (const edge of payload.edges) {
          adj.get(edge.from).add(edge.to);
          adj.get(edge.to).add(edge.from);
        }
        let complete;
        for (const [start, neighbors] of adj) {
          if (!neighbors.size) continue;
          const nodes = new Set([start, ...neighbors]);
          if ([...neighbors].every((key) => [...adj.get(key)].every((next) => nodes.has(next)))) {
            complete = { start, nodes };
            break;
          }
        }
        assert(complete, "Require an actual closed radius1 component, not an invented dependency");
        const result = await catalog.traverseDeclared(complete.start, ["risk"], { depth: 1 });
        assert.deepEqual(result.nodes, [...complete.nodes].sort());
        assert(result.edges.length > 0);
        projectionProof.traversalActualBoundary = {
          depth0Rejects: true,
          completedRadius1Nodes: result.nodes.length,
          completedRadius1Edges: result.edges.length,
        };
      },
    );
    await checkAsync(
      "generic terminal World original inspection is unsupported before artifact fetch",
      async () => {
        const priorFetch = globalThis.fetch;
        let attempts = 0;
        globalThis.fetch = async () => {
          attempts++;
          throw new Error("No World artifact fetch is authorized by this negative unit case");
        };
        try {
          for (const id of ["world:quakes", "world:satellites"]) {
            assert.equal(manifest.artifacts[id].status, "AVAILABLE");
            await assert.rejects(
              () => reader.readBoundArtifact(id),
              /unsupported|declared|World|kind/i,
            );
          }
          assert.equal(attempts, 0);
        } finally {
          globalThis.fetch = priorFetch;
        }
      },
    );
    await checkAsync(
      "generic terminal World full validator rejects malformed payloads",
      async () => {
        for (const id of ["world:quakes", "world:satellites"]) {
          const value = artifact(id);
          value.payload = { account: "ENGINEERING_PRIVACY_SENTINEL" };
          await assert.rejects(() =>
            reader.validateFullOriginal(id, manifest.artifacts[id], value),
          );
        }
      },
    );
    if (failures.length === stageFailureStart) {
      completedAreas.add("projections");
      completedAreas.add("index");
    }
  }
}

const navigationProof = {
  provenance: "ENGINEERING_QA_ACTUAL_RETAINED_CATALOG_AND_PURE_NAVIGATION_ONLY",
};
if ((!coreOnly && !projectionsOnly) || navigationOnly) {
  const search = await import("../src/app/terminal/search.ts"),
    commands = await import("../src/app/terminal/commands.ts"),
    capabilities = await import("../src/app/terminal/capabilities.ts"),
    catalog = await import("../src/app/terminal/catalog.ts"),
    reader = await import("../src/app/terminal/reader.ts"),
    legacy = await import("../src/app/command/mnemonics.ts");
  let data, shards;
  await checkAsync("navigation service composes all real validated shards", async () => {
    shards = await Promise.all(catalog.SHARD_NAMES.map(catalog.loadTerminalShard));
    data = {
      entities: catalog.catalogEntities(shards),
      bindings: Object.assign({}, ...shards.map((s) => s.bindings)),
      routes: Object.assign({}, ...shards.map((s) => s.routes)),
      projectionPins: Object.assign({}, ...shards.map((s) => s.projectionPins)),
    };
    assert(data.entities.length > 1000);
    assert.equal(Object.keys(data.bindings).length, CURRENT_AVAILABLE_BINDINGS);
    navigationProof.entities = data.entities.length;
    navigationProof.bindings = CURRENT_AVAILABLE_BINDINGS;
  });
  if (data) {
    const clone = (value) => structuredClone(value),
      ctx = parseInvestigationContext("risk", ""),
      history = { ...data, scope: "history", limit: 50 };
    let failureStart = failures.length;
    check(
      "search full ID outranks mnemonic, label prefix, token prefix and substring classes",
      () => {
        assert.equal(search.searchLoaded(observationIssue, ctx, history).results[0].rank, 0);
        assert.equal(search.searchLoaded("IN-MKT", ctx, history).results[0].rank, 1);
        for (const [query, rank] of [
          ["regim", 2],
          ["metadata", 3],
          ["tain", 4],
        ])
          assert(
            search.searchLoaded(query, ctx, history).results.some((result) => result.rank === rank),
          );
      },
    );
    for (const market of ["US", "INDIA"]) {
      check(
        `current search preserves admitted ${market} aggregate identity from a listing context`,
        () => {
          const id = market === "INDIA" ? "IN-MKT" : "US-MKT";
          const listingContext = {
            ...clone(originContext),
            market: "INDIA",
            subject: { kind: "reference-listing", providerSymbol: "RELIANCE.NS", venue: "IS" },
            anchor: undefined,
            compare: undefined,
            view: { workspace: "market" },
          };
          for (const source of [ctx, listingContext]) {
            const response = search.searchLoaded(id, source, {
              ...data,
              scope: "current",
              limit: 20,
            });
            assert.equal(response.results[0]?.id, id);
            const result = response.results.find(
              (item) => item.id === id && item.type === "market-factor",
            );
            assert(
              result?.target,
              "An admitted exact aggregate cannot be hidden by unrelated current aliases",
            );
            assert.equal(result.capability.label, "PUBLIC_REPLAY");
            assert.equal(result.target.context.subject.id, id);
            assert.equal(result.target.context.market, market);
            assert.equal(result.target.context.anchor.artifactId, "market:" + id);
            assert.deepEqual(result.target.context.origin, source.origin);
          }
        },
      );
    }

    for (const market of ["US", "INDIA"]) {
      for (const [field, patch] of [
        [
          "scope",
          (entry) => {
            entry.scope = "PRIVATE";
          },
        ],
        [
          "source",
          (entry) => {
            entry.sources = [market === "US" ? "IIMA" : "KENNETH_FRENCH"];
          },
        ],
        [
          "kind",
          (entry) => {
            entry.kind = "regimes-snapshot";
          },
        ],
        [
          "licence",
          (entry) => {
            entry.licence.status = "WITHDRAWN";
          },
        ],
        [
          "url",
          (entry) => {
            entry.url = "/artifacts/replay/unbound-market-revision.json";
          },
        ],
        [
          "as_of",
          (entry) => {
            entry.as_of = "2026-10-08T04:10:01Z";
          },
        ],
      ]) {
        check(`current ${market} aggregate exception rejects wrong ${field}`, () => {
          const id = market === "INDIA" ? "IN-MKT" : "US-MKT";
          const bindings = clone(data.bindings);
          patch(bindings["market:" + id]);
          const result = search
            .searchLoaded(id, ctx, { ...data, bindings, scope: "current" })
            .results.find((item) => item.type === "market-factor" && item.id === id);
          assert.equal(result, undefined);
        });
      }
    }

    for (const market of ["US", "INDIA"]) {
      check(`current ${market} aggregate exception rejects wrong country metadata`, () => {
        const id = market === "INDIA" ? "IN-MKT" : "US-MKT";
        const entities = clone(data.entities);
        entities.find((item) => item.type === "market-factor" && item.id === id).market =
          market === "US" ? "INDIA" : "US";
        const result = search
          .searchLoaded(id, ctx, { ...data, entities, scope: "current" })
          .results.find((item) => item.type === "market-factor" && item.id === id);
        assert.equal(result, undefined);
      });
    }

    check("loaded search ordering is independent of catalogue load order", () => {
      assert.equal(
        catalog.stableTerminal(search.searchLoaded("factor", ctx, history)),
        catalog.stableTerminal(
          search.searchLoaded("factor", ctx, {
            ...history,
            entities: [...data.entities].reverse(),
          }),
        ),
      );
    });
    check("historical Factor semantic identity keeps three country-correct exact choices", () => {
      const r = search.searchLoaded("india:mom", ctx, history).results;
      assert.equal(r.length, 1);
      assert.equal(r[0].market, "INDIA");
      assert.equal(r[0].choices.length, 3);
      assert(r[0].requiresChoice);
      assert.equal(r[0].target, undefined);
      for (const choice of r[0].choices) {
        const source = artifact(choice.artifactId);
        assert.equal(source.country, "INDIA");
        assert.equal(choice.cutoff, source.evidence_cutoff);
        assert.equal(choice.target.context.market, "INDIA");
        assert.equal(choice.target.context.anchor.artifactId, choice.artifactId);
      }
    });
    check(
      "current Issue search excludes old sweep aliases and preserves an explicitly pinned old state",
      () => {
        const entity = data.entities.find(
          (e) =>
            e.type === "issue" &&
            e.versionChoices?.length > 1 &&
            artifact(currentStateId).payload.issues.some((i) => i.issue_id === e.id),
        );
        assert(entity);
        const current = search
          .searchLoaded(entity.id, ctx, { ...data, scope: "current" })
          .results.find((r) => r.type === "issue");
        assert(current);
        assert.equal(current.choices.length, 1);
        assert.equal(current.target.context.anchor.artifactId, currentStateId);
        const old = entity.versionChoices.find((c) => c.artifactId !== currentStateId);
        assert(old);
        const pinned = parseInvestigationContext(
          "risk",
          qs({ ctx: "1", artifact: old.artifactId, sweep: old.view.sweepId, issue: entity.id }),
        );
        const r = search
          .searchLoaded(entity.id, pinned, { ...data, scope: "current" })
          .results.find((r) => r.type === "issue");
        assert.equal(r.target.context.anchor.artifactId, old.artifactId);
        assert.equal(r.target.context.view.sweepId, old.view.sweepId);
      },
    );
    check(
      "search target memo cannot freeze caller context or retain a changed complete origin",
      () => {
        const mutable = clone(originContext);
        const select = () =>
          search
            .searchLoaded("IN-MKT", mutable, history)
            .results.find((result) => result.type === "market-factor").target;
        const first = select();
        assert(first);
        assert.equal(Object.isFrozen(mutable), false);
        assert.equal(Object.isFrozen(mutable.origin), false);
        assert.equal(Object.isFrozen(first), true);
        assert.equal(Object.isFrozen(first.context.origin), true);
        assert.throws(() => {
          first.context.market = "US";
        });
        const changed = "risk-issue:" + "b".repeat(64);
        mutable.origin.issueId = changed;
        const next = select();
        assert.equal(next.context.origin.issueId, changed);
        assert.notEqual(next, first);
        assert.equal(first.context.origin.issueId, sourceOrigin.issueId);
        assert.equal(Object.isFrozen(mutable.origin), false);
      },
    );
    check("search cached navigation never bypasses current binding status or licence", () => {
      const selected = data.entities.find(
        (entity) => entity.type === "recorded-trace" && entity.id === "observatory:US-MKT:hmm",
      );
      assert(selected);
      const bindings = clone(data.bindings);
      const options = { ...history, bindings };
      const query = () =>
        search
          .searchLoaded(selected.id, originContext, options)
          .results.find((result) => result.id === selected.id);
      assert(query().target);
      const admitted = clone(bindings[selected.artifactId]);
      bindings[selected.artifactId].status = "UNAVAILABLE";
      assert.equal(query(), undefined);
      bindings[selected.artifactId] = {
        ...admitted,
        licence: { ...admitted.licence, status: "UNKNOWN" },
      };
      assert.equal(query(), undefined);
      bindings[selected.artifactId] = admitted;
      assert(query().target);
    });

    check("reference listings do not become quote or recording availability", () => {
      const r = search
        .searchLoaded("SPY", ctx, history)
        .results.find((x) => x.type === "reference-listing");
      assert(r);
      assert.equal(r.availability, "REFERENCE");
      assert.equal(r.target.context.subject.kind, "reference-listing");
      assert(/identity|reference/i.test(r.capability.reason));
      assert.equal(search.searchLoaded("observatory:SPY:hmm", ctx, history).results.length, 0);
      assert.equal(
        search.searchLoaded("observatory:IN-MKT:neural", ctx, history).results.length,
        0,
      );
    });
    check("search unavailable command stays disabled with a reason", () => {
      const r = search.searchLoaded("EXECUTION", ctx, history).results[0];
      assert.equal(r.availability, "DISABLED");
      assert.equal(r.target, undefined);
      assert.equal(r.capability.enabled, false);
      assert(r.capability.disabledReason);
    });
    for (const query of [null, 1, [], {}, "x".repeat(161), "a\u0000b", "\ud800", "\ufffd"])
      check(`search rejects invalid raw query ${JSON.stringify(query)}`, () =>
        assert.throws(() => search.searchLoaded(query, ctx, data)),
      );
    for (const options of [
      { limit: 0 },
      { limit: 51 },
      { limit: 1.5 },
      { scope: "private" },
      { entities: Array(4097).fill(data.entities[0]) },
    ])
      check("search rejects review-bound widening " + JSON.stringify(Object.keys(options)), () =>
        assert.throws(() => search.searchLoaded("factor", ctx, { ...data, ...options })),
      );
    check("private input text and unknown injected kinds cannot expose an index result", () => {
      assert.equal(search.searchLoaded("ENGINEERING_PRIVATE_BOOK_TOKEN", ctx, history).total, 0);
      const e = {
        ...data.entities[0],
        type: "private-account",
        namespace: "private",
        label: "ENGINEERING_PRIVATE_BOOK_TOKEN",
      };
      assert.equal(
        search.searchLoaded("ENGINEERING_PRIVATE_BOOK_TOKEN", ctx, { ...data, entities: [e] })
          .total,
        0,
      );
    });
    await checkAsync(
      "async search loads only seed until explicit nonempty/workspace search",
      async () => {
        const calls = [],
          service = search.createTerminalSearchService({
            loadShard: async (name) => {
              calls.push(name);
              return shards.find((s) => s.name === name);
            },
          });
        await service.search("", ctx);
        assert.deepEqual(calls, ["seed"]);
        await service.search(observationIssue, ctx, { workspaces: ["risk"] });
        assert.deepEqual(calls, ["seed", "risk"]);
        assert(service.loadedEntities().some((e) => e.type === "issue"));
      },
    );

    await checkAsync(
      "current-only search never requests archive and explicit retained scope loads exactly the approved archive",
      async () => {
        const calls = [];
        const service = search.createTerminalSearchService({
          loadShard: async (name) => {
            calls.push(name);
            const shard = shards.find((value) => value.name === name);
            assert(shard);
            return shard;
          },
        });
        await service.search("IN-MKT", ctx);
        assert(!calls.includes("history-archive"));
        await service.search("india:mom", ctx, { history: true });
        assert.equal(calls.filter((name) => name === "history-archive").length, 1);
        assert(calls.includes("history"));
        const before = calls.length;
        await service.search("IN-MKT", ctx, { history: false });
        assert.equal(
          calls.length,
          before,
          "A loaded archive may remain cached but no new archive read is triggered by current search",
        );
        const result = await service.search("india:mom", ctx, { history: true });
        assert.equal(result.scope, "history");
        assert(result.results.some((value) => value.id === "india:mom"));
        navigationProof.historyLoader = {
          calls,
          currentOnlyArchiveRequests: 0,
          explicitHistoryArchiveRequests: 1,
        };
      },
    );
    await checkAsync(
      "exact historical binding fallback requests archive only after exact family/current-navigation miss",
      async () => {
        const source = readFileSync(path.join(frontend, "src/app/terminal/catalog.ts"), "utf8");
        const tree = ts.createSourceFile(
          "catalog.ts",
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        );
        const declaration = tree.statements.find(
          (node) => ts.isFunctionDeclaration(node) && node.name?.text === "findArtifactBinding",
        );
        assert(declaration);
        const emitted = ts.transpileModule(declaration.getText(tree), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const requests = [];
        const byName = new Map(shards.map((shard) => [shard.name, shard]));
        const module = await import(
          "data:text/javascript;base64," +
            Buffer.from(
              "const loadTerminalShard=(...args)=>globalThis.__terminalEngineeringShardLoad(...args); const isArtifactId=(value)=>globalThis.__terminalEngineeringIsArtifactId(value);\n" +
                emitted,
            ).toString("base64")
        );
        const oldLoad = globalThis.__terminalEngineeringShardLoad,
          oldId = globalThis.__terminalEngineeringIsArtifactId;
        globalThis.__terminalEngineeringShardLoad = async (name) => {
          requests.push(name);
          assert(byName.has(name));
          return byName.get(name);
        };
        globalThis.__terminalEngineeringIsArtifactId = isArtifactId;
        try {
          const currentId = manifest.routes["/risk-manager/state"];
          assert.equal(
            await module.findArtifactBinding(currentId),
            byName.get("risk").bindings[currentId],
          );
          assert.deepEqual(requests.splice(0), ["risk"]);
          const archived = Object.keys(byName.get("history-archive").bindings).find(
            (id) =>
              !byName.get("recordings").bindings[id] &&
              !byName.get("history").bindings[id] &&
              !/^(?:risk|regimes|factors|market|data-organ):/.test(id),
          );
          assert(archived, "Use an actual exact retained archive binding");
          assert.equal(
            await module.findArtifactBinding(archived),
            byName.get("history-archive").bindings[archived],
          );
          assert.deepEqual(requests.splice(0), ["recordings", "history", "history-archive"]);
          await assert.rejects(() => module.findArtifactBinding("data-organ:issues:" + sampleHash));
          assert(requests.includes("history-archive"));
        } finally {
          globalThis.__terminalEngineeringShardLoad = oldLoad;
          globalThis.__terminalEngineeringIsArtifactId = oldId;
        }
      },
    );

    await checkAsync("superseded and explicitly cancelled searches reject AbortError", async () => {
      for (const cancel of ["newer", "cancel", "signal"]) {
        let release;
        const blocked = new Promise((resolve) => {
          release = resolve;
        });
        const service = search.createTerminalSearchService({
            loadShard: async (name) =>
              name === "risk" ? blocked : shards.find((s) => s.name === name),
          }),
          controller = new AbortController();
        const pending = service
          .search(observationIssue, ctx, { workspaces: ["risk"], signal: controller.signal })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
        if (cancel === "newer") await service.search("IN-MKT", ctx, { workspaces: [] });
        if (cancel === "cancel") service.cancel();
        if (cancel === "signal") controller.abort();
        release(shards.find((s) => s.name === "risk"));
        const result = await pending;
        assert.equal(result.error?.name, "AbortError");
      }
    });
    await checkAsync(
      "pre-aborted search and unknown workspace cannot select arbitrary loaders",
      async () => {
        let calls = 0;
        const service = search.createTerminalSearchService({
          loadShard: async (name) => {
            calls++;
            return shards.find((s) => s.name === name);
          },
        });
        await assert.rejects(() => service.search("x", ctx, { signal: AbortSignal.abort() }), {
          name: "AbortError",
        });
        assert.equal(calls, 0);
        await assert.rejects(() => service.load(["https://provider.invalid/private"]));
      },
    );
    check("loaded real search p95 stays within30ms across sixty varied queries", () => {
      const queries = [
        observationIssue,
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
      for (const q of queries) search.searchLoaded(q, originContext, { ...data, scope: "history" });
      const times = [];
      for (let i = 0; i < 60; i++) {
        const start = performance.now();
        search.searchLoaded(queries[i % queries.length], originContext, {
          ...data,
          scope: "history",
        });
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(times.length * 0.95) - 1];
      navigationProof.searchPerformance = {
        samples: 60,
        p95_ms: p95,
        limit_ms: 30,
        entities: data.entities.length,
        queries,
        environment: { node: process.version, platform: process.platform, arch: process.arch },
      };
      assert(p95 <= 30, `Loadedsearch p95 ${p95}ms exceeds30ms`);
    });
    if (failures.length === failureStart) completedAreas.add("search");
    failureStart = failures.length;
    const commandOptions = { ...data, legacyParser: legacy.parseCommand };
    for (const country of ["US", "INDIA"])
      for (const suffix of ["", " GO", " <GO>"])
        check(`country Regime grammar ${country}${suffix}`, () => {
          const r = commands.resolveTerminalCommand(country + " REG" + suffix, ctx, commandOptions);
          assert.equal(r.status, "READY");
          assert.equal(r.target.workspace, "regimes");
          assert.equal(r.target.context.market, country);
          assert.equal(r.target.context.subject.id, country === "US" ? "US-MKT" : "IN-MKT");
        });
    for (const filter of ["HIGH", "MEDIUM", "LOW", "MODEL", "DATA", "SYSTEM"])
      check("Risk filter grammar " + filter, () => {
        const r = commands.resolveTerminalCommand("RISK " + filter, ctx, commandOptions);
        assert.equal(r.status, "READY");
        assert.equal(r.target.workspace, "risk");
        assert.equal(
          r.target.context.view[
            ["HIGH", "MEDIUM", "LOW"].includes(filter) ? "severity" : "category"
          ],
          filter,
        );
      });
    check("Data exact source and unique alias resolve the same current publication", () => {
      const a = commands.resolveTerminalCommand("DATA IIMA", ctx, commandOptions),
        b = commands.resolveTerminalCommand("DATA iima:daily-factors GO", ctx, commandOptions);
      assert.equal(a.status, "READY");
      assert.equal(b.status, "READY");
      assert.equal(targetHref(a.target), targetHref(b.target));
      assert.equal(a.target.context.view.sourceId, "iima:daily-factors");
      assert.equal(a.target.context.anchor.artifactId, data.routes["/data/coverage"]);
    });
    for (const country of ["US", "INDIA"])
      check("country-qualified Factor grammar " + country, () => {
        const r = commands.resolveTerminalCommand(
          `FACTOR ${country.toLowerCase()}:mom ${country}`,
          ctx,
          commandOptions,
        );
        assert.equal(r.status, "READY");
        assert.equal(r.target.workspace, "factors");
        assert.equal(r.target.context.market, country);
        assert.equal(r.target.context.view.factorId, country.toLowerCase() + ":mom");
        const value = artifact(r.target.context.anchor.artifactId);
        assert.equal(r.target.context.view.cutoff, value.evidence_cutoff);
      });
    check("exact Issue command picks current or explicitly pinned actual owning sweep", () => {
      const e = data.entities.find(
        (e) =>
          e.type === "issue" &&
          e.versionChoices?.length > 1 &&
          artifact(currentStateId).payload.issues.some((i) => i.issue_id === e.id),
      );
      const a = commands.resolveTerminalCommand("ISSUE " + e.id, ctx, commandOptions);
      assert.equal(a.status, "READY");
      assert.equal(a.target.context.anchor.artifactId, currentStateId);
      const old = e.versionChoices.find((v) => v.artifactId !== currentStateId),
        pinned = parseInvestigationContext(
          "risk",
          qs({ artifact: old.artifactId, sweep: old.view.sweepId, issue: e.id }),
        );
      const b = commands.resolveTerminalCommand("ISSUE " + e.id, pinned, commandOptions);
      assert.equal(b.status, "READY");
      assert.equal(b.target.context.anchor.artifactId, old.artifactId);
      assert.equal(b.target.context.view.sweepId, old.view.sweepId);
    });
    for (const [namespace, type] of [
      ["regime", "model-run"],
      ["agent", "recorded-agent-run"],
    ])
      check("namespaced run grammar " + namespace, () => {
        const e = data.entities.find(
          (e) =>
            e.type === type &&
            (namespace === "agent" ? e.namespace === "agent" : e.namespace === "regime"),
        );
        assert(e);
        const r = commands.resolveTerminalCommand(`RUN ${namespace}:${e.id}`, ctx, commandOptions);
        assert(["READY", "CHOOSE"].includes(r.status));
        if (r.status === "READY") {
          assert.equal(r.target.context.view.runId, e.id);
          assert.equal(r.target.workspace, namespace === "agent" ? "agents" : "regimes");
          if (namespace === "agent") assert.equal(r.target.to, "/runs/" + e.id);
        } else assert(r.choices.length > 1);
        const wrong = commands.resolveTerminalCommand(
          `RUN ${namespace === "agent" ? "regime" : "agent"}:${e.id}`,
          ctx,
          commandOptions,
        );
        assert.equal(wrong.status, "REJECTED");
      });
    check("CHANGES requires exact verified compatible anchors and country", () => {
      assert.equal(
        commands.resolveTerminalCommand("CHANGES INDIA", ctx, commandOptions).status,
        "CHOOSE",
      );
      const prior = currentState.payload.prior_state_ref;
      assert(prior);
      const compare = parseInvestigationContext(
        "risk",
        qs({ market: "INDIA", artifact: currentStateId, compare: prior }),
      );
      const verified = (a, b, w) =>
        a === currentStateId &&
        b === prior &&
        w === "risk" &&
        currentState.payload.policy.sha256 === artifact(prior).payload.policy.sha256;
      const r = commands.resolveTerminalCommand("CHANGES INDIA", compare, {
        ...commandOptions,
        comparisonCompatible: verified,
      });
      assert.equal(r.status, "READY");
      assert.equal(r.target.context.view.panel, "changes");
      assert.equal(r.target.context.compare.artifactId, prior);
      assert.equal(
        commands.resolveTerminalCommand("CHANGES US", compare, {
          ...commandOptions,
          comparisonCompatible: verified,
        }).status,
        "CHOOSE",
      );
      assert.equal(
        commands.resolveTerminalCommand("CHANGES INDIA", compare, {
          ...commandOptions,
          comparisonCompatible: () => "yes",
        }).status,
        "CHOOSE",
      );
    });
    check("COMPARE opens only the admitted matrix with an explicit publication grant", () => {
      const r = commands.resolveTerminalCommand("COMPARE US INDIA REG", ctx, commandOptions);
      assert.equal(r.status, "READY");
      assert.equal(r.target.context.anchor.artifactId, data.routes["/regimes/matrix"]);
      assert.equal(r.target.context.view.mode, "compare");
      const id = data.routes["/regimes/matrix"],
        bad = {
          ...data.bindings,
          [id]: {
            ...data.bindings[id],
            licence: { ...data.bindings[id].licence, permitted_uses: [] },
          },
        };
      assert.notEqual(
        commands.resolveTerminalCommand("COMPARE US INDIA REG", ctx, {
          ...commandOptions,
          bindings: bad,
        }).status,
        "READY",
      );
    });
    for (const text of ["RELIANCE IN DES", "SPY US GP", "IN-MKT GP", "AAPL US OMON", "AAPL US FA"])
      check("preserved legacy navigation " + text, () => {
        const r = commands.resolveTerminalCommand(text, ctx, commandOptions);
        assert(["READY", "LEGACY_READY"].includes(r.status));
        if (r.status === "LEGACY_READY") {
          assert.equal(r.capability.label, "LOCAL_LIVE_ONLY");
          assert.equal(r.capability.enabled, false);
          assert(r.navigation.to.startsWith("/markets/"));
        } else targetHref(r.target);
      });
    for (const text of ["RELIANCE IN DES", "SPY OMON", "SPY FA", "SPY RISK", "RELIANCE IN DATA"]) {
      check("explicit listing command preserves complete starting Issue origin " + text, () => {
        const starting = { ...clone(originContext), compare: { artifactId: previousStateId } };
        const result = commands.resolveTerminalCommand(text, starting, commandOptions);
        assert(["READY", "LEGACY_READY"].includes(result.status));
        const targetContext =
          result.status === "READY" ? result.target.context : result.navigation.context;
        assert.deepEqual(targetContext.origin, sourceOrigin);
        assert.equal(targetContext.anchor, undefined);
        assert.equal(targetContext.compare, undefined);
        assert.equal(targetContext.subject.kind, "reference-listing");
        assert.notEqual(
          targetContext.origin,
          starting.origin,
          "The parsed origin must be an independent tuple",
        );
        assert.deepEqual(
          parseInvestigationContext(
            targetContext.view.workspace,
            serializeInvestigationContext(targetContext),
          ).origin,
          sourceOrigin,
        );
      });
    }

    check(
      "aggregate Observatory resolves exact India while security gets an honest coverage chooser",
      () => {
        const a = commands.resolveTerminalCommand("IN-MKT OBS", ctx, commandOptions);
        assert.equal(a.status, "READY");
        assert.equal(a.target.context.anchor.artifactId, "observatory:IN-MKT:hmm");
        const b = commands.resolveTerminalCommand("SPY OBS", ctx, commandOptions);
        assert.equal(b.status, "CHOOSE");
        assert(b.choices.length);
        assert(
          b.choices.every(
            (c) =>
              c.target?.context.anchor?.artifactId?.startsWith("observatory:") &&
              !c.target.context.anchor.artifactId.includes(":SPY:"),
          ),
        );
      },
    );
    const rejected = [
      "",
      "FACTOR AAPL US",
      "FACTOR us:mom INDIA",
      "FACTOR india:mom",
      "DATA UNKNOWN_PROVIDER",
      "DATA http://backend.invalid/private",
      "ISSUE risk-issue:" + sampleHash.slice(0, 16),
      "ISSUE risk-issue:" + sampleHash,
      "RUN plugin:" + sampleHash,
      "RUN regime:" + sampleHash,
      "RUN agent:abc",
      "RISK CRITICAL",
      "COMPARE INDIA US FACTOR",
      "US REG GO GO",
      "US GO REG",
      "AAPL US UNKNOWN",
      "x".repeat(161),
      "DATA\u0000IIMA",
    ];
    for (const text of rejected)
      check("command rejection " + JSON.stringify(text), () => {
        const r = commands.resolveTerminalCommand(text, ctx, commandOptions);
        assert.equal(r.status, "REJECTED");
        assert(r.reason);
        assert(r.correction);
        assert.equal(r.target, undefined);
      });
    for (const verb of [
      "BUY",
      "SELL",
      "TRADE",
      "ORDER",
      "EXECUTE",
      "TRAIN",
      "FIT",
      "REFRESH",
      "CAPTURE",
      "DEPLOY",
    ])
      check("execution verb never dispatches legacy parser " + verb, () => {
        let calls = 0;
        const r = commands.resolveTerminalCommand(verb + " AAPL", ctx, {
          ...commandOptions,
          legacyParser: () => {
            calls++;
            throw new Error("No execution dispatch is authorized");
          },
        });
        assert.equal(r.status, "REJECTED");
        assert.equal(calls, 0);
      });
    check("private context injection cannot survive a command target", () => {
      const r = commands.resolveTerminalCommand(
        "INDIA REG",
        { ...ctx, account: "ENGINEERING_PRIVATE_SENTINEL" },
        commandOptions,
      );
      assert.equal(r.status, "REJECTED");
      assert(!JSON.stringify(r).includes("ENGINEERING_PRIVATE_SENTINEL"));
    });
    if (failures.length === failureStart) completedAreas.add("commands");
    failureStart = failures.length;
    check("capability registry preserves five labels and all six false claims", () => {
      assert(Object.isFrozen(capabilities.SCIENTIFIC_CLAIMS));
      assert.equal(Object.keys(capabilities.SCIENTIFIC_CLAIMS).length, 6);
      assert(Object.values(capabilities.SCIENTIFIC_CLAIMS).every((v) => v === false));
      assert.throws(() => capabilities.capabilityFor({ feature: "unreviewed-business-operation" }));
    });
    check("Phase5 six-component truth remains country-specific and explicitly partial", () => {
      const actual = Object.fromEntries(
        capabilities.PHASE5_COMPONENTS.map((c) => [c.id, c.status]),
      );
      assert.deepEqual(actual, {
        volatility: { US: "AVAILABLE", INDIA: "PARTIAL" },
        seasonality: { US: "UNAVAILABLE", INDIA: "UNAVAILABLE" },
        neutrality: { US: "PARTIAL", INDIA: "PARTIAL" },
        momentum: { US: "PARTIAL", INDIA: "PARTIAL" },
        fracture: { US: "PARTIAL", INDIA: "PARTIAL" },
        hawkes: { US: "UNAVAILABLE", INDIA: "UNAVAILABLE" },
      });
      assert(capabilities.PHASE5_COMPONENTS.every((c) => c.limitation));
    });
    for (const feature of [
      "legacy-demo-history",
      "legacy-demo-compare",
      "factor-local-assessment",
      "public-login",
      "execution",
      "neural-trace",
    ])
      check("unavailable capability remains disabled even in localLive " + feature, () => {
        const c = capabilities.capabilityFor({
          feature,
          selectionAvailable: true,
          environment: { hostname: "localhost", localLiveFlag: true, mode: "live" },
        });
        assert.equal(c.label, "UNAVAILABLE");
        assert.equal(c.enabled, false);
        assert(c.disabledReason);
      });
    for (const feature of [
      "paper-book",
      "market-options",
      "market-fundamentals",
      "market-private-risk",
      "local-live",
      "fresh-quotes",
      "model-training",
      "agent-execution",
    ])
      check("remote modes cannot enable local capability " + feature, () => {
        for (const hostname of [
          "finsight-alpha-web.vercel.app",
          "localhost.example.com",
          "127.0.0.1.evil",
        ]) {
          const c = capabilities.capabilityFor({
            feature,
            environment: { hostname, localLiveFlag: true, mode: "live" },
          });
          assert.equal(c.label, "LOCAL_LIVE_ONLY");
          assert.equal(c.enabled, false);
        }
        assert.equal(
          capabilities.capabilityFor({
            feature,
            environment: { hostname: "localhost", localLiveFlag: false, mode: "live" },
          }).enabled,
          false,
        );
        assert.equal(
          capabilities.capabilityFor({
            feature,
            environment: { hostname: "localhost", localLiveFlag: true, mode: "replay" },
          }).enabled,
          false,
        );
      });
    check(
      "original inspection capability agrees with strict reader for all340 actual bindings",
      () => {
        let supported = 0;
        for (const [id, binding] of Object.entries(data.bindings)) {
          const c = capabilities.capabilityFor({
            feature: "original-inspection",
            artifactId: id,
            binding,
          });
          assert.equal(c.enabled, reader.canInspectOriginal(id, binding), id);
          assert(c.requiredMode);
          assert(c.allowedActionClass);
          assert(c.verificationBasis?.detail);
          if (c.enabled) supported++;
          else assert(c.disabledReason);
        }
        assert.equal(supported, 315); // Main32c retains the prior308 and adds seven guarded Data originals.
        navigationProof.originalInspection = {
          bindings: CURRENT_AVAILABLE_BINDINGS,
          supported,
          unsupported: CURRENT_AVAILABLE_BINDINGS - supported,
        };
      },
    );
    for (const id of [
      "observatory:US-MKT:hmm",
      "observatory:US-MKT:signal",
      "observatory:IN-MKT:hmm",
      "observatory:IN-MKT:signal",
    ])
      check("recorded trace capability requires exact kind/asset/clock " + id, () => {
        const [, asset, scene] = id.split(":"),
          context = parseInvestigationContext(
            "observatory",
            qs({ subject: "market-factor:" + asset, artifact: id, trace: id, scene }),
          ),
          binding = manifest.artifacts[id],
          request = {
            feature: "recorded-trace",
            context,
            binding,
            selectionAvailable: true,
            hasDisplayProjection: !!data.projectionPins[id + "|observatory-trace-window"],
          };
        const c = capabilities.capabilityFor(request);
        assert.equal(c.label, "PUBLIC_REPLAY");
        assert.equal(c.enabled, true);
        assert.equal(c.evidenceRef.artifactId, id);
        if (id === "observatory:IN-MKT:hmm") {
          assert(/92|final|last/i.test(c.reason));
          assert.equal(
            capabilities.capabilityFor({ ...request, hasDisplayProjection: false }).enabled,
            false,
          );
        }
        for (const wrong of [
          manifest.artifacts[
            asset === "IN-MKT" ? "observatory:US-MKT:hmm" : "observatory:IN-MKT:hmm"
          ],
          manifest.artifacts["market:" + asset],
        ])
          assert.equal(capabilities.capabilityFor({ ...request, binding: wrong }).enabled, false);
        assert.equal(
          capabilities.capabilityFor({ ...request, context: { ...context, anchor: undefined } })
            .enabled,
          false,
        );
        assert.equal(
          capabilities.capabilityFor({
            ...request,
            context: { ...context, view: { ...context.view, cutoff: "2099-01-01T00:00:00Z" } },
          }).enabled,
          false,
        );
      });
    check("401 evidence never verifies business operations or grants remote paper access", () => {
      const boundary = capabilities.capabilityFor({ feature: "hosted-auth-boundary" }),
        health = capabilities.capabilityFor({ feature: "hosted-health" });
      assert.equal(boundary.label, "HOSTED_AUTH_REQUIRED");
      assert.equal(boundary.enabled, false);
      assert(/401|boundary/.test(boundary.reason));
      assert.equal(health.label, "HOSTED_API_VERIFIED");
      assert(/health/.test(health.reason));
      assert.equal(
        capabilities.capabilityFor({
          feature: "paper-book",
          environment: { hostname: "example.vercel.app", localLiveFlag: true, mode: "live" },
        }).enabled,
        false,
      );
    });
    check(
      "public derivative permission fails closed for missing, unknown, expired and malformed grants",
      () => {
        const entry = manifest.artifacts["market:US-MKT"];
        assert(capabilities.publicDerivativeAvailable(entry));
        for (const patch of [
          { status: "UNAVAILABLE" },
          { bytes: 0 },
          { sha256: "bad" },
          { licence: { ...entry.licence, status: "UNKNOWN" } },
          { licence: { ...entry.licence, permitted_uses: [] } },
          { licence: { ...entry.licence, permitted_uses: undefined } },
          { licence: { ...entry.licence, valid_through: "1900-01-01T00:00:00Z" } },
        ])
          assert.equal(capabilities.publicDerivativeAvailable({ ...entry, ...patch }), false);
      },
    );
    if (failures.length === failureStart) completedAreas.add("capabilities");
  }
}

const missingAreas = requiredAreas.filter((area) => !completedAreas.has(area));
if (!coreOnly && !projectionsOnly && !navigationOnly)
  check("complete approved static-verification coverage", () =>
    assert.deepEqual(
      missingAreas,
      [],
      "Full verification requires all approved static boundaries; --core-only is an explicit contracts-stage check.",
    ),
  );
const report = {
  transport: transportProof,
  schema_version: "phase75-terminal-context-proof/1",
  status: failures.length ? "FAIL" : missingAreas.length ? "INCOMPLETE" : "PASS",
  stageStatus: failures.length ? "FAIL" : "PASS",
  phase: navigationOnly
    ? "CONTRACTS_PROJECTIONS_SEARCH_COMMANDS_CAPABILITIES"
    : projectionsOnly
      ? "CONTRACTS_FREEZE_PROJECTIONS_INDEX"
      : coreOnly
        ? "CONTEXT_COMPATIBILITY_LINKS_AND_FREEZE"
        : "FULL_TERMINAL_STATIC",
  completedAreas: [...completedAreas],
  missingAreas,
  manifest_sha256: hash(manifestRaw),
  checks,
  passed,
  failures,
  performance: performanceProof,
  freeze: freezeProof,
  projections: projectionProof,
  navigation: navigationProof,
};
const proofDir = path.resolve(root, process.env.TERMINAL_PROOF_DIR ?? ".tmp/phase75/context");
mkdirSync(proofDir, { recursive: true });
writeFileSync(path.join(proofDir, "context-proof.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    phase: report.phase,
    status: report.status,
    stageStatus: report.stageStatus,
    missingAreas,
    checks,
    failures: failures.map((x) => ({ name: x.name, error: x.error.split("\n")[0] })),
    performance: performanceProof,
  }),
);
assert.equal(
  failures.length,
  0,
  `${failures.length} independent terminal context checks failed; see ${proofDir}`,
);
