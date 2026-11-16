import type { ReplayEntry } from "../../replay/contracts.ts";
import {
  serializeInvestigationContext,
  isArtifactId,
  type InvestigationView,
  type Market,
  type TerminalWorkspace,
} from "./context.ts";

export const TERMINAL_CONTRACT = "terminal-generator/1" as const;
export const SHARD_NAMES = [
  "seed",
  "market",
  "regimes",
  "risk",
  "factors",
  "data",
  "recordings",
  "history",
  "history-archive",
] as const;
export type TerminalShardName = (typeof SHARD_NAMES)[number];
export type StaticTerminalShardName = "data" | "history-archive";
export type StaticTerminalIndexName = StaticTerminalShardName | "retained-navigation";
export type StaticTerminalReference = {
  schema_version: "terminal-static-shard/1";
  name: StaticTerminalShardName;
  url: string;
  sha256: string;
  bytes: number;
};
// Byte ceilings. Only the seed is on the initial path, so only the seed keeps a tight budget.
// Every other shard is retained metadata fetched on demand; it grows with each publication
// epoch, so its ceilings are runaway guards rather than tuning targets.
export const MAX_SEED_MODULE_BYTES = 48 * 1024;
export const MAX_SEED_MODULE_GZIP_BYTES = 12 * 1024;
export const MAX_LAZY_MODULE_BYTES = 512 * 1024;
export const MAX_LAZY_MODULE_GZIP_BYTES = 128 * 1024;
// Static JSON indexes (Data, history-archive) are verified by SHA-256 before parsing.
export const MAX_STATIC_TERMINAL_BYTES = 8 * 1024 * 1024;
// Per-shard collection guards. Retained history adds ~12 records per daily epoch, so these
// bound validation work against a runaway rather than budget the corpus.
export const MAX_SHARD_ENTITIES = 8192;
export const MAX_SHARD_EDGES = 32768;
// Largest Risk original the terminal reads. Must equal ADMISSION_LIMIT in src/risk_manager/publication.py.
export const MAX_RISK_ORIGINAL_BYTES = 1024 * 1024;
/** Decoded-size ceiling for one shard: tight for the seed, runaway guards for everything lazy. */
export function shardByteCeiling(name: TerminalShardName | undefined): number {
  return name === "seed"
    ? MAX_SEED_MODULE_BYTES
    : name === "data" || name === "history-archive"
      ? MAX_STATIC_TERMINAL_BYTES
      : MAX_LAZY_MODULE_BYTES;
}
export const RELATIONS = [
  "REFERENCED_ARTIFACT",
  "ISSUE_ORIGIN",
  "DECLARED_PRODUCER",
  "DECLARED_SOURCE_VERSION",
  "DECLARED_ADMISSION",
  "DECLARED_CAPTURE",
  "PRESENT_IN",
] as const;
export type TerminalRelation = (typeof RELATIONS)[number];
export type TerminalEntity = {
  key: string;
  id: string;
  type: string;
  namespace: string;
  label: string;
  market?: Market;
  artifactId: string | null;
  cutoff: string | null;
  workspace: TerminalWorkspace;
  view: InvestigationView;
  availability: "AVAILABLE";
  versionChoices?: { artifactId: string; cutoff: string; view: InvestigationView }[];
};
export type TerminalEdge = {
  from: string;
  to: string;
  relation: TerminalRelation;
  artifactId: string;
  selector: string;
};
export type DisplayProjection = {
  schema_version: "terminal-display/1";
  generator_contract: typeof TERMINAL_CONTRACT;
  selector:
    | "market-week-window"
    | "regime-timeline-window"
    | "frozen-research-summary"
    | "observatory-trace-window";
  source: { artifactId: string; entry: ReplayEntry };
  originalFullRowCount: number;
  range: { start: number; end: number };
  originalFrameCount?: number;
  iterationRange?: { start: number; end: number };
  dateRange?: { start: number; end: number };
  limitations: string[];
  selectedFields: unknown;
  projectionDigest: string;
};
export type TerminalBundle = {
  kind: "risk" | "data" | "regimes" | "factors";
  anchor: string;
  cutoff: string;
  market?: Market;
  artifacts: Record<string, string>;
  identity?: string;
};
export type TerminalPayload = {
  bindings: Record<string, ReplayEntry>;
  routes: Record<string, string>;
  entities: TerminalEntity[];
  edges: TerminalEdge[];
  projections: DisplayProjection[];
  bundles: TerminalBundle[];
  projectionPins?: Record<string, string>;
};
export type ManifestBinding = { sha256: string; bytes: number; asOf: string };
/** Plain-JSON shard wire: the payload is the logical content, sealed by one SHA-256 digest. */
export type ShardWire = {
  schema_version: "terminal-shard/3";
  generator_contract: typeof TERMINAL_CONTRACT;
  name: TerminalShardName;
  manifestBinding: ManifestBinding;
  payload: TerminalPayload;
  payloadDigest: string;
};
export type TerminalShard = TerminalPayload & Pick<ShardWire, "name" | "manifestBinding">;
const HASH = /^[a-f0-9]{64}$/;
const ENTITY_TYPES = new Set([
  "admission",
  "artifact",
  "capture",
  "capture-sha",
  "data-origin",
  "data-source",
  "factor",
  "factor-audit-channel",
  "factor-definition",
  "issue",
  "market-factor",
  "model-run",
  "recorded-agent-run",
  "recorded-task",
  "recorded-trace",
  "reference-listing",
  "signal",
  "source-version",
  "sweep",
  "workspace",
]);
const NAMESPACES = new Set([
  "IB",
  "IS",
  "UN",
  "UP",
  "UQ",
  "agent",
  "data-organ",
  "data-organ-costs",
  "data-organ-coverage",
  "data-organ-disagreement",
  "data-organ-health",
  "data-organ-issues",
  "data-organ-lineage",
  "data-organ-revisions",
  "factor-declared",
  "factor-evidence",
  "factor-regime",
  "factors-audit",
  "factors-catalog",
  "factors-ledger",
  "factors-lineage",
  "market-factor",
  "observatory",
  "plugin-run",
  "projection",
  "regime",
  "regime-declared",
  "regimes-factors",
  "regimes-history",
  "regimes-lineage",
  "regimes-matrix",
  "regimes-snapshot",
  "regimes-timeline",
  "risk",
  "risk-state",
  "satellite-projection",
  "terminal",
  "world-events",
]);
const DISPLAY_SELECTORS = [
  "market-week-window",
  "regime-timeline-window",
  "frozen-research-summary",
  "observatory-trace-window",
] as const;
const WORKSPACES = new Set([
  "market",
  "world",
  "risk",
  "regimes",
  "factors",
  "research",
  "execution",
  "observatory",
  "agents",
  "data",
]);
export function stableTerminal(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}
export async function terminalDigest(value: unknown): Promise<string> {
  const raw = new TextEncoder().encode(stableTerminal(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new Error("Terminal metadata contains an undeclared field.");
  return value as Record<string, unknown>;
}
function count(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function text(value: unknown, maximum = 4096): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}
const UNSAFE_KEYS = ["__proto__", "prototype", "constructor"];
function validateBinding(id: string, entry: unknown): asserts entry is ReplayEntry {
  const r = record(entry, [
    "status",
    "kind",
    "url",
    "sha256",
    "bytes",
    "sources",
    "licence",
    "input_hash",
    "as_of",
    "observed_at",
    "available_at",
    "reason",
    "scope",
  ]);
  if (Object.keys(r).length !== 13 || UNSAFE_KEYS.includes(id))
    throw new Error("Incomplete terminal artifact binding.");
  const l = record(r.licence, [
    "status",
    "permitted_uses",
    "dataset_key",
    "valid_through",
    "attribution",
    "source_urls",
    "terms_url",
    "basis",
  ]);
  if (
    !text(id, 180) ||
    r.status !== "AVAILABLE" ||
    !text(r.kind, 80) ||
    !text(r.scope, 100) ||
    !text(r.url) ||
    !/^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(r.url) ||
    !text(r.sha256) ||
    !HASH.test(r.sha256) ||
    !count(r.bytes, 16 * 1024 * 1024) ||
    !Array.isArray(r.sources) ||
    !r.sources.every((s) => text(s, 160)) ||
    !text(r.as_of) ||
    !Number.isFinite(Date.parse(r.as_of)) ||
    !["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN", "TEST_ONLY"].includes(String(l.status)) ||
    !Array.isArray(l.permitted_uses) ||
    !l.permitted_uses.includes("publish_derived") ||
    !text(l.dataset_key)
  )
    throw new Error("Terminal artifact binding is not an admitted public derivative.");
  if (
    l.valid_through !== null &&
    (!text(l.valid_through) || Date.parse(l.valid_through) <= Date.parse(r.as_of))
  )
    throw new Error("Terminal publication grant is expired.");
}
export async function validateTerminalShard(
  value: unknown,
  expectedName?: TerminalShardName,
  expectedManifest?: ManifestBinding,
): Promise<TerminalShard> {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > shardByteCeiling(expectedName))
    throw new Error("Terminal decoded metadata bound exceeded.");
  const raw = record(value, [
    "schema_version",
    "generator_contract",
    "name",
    "manifestBinding",
    "payload",
    "payloadDigest",
  ]);
  const manifest = record(raw.manifestBinding, ["sha256", "bytes", "asOf"]);
  if (
    raw.schema_version !== "terminal-shard/3" ||
    raw.generator_contract !== TERMINAL_CONTRACT ||
    !SHARD_NAMES.includes(raw.name as TerminalShardName) ||
    (expectedName && raw.name !== expectedName) ||
    !text(manifest.sha256) ||
    !HASH.test(manifest.sha256) ||
    !count(manifest.bytes, 2 * 1024 * 1024) ||
    !text(manifest.asOf) ||
    !Number.isFinite(Date.parse(manifest.asOf)) ||
    !text(raw.payloadDigest) ||
    !HASH.test(raw.payloadDigest)
  )
    throw new Error("Terminal shard identity is invalid.");
  if (expectedManifest && stableTerminal(manifest) !== stableTerminal(expectedManifest))
    throw new Error("Terminal shards do not share one build-verified manifest.");
  const { payloadDigest, ...sealed } = raw;
  if ((await terminalDigest(sealed)) !== payloadDigest)
    throw new Error("Terminal shard digest mismatch.");
  const p = record(raw.payload, [
    "bindings",
    "routes",
    "entities",
    "edges",
    "projections",
    "bundles",
    "projectionPins",
  ]);
  if (
    !p.bindings ||
    typeof p.bindings !== "object" ||
    Array.isArray(p.bindings) ||
    !p.routes ||
    typeof p.routes !== "object" ||
    Array.isArray(p.routes) ||
    !Array.isArray(p.entities) ||
    p.entities.length > MAX_SHARD_ENTITIES ||
    !Array.isArray(p.edges) ||
    p.edges.length > MAX_SHARD_EDGES ||
    !Array.isArray(p.projections) ||
    !Array.isArray(p.bundles)
  )
    throw new Error("Terminal shard collection bound exceeded.");
  for (const [id, entry] of Object.entries(p.bindings)) validateBinding(id, entry);
  for (const value of p.bundles) {
    const bundle = record(value, ["kind", "anchor", "cutoff", "market", "artifacts", "identity"]);
    if (
      !["risk", "data", "regimes", "factors"].includes(String(bundle.kind)) ||
      !text(bundle.anchor) ||
      !Object.hasOwn(p.bindings, bundle.anchor) ||
      !text(bundle.cutoff) ||
      !Number.isFinite(Date.parse(bundle.cutoff)) ||
      (bundle.market !== undefined && !["US", "INDIA"].includes(String(bundle.market)))
    )
      throw new Error("Terminal bundle identity is invalid.");
    const permitted =
      bundle.kind === "risk"
        ? ["state", "sweep"]
        : bundle.kind === "data"
          ? ["health", "coverage", "issues", "lineage", "revisions", "costs", "disagreement"]
          : bundle.kind === "factors"
            ? ["catalog", "audit", "ledger", "lineage"]
            : ["snapshot", "timeline", "factors", "lineage", "history", "matrix"];
    const refs = record(bundle.artifacts, permitted);
    if (
      !Object.values(refs).includes(bundle.anchor) ||
      Object.values(refs).some(
        (id) => typeof id !== "string" || !Object.hasOwn(p.bindings as object, id),
      )
    )
      throw new Error("Terminal bundle reference is not bound.");
    if (bundle.kind === "risk" && (!text(bundle.identity) || !HASH.test(bundle.identity)))
      throw new Error("Risk bundle has no exact sweep identity.");
    for (const [kind, id] of Object.entries(refs)) {
      const entry = (p.bindings as Record<string, ReplayEntry>)[id as string];
      const expected =
        bundle.kind === "data"
          ? "data-organ-" + kind
          : bundle.kind === "risk"
            ? "risk-" + kind
            : bundle.kind + "-" + kind;
      if (
        entry.kind !== expected ||
        (["data", "regimes"].includes(String(bundle.kind)) && entry.as_of !== bundle.cutoff)
      )
        throw new Error("Terminal bundle kind/clock changed.");
    }
  }
  if (p.projectionPins !== undefined) {
    if (
      raw.name !== "seed" ||
      !p.projectionPins ||
      typeof p.projectionPins !== "object" ||
      Array.isArray(p.projectionPins)
    )
      throw new Error("Projection digest pins belong to the navigation seed.");
    for (const [key, digest] of Object.entries(p.projectionPins)) {
      const split = key.lastIndexOf("|"),
        id = key.slice(0, split),
        selector = key.slice(split + 1);
      if (
        split < 1 ||
        !isArtifactId(id) ||
        !DISPLAY_SELECTORS.includes(selector as DisplayProjection["selector"]) ||
        !text(digest) ||
        !HASH.test(digest)
      )
        throw new Error("Invalid compiled projection digest pin.");
    }
  }
  for (const value of p.projections) {
    const projection = record(value, [
        "schema_version",
        "generator_contract",
        "selector",
        "source",
        "originalFullRowCount",
        "range",
        "originalFrameCount",
        "iterationRange",
        "dateRange",
        "limitations",
        "selectedFields",
        "projectionDigest",
      ]),
      source = record(projection.source, ["artifactId", "entry"]);
    if (
      !text(source.artifactId) ||
      !Object.hasOwn(p.bindings, source.artifactId) ||
      !text(projection.projectionDigest) ||
      !HASH.test(projection.projectionDigest)
    )
      throw new Error("Projection has no exact source binding.");
    const { verifyDisplayProjection } = await import("./reader.ts");
    await verifyDisplayProjection(
      value,
      (p.bindings as Record<string, ReplayEntry>)[source.artifactId],
      projection.projectionDigest,
    );
  }
  const keys = new Set<string>();
  for (const value of p.entities) {
    const e = record(value, [
      "key",
      "id",
      "type",
      "namespace",
      "label",
      "market",
      "artifactId",
      "cutoff",
      "workspace",
      "view",
      "availability",
      "versionChoices",
    ]);
    if (
      !text(e.key) ||
      keys.has(e.key) ||
      !text(e.id, 180) ||
      !text(e.type, 80) ||
      !ENTITY_TYPES.has(e.type) ||
      !text(e.namespace, 80) ||
      !NAMESPACES.has(e.namespace) ||
      !text(e.label, 500) ||
      (e.market !== undefined && e.market !== "US" && e.market !== "INDIA") ||
      (e.artifactId !== null &&
        (!text(e.artifactId, 180) || !Object.hasOwn(p.bindings, e.artifactId))) ||
      (e.cutoff !== null && (!text(e.cutoff) || !Number.isFinite(Date.parse(e.cutoff)))) ||
      !WORKSPACES.has(String(e.workspace)) ||
      !e.view ||
      typeof e.view !== "object" ||
      (e.view as Record<string, unknown>).workspace !== e.workspace ||
      e.availability !== "AVAILABLE"
    )
      throw new Error("Terminal entity identity/binding is invalid.");
    serializeInvestigationContext({
      version: 1,
      ...(e.market ? { market: e.market as Market } : {}),
      ...(e.artifactId ? { anchor: { artifactId: e.artifactId as string } } : {}),
      view: e.view as InvestigationView,
    });
    if (e.versionChoices !== undefined) {
      if (!Array.isArray(e.versionChoices) || !e.versionChoices.length)
        throw new Error("Terminal entity versions are missing.");
      for (const value of e.versionChoices) {
        const choice = record(value, ["artifactId", "cutoff", "view"]);
        if (
          !text(choice.artifactId) ||
          !Object.hasOwn(p.bindings as object, choice.artifactId) ||
          !text(choice.cutoff) ||
          !Number.isFinite(Date.parse(choice.cutoff))
        )
          throw new Error("Terminal entity version has no exact binding.");
        if (
          !choice.view ||
          typeof choice.view !== "object" ||
          (choice.view as InvestigationView).workspace !== e.workspace
        )
          throw new Error("Entity version workspace changed.");
        const entry = (p.bindings as Record<string, ReplayEntry>)[choice.artifactId],
          view = choice.view as InvestigationView;
        const owner = (p.bundles as TerminalBundle[]).find(
          (bundle) =>
            bundle.kind === "risk" &&
            bundle.cutoff === choice.cutoff &&
            (e.type === "issue"
              ? bundle.anchor === choice.artifactId &&
                view.workspace === "risk" &&
                view.sweepId === bundle.identity
              : e.type === "sweep"
                ? bundle.artifacts.sweep === choice.artifactId &&
                  view.workspace === "risk" &&
                  view.sweepId === bundle.identity
                : false),
        );
        const factorOwner =
          entry.kind.startsWith("factors-") &&
          (p.bundles as TerminalBundle[]).some(
            (bundle) =>
              bundle.kind === "factors" &&
              bundle.cutoff === choice.cutoff &&
              Object.values(bundle.artifacts).includes(choice.artifactId as string) &&
              bundle.market === e.market,
          );
        if (
          e.type === "issue" || e.type === "sweep"
            ? !owner
            : entry.kind.startsWith("factors-") && e.type !== "artifact"
              ? !factorOwner
              : choice.cutoff !== entry.as_of
        )
          throw new Error(
            "Entity version clock/owner changed: " +
              e.type +
              " " +
              choice.artifactId +
              " " +
              choice.cutoff,
          );
        serializeInvestigationContext({
          version: 1,
          ...(e.market ? { market: e.market as Market } : {}),
          anchor: { artifactId: choice.artifactId },
          view,
        });
      }
    }
    if (
      e.artifactId !== null &&
      (!Array.isArray(e.versionChoices) ||
        !e.versionChoices.some(
          (choice) =>
            choice.artifactId === e.artifactId &&
            choice.cutoff === e.cutoff &&
            stableTerminal(choice.view) === stableTerminal(e.view),
        ))
    )
      throw new Error("Selected entity version is not retained.");
    if (
      e.type === "artifact" &&
      ((p.bindings as Record<string, ReplayEntry>)[e.artifactId as string]?.kind !== e.namespace ||
        e.id !== e.artifactId)
    )
      throw new Error("Artifact namespace is not its bound kind.");
    keys.add(e.key);
  }
  const selectors: Record<TerminalRelation, readonly string[]> = {
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
  for (const value of p.edges) {
    const e = record(value, ["from", "to", "relation", "artifactId", "selector"]);
    if (
      !text(e.from) ||
      !text(e.to) ||
      !keys.has(e.from) ||
      !keys.has(e.to) ||
      !RELATIONS.includes(e.relation as TerminalRelation) ||
      !text(e.artifactId, 180) ||
      !Object.hasOwn(p.bindings, e.artifactId) ||
      !text(e.selector, 120) ||
      !selectors[e.relation as TerminalRelation].includes(e.selector)
    )
      throw new Error("Terminal declared edge is invalid.");
  }
  for (const [route, id] of Object.entries(p.routes))
    if (
      !route.startsWith("/") ||
      route.startsWith("//") ||
      UNSAFE_KEYS.includes(route) ||
      typeof id !== "string" ||
      !Object.hasOwn(p.bindings, id)
    )
      throw new Error("Terminal route has no exact binding.");
  return {
    ...(p as TerminalPayload),
    name: raw.name as TerminalShardName,
    manifestBinding: manifest as ManifestBinding,
  };
}

/** Closed build-verified navigation projection. No ReplayEntry or scientific payload is encoded. */
export type NavigationChoice = {
  artifactId: string | null;
  cutoff: string | null;
  view: InvestigationView;
  availability: "PUBLIC_REPLAY" | "LOCAL_LIVE_ONLY" | "UNAVAILABLE";
};
export type NavigationRecord = Pick<
  TerminalEntity,
  "id" | "type" | "namespace" | "label" | "workspace" | "market"
> & {
  key: string;
  choices: NavigationChoice[];
};
export type NavigationProjection = {
  schema_version: "terminal-search-navigation/2";
  generator_contract: typeof TERMINAL_CONTRACT;
  manifestBinding: ManifestBinding;
  records: NavigationRecord[];
  payloadDigest: string;
};
const AVAILABILITY = ["PUBLIC_REPLAY", "LOCAL_LIVE_ONLY", "UNAVAILABLE"];
/** Closed navigation grammar: canonical key order, exact selections and routable views only. */
function validateNavigationRecords(value: unknown): NavigationRecord[] {
  if (!Array.isArray(value) || !value.length || value.length > 4096)
    throw new Error("Invalid navigation collections.");
  let priorKey = "";
  for (const item of value) {
    const r = record(item, [
      "key",
      "id",
      "type",
      "namespace",
      "label",
      "workspace",
      "market",
      "choices",
    ]);
    if (
      !text(r.type, 80) ||
      !ENTITY_TYPES.has(r.type) ||
      !text(r.namespace, 80) ||
      !NAMESPACES.has(r.namespace) ||
      !text(r.id, 180) ||
      (r.market !== undefined && r.market !== "US" && r.market !== "INDIA")
    )
      throw new Error("Invalid navigation identity.");
    const key = [r.type, r.namespace, r.id, r.market ?? "ALL"].join("|");
    if (r.key !== key || key <= priorKey || !text(r.label))
      throw new Error("Navigation canonical order/label changed.");
    priorKey = key;
    if (!Array.isArray(r.choices) || !r.choices.length || r.choices.length > 512)
      throw new Error("Navigation choices exceed their bound.");
    for (const value of r.choices) {
      const choice = record(value, ["artifactId", "cutoff", "view", "availability"]);
      const { artifactId, cutoff, view } = choice;
      if (
        !("artifactId" in choice && "cutoff" in choice) ||
        (artifactId !== null && (typeof artifactId !== "string" || !isArtifactId(artifactId))) ||
        (cutoff !== null && (!text(cutoff) || !Number.isFinite(Date.parse(cutoff)))) ||
        (artifactId === null) !== (cutoff === null) ||
        !AVAILABILITY.includes(String(choice.availability))
      )
        throw new Error("Invalid exact navigation selection.");
      if (
        !view ||
        typeof view !== "object" ||
        Array.isArray(view) ||
        Object.entries(view).some(([field, v]) => UNSAFE_KEYS.includes(field) || !text(v))
      )
        throw new Error("Invalid navigation selector.");
      serializeInvestigationContext({
        version: 1,
        ...(r.market ? { market: r.market as Market } : {}),
        ...(artifactId ? { anchor: { artifactId: artifactId as string } } : {}),
        view: view as InvestigationView,
      });
      if ((view as InvestigationView).workspace !== r.workspace)
        throw new Error("Navigation workspace identity changed.");
    }
  }
  return value as NavigationRecord[];
}
export async function validateNavigationProjection(
  value: unknown,
  expectedManifest?: ManifestBinding,
  ceiling = MAX_LAZY_MODULE_BYTES,
): Promise<NavigationRecord[]> {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ceiling)
    throw new Error("Search navigation decoded bound exceeded.");
  const raw = record(value, [
    "schema_version",
    "generator_contract",
    "manifestBinding",
    "records",
    "payloadDigest",
  ]);
  const manifest = record(raw.manifestBinding, ["sha256", "bytes", "asOf"]);
  if (
    Object.keys(manifest).length !== 3 ||
    !HASH.test(String(manifest.sha256)) ||
    !count(manifest.bytes, 2097152) ||
    manifest.bytes === 0 ||
    !text(manifest.asOf, 80) ||
    !Number.isFinite(Date.parse(manifest.asOf))
  )
    throw new Error("Search navigation manifest binding is invalid.");
  if (
    Object.keys(raw).length !== 5 ||
    raw.schema_version !== "terminal-search-navigation/2" ||
    raw.generator_contract !== TERMINAL_CONTRACT ||
    !HASH.test(String(raw.payloadDigest)) ||
    (expectedManifest !== undefined &&
      stableTerminal(raw.manifestBinding) !== stableTerminal(expectedManifest))
  )
    throw new Error("Search navigation identity changed.");
  const { payloadDigest, ...sealed } = raw;
  if ((await terminalDigest(sealed)) !== payloadDigest)
    throw new Error("Search navigation digest mismatch.");
  const records = validateNavigationRecords(structuredClone(raw.records));
  const freeze = (value: unknown) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(records);
  return records;
}
let navigationPending: Promise<NavigationRecord[]> | undefined;
export function loadSearchNavigation(): Promise<NavigationRecord[]> {
  navigationPending ??= import("./generated/search.generated.ts")
    .then((module) => validateNavigationProjection(module.default))
    .catch((error: unknown) => {
      navigationPending = undefined;
      throw error;
    });
  return navigationPending;
}

let retainedNavigationPending: Promise<NavigationRecord[]> | undefined;
export function loadRetainedSearchNavigation(): Promise<NavigationRecord[]> {
  retainedNavigationPending ??= Promise.all([
    import("./generated/history.generated.ts"),
    loadTerminalSeed(),
    import("./reader.ts"),
  ])
    .then(async ([module, seed, reader]) => {
      const value = await reader.readTerminalIndex(
        module.retainedNavigation,
        "retained-navigation",
      );
      return validateNavigationProjection(
        value,
        seed.manifestBinding,
        MAX_STATIC_TERMINAL_BYTES,
      ).catch((error: unknown) => {
        throw reader.staticIndexFailure(
          "Terminal static index content is invalid.",
          "retained-navigation",
          error instanceof Error ? error.message : "navigation validation failed.",
        );
      });
    })
    .catch((error: unknown) => {
      retainedNavigationPending = undefined;
      throw error;
    });
  return retainedNavigationPending;
}
const loaders = {
  seed: () => import("./generated/seed.generated.ts"),
  market: () => import("./generated/market.generated.ts"),
  regimes: () => import("./generated/regimes.generated.ts"),
  risk: () => import("./generated/risk.generated.ts"),
  factors: () => import("./generated/factors.generated.ts"),
  data: () => import("./generated/data.generated.ts"),
  recordings: () => import("./generated/recordings.generated.ts"),
  history: () => import("./generated/history.generated.ts"),
  "history-archive": () => import("./generated/history-archive.generated.ts"),
};
/**
 * Fetch, authenticate, parse and validate one static index. Fail closed: any rejection names the
 * unavailable index and its reason, and no part of the index is returned.
 */
export async function loadStaticTerminalShard(
  reference: unknown,
  name: StaticTerminalShardName,
  expectedManifest?: ManifestBinding,
): Promise<TerminalShard> {
  const reader = await import("./reader.ts");
  const value = await reader.readTerminalIndex(reference, name);
  // Authentic bytes can still be the wrong shard (stale deploy): name the unavailable index.
  return validateTerminalShard(value, name, expectedManifest).catch((error: unknown) => {
    throw reader.staticIndexFailure(
      "Terminal static index content is invalid.",
      name,
      error instanceof Error ? error.message : "shard validation failed.",
    );
  });
}
const pending = new Map<TerminalShardName, Promise<TerminalShard>>();
export function loadTerminalShard(name: TerminalShardName): Promise<TerminalShard> {
  let result = pending.get(name);
  if (!result) {
    result = loaders[name]()
      .then(async (module) => {
        const manifest = name === "seed" ? undefined : (await loadTerminalSeed()).manifestBinding;
        return name === "data" || name === "history-archive"
          ? loadStaticTerminalShard(module.default, name, manifest)
          : validateTerminalShard(module.default, name, manifest);
      })
      .catch((error: unknown) => {
        pending.delete(name);
        throw error;
      });
    pending.set(name, result);
  }
  return result;
}
export const loadTerminalSeed = () => loadTerminalShard("seed");
export function catalogEntities(shards: readonly TerminalShard[]): TerminalEntity[] {
  const result = new Map<string, TerminalEntity>();
  for (const shard of shards)
    for (const entity of shard.entities) {
      const prior = result.get(entity.key);
      if (!prior) {
        result.set(entity.key, entity);
        continue;
      }
      if (
        prior.id !== entity.id ||
        prior.type !== entity.type ||
        prior.namespace !== entity.namespace ||
        prior.workspace !== entity.workspace ||
        prior.market !== entity.market
      )
        throw new Error("Conflicting terminal entity identity.");
      const choices = new Map(
        [...(prior.versionChoices ?? []), ...(entity.versionChoices ?? [])].map((choice) => [
          stableTerminal(choice),
          choice,
        ]),
      );
      const selected = (entity.cutoff ?? "") > (prior.cutoff ?? "") ? entity : prior;
      result.set(entity.key, {
        ...selected,
        ...(choices.size
          ? {
              versionChoices: [...choices.values()].sort((a, b) =>
                a.cutoff + a.artifactId < b.cutoff + b.artifactId ? -1 : 1,
              ),
            }
          : {}),
      });
    }
  return [...result.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
export async function findArtifactBinding(id: string): Promise<ReplayEntry> {
  if (!isArtifactId(id)) throw new Error("Exact retained artifact identity is invalid.");
  const family: TerminalShardName = id.startsWith("data-organ:")
    ? "data"
    : id.startsWith("risk:")
      ? "risk"
      : id.startsWith("regimes:")
        ? "regimes"
        : id.startsWith("factors:")
          ? "factors"
          : id.startsWith("market:")
            ? "market"
            : "recordings";
  const shard = await loadTerminalShard(family),
    entry =
      shard.bindings[id] ??
      (family === "recordings" ? (await loadTerminalShard("history")).bindings[id] : undefined) ??
      (await loadTerminalShard("history-archive")).bindings[id];
  if (!entry)
    throw new Error("Exact retained artifact is unavailable; latest was not substituted.");
  return entry;
}
export async function selectProjection(
  selector: DisplayProjection["selector"],
  asset: string,
  artifactId?: string,
): Promise<DisplayProjection> {
  if (selector === "observatory-trace-window") {
    if (asset !== "IN-MKT" || (artifactId !== undefined && artifactId !== "observatory:IN-MKT:hmm"))
      throw new Error(
        "Exact recorded trace display window is unavailable; no asset or artifact was substituted.",
      );
    const module = await import("./generated/observatory-window.generated.ts");
    return module.default as unknown as DisplayProjection;
  }
  const shard = await loadTerminalShard(selector === "market-week-window" ? "market" : "regimes");
  const candidates = shard.projections.filter(
    (p) =>
      p.selector === selector &&
      (!artifactId || p.source.artifactId === artifactId) &&
      ((p.selectedFields as Record<string, unknown>).asset === asset ||
        (p.selectedFields as Record<string, unknown>).ticker === asset ||
        p.source.entry.sources.includes(
          asset === "IN-MKT"
            ? "iima:daily-factors"
            : asset === "US-MKT"
              ? "ken-french:daily-factors"
              : "__unsupported__",
        )),
  );
  const selected = artifactId
    ? candidates
    : candidates.sort((a, b) => (a.source.entry.as_of < b.source.entry.as_of ? 1 : -1));
  if (!selected.length || (artifactId && selected.length !== 1))
    throw new Error("Exact display projection is unavailable.");
  return selected[0];
}
export async function traverseDeclared(
  start: string,
  shardNames: readonly TerminalShardName[],
  options: {
    depth?: number;
    nodes?: number;
    edges?: number;
    signal?: AbortSignal;
  } = {},
) {
  const limits = {
    depth: options.depth ?? 4,
    nodes: options.nodes ?? 256,
    edges: options.edges ?? 512,
  };
  if (
    limits.depth > 4 ||
    limits.nodes > 256 ||
    limits.edges > 512 ||
    Object.values(limits).some((n) => !count(n))
  )
    throw new Error("Declared traversal bounds cannot be widened.");
  const names = [...new Set(shardNames)];
  if (names.some((name) => !SHARD_NAMES.includes(name)))
    throw new Error("Unknown traversal shard.");
  // Work is bounded by depth/nodes/edges; each shard load enforces its own byte ceiling.
  if (options.signal?.aborted) throw new Error("Investigation cancelled.");
  const shards = await Promise.all(names.map(loadTerminalShard));
  if (options.signal?.aborted) throw new Error("Investigation cancelled.");
  if (!shards.some((shard) => shard.entities.some((entity) => entity.key === start)))
    throw new Error("Traversal start is not a retained entity.");
  const visited = new Set([start]),
    selected: TerminalEdge[] = [];
  let frontier = [start];
  const all = shards.flatMap((s) => s.edges);
  for (let depth = 0; depth < limits.depth && frontier.length; depth++) {
    const next: string[] = [];
    for (const edge of all) {
      if (!frontier.includes(edge.from) && !frontier.includes(edge.to)) continue;
      if (selected.some((x) => stableTerminal(x) === stableTerminal(edge))) continue;
      if (selected.length >= limits.edges)
        throw new Error("Declared traversal edge bound exceeded.");
      selected.push(edge);
      for (const key of [edge.from, edge.to])
        if (!visited.has(key)) {
          if (visited.size >= limits.nodes)
            throw new Error("Declared traversal node bound exceeded.");
          visited.add(key);
          next.push(key);
        }
    }
    frontier = next;
  }
  const incomplete = all.some(
    (edge) =>
      (frontier.includes(edge.from) && !visited.has(edge.to)) ||
      (frontier.includes(edge.to) && !visited.has(edge.from)),
  );
  if (incomplete)
    throw new Error(
      "Declared traversal depth bound exceeded; bounded incomplete navigation has further unvisited declared neighbors.",
    );
  return {
    incomplete,
    nodes: [...visited].sort(),
    edges: selected,
    limitation:
      (incomplete
        ? "Bounded incomplete navigation: the selected depth limit has an unexplored frontier. "
        : "") +
      "Declared identity relationships only; impact relationship unavailable where no exact admission/source-version relation exists.",
  };
}
