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
export type PackedValue = null | boolean | number | string | PackedValue[];
export type PackedShard = {
  schema_version: "terminal-shard/1";
  generator_contract: typeof TERMINAL_CONTRACT;
  name: TerminalShardName;
  manifestBinding: { sha256: string; bytes: number; asOf: string };
  strings: string[];
  texts: number[][];
  structures: PackedValue[];
  payload: PackedValue;
  payloadDigest: string;
};
export type TerminalShard = TerminalPayload & Pick<PackedShard, "name" | "manifestBinding">;
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
// !1 is a versioned 32-byte hash fragment; !! escapes a literal leading ! exactly once.
function encodeHashFragment(hex: string): string {
  const bytes = hex
    .match(/../g)!
    .map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join("");
  return "!1" + btoa(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function decodeTerminalFragment(fragment: string): string {
  let value = fragment;
  if (fragment.startsWith("!!")) value = fragment.slice(1);
  else if (fragment.startsWith("!1")) {
    const encoded = fragment.slice(2);
    if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error("Malformed terminal hash fragment.");
    let bytes: string;
    try {
      bytes = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=");
    } catch {
      throw new Error("Malformed terminal hash fragment.");
    }
    if (bytes.length !== 32) throw new Error("Terminal hash fragment byte count changed.");
    value = Array.from(bytes, (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    if (encodeHashFragment(value) !== fragment)
      throw new Error("Noncanonical terminal hash fragment.");
  } else if (fragment.startsWith("!")) throw new Error("Unknown terminal fragment encoding.");
  if (value.length > 8192) throw new Error("Terminal decoded fragment bound exceeded.");
  return value;
}
export function packTerminalPayload(value: unknown): {
  strings: string[];
  texts: number[][];
  structures: PackedValue[];
  payload: PackedValue;
} {
  const strings: string[] = [],
    indexes = new Map<string, number>(),
    structures: PackedValue[] = [],
    refs = new Map<string, number>();
  const intern = (s: string) => {
    let n = indexes.get(s);
    if (n === undefined) {
      n = strings.length;
      strings.push(s);
      indexes.set(s, n);
    }
    return n;
  };
  function signedSignature(v: unknown): string {
    const negative: (string | number)[][] = [];
    function visit(value: unknown, path: (string | number)[]) {
      if (Object.is(value, -0)) negative.push(path);
      else if (Array.isArray(value)) value.forEach((child, i) => visit(child, [...path, i]));
      else if (value && typeof value === "object")
        for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    }
    visit(v, []);
    return stableTerminal(v) + "|" + stableTerminal(negative);
  }
  function encode(v: unknown): PackedValue {
    if (typeof v === "string") return "$" + intern(v).toString(36);
    if (Object.is(v, -0)) return "!-0";
    if (v && typeof v === "object") {
      const signature = signedSignature(v),
        prior = refs.get(signature);
      if (prior !== undefined) return "@" + prior.toString(36);
      const packed: PackedValue = Array.isArray(v)
        ? [0, ...v.map(encode)]
        : [
            1,
            ...Object.entries(v)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .flatMap(([k, x]) => [intern(k), encode(x)]),
          ];
      const n = structures.length;
      structures.push(packed);
      refs.set(signature, n);
      return "@" + n.toString(36);
    }
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)))
      return v;
    throw new Error("Terminal projection contains an unsupported value.");
  }
  const payload = encode(value),
    fragments: string[] = [],
    fragmentIds = new Map<string, number>();
  const texts = strings.map((s) =>
    s
      .split(/([a-f0-9]{64})/)
      .filter(Boolean)
      .map((part) => {
        let n = fragmentIds.get(part);
        if (n === undefined) {
          n = fragments.length;
          fragments.push(
            HASH.test(part) ? encodeHashFragment(part) : part.startsWith("!") ? "!" + part : part,
          );
          fragmentIds.set(part, n);
        }
        return n;
      }),
  );
  return { strings: fragments, texts, structures, payload };
}
export function unpackTerminalPayload(
  strings: readonly string[],
  value: PackedValue,
  structures: readonly PackedValue[] = [],
  texts?: readonly number[][],
): unknown {
  if (
    strings.length > 20000 ||
    strings.some((s) => typeof s !== "string" || s.length > 8193) ||
    structures.length > 20000
  )
    throw new Error("Terminal dictionary is outside its bound.");
  const fragments = strings.map(decodeTerminalFragment);
  const dictionary = texts
    ? texts.map((parts) => {
        if (
          !Array.isArray(parts) ||
          parts.length > 32 ||
          parts.some((i) => !count(i, strings.length - 1))
        )
          throw new Error("Invalid terminal text fragments.");
        const value = parts.map((i) => fragments[i]).join("");
        if (value.length > 8192) throw new Error("Terminal text expansion bound exceeded.");
        return value;
      })
    : fragments;
  if (dictionary.length > 20000) throw new Error("Terminal text dictionary bound exceeded.");
  let visited = 0;
  const active = new Set<number>();
  function decode(v: PackedValue, depth: number): unknown {
    if (++visited > 200000 || depth > 64)
      throw new Error("Terminal metadata decoding bound exceeded.");
    if (typeof v === "string") {
      if (v === "!-0") return -0;
      if (!/^[$@][0-9a-z]+$/.test(v)) throw new Error("Malformed terminal reference.");
      const n = parseInt(v.slice(1), 36),
        pool = v[0] === "$" ? dictionary : structures;
      if (!count(n, pool.length - 1) || n.toString(36) !== v.slice(1))
        throw new Error("Invalid terminal dictionary reference.");
      if (v[0] === "$") return dictionary[n];
      if (active.has(n)) throw new Error("Cyclic terminal structure reference.");
      active.add(n);
      const decoded = decode(structures[n], depth + 1);
      active.delete(n);
      return decoded;
    }
    if (Array.isArray(v)) {
      if (v[0] === 0) return v.slice(1).map((x) => decode(x, depth + 1));
      if (v[0] !== 1 || v.length % 2 !== 1) throw new Error("Malformed terminal record.");
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (let i = 1; i < v.length; i += 2) {
        const key = v[i];
        if (!count(key, dictionary.length - 1))
          throw new Error("Invalid terminal field reference.");
        const name = dictionary[key];
        if (["__proto__", "prototype", "constructor"].includes(name) || Object.hasOwn(result, name))
          throw new Error("Duplicate or unsafe terminal field.");
        result[name] = decode(v[i + 1], depth + 1);
      }
      return result;
    }
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)))
      return v;
    throw new Error("Malformed packed terminal scalar.");
  }
  return decode(value, 0);
}
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
  if (Object.keys(r).length !== 13) throw new Error("Incomplete terminal artifact binding.");
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
  expectedManifest?: PackedShard["manifestBinding"],
): Promise<TerminalShard> {
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    (expectedName === "seed" ? 48 : 128) * 1024
  )
    throw new Error("Terminal decoded metadata bound exceeded.");
  const raw = record(value, [
    "schema_version",
    "generator_contract",
    "name",
    "manifestBinding",
    "strings",
    "texts",
    "structures",
    "payload",
    "payloadDigest",
  ]);
  const manifest = record(raw.manifestBinding, ["sha256", "bytes", "asOf"]);
  if (
    raw.schema_version !== "terminal-shard/1" ||
    raw.generator_contract !== TERMINAL_CONTRACT ||
    !SHARD_NAMES.includes(raw.name as TerminalShardName) ||
    (expectedName && raw.name !== expectedName) ||
    !text(manifest.sha256) ||
    !HASH.test(manifest.sha256) ||
    !count(manifest.bytes, 2 * 1024 * 1024) ||
    !text(manifest.asOf) ||
    !Number.isFinite(Date.parse(manifest.asOf)) ||
    !Array.isArray(raw.strings) ||
    !Array.isArray(raw.structures) ||
    !Array.isArray(raw.texts) ||
    !text(raw.payloadDigest) ||
    !HASH.test(raw.payloadDigest)
  )
    throw new Error("Terminal shard identity is invalid.");
  if (expectedManifest && stableTerminal(manifest) !== stableTerminal(expectedManifest))
    throw new Error("Terminal shards do not share one build-verified manifest.");
  const sealed = {
    schema_version: raw.schema_version,
    generator_contract: raw.generator_contract,
    name: raw.name,
    manifestBinding: raw.manifestBinding,
    strings: raw.strings,
    texts: raw.texts,
    structures: raw.structures,
    payload: raw.payload,
  };
  if ((await terminalDigest(sealed)) !== raw.payloadDigest)
    throw new Error("Terminal shard digest mismatch.");
  const p = record(
    unpackTerminalPayload(
      raw.strings as string[],
      raw.payload as PackedValue,
      raw.structures as PackedValue[],
      raw.texts as number[][],
    ),
    ["bindings", "routes", "entities", "edges", "projections", "bundles", "projectionPins"],
  );
  if (
    !p.bindings ||
    typeof p.bindings !== "object" ||
    Array.isArray(p.bindings) ||
    !p.routes ||
    typeof p.routes !== "object" ||
    Array.isArray(p.routes) ||
    !Array.isArray(p.entities) ||
    p.entities.length > 512 ||
    !Array.isArray(p.edges) ||
    p.edges.length > 8192 ||
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
      typeof id !== "string" ||
      !Object.hasOwn(p.bindings, id)
    )
      throw new Error("Terminal route has no exact binding.");
  return {
    ...(p as TerminalPayload),
    name: raw.name as TerminalShardName,
    manifestBinding: manifest as PackedShard["manifestBinding"],
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
export type PackedNavigation = {
  strings: string[];
  hashes: string[];
  views: string[];
  selections: string[];
  columns: string[];
};
/** Template references are exact equality compression, not inferred entity relationships. */
export function packNavigationRecords(records: readonly NavigationRecord[]): PackedNavigation {
  const strings: string[] = [],
    indexes = new Map<string, number>(),
    views: string[] = [],
    selections: string[] = [];
  const intern = (value: string) => {
    let n = indexes.get(value);
    if (n === undefined) {
      n = strings.length;
      strings.push(value);
      indexes.set(value, n);
    }
    return n;
  };
  const integers = (values: number[]) => values.map((n) => (n + 4).toString(36)).join(".");
  const unique = (values: string[], value: string) => {
    const n = values.indexOf(value);
    if (n >= 0) return n;
    values.push(value);
    return values.length - 1;
  };
  const rows = records.map(
    (record) =>
      [
        intern(record.type),
        intern(record.namespace),
        intern(record.id),
        intern(record.label.replaceAll("%", "%%").split(record.id).join("%i%")),
        record.market === "US" ? 1 : record.market === "INDIA" ? 2 : 0,
        record.choices.map((choice) => [
          unique(
            selections,
            integers([
              choice.artifactId === null ? -1 : intern(choice.artifactId),
              choice.cutoff === null ? -1 : intern(choice.cutoff),
            ]),
          ),
          unique(
            views,
            integers(
              Object.entries(choice.view)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .flatMap(([key, value]) => [
                  intern(key),
                  value === record.id
                    ? -1
                    : value === choice.cutoff
                      ? -2
                      : value === choice.artifactId
                        ? -3
                        : intern(String(value)),
                ]),
            ),
          ),
          ["PUBLIC_REPLAY", "LOCAL_LIVE_ONLY", "UNAVAILABLE"].indexOf(choice.availability),
        ]),
      ] as const,
  );
  const hashes: string[] = [];
  const encoded = strings.map((value) =>
    value.replaceAll("!", "!!").replace(/[a-f0-9]{64}/g, (hex) => {
      const bytes = hex
        .match(/../g)!
        .map((pair) => String.fromCharCode(parseInt(pair, 16)))
        .join("");
      const n = unique(
        hashes,
        btoa(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
      );
      return "!" + n.toString(36) + "!";
    }),
  );
  return {
    strings: encoded,
    hashes,
    views,
    selections,
    columns: [
      ...Array.from({ length: 5 }, (_, i) => integers(rows.map((row) => row[i] as number))),
      rows.map((row) => integers(row[5].flat())).join("/"),
    ],
  };
}
export function unpackNavigationRecords(
  value: PackedNavigation,
  expectedCount: number,
): NavigationRecord[] {
  const integers = (wire: string, maximum = 20000): number[] => {
    if (typeof wire !== "string" || wire.length > 128 * 1024)
      throw new Error("Invalid navigation integer wire.");
    const values = wire
      ? wire.split(".").map((token) => {
          const n = parseInt(token, 36);
          if (
            !/^[0-9a-z]+$/.test(token) ||
            !Number.isSafeInteger(n) ||
            n.toString(36) !== token ||
            n < 1 ||
            n > maximum + 4
          )
            throw new Error("Invalid navigation index.");
          return n - 4;
        })
      : [];
    if (values.length > 20000) throw new Error("Navigation integer bound exceeded.");
    return values;
  };
  if (
    !count(expectedCount, 4096) ||
    expectedCount < 1 ||
    !Array.isArray(value.strings) ||
    value.strings.length > 12000 ||
    !Array.isArray(value.hashes) ||
    value.hashes.length > 4096 ||
    !Array.isArray(value.views) ||
    value.views.length > 4096 ||
    !Array.isArray(value.selections) ||
    value.selections.length > 4096 ||
    !Array.isArray(value.columns) ||
    value.columns.length !== 6
  )
    throw new Error("Invalid navigation collections.");
  const hashes = value.hashes.map((wire) => {
    if (typeof wire !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(wire))
      throw new Error("Invalid navigation hash.");
    const bytes = atob(wire.replaceAll("-", "+").replaceAll("_", "/") + "=");
    const hex = Array.from(bytes, (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join(
      "",
    );
    if (bytes.length !== 32 || encodeHashFragment(hex).slice(2) !== wire)
      throw new Error("Noncanonical navigation hash.");
    return hex;
  });
  const strings = value.strings.map((wire) => {
    if (typeof wire !== "string" || wire.length > 8192) throw new Error("Invalid navigation text.");
    let out = "";
    for (let i = 0; i < wire.length; i++) {
      if (wire[i] !== "!") {
        out += wire[i];
        continue;
      }
      if (wire[i + 1] === "!") {
        out += "!";
        i++;
        continue;
      }
      const end = wire.indexOf("!", i + 1),
        token = wire.slice(i + 1, end),
        n = parseInt(token, 36);
      if (
        end < 0 ||
        !/^[0-9a-z]+$/.test(token) ||
        !count(n, hashes.length - 1) ||
        n.toString(36) !== token
      )
        throw new Error("Invalid navigation hash reference.");
      out += hashes[n];
      i = end;
    }
    if (!text(out, 8192)) throw new Error("Invalid expanded navigation text.");
    return out;
  });
  const stringAt = (n: number) => {
    if (!count(n, strings.length - 1)) throw new Error("Invalid navigation text reference.");
    return strings[n];
  };
  const views = value.views.map((wire) => {
    const values = integers(wire);
    if (!values.length || values.length % 2 || values.length > 50)
      throw new Error("Invalid navigation view.");
    return values;
  });
  const selections = value.selections.map((wire) => {
    const values = integers(wire);
    if (values.length !== 2 || values.some((n) => n < -1))
      throw new Error("Invalid navigation selection.");
    const artifactId = values[0] === -1 ? null : stringAt(values[0]),
      cutoff = values[1] === -1 ? null : stringAt(values[1]);
    if (
      (artifactId !== null && !isArtifactId(artifactId)) ||
      (cutoff !== null && !Number.isFinite(Date.parse(cutoff))) ||
      (artifactId === null) !== (cutoff === null)
    )
      throw new Error("Invalid exact navigation selection.");
    return { artifactId, cutoff };
  });
  const columns = value.columns.slice(0, 5).map((wire) => integers(wire)),
    choiceRows = value.columns[5].split("/");
  if (
    columns.some((column) => column.length !== expectedCount) ||
    choiceRows.length !== expectedCount
  )
    throw new Error("Navigation record count changed.");
  let priorKey = "";
  return choiceRows.map((wire, row) => {
    const type = stringAt(columns[0][row]),
      namespace = stringAt(columns[1][row]),
      id = stringAt(columns[2][row]),
      template = stringAt(columns[3][row]),
      marketCode = columns[4][row];
    if (
      !ENTITY_TYPES.has(type) ||
      !NAMESPACES.has(namespace) ||
      ![0, 1, 2].includes(marketCode) ||
      !text(id, 180)
    )
      throw new Error("Invalid navigation identity.");
    let label = "";
    for (let i = 0; i < template.length; i++) {
      if (template[i] !== "%") label += template[i];
      else if (template[i + 1] === "%") {
        label += "%";
        i++;
      } else if (template.slice(i, i + 3) === "%i%") {
        label += id;
        i += 2;
      } else throw new Error("Invalid navigation label template.");
    }
    const market =
      marketCode === 1 ? ("US" as const) : marketCode === 2 ? ("INDIA" as const) : undefined;
    const key = [type, namespace, id, market ?? "ALL"].join("|");
    if (key <= priorKey || !text(label))
      throw new Error("Navigation canonical order/label changed.");
    priorKey = key;
    const values = integers(wire),
      choices: NavigationChoice[] = [];
    if (!values.length || values.length % 3 || values.length > 1536)
      throw new Error("Navigation choices exceed their bound.");
    for (let i = 0; i < values.length; i += 3) {
      const [selectionIndex, viewIndex, capability] = values.slice(i, i + 3);
      if (
        !count(selectionIndex, selections.length - 1) ||
        !count(viewIndex, views.length - 1) ||
        ![0, 1, 2].includes(capability)
      )
        throw new Error("Invalid navigation choice reference.");
      const selection = selections[selectionIndex],
        view: Record<string, string> = Object.create(null) as Record<string, string>;
      const entries = views[viewIndex];
      for (let j = 0; j < entries.length; j += 2) {
        const field = stringAt(entries[j]),
          n = entries[j + 1],
          v =
            n === -1
              ? id
              : n === -2
                ? selection.cutoff
                : n === -3
                  ? selection.artifactId
                  : stringAt(n);
        if (
          ["__proto__", "prototype", "constructor"].includes(field) ||
          Object.hasOwn(view, field) ||
          typeof v !== "string"
        )
          throw new Error("Invalid navigation selector.");
        view[field] = v;
      }
      serializeInvestigationContext({
        version: 1,
        ...(market ? { market } : {}),
        ...(selection.artifactId ? { anchor: { artifactId: selection.artifactId } } : {}),
        view: view as InvestigationView,
      });
      choices.push({
        ...selection,
        view: view as InvestigationView,
        availability: (["PUBLIC_REPLAY", "LOCAL_LIVE_ONLY", "UNAVAILABLE"] as const)[capability],
      });
    }
    const workspace = choices[0].view.workspace;
    if (choices.some((choice) => choice.view.workspace !== workspace))
      throw new Error("Navigation workspace identity changed.");
    return { key, id, type, namespace, label, workspace, ...(market ? { market } : {}), choices };
  });
}
export type NavigationProjection = PackedNavigation & {
  schema_version: "terminal-search-navigation/1";
  generator_contract: typeof TERMINAL_CONTRACT;
  manifestBinding: PackedShard["manifestBinding"];
  recordCount: number;
  logicalDigest: string;
  payloadDigest: string;
};
export async function validateNavigationProjection(
  value: unknown,
  expectedManifest?: PackedShard["manifestBinding"],
): Promise<NavigationRecord[]> {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 131072)
    throw new Error("Search navigation decoded bound exceeded.");
  const raw = record(value, [
    "schema_version",
    "generator_contract",
    "manifestBinding",
    "recordCount",
    "logicalDigest",
    "payloadDigest",
    "strings",
    "hashes",
    "views",
    "selections",
    "columns",
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
    Object.keys(raw).length !== 11 ||
    raw.schema_version !== "terminal-search-navigation/1" ||
    raw.generator_contract !== TERMINAL_CONTRACT ||
    !HASH.test(String(raw.payloadDigest)) ||
    !HASH.test(String(raw.logicalDigest)) ||
    (expectedManifest !== undefined &&
      stableTerminal(raw.manifestBinding) !== stableTerminal(expectedManifest))
  )
    throw new Error("Search navigation identity changed.");
  const { payloadDigest, ...sealed } = raw;
  if ((await terminalDigest(sealed)) !== payloadDigest)
    throw new Error("Search navigation digest mismatch.");
  const records = unpackNavigationRecords(raw as PackedNavigation, raw.recordCount as number);
  if ((await terminalDigest(records)) !== raw.logicalDigest)
    throw new Error("Search navigation semantic set changed.");
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
  ])
    .then(([module, seed]) =>
      validateNavigationProjection(module.retainedNavigation, seed.manifestBinding),
    )
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
const pending = new Map<TerminalShardName, Promise<TerminalShard>>();
export function loadTerminalShard(name: TerminalShardName): Promise<TerminalShard> {
  let result = pending.get(name);
  if (!result) {
    result = loaders[name]()
      .then(async (module) =>
        validateTerminalShard(
          module.default,
          name,
          name === "seed" ? undefined : (await loadTerminalSeed()).manifestBinding,
        ),
      )
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
    bytes?: number;
    signal?: AbortSignal;
  } = {},
) {
  const limits = {
    depth: options.depth ?? 4,
    nodes: options.nodes ?? 256,
    edges: options.edges ?? 512,
    bytes: options.bytes ?? 512 * 1024,
  };
  if (
    limits.depth > 4 ||
    limits.nodes > 256 ||
    limits.edges > 512 ||
    limits.bytes > 512 * 1024 ||
    Object.values(limits).some((n) => !count(n))
  )
    throw new Error("Declared traversal bounds cannot be widened.");
  const names = [...new Set(shardNames)];
  if (names.some((name) => !SHARD_NAMES.includes(name)))
    throw new Error("Unknown traversal shard.");
  const reserved = 48 * 1024 + names.filter((name) => name !== "seed").length * 128 * 1024;
  if (reserved > limits.bytes)
    throw new Error("Declared traversal metadata reservation exceeds byte bound before loading.");
  if (options.signal?.aborted) throw new Error("Investigation cancelled.");
  const shards = await Promise.all(names.map(loadTerminalShard));
  if (options.signal?.aborted) throw new Error("Investigation cancelled.");
  const bytes = reserved;
  if (!shards.some((shard) => shard.entities.some((entity) => entity.key === start)))
    throw new Error("Traversal start is not a retained entity.");
  if (bytes > limits.bytes) throw new Error("Declared metadata traversal byte bound exceeded.");
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
    metadataAccounting:
      "Conservative admission reservation: 48 KiB seed plus 128 KiB per requested lazy shard, checked before import.",
    nodes: [...visited].sort(),
    edges: selected,
    bytes,
    limitation:
      (incomplete
        ? "Bounded incomplete navigation: the selected depth limit has an unexplored frontier. "
        : "") +
      "Declared identity relationships only; impact relationship unavailable where no exact admission/source-version relation exists.",
  };
}
