import { MOTION, STATE, type ColorName } from "@/visual/tokens";
import type { ResearchGraph } from "./contract";
import type { Layout } from "./layouts";
import { nodeSize, stateColor, viewsAt, type NodeView, type Replay } from "./model";

export type NodePaint = {
  color: ColorName;
  size: number;
  alpha: number;
  /** 0 filled, 1 hollow (rule not met), 2 dashed (no result / unavailable). */
  ring: 0 | 1 | 2;
  pulse: number;
  flareAt: number;
};
export type EdgePaint = {
  color: ColorName;
  w: number;
  /** Particles travel along this edge until replay time `until`. */
  flowing: boolean;
  until: number;
};
export type Paint = { views: NodeView[]; nodes: NodePaint[]; edges: EdgePaint[] };

/**
 * What every node and edge looks like after `step` recorded events. Pure, shared by the
 * WebGL and 2D renderers, so both show exactly the same state.
 */
export function paintAt(
  graph: ResearchGraph,
  layout: Layout,
  replay: Replay,
  step: number,
  selected: number,
): Paint {
  const views = viewsAt(graph, replay, step);
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const neighbours = new Set<number>();
  if (selected >= 0)
    for (const e of graph.edges) {
      const a = index.get(e.from)!,
        b = index.get(e.to)!;
      if (a === selected) neighbours.add(b);
      if (b === selected) neighbours.add(a);
    }
  const nodes = graph.nodes.map((n, i): NodePaint => {
    const v = views[i],
      s = STATE[v.state],
      dormant = v.state === "dormant";
    const focusLift = selected < 0 || selected === i ? 1 : neighbours.has(i) ? 0.85 : 0.22;
    return {
      color: stateColor(v.state),
      size: nodeSize(n) * (dormant ? 0.55 : 1),
      alpha: s.glow * focusLift,
      ring: v.state === "unavailable" ? 2 : v.state === "inconclusive" ? 1 : 0,
      pulse: v.running ? 1 : 0,
      flareAt: v.flareAt,
    };
  });
  const finding = index.get("F")!,
    skeptic = index.get("SK")!;
  const edges = graph.edges.map((e): EdgePaint => {
    const a = index.get(e.from)!,
      b = index.get(e.to)!,
      va = views[a],
      vb = views[b];
    const lit = (on: boolean, w: number) => (on ? w : 0.05);
    const focus = selected < 0 || a === selected || b === selected ? 1 : 0.3;
    let p: EdgePaint;
    switch (e.kind) {
      case "HOLM_FAMILY": {
        const on = views[finding].state !== "dormant";
        p = {
          color: on ? "teal" : "faint",
          w: lit(on, 0.13),
          flowing: on,
          until: views[finding].flareAt + 1.6,
        };
        break;
      }
      case "CHALLENGES": {
        const closed = views[finding].state === "challenged";
        const open = views[skeptic].state !== "dormant";
        p = {
          color: closed ? "red" : open ? "magenta" : "faint",
          w: lit(open, closed ? 0.95 : 0.7),
          flowing: open && (views[skeptic].running || closed),
          until: closed ? views[finding].flareAt + MOTION.shock : 1e9,
        };
        break;
      }
      case "VERIFIES": {
        const on = va.state !== "dormant";
        p = { color: stateColor(va.state), w: lit(on, 0.42), flowing: on, until: va.flareAt + 1.2 };
        break;
      }
      case "VERDICT": {
        const on = va.state !== "dormant";
        p = { color: stateColor(va.state), w: lit(on, 0.3), flowing: false, until: 0 };
        break;
      }
      case "CASE":
      case "MUTANT":
      case "SETTING":
      case "GUARD": {
        const on = va.state !== "dormant";
        p = {
          color: stateColor(on ? va.state : vb.state),
          w: lit(on || vb.state !== "dormant", on ? 0.34 : 0.12),
          flowing: vb.running,
          until: 1e9,
        };
        break;
      }
      default: {
        // Hypothesis to question or trial: lit by the target's state, flowing while it runs.
        const on = vb.state !== "dormant";
        p = {
          color: stateColor(on ? vb.state : "dormant"),
          w: lit(on, vb.running ? 0.75 : 0.36 * STATE[vb.state].glow + 0.08),
          flowing: vb.running,
          until: 1e9,
        };
      }
    }
    p.w *= focus;
    return p;
  });
  return { views, nodes, edges };
}
