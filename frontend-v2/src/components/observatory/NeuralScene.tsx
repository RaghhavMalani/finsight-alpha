import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type Group,
} from "three";
import { createLineBundle, createPointCloud } from "./bundles";
import { esc, fmt } from "./format";
import { GlowCurves } from "./GlowCurves";
import { GlowPoints } from "./GlowPoints";
import {
  familyHex,
  NEGATIVE,
  NEURAL_FAMILY_COLORS,
  POSITIVE,
  stateAt,
  type NeuralView,
} from "./neural-model";
import { pickNearest, showTip, useCanvasPointer } from "./pointer";
import type { LabelLayer, LabelSpec } from "./SceneLabels";

const SEGMENTS = 9,
  HEIGHT = 9.6,
  WIDTH = 17.6,
  /** Most connections drawn between two layers: the strongest by |w| in the final snapshot. */
  EDGE_CAP = 2000;
const zOf = (x: number) => -0.03 * x * x;

type Edge = { l: number; from: number; to: number };

/**
 * The network as it trains. Columns are layers, glows are units, and every connection is a
 * curve coloured by the sign of its weight (cyan positive, magenta negative) and lit by its
 * size relative to the layer's largest. Scrubbing interpolates between recorded snapshots;
 * pulses run input → output, the direction of the forward pass.
 */
