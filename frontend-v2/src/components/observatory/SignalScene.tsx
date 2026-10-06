import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createLineBundle, createPointCloud } from "./bundles";
import { esc, gauss, monthRange, rng } from "./format";
import { GlowCurves } from "./GlowCurves";
import { GlowPoints } from "./GlowPoints";
import { pickNearest, showTip, useCanvasPointer } from "./pointer";
import { PANEL } from "./SceneFrame";
import type { LabelLayer, LabelSpec } from "./SceneLabels";
import {
  aucTone,
  FAMILY_COLORS,
  familyColor,
  foldAuc,
  importanceAt,
  TONE_VAR,
  type SignalView,
} from "./signal-model";

/** Strands per feature curve and segments per strand. */
const STRANDS = 5,
  SEGMENTS = 26,
  HEIGHT = 9.6;
/** Column x positions: the input column, then one per fold, on a shallow arc (z = −0.045x²). */
const REFERENCE_X = [-8.6, -4.9, -1.6, 1.6, 4.9, 8.2];
const columnX = (folds: number) =>
  folds === 5
    ? REFERENCE_X
    : Array.from({ length: folds + 1 }, (_, L) => -8.6 + (16.8 * L) / folds);
const zOf = (x: number) => -0.045 * x * x;

/**
 * Feature flow. Columns are the input slots and the walk-forward folds; every feature is one
 * line through all of them, re-sorted in each fold by how much the trees used it. Earlier folds
 * show their final stage, the current fold its current stage, later folds are pending.
 */
