import { useEffect, useState } from "react";
import { GEO_PROJECTION_PIN } from "./geo-pin.generated";

/** Global Eye v2: the sourced knowledge graph and propagate() answers, as the page reads them. */
export type GeoStatus = "AVAILABLE" | "PARTIAL" | "NO_COVERAGE" | "BELOW_THRESHOLD" | "UNAVAILABLE";
export const STATUSES: readonly GeoStatus[] = [
  "AVAILABLE",
  "PARTIAL",
  "NO_COVERAGE",
  "BELOW_THRESHOLD",
  "UNAVAILABLE",
];
export const STATUS_WORDS: Record<GeoStatus, string> = {
  AVAILABLE: "securities are reached through cited edges",
  PARTIAL: "sites lie in the radius, but no cited link reaches a security",
  NO_COVERAGE: "no sourced site lies in the radius; this says nothing about real exposure",
  BELOW_THRESHOLD: "below the declared disruption threshold",
  UNAVAILABLE: "no answer could be computed",
};

export type GeoSource = {
  url: string;
  title: string;
  date: string;
  date_basis: string;
  available_at: string;
  excerpt: string;
  locator: string;
};
export type GeoNode = {
  id: string;
  type: "facility" | "port" | "chokepoint" | "company" | "security" | "sector" | "unknown";
  name: string;
  lat: number | null;
  lon: number | null;
  location_precision: string | null;
  source: GeoSource;
};
export type GeoEdge = {
  id: string;
  type: "operates" | "supplies" | "ships_through" | "listed_as" | "exposed_to";
  src: string;
  dst: string;
  confidence: number;
  mechanism: string;
  source: GeoSource;
};
export type GeoChain = {
  site: string;
  distance_km: number;
  company: string;
  score: number;
  hops: GeoEdge[];
};
export type GeoAnswer = {
  status: GeoStatus;
  reason: string | null;
  radius_km: number | null;
  nearest_site_km: number | null;
  cutoff: string | null;
  /** Whether propagate() evaluated sites and chains; false for UNAVAILABLE and BELOW_THRESHOLD. */
  evaluated: boolean;
  /** Missing is not zero: null when propagate() did not count chains. */
  chains_total: number | null;
  sites: { site: string; distance_km: number; linked: boolean }[];
  securities: { security: string; score: number; sites: string[]; best_chain: GeoChain }[];
};
export type GeoEvent = {
  id: string;
  origin: "recorded" | "scenario" | "live";
  label: string;
  kind: string;
  lat: number;
  lon: number;
  magnitude: number | null;
  time: string;
  point_in_time: GeoAnswer;
  retrospective: GeoAnswer | null;
};
export type GeoProjection = {
  graph: {
    version: string;
    path: string;
    seed_sha256_lf: string;
    knowledge_cutoff: string;
    nodes: number;
    edges: number;
  };
  input: { artifact: string; url: string; sha256: string; as_of: string; events: number };
  precision: string;
  radius_rule: string;
  score_rule: string;
  nodes: Record<string, GeoNode>;
  edges: Record<string, GeoEdge>;
  events: Map<string, GeoEvent>;
  scenarios: GeoEvent[];
  sha256: string;
  url: string;
};
export type GeoLoad =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ok"; projection: GeoProjection };

class Malformed extends Error {}
const fail = (why: string): never => {
  throw new Malformed(why);
};
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

type RawAnswer = Omit<GeoAnswer, "securities"> & {
  securities: {
    security: string;
    score: number;
    sites: string[];
    best_chain: Omit<GeoChain, "hops"> & { hops: string[] };
  }[];
};

