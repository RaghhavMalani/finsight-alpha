import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ContextError,
  WORKSPACE_PATHS,
  parseInvestigationContext,
  parseRouterContext,
  safeParseInvestigationContext,
  serializeInvestigationContext,
  contextQuery,
  subjectMarket,
  subjectTicker,
  workspaceOf,
  isArtifactId,
  isObservationDate,
} from "../src/app/terminal/context.ts";

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
check("context codec p95 bound", () => {
  const value = parseInvestigationContext("risk", qRisk);
  for (let i = 0; i < 30; i++) parseInvestigationContext("risk", contextQuery(value));
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    parseInvestigationContext("risk", contextQuery(value));
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  assert(p95 <= 2, `Context codec p95 ${p95}ms exceeds2ms`);
  performanceProof.codec = { samples: samples.length, p95_ms: p95, limit_ms: 2 };
});

const pinnedRisk = parseInvestigationContext("risk", qRisk);
const dataIssueId = manifest.routes["/data/issues"];
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

const missingAreas = requiredAreas.filter((area) => !completedAreas.has(area));
if (!coreOnly)
  check("complete approved static-verification coverage", () =>
    assert.deepEqual(
      missingAreas,
      [],
      "Full verification requires all approved static boundaries; --core-only is an explicit contracts-stage check.",
    ),
  );
const report = {
  schema_version: "phase75-terminal-context-proof/1",
  phase: coreOnly ? "CONTEXT_COMPATIBILITY_LINKS" : "FULL_TERMINAL_STATIC",
  completedAreas: [...completedAreas],
  missingAreas,
  manifest_sha256: hash(manifestRaw),
  checks,
  passed,
  failures,
  performance: performanceProof,
};
const proofDir = path.resolve(root, process.env.TERMINAL_PROOF_DIR ?? ".tmp/phase75/context");
mkdirSync(proofDir, { recursive: true });
writeFileSync(path.join(proofDir, "context-proof.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    phase: report.phase,
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
