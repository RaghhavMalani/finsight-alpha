import type { NumValue, RefValue, SourceFile, TextValue } from "@/visual/Num";
import type { EvidenceState } from "@/visual/tokens";

/** The build-time projection written by scripts/generate-research-graph.mjs. */
export type NodeKind =
  | "hypothesis"
  | "question"
  | "experiment"
  | "counterfactual"
  | "finding"
  | "verifier"
  | "check"
  | "skeptic";
export type Fact = { k: string; n?: NumValue; t?: TextValue };
export type GraphNode = {
  id: string;
  kind: NodeKind;
  group: string;
  country?: string;
  label: TextValue;
  verdict?: TextValue;
  state: EvidenceState;
  finalState?: EvidenceState;
  edgeKind?: string;
  run_id?: RefValue;
  hash?: RefValue;
  world?: RefValue;
  model?: TextValue | null;
  cost?: Fact[];
  /** The preregistered rule that produced `state`, with its sealed inputs. */
  rule?: { text: string; src: string; ptr: string; inputs: Fact[]; met: boolean } | null;
  /** estimate ÷ SE, derived with its formula; drives Bloom's radius. */
  t?: NumValue | null;
  verdicts?: Fact[];
  facts: Fact[];
};
export type GraphEdge = { from: string; to: string; kind: string; src: string; ptr: string };
export type EventKind =
  "freeze" | "start" | "holdout" | "resolve" | "fail" | "reject" | "challenge" | "challenged";
export type GraphEvent = {
  at: string;
  node: string;
  kind: EventKind;
  label: string;
  src: string;
  ptr: string;
};
export type ResearchGraph = {
  schema_version: "research-graph/1";
  status: "AVAILABLE";
  reason: null;
  study: {
    title: TextValue;
    alpha: NumValue;
    z_crit: NumValue;
    holdout_openings: NumValue;
    series: TextValue;
    preregistration_hash: RefValue;
    frozen_at: RefValue;
    code_commit: RefValue;
    evidence_cutoff: RefValue;
    evidence_mode: TextValue;
    licence: TextValue;
    publication_scope: TextValue;
    live: { t: null; reason: string };
  };
  sources: Record<string, SourceFile>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  timeline: GraphEvent[];
};

const KINDS = new Set<NodeKind>([
  "hypothesis",
  "question",
  "experiment",
  "counterfactual",
  "finding",
  "verifier",
  "check",
  "skeptic",
]);
const EVENTS = new Set<EventKind>([
  "freeze",
  "start",
  "holdout",
  "resolve",
  "fail",
  "reject",
  "challenge",
  "challenged",
]);

function fail(reason: string): never {
  throw new Error(reason);
}

/**
 * Structural check of a document whose bytes already matched the pinned SHA-256. Every
 * numeric fact must name a sealed source with a hash, so a value can never render without
 * its origin. Returns the reason the workspace is unavailable, or the graph.
 */
export function validateGraph(doc: unknown): ResearchGraph {
  const d = doc as Partial<ResearchGraph> & { status?: string; reason?: string };
  if (!d || typeof d !== "object") fail("Research projection is not an object");
  if (d.schema_version !== "research-graph/1")
    fail(`Unknown research projection schema ${String(d.schema_version)}`);
  if (d.status !== "AVAILABLE")
    fail(`Research evidence unavailable at build: ${d.reason ?? "no reason recorded"}`);
  const sources = d.sources ?? fail("Projection lists no sealed sources");
  for (const [key, s] of Object.entries(sources))
    if (!/^[0-9a-f]{64}$/.test(s.sha256)) fail(`Source ${key} has no SHA-256`);
  const nodes = d.nodes ?? fail("Projection has no nodes");
  if (!nodes.length) fail("Projection has no nodes");
  const ids = new Set<string>();
  const sealed = (src: string, where: string) => {
    if (!sources[src]) fail(`${where} cites ${src}, which is not a sealed source`);
  };
  for (const n of nodes) {
    if (!KINDS.has(n.kind)) fail(`Node ${n.id} has unknown kind ${n.kind}`);
    if (ids.has(n.id)) fail(`Duplicate node ${n.id}`);
    ids.add(n.id);
    sealed(n.label.src, `Node ${n.id} label`);
    for (const f of [...n.facts, ...(n.cost ?? []), ...(n.verdicts ?? [])]) {
      if (f.n) {
        if (f.n.v !== null && typeof f.n.v !== "number") fail(`${n.id} ${f.k} is not numeric`);
        sealed(f.n.src, `${n.id} ${f.k}`);
      }
      if (f.t) sealed(f.t.src, `${n.id} ${f.k}`);
    }
  }
  for (const e of d.edges ?? fail("Projection has no edges")) {
    if (!ids.has(e.from) || !ids.has(e.to)) fail(`Edge ${e.from}→${e.to} names an unknown node`);
    sealed(e.src, `Edge ${e.from}→${e.to}`);
  }
  let last = -Infinity;
  for (const ev of d.timeline ?? fail("Projection has no timeline")) {
    if (!ids.has(ev.node)) fail(`Event names unknown node ${ev.node}`);
    if (!EVENTS.has(ev.kind)) fail(`Unknown event kind ${ev.kind}`);
    const t = Date.parse(ev.at);
    if (!Number.isFinite(t) || t < last) fail(`Timeline is not in recorded order at ${ev.at}`);
    last = t;
    sealed(ev.src, `Event ${ev.label}`);
  }
  if (!d.study) fail("Projection has no study context");
  return d as ResearchGraph;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
