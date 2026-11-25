import type { GeoAnswer, GeoNode, GeoProjection } from "./geo-graph";

/**
 * What the globe draws for the knowledge graph, in latitude, longitude and altitude (globe radii).
 * Only sites carry coordinates in the graph. Companies and securities have none, so they are drawn
 * on tiers above the event (or above their operator's largest site cluster), never at a place.
 * Every arc is one cited edge, except event → site, which is the event's distance to the site.
 */
export type ArcKind = "proximity" | "operates" | "ships_through" | "supplies" | "listed_as";
export type OverlayArc = {
  key: string;
  a: [number, number, number];
  b: [number, number, number];
  /** The encoded value in [0, 1]: hop confidence, or proximity for event → site. */
  value: number;
  kind: ArcKind;
  /** The rendered colour, from arcRgb(): the one mapping the scene and the legend share. */
  rgb: [number, number, number];
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
  scenario: boolean;
  /** Reached securities drawn on the globe without a label (beyond MAX_LABELS); listed in the panel. */
  moreLabels: number;
};
/** At most this many ticker labels on the globe, the highest chain scores first. */
export const MAX_LABELS = 5;

/** Hue names the edge type. Scenario arcs use an amber family so a hypothesis never looks recorded. */
export const ARC_COLORS: Record<ArcKind, string> = {
  proximity: "#ffd166",
  operates: "#5eead4",
  ships_through: "#5eead4",
  supplies: "#3fe0ff",
  listed_as: "#b794ff",
};
export const SCENARIO_ARC_COLORS: Record<ArcKind, string> = {
  proximity: "#ffe08a",
  operates: "#ffb347",
  ships_through: "#ffb347",
  supplies: "#ff9f43",
  listed_as: "#ffc078",
};
export const SITE_COLORS: Record<string, string> = {
  facility: "#5eead4",
  port: "#60a5fa",
  chokepoint: "#c084fc",
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/** Light emitted per unit value: 0.12 at value 0 so a weak arc stays visible, 1 at value 1. */
export const arcGain = (value: number) => 0.12 + 0.88 * Math.min(1, Math.max(0, value));
/**
 * The sRGB colour (0..1) of an arc of this kind and value: the hue's linear light scaled by the
 * gain, back in sRGB. The scene sets exactly this colour and the legend paints exactly this colour.
 */
export function arcRgb(kind: ArcKind, value: number, scenario = false): [number, number, number] {
  const hex = (scenario ? SCENARIO_ARC_COLORS : ARC_COLORS)[kind];
  const gain = arcGain(value);
  return [1, 3, 5].map((i) => toSrgb(toLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * gain)) as [
    number,
    number,
    number,
  ];
}
export const cssRgb = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

const SURFACE = 1.004;
const TIERS = [1.12, 1.24, 1.36];
const SPREAD = 7; // degrees of longitude between neighbours on a tier

export const shortName = (n: GeoNode | undefined, id: string) => {
  if (!n) return id;
  const s = n.type === "security" ? n.name.split(" ")[0] : n.name.split(",")[0];
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
};
/** A company's ticker on the globe; companies without a cited listing get no globe label. */
function ticker(p: GeoProjection, id: string) {
  const n = p.nodes[id];
  if (n?.type === "security") return shortName(n, id);
  const listing = Object.values(p.edges).find((e) => e.type === "listed_as" && e.src === id);
  return listing ? shortName(p.nodes[listing.dst], listing.dst) : null;
}

function tier(ids: string[], lat: number, lon: number, level: number, fan = false) {
  const out = new Map<string, [number, number, number]>();
  // A fanned tier spaces its nodes wider and staggers alternate ones in latitude, so the labels
  // of neighbours never sit on one line.
  const step = fan ? SPREAD * 1.6 : SPREAD;
  ids.forEach((id, k) =>
    out.set(id, [
      Math.max(-80, Math.min(80, lat + 2 * level + (fan && k % 2 ? 4 : 0))),
      lon + (k - (ids.length - 1) / 2) * step,
      TIERS[level],
    ]),
  );
  return out;
}

const located = (p: GeoProjection) =>
  Object.values(p.nodes).filter((n) => n.lat != null && n.lon != null);

/** True when the answer draws its own chain, which then replaces the static companies layer. */
export const drawsChain = (a: GeoAnswer | null | undefined) =>
  !!a && (a.status === "AVAILABLE" || a.status === "PARTIAL");

export function buildOverlay(
  p: GeoProjection,
  layers: { sites: boolean; companies: boolean },
  selected: { lat: number; lon: number; answer: GeoAnswer; scenario: boolean } | null,
): GeoOverlay {
  const sites: OverlaySite[] = [];
  const arcs: OverlayArc[] = [];
  const labels: OverlayLabel[] = [];
  let moreLabels = 0;
  const scenario = !!selected?.scenario && drawsChain(selected.answer);
  const arc = (key: string, a: OverlayArc["a"], b: OverlayArc["b"], value: number, kind: ArcKind) =>
    arcs.push({ key, a, b, value, kind, rgb: arcRgb(kind, value, scenario) });
  const at = (id: string): [number, number, number] => {
    const n = p.nodes[id];
    return [n.lat!, n.lon!, SURFACE];
  };
  const label = (id: string, pos: [number, number, number]) => {
    const text = ticker(p, id);
    if (text) labels.push({ key: id, lat: pos[0], lon: pos[1], alt: pos[2], text, cls: "sec" });
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
  if (selected && answer && drawsChain(answer)) {
    const ev: [number, number, number] = [selected.lat, selected.lon, SURFACE];
    const radius = answer.radius_km ?? 0;
    for (const s of answer.sites)
      if (radius > 0)
        arc(
          `event>${s.site}`,
          ev,
          at(s.site),
          Math.max(0, 1 - s.distance_km / radius),
          "proximity",
        );
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
    const pos = new Map([0, 1, 2].flatMap((k) => [...tier(levels[k], ev[0], ev[1], k, true)]));
    for (const r of answer.securities)
      for (const h of r.best_chain.hops) {
        if (h.type === "exposed_to") continue;
        const site = h.type === "operates" || h.type === "ships_through";
        const a = site ? at(h.dst) : pos.get(h.src);
        const b = site ? pos.get(h.src) : pos.get(h.dst);
        if (a && b && !arcs.some((x) => x.key === h.id)) arc(h.id, a, b, h.confidence, h.type);
      }
    // Tickers only on the globe, the top MAX_LABELS by chain score (securities arrive ranked);
    // company names and the rest live in the panel.
    for (const id of levels[2].slice(0, MAX_LABELS)) label(id, pos.get(id)!);
    moreLabels = Math.max(0, levels[2].length - MAX_LABELS);
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
            arc(key, site, pos.get(op)!, e.confidence, "operates");
        }
        if (e.type === "supplies" && pos.has(e.src) && pos.has(e.dst))
          arc(e.id, pos.get(e.src)!, pos.get(e.dst)!, e.confidence, "supplies");
      }
      for (const [id, xyz] of pos) label(id, xyz);
    });
  }
  return {
    sites,
    arcs,
    labels,
    scenario,
    moreLabels,
    event: selected
      ? { lat: selected.lat, lon: selected.lon, radiusKm: selected.answer.radius_km }
      : null,
  };
}