export default function SignalScene({
  view,
  index,
  reduced,
  labels,
  tip,
}: {
  view: SignalView;
  index: number;
  reduced: boolean;
  labels: LabelLayer;
  tip: HTMLElement | null;
}) {
  const group = useRef<Group>(null);
  const pointer = useCanvasPointer();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const dragging = useRef(false);
  useEffect(() => {
    if (!controls) return;
    const start = () => (dragging.current = true),
      end = () => (dragging.current = false);
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
    };
  }, [controls]);

  const sim = useMemo(() => {
    const NF = view.features.length,
      NL = view.folds.length,
      X = columnX(NL),
      gap = HEIGHT / Math.max(1, NF - 1),
      R = rng(42);
    const yOf = (slot: number) => HEIGHT / 2 - slot * gap;
    const colors = view.features.map((_, i) => new Color(familyColor(view, i)));
    const bundle = createLineBundle(NL * NF * STRANDS * (SEGMENTS - 1) * 2, 0.12),
      jitter = Array.from({ length: NL * NF * STRANDS }, () => [
        gauss(R),
        gauss(R),
        gauss(R),
        gauss(R),
      ]);
    const nodes = createPointCloud((NL + 1) * NF);
    const start = view.inputSlot.map(yOf);
    const spinePoints = X.flatMap((x) => [
      x,
      HEIGHT / 2 + 0.3,
      zOf(x),
      x,
      -HEIGHT / 2 - 0.3,
      zOf(x),
    ]);
    const spineGeometry = new BufferGeometry();
    spineGeometry.setAttribute("position", new Float32BufferAttribute(spinePoints, 3));
    const spines = new LineSegments(
      spineGeometry,
      new LineBasicMaterial({
        color: 0xe7eaec,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    );
    return {
      NF,
      NL,
      X,
      yOf,
      colors,
      bundle,
      jitter,
      nodes,
      spines,
      /** Displayed and target height of every feature in every column, and its weight. */
      disp: Array.from({ length: NL + 1 }, () => Float32Array.from(start)),
      tgt: Array.from({ length: NL + 1 }, () => Float32Array.from(start)),
      w: Array.from({ length: NL + 1 }, () => new Float32Array(NF)),
      /** Hover anchors: every node position, rewritten in place each frame. */
      anchors: Array.from(
        { length: (NL + 1) * NF },
        (_, k) => [k % NF, new Vector3()] as [number, Vector3],
      ),
      idx: -1,
      dirty: true,
      hover: null as number | null,
      /** Phone-width stage: the legend and readout carry family and feature names instead. */
      compact: false,
    };
  }, [view]);
  useEffect(
    () => () => {
      sim.spines.geometry.dispose();
      (sim.spines.material as LineBasicMaterial).dispose();
      labels.set([]);
      showTip(tip, null, 0, 0, 0);
    },
    [sim, labels, tip],
  );
  const inputNodes = useMemo(() => view.features.map((label, id) => ({ id, label })), [view]);
  const scratch = useMemo(
    () => ({
      path: new CubicBezierCurve3(new Vector3(), new Vector3(), new Vector3(), new Vector3()),
      points: Array.from({ length: SEGMENTS }, () => new Vector3()),
    }),
    [],
  );

  /** Rank every feature in every visible fold column at scrub position idx. */
  function setTargets(idx: number) {
    for (let L = 1; L <= sim.NL; L++) {
      const imp = importanceAt(view, L, idx);
      if (!imp) continue;
      const order = imp
        .map((_, i) => i)
        .sort((a, b) => imp[b] - imp[a] || view.inputSlot[a] - view.inputSlot[b]);
      const max = Math.max(...imp) || 1;
      order.forEach((f, r) => {
        sim.tgt[L][f] = sim.yOf(r);
        sim.w[L][f] = Math.sqrt(imp[f] / max);
      });
    }
    sim.w[0].fill(0.5);
    const visible = view.frames[idx][0] + 1;
    sim.bundle.material.uniforms.uMaxLayer.value = visible;
    sim.nodes.material.uniforms.uMaxLayer.value = visible;
  }

  function build() {
    const { NF, NL, X, bundle, jitter, nodes, colors, disp, w } = sim;
    const { path, points } = scratch;
    let v = 0;
    for (let L = 1; L <= NL; L++)
      for (let i = 0; i < NF; i++) {
        const x0 = X[L - 1],
          x1 = X[L],
          y0 = disp[L - 1][i],
          y1 = disp[L][i],
          weight = w[L][i],
          color = colors[i],
          dx = x1 - x0;
        const shown = 1 + Math.floor(weight * (STRANDS - 0.01));
        for (let s = 0; s < STRANDS; s++) {
          const J = jitter[((L - 1) * NF + i) * STRANDS + s],
            spread = 0.03 + 0.42 * weight;
          path.v0.set(x0, y0, zOf(x0));
          path.v3.set(x1, y1, zOf(x1));
          path.v1.set(x0 + dx * 0.42, y0 + J[0] * spread, zOf(x0) + J[1] * spread * 1.6);
          path.v2.set(x1 - dx * 0.42, y1 + J[2] * spread, zOf(x1) + J[3] * spread * 1.6);
          const ww = s < shown ? (s === 0 ? Math.max(weight, 0.06) : weight * 0.75) : 0;
          for (let k = 0; k < SEGMENTS; k++) path.getPoint(k / (SEGMENTS - 1), points[k]);
          for (let k = 1; k < SEGMENTS; k++)
            for (const q of [k - 1, k]) {
              const P = points[q];
              bundle.position.setXYZ(v, P.x, P.y, P.z);
              bundle.t.setX(v, (L - 1 + q / (SEGMENTS - 1)) / NL);
              bundle.color.setXYZ(v, color.r, color.g, color.b);
              bundle.w.setX(v, ww);
              bundle.key.setXY(v, i, i);
              bundle.layer.setX(v, L);
              v++;
            }
        }
      }
    for (let L = 0; L <= NL; L++)
      for (let i = 0; i < NF; i++) {
        const k = L * NF + i,
          x = X[L],
          weight = w[L][i],
          color = colors[i];
        nodes.position.setXYZ(k, x, disp[L][i], zOf(x));
        nodes.color.setXYZ(k, color.r, color.g, color.b);
        nodes.size.setX(k, L === 0 ? 0.06 : 0.05 + 0.2 * weight);
        nodes.alpha.setX(k, L === 0 ? 0.45 : 0.35 + 0.65 * weight);
        nodes.key.setX(k, i);
        nodes.layer.setX(k, L);
      }
    bundle.commit();
    nodes.commit();
  }

  /** Ease displayed ranks toward their targets; true while anything is still moving. */
  function step() {
    let moving = false;
    for (let L = 1; L <= sim.NL; L++)
      for (let i = 0; i < sim.NF; i++) {
        const d = sim.tgt[L][i] - sim.disp[L][i];
        if (Math.abs(d) > 0.002) {
          sim.disp[L][i] += d * (reduced ? 1 : 0.16);
          moving = true;
        } else sim.disp[L][i] = sim.tgt[L][i];
      }
    return moving;
  }

  function setLabels() {
    const { X, NF, yOf } = sim,
      idx = sim.idx,
      [f] = view.frames[idx],
      list: LabelSpec[] = [];
    const at = (x: number, y: number) => new Vector3(x, y, zOf(x));
    list.push({
      pos: at(X[0], HEIGHT / 2 + 0.8),
      align: "right",
      valign: "bottom",
      dx: 6,
      pri: 3,
      html: `Inputs<small>${NF} features</small>`,
    });
    view.folds.forEach((fold, k) => {
      const x = X[k + 1],
        pending = k > f,
        auc = foldAuc(view, k, idx);
      list.push({
        pos: at(x, HEIGHT / 2 + 0.8),
        cls: pending ? "dim" : "",
        valign: "bottom",
        pri: 3,
        html: `Fold ${fold.fold}<small>${monthRange(fold.validationStart, fold.validationEnd, true)}</small>`,
      });
      const chip =
        auc == null
          ? "n/a"
          : `<span class="auc" style="color:${TONE_VAR[aucTone(auc)]}">${auc.toFixed(3)}</span>`;
      list.push({
        pos: at(x, -HEIGHT / 2 - 0.3),
        cls: pending ? "dim" : "",
        valign: "top",
        // Narrow stages keep every chip and drop the repeated "Val AUC" header.
        pri: sim.compact ? 3 : 2,
        html: pending ? "Pending" : sim.compact ? chip : `Val AUC<br>${chip}`,
      });
      const rho = view.rho[k - 1];
      if (k > 0 && k <= f && rho != null) {
        // Between the fold headers and the lines, clear of both.
        const xm = (X[k] + x) / 2;
        list.push({
          pos: at(xm, HEIGHT / 2 + 0.32),
          cls: "rho",
          pri: 1,
          html: `ρ ${rho.toFixed(2)}`,
        });
      }
    });
    if (!sim.compact) {
      const { family } = view;
      view.families.forEach((name, k) => {
        const slots = view.features
          .map((_, i) => i)
          .filter((i) => family[i] === k)
          .map((i) => view.inputSlot[i]);
        if (!slots.length) return;
        const mid = (Math.min(...slots) + Math.max(...slots)) / 2;
        list.push({
          pos: at(X[0], yOf(mid)),
          dx: -14,
          align: "right",
          color: FAMILY_COLORS[name],
          pri: 3,
          html: `${esc(name)}<small>${slots.length}</small>`,
        });
      });
    }
    const L = f + 1,
      imp = importanceAt(view, L, idx)!,
      top = imp
        .map((_, i) => i)
        .sort((a, b) => imp[b] - imp[a])
        .slice(0, 6);
    const named = sim.hover != null && !top.includes(sim.hover) ? [...top, sim.hover] : top;
    if (!sim.compact)
      for (const i of named)
        list.push({
          pos: at(X[L], sim.tgt[L][i]),
          dx: 12,
          align: "left",
          cls: "feat",
          color: familyColor(view, i),
          html: esc(view.features[i]),
        });
    labels.set(list);
  }

  function tooltip(id: number) {
    const f = view.frames[sim.idx][0];
    const ranks = view.folds.slice(0, f + 1).map((_, k) => {
      const imp = importanceAt(view, k + 1, sim.idx)!;
      return 1 + imp.filter((v) => v > imp[id]).length;
    });
    const family = `${esc(view.families[view.family[id]])}<br>`;
    return `<strong style="color:${familyColor(view, id)}">${esc(view.features[id])}</strong>${family}rank by fold ${ranks.map((r) => "#" + r).join(" → ")}<br>importance now ${importanceAt(view, f + 1, sim.idx)![id].toFixed(4)}`;
  }

  useFrame(({ camera, size, scene, clock }) => {
    const g = group.current;
    if (!g) return;
    const compact = size.width - (size.width > 900 ? PANEL : 0) < 600;
    if (compact !== sim.compact) {
      sim.compact = compact;
      if (sim.idx >= 0) setLabels();
    }
    if (sim.idx !== index) {
      const first = sim.idx < 0;
      sim.idx = index;
      setTargets(index);
      if (first) for (let L = 0; L <= sim.NL; L++) sim.disp[L].set(sim.tgt[L]);
      sim.dirty = true;
      setLabels();
    }
    if (step() || sim.dirty) {
      build();
      sim.dirty = false;
    }
    if (!reduced && !dragging.current) g.rotation.y = 0.16 * Math.sin(clock.elapsedTime * 0.11);
    const visible = view.frames[sim.idx][0] + 1;
    for (let L = 0; L <= visible; L++)
      for (let i = 0; i < sim.NF; i++)
        sim.anchors[L * sim.NF + i][1].set(sim.X[L], sim.disp[L][i], zOf(sim.X[L]));
    const hit = pickNearest(
      pointer.current,
      sim.anchors.slice(0, (visible + 1) * sim.NF),
      g,
      camera,
      size.width,
      size.height,
    );
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