export default function NeuralScene({
  view,
  epoch,
  reduced,
  labels,
  tip,
}: {
  view: NeuralView;
  epoch: number;
  reduced: boolean;
  labels: LabelLayer;
  tip: HTMLElement | null;
}) {
  const group = useRef<Group>(null);
  const pointer = useCanvasPointer();
  const viewRef = useRef(view);
  viewRef.current = view;

  const sim = useMemo(() => {
    const sizes = view.sizes,
      L = sizes.length;
    const X = sizes.map((_, l) => -WIDTH / 2 + (WIDTH * l) / (L - 1));
    // Inputs fill the column, with a small gap between families; hidden layers stay compact.
    const ys: number[][] = sizes.map((n, l) => {
      if (l === 0) {
        const gaps = view.families.length - 1,
          step = HEIGHT / Math.max(1, n - 1 + gaps * 1.6);
        return view.features.map((_, i) => {
          const slot = view.inputSlot[i],
            gap = view.family[i] * 1.6;
          return HEIGHT / 2 - (slot + gap) * step;
        });
      }
      const span = Math.min(HEIGHT * 0.9, 0.46 * (n - 1));
      return Array.from({ length: n }, (_, k) => (n === 1 ? 0 : span / 2 - (span * k) / (n - 1)));
    });
    const offset = sizes.map((_, l) => sizes.slice(0, l).reduce((a, b) => a + b, 0));
    const final = view.snapshots[view.snapshots.length - 1];
    // Fixed edge set per structure: every connection, or the strongest EDGE_CAP at the end.
    const edges: Edge[] = [];
    for (let l = 0; l < L - 1; l++) {
      const layer: Edge[] = [];
      for (let from = 0; from < sizes[l]; from++)
        for (let to = 0; to < sizes[l + 1]; to++) layer.push({ l, from, to });
      if (layer.length > EDGE_CAP && final) {
        const w = final.weights[l];
        layer.sort((a, b) => Math.abs(w[b.from][b.to]) - Math.abs(w[a.from][a.to]));
        layer.length = EDGE_CAP;
      }
      edges.push(...layer);
    }
    const bundle = createLineBundle(edges.length * (SEGMENTS - 1) * 2, 0.22);
    // Hundreds of curves converge on each unit; scale additive brightness by the densest
    // layer pair so overlap lights the structure instead of blowing out under bloom.
    const densest = Math.max(...sizes.slice(1).map((n, l) => Math.min(EDGE_CAP, n * sizes[l])));
    bundle.material.uniforms.uGain.value = Math.min(1, Math.sqrt(70 / densest));
    const path = new CubicBezierCurve3(new Vector3(), new Vector3(), new Vector3(), new Vector3()),
      pts = Array.from({ length: SEGMENTS }, () => new Vector3());
    let v = 0;
    edges.forEach((e, n) => {
      const x0 = X[e.l],
        x1 = X[e.l + 1],
        y0 = ys[e.l][e.from],
        y1 = ys[e.l + 1][e.to],
        dx = x1 - x0;
      path.v0.set(x0, y0, zOf(x0));
      path.v1.set(x0 + dx * 0.45, y0, zOf(x0 + dx * 0.45));
      path.v2.set(x1 - dx * 0.45, y1, zOf(x1 - dx * 0.45));
      path.v3.set(x1, y1, zOf(x1));
      for (let k = 0; k < SEGMENTS; k++) path.getPoint(k / (SEGMENTS - 1), pts[k]);
      for (let k = 1; k < SEGMENTS; k++)
        for (const q of [k - 1, k]) {
          bundle.position.setXYZ(v, pts[q].x, pts[q].y, pts[q].z);
          bundle.t.setX(v, (e.l + q / (SEGMENTS - 1)) / (L - 1));
          bundle.key.setXY(v, offset[e.l] + e.from, offset[e.l + 1] + e.to);
          bundle.layer.setX(v, e.l + 1);
          bundle.phase.setX(v, (n % 7) * 0.002);
          v++;
        }
    });
    const total = sizes.reduce((a, b) => a + b, 0);
    const nodes = createPointCloud(total);
    const anchors: [number, Vector3][] = [];
    sizes.forEach((n, l) => {
      for (let k = 0; k < n; k++) {
        const id = offset[l] + k,
          p = new Vector3(X[l], ys[l][k], zOf(X[l]));
        nodes.position.setXYZ(id, p.x, p.y, p.z);
        nodes.key.setX(id, id);
        nodes.layer.setX(id, l);
        anchors.push([id, p]);
      }
    });
    const spine = new BufferGeometry();
    spine.setAttribute(
      "position",
      new Float32BufferAttribute(
        X.flatMap((x) => [x, HEIGHT / 2 + 0.35, zOf(x), x, -HEIGHT / 2 - 0.35, zOf(x)]),
        3,
      ),
    );
    const spines = new LineSegments(
      spine,
      new LineBasicMaterial({
        color: 0xe7eaec,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    );
    return {
      sizes,
      L,
      X,
      ys,
      offset,
      edges,
      bundle,
      nodes,
      anchors,
      spines,
      shown: -1,
      snapshotCount: -1,
      hover: null as number | null,
    };
    // Geometry follows the network's shape; weights are rewritten in place as they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.structureKey]);
  useEffect(
    () => () => {
      sim.spines.geometry.dispose();
      (sim.spines.material as LineBasicMaterial).dispose();
      labels.set([]);
      showTip(tip, null, 0, 0, 0);
    },
    [sim, labels, tip],
  );
  const inputNodes = useMemo(
    () => view.features.map((label, id) => ({ id, label })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.structureKey],
  );

  const pos = new Color(POSITIVE),
    neg = new Color(NEGATIVE),
    tmp = new Color();
  /** Rewrite edge colour/weight and unit glow for a scrub epoch. */
  function paint(at: number) {
    const v = viewRef.current;
    const state = stateAt(v, at);
    if (!state) return;
    const { bundle, nodes, edges, offset, sizes } = sim;
    const maxAbs = state.weights.map((w) =>
      Math.max(1e-9, ...w.map((row) => Math.max(...row.map(Math.abs)))),
    );
    let k = 0;
    for (const e of edges) {
      const w = state.weights[e.l][e.from]?.[e.to] ?? 0,
        mag = Math.pow(Math.abs(w) / maxAbs[e.l], 0.75),
        c = w >= 0 ? pos : neg;
      for (let s = 0; s < (SEGMENTS - 1) * 2; s++, k++) {
        bundle.color.setXYZ(k, c.r, c.g, c.b);
        bundle.w.setX(k, mag < 0.04 ? 0 : mag * 0.9);
      }
    }
    sizes.forEach((n, l) => {
      for (let u = 0; u < n; u++) {
        const id = offset[l] + u;
        if (l === 0) {
          tmp.set(familyHex(v, u));
          const share = v.run.attribution[u] ?? 0,
            maxShare = Math.max(1e-9, ...v.run.attribution);
          nodes.color.setXYZ(id, tmp.r, tmp.g, tmp.b);
          nodes.size.setX(id, 0.07 + 0.16 * Math.sqrt(share / maxShare));
          nodes.alpha.setX(id, 0.55 + 0.45 * Math.sqrt(share / maxShare));
        } else if (l === sizes.length - 1) {
          nodes.color.setXYZ(id, 1, 0.82, 0.55);
          nodes.size.setX(id, 0.42);
          nodes.alpha.setX(id, 1);
        } else {
          const live = state.activeFraction[l - 1]?.[u] ?? 0,
            mean = Math.abs(state.meanActivation[l - 1]?.[u] ?? 0),
            peak = Math.max(1e-9, ...state.meanActivation[l - 1].map(Math.abs));
          // Dead units (never active on validation rows) fade to grey.
          tmp.setRGB(0.45, 0.48, 0.52).lerp(new Color(1, 0.72, 0.32), Math.min(1, live * 1.4));
          nodes.color.setXYZ(id, tmp.r, tmp.g, tmp.b);
          nodes.size.setX(id, 0.1 + 0.22 * Math.sqrt(mean / peak));
          nodes.alpha.setX(id, 0.25 + 0.75 * live);
        }
      }
    });
    bundle.commit();
    nodes.commit();
  }

  function setLabels() {
    const v = viewRef.current,
      list: LabelSpec[] = [];
    const at = (x: number, y: number) => new Vector3(x, y, zOf(x));
    const a = v.run.architecture;
    sim.sizes.forEach((n, l) => {
      const x = sim.X[l],
        top = Math.max(...sim.ys[l]),
        bottom = Math.min(...sim.ys[l]);
      const header =
        l === 0
          ? `Inputs<small>${n} features</small>`
          : l === sim.sizes.length - 1
            ? "Output<small>P(up) · sigmoid</small>"
            : `Hidden ${l}<small>${n} · ${esc(a.activation)}</small>`;
      list.push({ pos: at(x, top + 0.45), valign: "bottom", pri: 3, html: header });
      const row = v.epochs[Math.min(v.epochs.length, Math.round(sim.shown)) - 1];
      if (l > 0 && row)
        list.push({
          pos: at((sim.X[l - 1] + x) / 2, Math.min(bottom, Math.min(...sim.ys[l - 1])) - 0.4),
          valign: "top",
          cls: "rho",
          pri: 1,
          html: `‖W${l}‖ ${row.weight_norm[l - 1].toFixed(2)}`,
        });
    });
    // Family names beside the input column.
    v.families.forEach((name, k) => {
      const ys = v.features
        .map((_, i) => i)
        .filter((i) => v.family[i] === k)
        .map((i) => sim.ys[0][i]);
      if (!ys.length) return;
      list.push({
        pos: at(sim.X[0], (Math.max(...ys) + Math.min(...ys)) / 2),
        dx: -14,
        align: "right",
        color: NEURAL_FAMILY_COLORS[name],
        pri: 3,
        html: `${esc(name)}<small>${ys.length}</small>`,
      });
    });
    if (sim.hover != null && sim.hover < v.features.length)
      list.push({
        pos: at(sim.X[0], sim.ys[0][sim.hover]),
        dx: 12,
        align: "left",
        cls: "feat",
        color: familyHex(v, sim.hover),
        html: esc(v.features[sim.hover]),
      });
    labels.set(list);
  }

  function tooltip(id: number) {
    const v = viewRef.current,
      state = stateAt(v, sim.shown);
    let l = 0;
    while (l + 1 < sim.offset.length && id >= sim.offset[l + 1]) l++;
    const u = id - sim.offset[l];
    const probe = v.run.probe;
    if (l === 0) {
      const share = v.run.attribution[u];
      return `<strong style="color:${familyHex(v, u)}">${esc(v.features[u])}</strong>${esc(v.families[v.family[u]])}<br>attribution ${share == null ? "n/a" : (share * 100).toFixed(1) + "%"}${probe ? `<br>latest row ${fmt(probe.input[u], 2)}σ` : ""}`;
    }
    if (!state) return null;
    const bias = state.biases[l - 1][u],
      incoming = Math.sqrt(state.weights[l - 1].reduce((s, row) => s + row[u] ** 2, 0));
    if (l === sim.sizes.length - 1)
      return `<strong>Output unit</strong>bias ${fmt(bias)} · ‖w in‖ ${incoming.toFixed(2)}${probe ? `<br>latest row → ${probe.output.toFixed(3)} (not a forecast)` : ""}`;
    return `<strong>Hidden ${l} · unit ${u + 1}</strong>mean activation ${fmt(state.meanActivation[l - 1][u])}<br>active on ${(state.activeFraction[l - 1][u] * 100).toFixed(0)}% of validation rows<br>bias ${fmt(bias)} · ‖w in‖ ${incoming.toFixed(2)}${probe?.activations[l - 1] ? `<br>latest row ${fmt(probe.activations[l - 1][u])}` : ""}`;
  }

  useFrame(({ camera, size, scene, clock }) => {
    const g = group.current;
    if (!g) return;
    const v = viewRef.current;
    // Ease toward the scrubbed epoch so replay and training read as continuous motion.
    const target = Math.min(epoch, v.lastEpoch);
    const next =
      sim.shown < 0 || reduced ? target : sim.shown + (target - sim.shown) * Math.min(1, 0.22);
    const settled = Math.abs(next - target) < 0.01 ? target : next;
    if (settled !== sim.shown || v.snapshots.length !== sim.snapshotCount) {
      sim.shown = settled;
      sim.snapshotCount = v.snapshots.length;
      paint(settled);
      setLabels();
    }
    if (!reduced) g.rotation.y = 0.12 * Math.sin(clock.elapsedTime * 0.09);
    const hit = pickNearest(pointer.current, sim.anchors, g, camera, size.width, size.height);
    const id = hit?.id ?? null;
    sim.bundle.material.uniforms.uHover.value = id ?? -1;
    sim.nodes.material.uniforms.uHover.value = id ?? -1;
    scene.userData.hover = id;
    if (id !== sim.hover) {
      sim.hover = id;
      setLabels();
    }
    showTip(tip, hit ? tooltip(hit.id) : null, hit?.x ?? 0, hit?.y ?? 0, size.width);
    labels.place(g, camera, size.width, size.height);
  });

  return (
    <group ref={group}>
      <primitive object={sim.spines} />
      <GlowCurves bundle={sim.bundle} reduced={reduced} />
      <GlowPoints cloud={sim.nodes} nodes={inputNodes} />
    </group>
  );
}
