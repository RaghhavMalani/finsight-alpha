import { defaultParseSearch, defaultStringifySearch } from "@tanstack/router-core";
import { resolveInstrument, type ExchangeCode } from "../../markets/instruments.ts";

export const WORKSPACE_PATHS = {
  market: "/markets",
  world: "/globe",
  risk: "/risk",
  regimes: "/dynamics",
  factors: "/factors",
  research: "/research",
  execution: "/execution",
  observatory: "/observatory",
  agents: "/forge",
  data: "/data",
} as const;
export type TerminalWorkspace = keyof typeof WORKSPACE_PATHS;
export type Market = "US" | "INDIA";
export type InvestigationSubject =
  | { kind: "market-factor"; id: "US-MKT" | "IN-MKT" }
  | { kind: "reference-listing"; providerSymbol: string; venue: ExchangeCode };
export type EvidenceAnchor = { artifactId: string };
export type TypedOrigin =
  | { kind: "risk-issue"; issueId: string; stateArtifactId: string; sweepArtifactId: string }
  | { kind: "artifact"; artifactId: string }
  | {
      kind: "regime-run" | "agent-run" | "factor" | "data-origin";
      entityId: string;
      artifactId: string;
    };
type TableView = { query?: string; sort?: string; direction?: "asc" | "desc"; columns?: string[] };
export type InvestigationView =
  | ({
      workspace: "market";
      panel?: "overview" | "graph";
      chart?: "relative" | "drawdown" | "volatility" | "regimes";
      range?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y";
    } & TableView)
  | {
      workspace: "regimes";
      panel?:
        | "overview"
        | "timeline"
        | "health"
        | "factors"
        | "fracture"
        | "evidence"
        | "legacy"
        | "changes";
      mode?: "now" | "replay" | "compare";
      cutoff?: string;
      runId?: string;
      program?: "mean-reversion" | "nonlinear" | "event-dynamics" | "market-regime";
      milestone?: string;
    }
  | {
      workspace: "factors";
      panel?: "exposure" | "catalog" | "audit" | "ledger" | "lineage" | "changes";
      factorId?: string;
      cutoff?: string;
      query?: string;
    }
  | ({
      workspace: "risk";
      panel?: "feed" | "coverage" | "history" | "changes";
      issueId?: string;
      sweepId?: string;
      partition?: "CURRENT_REAL" | "HISTORICAL" | "UNAVAILABLE" | "SYNTHETIC" | "RESOLVED";
      category?:
        "ALL" | "PORTFOLIO" | "MODEL" | "DATA" | "RESEARCH_HYGIENE" | "SIMULATOR" | "SYSTEM";
      severity?: "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
      country?: "ALL" | "US" | "INDIA" | "CROSS_MARKET" | "NONE";
      status?: "ALL" | "OPEN" | "RESOLVED";
      evidenceClass?: "ALL" | "REAL_RETAINED" | "UNAVAILABLE" | "RETAINED_SYNTHETIC";
    } & TableView)
  | ({
      workspace: "data";
      panel?:
        | "health"
        | "coverage"
        | "issues"
        | "lineage"
        | "revisions"
        | "costs"
        | "disagreement"
        | "changes";
      country?: "ALL" | "US" | "INDIA";
      sourceId?: string;
      originId?: string;
      admissionId?: string;
      sourceVersionId?: string;
      dataWindowEnd?: string;
    } & TableView)
  | { workspace: "research"; panel?: "summary" | "evidence" | "changes" }
  | {
      workspace: "observatory";
      scene?: "hmm" | "signal" | "neural" | "plugin";
      panel?: "stage" | "method" | "lineage";
      traceId?: string;
      traceStep?: number;
      cutoff?: string;
    }
  | { workspace: "world"; panel?: "context" | "events" | "satellites" }
  | ({
      workspace: "agents";
      panel?: "runs" | "action" | "turns" | "checks" | "artifacts";
      runId?: string;
      taskId?: string;
      model?: string;
      verdict?: "ACCEPT" | "REJECT" | "ABSTAIN";
      taskClass?: string;
      seed?: number;
      verified?: "verified" | "failed";
      node?: number;
    } & TableView)
  | { workspace: "execution"; panel?: "unavailable" };