function answer(raw: unknown, edges: Record<string, GeoEdge>, nodes: Record<string, GeoNode>) {
  if (!isObj(raw)) return fail("answer is not an object");
  const a = raw as unknown as RawAnswer;
  if (!STATUSES.includes(a.status)) fail(`unknown status ${String(a.status)}`);
  if (!Array.isArray(a.sites) || !Array.isArray(a.securities)) fail("answer lists missing");
  if (a.status === "AVAILABLE" && a.securities.length === 0) fail("an empty AVAILABLE answer");
  if (a.status !== "AVAILABLE" && a.securities.length > 0) fail("securities outside AVAILABLE");
  if (!["AVAILABLE", "PARTIAL", "NO_COVERAGE"].includes(a.status) && a.sites.length)
    fail("sites listed for an unevaluated answer");
  for (const s of a.sites) if (!nodes[s.site] || !num(s.distance_km)) fail("unknown site");
  const securities = a.securities.map((r) => {
    if (!nodes[r.security] || !num(r.score) || !nodes[r.best_chain?.site]) fail("bad security");
    const hops = r.best_chain.hops.map((id) => edges[id] ?? fail(`unknown edge ${id}`));
    // The hops must form one connected path from the site to the security.
    if (hops[0]?.dst !== r.best_chain.site) fail("chain does not start at its site");
    let at = hops[0].src;
    for (const h of hops.slice(1)) {
      if (h.src !== at) fail("chain is not connected");
      at = h.dst;
      if (h.type === "listed_as" && h.dst !== r.security) fail("chain lists another security");
    }
    return { ...r, best_chain: { ...r.best_chain, hops } };
  });
  return {
    status: a.status,
    reason: typeof a.reason === "string" ? a.reason : null,
    radius_km: num(a.radius_km) ? a.radius_km : null,
    nearest_site_km: num(a.nearest_site_km) ? a.nearest_site_km : null,
    cutoff: typeof a.cutoff === "string" ? a.cutoff : null,
    evaluated: a.status === "AVAILABLE" || a.status === "PARTIAL" || a.status === "NO_COVERAGE",
    chains_total: num(a.chains_total) ? a.chains_total : null,
    sites: a.sites,
    securities,
  } satisfies GeoAnswer;
}

export function parseProjection(value: unknown, sha256: string, url: string): GeoProjection {
  if (!isObj(value) || value.schema_version !== "geo-projection/1") fail("unknown schema");
  const v = value as Record<string, unknown> & {
    nodes: Record<string, GeoNode>;
    edges: Record<string, GeoEdge>;
    events: (Omit<GeoEvent, "point_in_time" | "retrospective"> & {
      point_in_time: unknown;
      retrospective: unknown;
    })[];
  };
  if (!isObj(v.nodes) || !isObj(v.edges) || !Array.isArray(v.events)) fail("tables missing");
  for (const [id, n] of Object.entries(v.nodes)) {
    if (n.id !== id || !n.source?.url?.startsWith("https://")) fail(`node ${id} unsourced`);
    const located = ["facility", "port", "chokepoint"].includes(n.type);
    if (located && (!num(n.lat) || !num(n.lon) || !n.location_precision))
      fail(`site ${id} has no precision label`);
  }
  for (const [id, e] of Object.entries(v.edges))
    if (
      e.id !== id ||
      !v.nodes[e.src] ||
      !v.nodes[e.dst] ||
      !(e.confidence > 0 && e.confidence <= 1) ||
      !e.source?.url?.startsWith("https://")
    )
      fail(`edge ${id} malformed or unsourced`);
  const events = new Map<string, GeoEvent>();
  const scenarios: GeoEvent[] = [];
  for (const e of v.events) {
    if (typeof e.id !== "string" || events.has(e.id) || !num(e.lat) || !num(e.lon))
      fail("bad event");
    const event: GeoEvent = {
      ...e,
      point_in_time: answer(e.point_in_time, v.edges, v.nodes),
      retrospective: e.retrospective == null ? null : answer(e.retrospective, v.edges, v.nodes),
    };
    events.set(e.id, event);
    if (e.origin === "scenario") scenarios.push(event);
  }
  return {
    graph: v.graph as GeoProjection["graph"],
    input: v.input as GeoProjection["input"],
    precision: String(v.precision),
    radius_rule: String(v.radius_rule),
    score_rule: String(v.score_rule),
    nodes: v.nodes,
    edges: v.edges,
    events,
    scenarios,
    sha256,
    url,
  };
}

