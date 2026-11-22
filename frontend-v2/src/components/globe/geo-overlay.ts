import type { GeoAnswer, GeoNode, GeoProjection } from "./geo-graph";

/**
 * What the globe draws for the knowledge graph, in latitude, longitude and altitude (globe radii).
 * Only sites carry coordinates in the graph. Companies and securities have none, so they are drawn
 * on tiers above the event (or above their operator's largest site cluster), never at a place.
 * Every arc is one cited edge, except event → site, which is the event's distance to the site.
 */
export type OverlayArc = {
  key: string;
  a: [number, number, number];
  b: [number, number, number];
  /** The encoded value in [0, 1]: hop confidence, or proximity for event → site. */
  value: number;
  kind: "proximity" | "operates" | "ships_through" | "supplies" | "listed_as";
};
export type OverlaySite = { key: string; lat: number; lon: number; type: GeoNode["type"] };
export type OverlayLabel = {
  key: string;
  lat: number;
  lon: number;
  alt: number;
  text: string;
  cls: string;
};
export type GeoOverlay = {
  sites: OverlaySite[];
  arcs: OverlayArc[];
  labels: OverlayLabel[];
  event: { lat: number; lon: number; radiusKm: number | null } | null;
};

export const ARC_COLORS: Record<OverlayArc["kind"], string> = {
  proximity: "#ffd166",
  operates: "#5eead4",
  ships_through: "#5eead4",
  supplies: "#3fe0ff",
  listed_as: "#f0a929",
};
export const SITE_COLORS: Record<string, string> = {
  facility: "#5eead4",
  port: "#60a5fa",
  chokepoint: "#c084fc",
};
const SURFACE = 1.004;
const TIERS = [1.12, 1.24, 1.36];
const SPREAD = 7; // degrees of longitude between neighbours on a tier

export const shortName = (n: GeoNode | undefined, id: string) => {
  if (!n) return id;
  const s = n.type === "security" ? n.name.split(" ")[0] : n.name.split(",")[0];
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
};

function tier(ids: string[], lat: number, lon: number, level: number) {
  const out = new Map<string, [number, number, number]>();
  ids.forEach((id, k) =>
    out.set(id, [
      Math.max(-80, Math.min(80, lat + 2 * level)),
      lon + (k - (ids.length - 1) / 2) * SPREAD,
      TIERS[level],
    ]),
  );
  return out;
}

const located = (p: GeoProjection) =>
  Object.values(p.nodes).filter((n) => n.lat != null && n.lon != null);

export function buildOverlay(
  p: GeoProjection,
  layers: { sites: boolean; companies: boolean },
  selected: { lat: number; lon: number; answer: GeoAnswer } | null,
): GeoOverlay {
  const sites: OverlaySite[] = [];
  const arcs: OverlayArc[] = [];
  const labels: OverlayLabel[] = [];
  const at = (id: string): [number, number, number] => {
    const n = p.nodes[id];
    return [n.lat!, n.lon!, SURFACE];
  };
  if (layers.sites) {
    const seen = new Set<string>();
    for (const n of located(p)) {
      const key = `${n.lat},${n.lon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sites.push({ key, lat: n.lat!, lon: n.lon!, type: n.type });
    }
  }
  const answer = selected?.answer;
  const drawsChain = !!answer && (answer.status === "AVAILABLE" || answer.status === "PARTIAL");
  if (selected && answer && drawsChain) {
    const ev: [number, number, number] = [selected.lat, selected.lon, SURFACE];
    const radius = answer.radius_km ?? 0;
    for (const s of answer.sites)
      if (radius > 0)
        arcs.push({
          key: `event>${s.site}`,
          a: ev,
          b: at(s.site),
          value: Math.max(0, 1 - s.distance_km / radius),
          kind: "proximity",
        });
    const levels: string[][] = [[], [], []];
    const add = (level: number, id: string) => {
      if (!levels.some((l) => l.includes(id))) levels[level].push(id);
    };
    for (const r of answer.securities)
      for (const h of r.best_chain.hops) {
        if (h.type === "operates" || h.type === "ships_through") add(0, h.src);
        if (h.type === "supplies") add(1, h.dst);
        if (h.type === "listed_as") add(2, h.dst);
      }
    const pos = new Map([0, 1, 2].flatMap((k) => [...tier(levels[k], ev[0], ev[1], k)]));
    for (const r of answer.securities)
      for (const h of r.best_chain.hops) {
        if (h.type === "exposed_to") continue;
        const a = h.type === "operates" || h.type === "ships_through" ? at(h.dst) : pos.get(h.src);
        const b =
          h.type === "operates" || h.type === "ships_through" ? pos.get(h.src) : pos.get(h.dst);
        if (a && b && !arcs.some((x) => x.key === h.id))
          arcs.push({ key: h.id, a, b, value: h.confidence, kind: h.type });
      }
    for (const [id, [lat, lon, alt]] of pos)
      labels.push({
        key: id,
        lat,
        lon,
        alt,
        text: shortName(p.nodes[id], id),
        cls: p.nodes[id]?.type === "security" ? "sec" : "co",
      });
  } else if (layers.companies) {
    // Each operator floats above its largest site cluster, tethered to every site it operates;
    // the other companies ring it, joined only by cited supplies edges.
    const edges = Object.values(p.edges);
    const operators = [...new Set(edges.filter((e) => e.type === "operates").map((e) => e.src))];
    const others = Object.values(p.nodes)
      .filter((n) => n.type === "company" && !operators.includes(n.id))
      .map((n) => n.id)
      .sort();
    operators.forEach((op, k) => {
      const clusters = new Map<string, number>();
      for (const e of edges)
        if (e.src === op && e.type === "operates") {
          const key = at(e.dst).slice(0, 2).join();
          clusters.set(key, (clusters.get(key) ?? 0) + 1);
        }
      const [lat, lon] = [...clusters.entries()]
        .sort((a, b) => b[1] - a[1])[0][0]
        .split(",")
        .map(Number);
      const pos = new Map([
        ...tier([op], lat, lon, 0),
        ...tier(k === 0 ? others : [], lat, lon, 1),
      ]);
      for (const e of edges) {
        if (e.src === op && e.type === "operates") {
          const site = at(e.dst);
          const key = `${op}>${site[0]},${site[1]}`;
          if (!arcs.some((x) => x.key === key))
            arcs.push({ key, a: site, b: pos.get(op)!, value: e.confidence, kind: "operates" });
        }
        if (e.type === "supplies" && pos.has(e.src) && pos.has(e.dst))
          arcs.push({
            key: e.id,
            a: pos.get(e.src)!,
            b: pos.get(e.dst)!,
            value: e.confidence,
            kind: "supplies",
          });
      }
      for (const [id, [la, lo, alt]] of pos)
        labels.push({
          key: id,
          lat: la,
          lon: lo,
          alt,
          text: shortName(p.nodes[id], id),
          cls: "co",
        });
    });
  }
  return {
    sites,
    arcs,
    labels,
    event: selected
      ? { lat: selected.lat, lon: selected.lon, radiusKm: selected.answer.radius_km }
      : null,
  };
}