export type InvestigationContext = {
  version: 1;
  market?: Market;
  subject?: InvestigationSubject;
  anchor?: EvidenceAnchor;
  compare?: EvidenceAnchor;
  observationDate?: string;
  origin?: TypedOrigin;
  view: InvestigationView;
};
export type ContextInput = string | URLSearchParams | Record<string, unknown>;
export class ContextError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ContextError";
    this.code = code;
  }
}
function fail(code: string, message: string): never {
  throw new ContextError(code, message);
}

const HASH = /^[a-f0-9]{64}$/;
const ISSUE = /^risk-issue:[a-f0-9]{64}$/;
const FACTOR = /^(?:us|india):(?:mkt|smb|hml|rf|mom)$/;
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/;
export const isHashId = (value: string) => HASH.test(value);
export const isIssueId = (value: string) => ISSUE.test(value);
export function isArtifactId(value: string): boolean {
  return (
    /^(?:risk:(?:state|sweep)|data-organ:(?:health|coverage|issues|lineage|revisions|costs|disagreement)|factors:(?:catalog|audit|ledger|lineage)|regimes:(?:snapshot|timeline|lineage|matrix|factors|history)|forge:run|plugins:run):[a-f0-9]{64}$/.test(
      value,
    ) ||
    /^(?:market|regime):[A-Z0-9^][A-Z0-9.^=-]{0,24}$/.test(value) ||
    /^observatory:(?:US-MKT|IN-MKT|SPY|QQQ|IWM):(?:hmm|signal|neural)$/.test(value) ||
    /^(?:world:(?:quakes|satellites)|forge:(?:baseline|baselines|runs|artifacts|reality|worlds)|product:(?:catalog|demo-full|demo-sparse)|dynamics:(?:catalog|demo-full|demo-sparse|estimator-tournament|evidence-complete-replication|failure-decomposition|generalization-autopsy|hawkes-boundary-decomposition|hawkes-event-process|hawkes-identifiability|nonlinear-identifiability|targeted-recovery))$/.test(
      value,
    )
  );
}
export function isObservationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function isClock(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
      value,
    ) &&
    isObservationDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