async function sha256Hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Fetch the static projection (same origin; Replay never calls the API) and refuse it unless its
 * size and SHA-256 match the pin compiled into this page. Every failure ends in "unavailable"
 * with its reason; nothing is drawn from unverified bytes.
 */
export async function loadGeoProjection(): Promise<GeoLoad> {
  const { url, sha256, bytes: expected, maxBytes } = GEO_PROJECTION_PIN;
  try {
    if (!globalThis.crypto?.subtle)
      return {
        status: "unavailable",
        reason: "Web Crypto is unavailable (a secure context is required) to verify the graph.",
      };
    const response = await fetch(url, { credentials: "omit", cache: "no-cache" });
    if (!response.ok)
      return { status: "unavailable", reason: `${url} returned HTTP ${response.status}` };
    const declared = Number(response.headers.get("content-length"));
    if (!response.headers.get("content-encoding") && declared > maxBytes)
      return {
        status: "unavailable",
        reason: `Oversized: the server declared ${declared} bytes, over the ${maxBytes} limit.`,
      };
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes)
      return {
        status: "unavailable",
        reason: `Oversized: ${bytes.byteLength} bytes, over the ${maxBytes} limit.`,
      };
    if (bytes.byteLength !== expected)
      return {
        status: "unavailable",
        reason: `Length mismatch: expected ${expected} bytes, received ${bytes.byteLength}.`,
      };
    const digest = await sha256Hex(bytes);
    if (digest !== sha256)
      return {
        status: "unavailable",
        reason: `SHA-256 mismatch: expected ${sha256.slice(0, 16)}…, received ${digest.slice(0, 16)}….`,
      };
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return { status: "ok", projection: parseProjection(value, digest, url) };
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Could not verify ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function useGeoProjection(): GeoLoad {
  const [state, setState] = useState<GeoLoad>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void loadGeoProjection().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** A live POST /geo/graph/propagate answer, in the same shape; unknown fields are refused. */
export function parseLiveAnswer(raw: unknown, nodes: Record<string, GeoNode>): GeoAnswer {
  if (!isObj(raw)) return fail("live answer is not an object");
  const r = raw as Record<string, unknown> & {
    event?: { radius_km?: number | null };
    securities?: { security: string; score: number; sites: string[]; best_chain: unknown }[];
  };
  const edges: Record<string, GeoEdge> = {};
  const live: Record<string, GeoNode> = { ...nodes };
  const securities = (r.securities ?? []).map((s) => {
    const c = s.best_chain as Omit<GeoChain, "hops"> & {
      hops: {
        edge: string;
        type: GeoEdge["type"];
        from: string;
        to: string;
        confidence: number;
        mechanism: string;
        source: GeoSource;
      }[];
    };
    for (const h of c.hops) {
      edges[h.edge] = {
        id: h.edge,
        type: h.type,
        src: h.from,
        dst: h.to,
        confidence: h.confidence,
        mechanism: h.mechanism,
        source: h.source,
      };
      // A node the static projection does not know is shown by its id, never renamed or typed.
      for (const id of [h.from, h.to])
        live[id] ??= {
          id,
          type: "unknown",
          name: id,
          lat: null,
          lon: null,
          location_precision: null,
          source: h.source,
        };
    }
    return { ...s, best_chain: { ...c, hops: c.hops.map((h) => h.edge) } };
  });
  for (const s of (r.sites as { site: string }[]) ?? []) if (!live[s.site]) fail("unknown site");
  return answer(
    { ...r, radius_km: r.event?.radius_km ?? null, securities },
    edges,
    live,
  ) as GeoAnswer;
}
