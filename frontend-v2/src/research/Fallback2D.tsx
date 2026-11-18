import { useEffect, useRef } from "react";
import { clearVoid, glowCurve, glowNode } from "@/visual/canvas2d";
import type { ResearchGraph } from "./contract";
import type { SceneBus } from "./bus";
import { bezier, type Layout, type Vec3 } from "./layouts";
import type { Replay } from "./model";
import { paintAt } from "./paint";
import type { Insets } from "./ResearchScene";

/**
 * Without WebGL the same layout is drawn flat on a 2D canvas with additive glow. It
 * repaints only when the replay step or selection changes; there is no flow animation.
 */
export default function Fallback2D({
  graph,
  layout,
  replay,
  bus,
  insets,
}: {
  graph: ResearchGraph;
  layout: Layout;
  replay: Replay;
  bus: SceneBus;
  insets: Insets;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
    let raf = 0,
      drawn = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth,
        h = canvas.clientHeight,
        dpr = Math.min(2, window.devicePixelRatio || 1);
      const key = `${bus.step}|${bus.version}|${w}|${h}`;
      if (key === drawn) return;
      drawn = key;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Orthographic view along the layout's camera direction, fitted to the free area.
      const [dx, dy, dz] = layout.camera.dir,
        l = Math.hypot(dx, dy, dz),
        dir: Vec3 = [dx / l, dy / l, dz / l];
      const right: Vec3 = [dir[2], 0, -dir[0]],
        rl = Math.hypot(...right) || 1;
      right[0] /= rl;
      right[2] /= rl;
      const up: Vec3 = [
        dir[1] * right[2] - dir[2] * right[1],
        dir[2] * right[0] - dir[0] * right[2],
        dir[0] * right[1] - dir[1] * right[0],
      ];
      const flat = (p: Vec3) => [
        p[0] * right[0] + p[1] * right[1] + p[2] * right[2],
        p[0] * up[0] + p[1] * up[1] + p[2] * up[2],
      ];
      const pts = layout.pos.map(flat);
      const xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs) - 1,
        maxX = Math.max(...xs) + 1,
        minY = Math.min(...ys) - 1,
        maxY = Math.max(...ys) + 1;
      const fw = w - insets.left - insets.right,
        fh = h - insets.top - insets.bottom;
      const s = Math.min(fw / (maxX - minX), fh / (maxY - minY));
      const ox = insets.left + (fw - (maxX - minX) * s) / 2,
        oy = insets.top + (fh - (maxY - minY) * s) / 2;
      const scr = (p: Vec3): [number, number] => {
        const [x, y] = flat(p);
        return [ox + (x - minX) * s, oy + (maxY - y) * s];
      };
      const p = paintAt(graph, layout, replay, bus.step, bus.selected);
      clearVoid(ctx, w, h);
      graph.edges.forEach((e, k) => {
        const a = layout.pos[index.get(e.from)!],
          b = layout.pos[index.get(e.to)!],
          [c1, c2] = layout.ctrl[k];
        const mid = bezier(a, c1, c2, b, 0.5);
        const A = scr(a),
          B = scr(b),
          M = scr(mid);
        // Quadratic through the cubic's midpoint.
        const C: [number, number] = [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];
        glowCurve(ctx, A, C, B, p.edges[k].color, Math.min(1, 0.1 + p.edges[k].w * 0.9), 1);
      });
      p.nodes.forEach((n, i) => {
        const [x, y] = scr(layout.pos[i]);
        glowNode(
          ctx,
          x,
          y,
          Math.max(2, n.size * s * 0.32),
          n.color,
          Math.min(1, n.alpha),
          n.ring === 2 ? "dashed" : n.ring === 1,
        );
      });
      const nodes = new Float32Array(graph.nodes.length * 3),
        labels = new Float32Array(layout.labels.length * 3);
      layout.pos.forEach((q, i) => nodes.set([...scr(q), 1], i * 3));
      layout.labels.forEach((q, i) => labels.set([...scr(q.at), 1], i * 3));
      bus.onProject?.(nodes, labels);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [graph, layout, replay, bus, insets]);
  return <canvas ref={ref} className="rs-canvas2d" aria-hidden="true" data-renderer="2d" />;
}