function clean(value: string, label: string, max = 256) {
  if (!value.length || value.length > max)
    fail("INVALID_TEXT", `${label} is empty, too long or contains invalid text.`);
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 32 || code === 127 || code === 65533)
      fail("INVALID_TEXT", `${label} contains invalid control text.`);
    if (code >= 0xd800 && code <= 0xdfff)
      fail("INVALID_UTF8", `${label} contains an invalid Unicode scalar.`);
  }
  return value;
}
function object(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail("INVALID_OBJECT", `${label} must be a plain object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!allowed.includes(key) || descriptor.get || descriptor.set)
      fail("UNKNOWN_FIELD", `${label} contains unsupported field ${key}.`);
  }
  return value as Record<string, unknown>;
}
function subjectText(subject: InvestigationSubject) {
  if (subject.kind === "market-factor") {
    object(subject, ["kind", "id"], "Subject");
    if (!["US-MKT", "IN-MKT"].includes(subject.id))
      fail("INVALID_SUBJECT", "Unknown market-factor identity.");
    return `market-factor:${subject.id}`;
  }
  object(subject, ["kind", "providerSymbol", "venue"], "Subject");
  if (subject.kind !== "reference-listing")
    fail("INVALID_SUBJECT", "Future subject kinds are unavailable.");
  const listing = resolveInstrument(subject.providerSymbol, subject.venue);
  if (listing.providerSymbol !== subject.providerSymbol || listing.code !== subject.venue)
    fail("INVALID_SUBJECT", "Listing does not match its recorded symbol and venue.");
  return `reference-listing:${listing.providerSymbol}:${listing.code}`;
}
export function subjectMarket(subject: InvestigationSubject): Market {
  return subject.kind === "market-factor"
    ? subject.id === "IN-MKT"
      ? "INDIA"
      : "US"
    : resolveInstrument(subject.providerSymbol, subject.venue).market;
}
export function subjectTicker(subject: InvestigationSubject | undefined): string | undefined {
  return subject?.kind === "market-factor" ? subject.id : subject?.providerSymbol;
}
function parseSubject(value: string): InvestigationSubject {
  const factor = /^market-factor:(US-MKT|IN-MKT)$/i.exec(value);
  if (factor) return { kind: "market-factor", id: factor[1].toUpperCase() as "US-MKT" | "IN-MKT" };
  const listing = /^reference-listing:([A-Z0-9^][A-Z0-9.^=-]{0,24}):(UN|UQ|UP|IS|IB)$/i.exec(value);
  if (!listing)
    return fail(
      "INVALID_SUBJECT",
      "Use a typed market-factor or verified reference-listing identity.",
    );
  const instrument = resolveInstrument(listing[1], listing[2]);
  return {
    kind: "reference-listing",
    providerSymbol: instrument.providerSymbol,
    venue: instrument.code,
  };
}
type Spec = {
  key: string;
  test?: (value: string) => boolean;
  values?: readonly string[];
  numeric?: number;
  list?: boolean;
};
const choice = (key: string, values: readonly string[]): Spec => ({ key, values });
const token = (key: string): Spec => ({ key, test: (v) => TOKEN.test(v) });
const hash = (key: string): Spec => ({ key, test: isHashId });
const table: Record<string, Spec> = {
  query: { key: "q", test: (v) => v.length <= 160 },
  sort: { key: "sort", test: (v) => /^[a-z][a-z0-9_]{0,30}$/.test(v) },
  direction: choice("direction", ["asc", "desc"]),
  columns: { key: "columns", list: true },
};
const specs: Record<TerminalWorkspace, Record<string, Spec>> = {
  market: {
    panel: choice("panel", ["overview", "graph"]),
    chart: choice("chart", ["relative", "drawdown", "volatility", "regimes"]),
    range: choice("range", ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y"]),
    ...table,
  },
  regimes: {
    panel: choice("panel", [
      "overview",
      "timeline",
      "health",
      "factors",
      "fracture",
      "evidence",
      "legacy",
      "changes",
    ]),
    mode: choice("mode", ["now", "replay", "compare"]),
    cutoff: { key: "at", test: isClock },
    runId: hash("run"),
    program: choice("program", ["mean-reversion", "nonlinear", "event-dynamics", "market-regime"]),
    milestone: choice("milestone", [
      "v1",
      "d0.2.1",
      "d0.3",
      "d0.3.1",
      "d0.3.2",
      "d0.3.2.1",
      "d0.3.3",
      "d0.3.3.1",
      "d0.3.3.2",
      "d0.3.4",
      "d0.4",
      "d0.4.1",
      "d0.4.1.1",
      "d0.4.2",
    ]),
  },
  factors: {
    panel: choice("panel", ["exposure", "catalog", "audit", "ledger", "lineage", "changes"]),
    factorId: { key: "factor", test: (v) => FACTOR.test(v) },
    cutoff: { key: "at", test: isClock },
    query: table.query,
  },
  risk: {
    panel: choice("panel", ["feed", "coverage", "history", "changes"]),
    issueId: { key: "issue", test: isIssueId },
    sweepId: hash("sweep"),
    partition: choice("partition", [
      "CURRENT_REAL",
      "HISTORICAL",
      "UNAVAILABLE",
      "SYNTHETIC",
      "RESOLVED",
    ]),
    category: choice("category", [
      "ALL",
      "PORTFOLIO",
      "MODEL",
      "DATA",
      "RESEARCH_HYGIENE",
      "SIMULATOR",
      "SYSTEM",
    ]),
    severity: choice("severity", ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
    country: choice("country", ["ALL", "US", "INDIA", "CROSS_MARKET", "NONE"]),
    status: choice("status", ["ALL", "OPEN", "RESOLVED"]),
    evidenceClass: choice("evidenceClass", [
      "ALL",
      "REAL_RETAINED",
      "UNAVAILABLE",
      "RETAINED_SYNTHETIC",
    ]),
    ...table,
  },
  data: {
    panel: choice("panel", [
      "health",
      "coverage",
      "issues",
      "lineage",
      "revisions",
      "costs",
      "disagreement",
      "changes",
    ]),
    country: choice("country", ["ALL", "US", "INDIA"]),
    sourceId: { key: "source", test: (v) => /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,79}$/.test(v) },
    originId: hash("origin"),
    admissionId: hash("admission"),
    sourceVersionId: hash("sourceVersion"),
    dataWindowEnd: { key: "dataWindowEnd", test: (v) => /^202[0-5]-12-31$/.test(v) },
    ...table,
  },
  research: { panel: choice("panel", ["summary", "evidence", "changes"]) },
  observatory: {
    scene: choice("scene", ["hmm", "signal", "neural", "plugin"]),
    panel: choice("panel", ["stage", "method", "lineage"]),
    traceId: { key: "trace", test: (v) => isArtifactId(v) && v.startsWith("observatory:") },
    traceStep: { key: "traceStep", numeric: 1_000_000 },
    cutoff: { key: "at", test: isClock },
  },
  world: { panel: choice("panel", ["context", "events", "satellites"]) },
  agents: {
    panel: choice("panel", ["runs", "action", "turns", "checks", "artifacts"]),
    runId: hash("run"),
    taskId: token("task"),
    model: token("model"),
    verdict: choice("verdict", ["ACCEPT", "REJECT", "ABSTAIN"]),
    taskClass: token("taskClass"),
    seed: { key: "seed", numeric: 2_147_483_647 },
    verified: choice("verified", ["verified", "failed"]),
    node: { key: "node", numeric: 1_000_000 },
    ...table,
  },
  execution: { panel: choice("panel", ["unavailable"]) },
};
const shared = [
  "ctx",
  "market",
  "subject",
  "artifact",
  "compare",
  "observationDate",
  "originIssue",
  "originState",
  "originSweep",
  "originKind",
  "originArtifact",
  "originEntity",
];
function allowedKeys(workspace: TerminalWorkspace) {
  return [
    ...shared,
    ...Object.values(specs[workspace]).map((s) => s.key),
    "ticker",
    "exchange",
    ...(workspace === "regimes" ? ["asset"] : []),
    ...(["factors", "data", "risk"].includes(workspace) ? ["country"] : []),
    ...(workspace === "data" ? ["section", "cutoff"] : []),
    ...(workspace === "market" ? ["view"] : []),
    ...(workspace === "agents" ? ["tab"] : []),
  ];
}
function params(input: ContextInput, workspace: TerminalWorkspace) {
  if (!Object.hasOwn(WORKSPACE_PATHS, workspace))
    fail("INVALID_WORKSPACE", "Unknown terminal workspace.");
  let result: URLSearchParams;
  if (typeof input === "string") {
    const raw = input.startsWith("?") ? input.slice(1) : input;
    if (new TextEncoder().encode(raw).byteLength > 4096 || raw.includes("#"))
      fail("URL_BOUND", "Investigation URL exceeds its bound or contains a fragment.");
    try {
      for (const field of raw.split("&"))
        for (const part of field.split("=")) decodeURIComponent(part.replaceAll("+", " "));
    } catch {
      fail("INVALID_UTF8", "Investigation URL has malformed UTF-8 or percent encoding.");
    }
    result = new URLSearchParams(raw);
  } else if (input instanceof URLSearchParams) result = new URLSearchParams(input);
  else {
    const values = object(input, allowedKeys(workspace), "Search");
    result = new URLSearchParams();
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(values))) {
      if (typeof descriptor.value !== "string")
        fail("INVALID_TYPE", `Query field ${key} must be a string.`);
      result.append(key, descriptor.value);
    }
  }
  if (new TextEncoder().encode(result.toString()).byteLength > 4096)
    fail("URL_BOUND", "Investigation URL exceeds 4096 bytes.");
  const seen = new Set<string>(),
    allowed = allowedKeys(workspace);
  for (const [key, value] of result) {
    if (!allowed.includes(key))
      fail("UNKNOWN_FIELD", `Unsupported ${workspace} query field ${key}.`);
    if (seen.has(key)) fail("DUPLICATE_KEY", `Duplicate query field ${key}.`);
    seen.add(key);
    if (key !== "q" || value !== "") clean(value, key, key === "q" ? 160 : 512);
  }
  if (result.has("ctx") && result.get("ctx") !== "1")
    fail("CONTEXT_VERSION", "This investigation context version is unavailable.");
  return result;
}
function originFrom(q: URLSearchParams): TypedOrigin | undefined {
  const issueKeys = ["originIssue", "originState", "originSweep"],
    genericKeys = ["originKind", "originArtifact", "originEntity"];
  if (issueKeys.some((k) => q.has(k))) {
    if (!issueKeys.every((k) => q.has(k)) || genericKeys.some((k) => q.has(k)))
      fail("INVALID_ORIGIN", "An Issue origin requires its complete unique state/sweep tuple.");
    const issueId = q.get("originIssue")!,
      stateArtifactId = q.get("originState")!,
      sweepArtifactId = q.get("originSweep")!;
    if (
      !isIssueId(issueId) ||
      !/^risk:state:[a-f0-9]{64}$/.test(stateArtifactId) ||
      !/^risk:sweep:[a-f0-9]{64}$/.test(sweepArtifactId)
    )
      fail("INVALID_ORIGIN", "Issue origin identifiers have incompatible namespaces.");
    return { kind: "risk-issue", issueId, stateArtifactId, sweepArtifactId };
  }
  if (!genericKeys.some((k) => q.has(k))) return;
  const kind = q.get("originKind"),
    artifactId = q.get("originArtifact"),
    entityId = q.get("originEntity");
  if (!kind || !artifactId || !isArtifactId(artifactId))
    fail("INVALID_ORIGIN", "Origin needs an exact typed artifact binding.");
  if (kind === "artifact" && !entityId) return { kind, artifactId };
  if (!entityId || !["regime-run", "agent-run", "factor", "data-origin"].includes(kind))
    fail("INVALID_ORIGIN", "Unsupported or incomplete origin type.");
  if (kind === "factor" ? !FACTOR.test(entityId) : !HASH.test(entityId))
    fail("INVALID_ORIGIN", "Origin entity identifier is not exact.");
  const prefix = {
    "regime-run": "regimes:",
    "agent-run": "forge:",
    factor: "factors:",
    "data-origin": "data-organ:",
  }[kind as "regime-run" | "agent-run" | "factor" | "data-origin"];
  if (!artifactId.startsWith(prefix))
    fail("INVALID_ORIGIN", "Origin entity and artifact namespaces disagree.");
  return {
    kind: kind as "regime-run" | "agent-run" | "factor" | "data-origin",
    artifactId,
    entityId,
  };
}
export function parseInvestigationContext(
  workspace: TerminalWorkspace,
  input: ContextInput = "",
): InvestigationContext {
  const q = params(input, workspace);
  let subject = q.has("subject") ? parseSubject(q.get("subject")!) : undefined;
  const tickers = [q.get("ticker"), q.get("asset")]
    .filter((v): v is string => v !== null)
    .map((v) => v.toUpperCase());
  if (new Set(tickers).size > 1)
    fail("CONTRADICTORY_SUBJECT", "Ticker and market-factor selection disagree.");
  if (tickers.length) {
    const ticker = tickers[0];
    const legacy: InvestigationSubject = ["US-MKT", "IN-MKT"].includes(ticker)
      ? { kind: "market-factor", id: ticker as "US-MKT" | "IN-MKT" }
      : (() => {
          const item = resolveInstrument(ticker, q.get("exchange") ?? undefined);
          return {
            kind: "reference-listing" as const,
            providerSymbol: item.providerSymbol,
            venue: item.code,
          };
        })();
    if (subject && subjectText(subject) !== subjectText(legacy))
      fail("CONTRADICTORY_SUBJECT", "Typed subject and legacy ticker disagree.");
    subject = legacy;
  }
  if (q.has("exchange") && (!subject || subject.kind === "market-factor"))
    fail("INVALID_SUBJECT", "A market factor has no exchange code.");
  if (q.has("exchange") && subject?.kind === "reference-listing") {
    const listing = resolveInstrument(subject.providerSymbol, q.get("exchange")!);
    if (listing.code !== subject.venue)
      fail("CONTRADICTORY_SUBJECT", "Exchange alias disagrees with the exact typed listing venue.");
  }
  const requestedMarket = q.get("market"),
    country = q.get("country");
  if (requestedMarket && !["US", "INDIA"].includes(requestedMarket))
    fail("INVALID_MARKET", "Unknown market filter.");
  if (
    country &&
    !["ALL", "US", "INDIA", ...(workspace === "risk" ? ["CROSS_MARKET", "NONE"] : [])].includes(
      country,
    )
  )
    fail("INVALID_MARKET", "Unknown country selection.");
  const markets = [
    requestedMarket,
    country === "US" || country === "INDIA" ? country : undefined,
    subject ? subjectMarket(subject) : undefined,
  ].filter((v): v is Market => !!v);
  if (new Set(markets).size > 1)
    fail(
      "CONTRADICTORY_MARKET",
      "Country and typed subject disagree. Choose one explicit compatible investigation.",
    );
  const market = markets[0];
  const anchor = q.get("artifact"),
    compare = q.get("compare"),
    observationDate = q.get("observationDate");
  if ((anchor && !isArtifactId(anchor)) || (compare && !isArtifactId(compare)))
    fail("INVALID_ANCHOR", "Evidence anchors require exact admitted artifact identifiers.");
  if (compare && !anchor) fail("INVALID_COMPARISON", "Comparison requires two exact anchors.");
  if (observationDate && !isObservationDate(observationDate))
    fail("INVALID_DATE", "Observation date is not an actual ISO calendar date.");
  const v: Record<string, unknown> = { workspace };
  for (const [property, spec] of Object.entries(specs[workspace])) {
    let value = q.get(spec.key);
    if (property === "panel") {
      const alias =
        workspace === "data"
          ? q.get("section")
          : workspace === "market"
            ? q.get("view")
            : workspace === "agents"
              ? q.get("tab")
              : null;
      if (value && alias && value !== alias)
        fail("CONTRADICTORY_VIEW", "Panel and legacy selection disagree.");
      value ??= alias;
    }
    if (property === "dataWindowEnd") {
      const alias = q.get("cutoff");
      if (value && alias && value !== alias)
        fail("CONTRADICTORY_CLOCK", "Annual Data window selections disagree.");
      value ??= alias;
    }
    if (value === null || (spec.key === "q" && value === "")) continue;
    if ((spec.values && !spec.values.includes(value)) || (spec.test && !spec.test(value)))
      fail("INVALID_SELECTION", `Unsupported ${workspace} ${spec.key}.`);
    if (spec.numeric !== undefined) {
      if (!/^(?:0|[1-9]\d*)$/.test(value) || Number(value) > spec.numeric)
        fail("INVALID_SELECTION", `${spec.key} must be a bounded nonnegative integer.`);
      v[property] = Number(value);
    } else if (spec.list) {
      const columns = value.split(",");
      if (
        columns.length > 12 ||
        new Set(columns).size !== columns.length ||
        columns.some((c) => !/^[a-z][a-z0-9_]{0,30}$/.test(c))
      )
        fail("INVALID_COLUMNS", "Choose at most twelve unique bounded columns.");
      v[property] = columns;
    } else v[property] = value;
  }
  if (workspace === "regimes" && (v.program || v.milestone)) {
    const milestones: Record<string, readonly string[]> = {
      "market-regime": ["v1", "d0.4.2"],
      "mean-reversion": ["d0.2.1"],
      nonlinear: [
        "d0.3",
        "d0.3.1",
        "d0.3.2",
        "d0.3.2.1",
        "d0.3.3",
        "d0.3.3.1",
        "d0.3.3.2",
        "d0.3.4",
      ],
      "event-dynamics": ["d0.4", "d0.4.1", "d0.4.1.1"],
    };
    if (
      typeof v.program !== "string" ||
      typeof v.milestone !== "string" ||
      !milestones[v.program]?.includes(v.milestone)
    )
      fail("INVALID_SELECTION", "The exact recorded program/milestone pair is unavailable.");
  }
  if (workspace === "agents" && v.node === 0)
    fail("INVALID_SELECTION", "Recorded node numbering starts at one.");
  if (v.issueId && !v.sweepId) fail("ISSUE_OWNER", "An exact Issue link needs its owning sweep.");
  if (v.factorId && market && !(v.factorId as string).startsWith(market.toLowerCase() + ":"))
    fail("CONTRADICTORY_MARKET", "Factor identity belongs to another country.");
  if (v.traceStep !== undefined && !v.traceId && !anchor?.startsWith("observatory:"))
    fail("TRACE_OWNER", "Trace step requires an exact recorded trace anchor.");
  if ((v.direction && !v.sort) || (v.sort && !v.direction))
    fail("INVALID_SORT", "Table sorting requires both a column and direction.");
  return {
    version: 1,
    ...(market ? { market } : {}),
    ...(subject ? { subject } : {}),
    ...(anchor ? { anchor: { artifactId: anchor } } : {}),
    ...(compare ? { compare: { artifactId: compare } } : {}),
    ...(observationDate ? { observationDate } : {}),
    ...(originFrom(q) ? { origin: originFrom(q) } : {}),
    view: v as InvestigationView,
  };
}
/** TanStack JSON-parses numeric query literals; only these exact protocol/view numbers cross that boundary. */
export function parseRouterContext(
  workspace: TerminalWorkspace,
  input: Record<string, unknown>,
): InvestigationContext {
  const record = object(input, allowedKeys(workspace), "Router search"),
    strings: Record<string, string> = {};
  const numeric = new Map(
    Object.values(specs[workspace])
      .filter((s) => s.numeric !== undefined)
      .map((s) => [s.key, s.numeric!]),
  );
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (typeof value === "string") strings[key] = value;
    else if (key === "ctx" && value === 1) strings[key] = "1";
    else if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= (numeric.get(key) ?? -1)
    )
      strings[key] = String(value);
    else fail("INVALID_TYPE", `Router field ${key} is not a supported literal.`);
  }
  return parseInvestigationContext(workspace, strings);
}
export function safeParseInvestigationContext(workspace: TerminalWorkspace, input: ContextInput) {
  try {
    return { ok: true as const, context: parseInvestigationContext(workspace, input) };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof ContextError
          ? error
          : new ContextError(
              "INVALID_CONTEXT",
              error instanceof Error ? error.message : "Invalid investigation context.",
            ),
    };
  }
}
export function serializeInvestigationContext(
  context: InvestigationContext,
): Record<string, string> {
  object(
    context,
    ["version", "market", "subject", "anchor", "compare", "observationDate", "origin", "view"],
    "Context",
  );
  if (context.version !== 1) fail("CONTEXT_VERSION", "Unsupported investigation version.");
  if (!context.view || typeof context.view !== "object")
    fail("INVALID_VIEW", "An investigation needs its tagged workspace view.");
  const workspace = context.view.workspace;
  if (!Object.hasOwn(WORKSPACE_PATHS, workspace))
    fail("INVALID_WORKSPACE", "Unknown terminal workspace.");
  object(context.view, ["workspace", ...Object.keys(specs[workspace])], "Workspace view");
  const values: Record<string, string> = { ctx: "1" };
  if (context.market !== undefined) {
    if (!["US", "INDIA"].includes(context.market)) fail("INVALID_MARKET", "Unknown market filter.");
    values.market = context.market;
  }
  if (context.subject !== undefined) {
    if (!context.subject || typeof context.subject !== "object")
      fail("INVALID_SUBJECT", "Subject must be a typed identity.");
    values.subject = subjectText(context.subject);
    // Read-only compatibility aliases are derived from the typed identity, never a second authority.
    values.ticker = subjectTicker(context.subject)!;
    if (context.subject.kind === "reference-listing") values.exchange = context.subject.venue;
  }
  for (const [property, key] of [
    ["anchor", "artifact"],
    ["compare", "compare"],
  ] as const) {
    const anchor = context[property];
    if (anchor !== undefined) {
      object(anchor, ["artifactId"], "Anchor");
      values[key] = anchor.artifactId;
    }
  }
  if (context.observationDate !== undefined) {
    if (typeof context.observationDate !== "string" || !isObservationDate(context.observationDate))
      fail("INVALID_DATE", "Observation date is not a valid calendar date.");
    values.observationDate = context.observationDate;
  }
  if (context.origin !== undefined) {
    if (!context.origin || typeof context.origin !== "object")
      fail("INVALID_ORIGIN", "Origin must be a typed exact reference.");
    const o = context.origin;
    if (o.kind === "risk-issue") {
      object(o, ["kind", "issueId", "stateArtifactId", "sweepArtifactId"], "Origin");
      values.originIssue = o.issueId;
      values.originState = o.stateArtifactId;
      values.originSweep = o.sweepArtifactId;
    } else {
      object(
        o,
        o.kind === "artifact" ? ["kind", "artifactId"] : ["kind", "artifactId", "entityId"],
        "Origin",
      );
      values.originKind = o.kind;
      values.originArtifact = o.artifactId;
      if (o.kind !== "artifact") values.originEntity = o.entityId;
    }
  }
  const fields = context.view as unknown as Record<string, unknown>;
  for (const [property, spec] of Object.entries(specs[workspace])) {
    const value = fields[property];
    if (value === undefined || (spec.key === "q" && value === "")) continue;
    if (spec.list) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
        fail("INVALID_TYPE", "Table columns must be strings.");
      values[spec.key] = value.join(",");
    } else if (spec.numeric !== undefined) {
      if (typeof value !== "number" || !Number.isInteger(value))
        fail("INVALID_TYPE", `${property} must be an integer.`);
      values[spec.key] = String(value);
    } else {
      if (typeof value !== "string") fail("INVALID_TYPE", `${property} must be a string.`);
      values[spec.key] = value;
    }
  }
  if (workspace === "factors" && context.market) values.country = context.market;
  if (context.view.workspace === "market" && context.view.panel === "graph") values.view = "graph";
  parseInvestigationContext(workspace, values);
  return values;
}
export const contextSearch = serializeInvestigationContext;
export function contextQuery(context: InvestigationContext): string {
  return new URLSearchParams(serializeInvestigationContext(context)).toString();
}
export function defaultContext(
  workspace: TerminalWorkspace,
  market?: Market,
): InvestigationContext {
  return { version: 1, ...(market ? { market } : {}), view: { workspace } };
}
export function workspaceOf(pathname: string): TerminalWorkspace | null {
  if (
    ["/runs", "/bench", "/artifacts", "/worlds", "/reality"].some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  )
    return "agents";
  return (
    (Object.entries(WORKSPACE_PATHS).find(
      ([, path]) => pathname === path || pathname.startsWith(path + "/"),
    )?.[0] as TerminalWorkspace | undefined) ?? null
  );
}

/** Typed investigation transport stays textual; legacy routes retain their existing JSON semantics. */
export function parseTerminalSearch(raw: string): Record<string, unknown> {
  const params = new URLSearchParams(raw);
  if (!params.has("ctx")) return defaultParseSearch(raw);
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) {
      const previous = result[key];
      result[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
    } else result[key] = value;
  }
  return result;
}
export function stringifyTerminalSearch(search: Record<string, unknown>): string {
  if (!Object.hasOwn(search, "ctx")) return defaultStringifySearch(search);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      const text = typeof item === "string" ? item : JSON.stringify(item);
      if (text !== undefined) params.append(key, text);
    }
  }
  const query = params.toString();
  return query ? "?" + query : "";
}
