import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineSegments,
  QuadraticBezierCurve3,
  Vector3,
  type Group,
} from "three";
import { createLineBundle, createPointCloud } from "./bundles";
import { esc, gauss, rng, sigma } from "./format";
import { GlowCurves } from "./GlowCurves";
import { GlowPoints } from "./GlowPoints";
import { interpolate, occupancy, SIGMA, stationary, type HMMView } from "./hmm-model";
import { pickNearest, showTip, useCanvasPointer } from "./pointer";
import type { LabelLayer, LabelSpec } from "./SceneLabels";

/** Emission samples per state; strands per transition bundle; segments per strand. */
const CLOUD = 1500,
  STRANDS = 14,
  SEGMENTS = 40;
const WHITE = new Color("#ffffff"),
  UP = new Vector3(0, 1, 0);
const AXIS_ENDS: [[number, number, number], string][] = [
  [[1, 0, 0], "Rising 20d return"],
  [[-1, 0, 0], "Falling 20d return"],
  [[0, 1, 0], "High 20d vol"],
  [[0, -1, 0], "Calm"],
  [[0, 0, 1], "Near 52w high"],
  [[0, 0, -1], "Deep drawdown"],
];

/**
 * Regime space. Each state sits at its own mean on 20d return, 20d vol and 52w drawdown (σ ×
 * 1.55). Its cloud samples the state's diagonal Gaussian on those axes, thinned to its
 * stationary share; bundles carry transition probability; a ring shows persistence. Scrubbing
 * EM eases every parameter between recorded iterations, so the training itself is visible.
 */
export default function HMMScene({
  view,
  target,
  reduced,
  labels,
  tip,
}: {
  view: HMMView;
  target: number;
  reduced: boolean;
  labels: LabelLayer;
  tip: HTMLElement | null;
}) {
  const group = useRef<Group>(null);
  const pointer = useCanvasPointer();
  const sim = useMemo(() => {
    const K = view.states.length,
      colors = view.states.map((s) => new Color(s.color)),
      R = rng(42);
    const cloud = createPointCloud(CLOUD * K),
      Z = new Float32Array(CLOUD * K * 3);
    for (let i = 0; i < CLOUD * K; i++) {
      const s = (i / CLOUD) | 0;
      for (let j = 0; j < 3; j++) Z[i * 3 + j] = Math.max(-2.4, Math.min(2.4, gauss(R)));
      cloud.color.setXYZ(i, colors[s].r, colors[s].g, colors[s].b);
      cloud.size.setX(i, 0.035 + R() * 0.05);
      cloud.key.setX(i, s);
    }
    const core = createPointCloud(K * 2);
    colors.forEach((c, s) => {
      const hot = c.clone().lerp(WHITE, 0.55);
      core.color.setXYZ(s, c.r, c.g, c.b);
      core.size.setX(s, 0.9);
      core.alpha.setX(s, 0.55);
      core.key.setX(s, s);
      core.color.setXYZ(K + s, hot.r, hot.g, hot.b);
      core.size.setX(K + s, 0.22);
      core.alpha.setX(K + s, 1);
      core.key.setX(K + s, s);
    });
    // Persistence rings, billboarded to the camera every frame.
    const circle = Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a), 0];
    }).flat();
    const rings = colors.map((color) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(circle, 3));
      return new Line(
        g,
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
    });
    const pairs = K * (K - 1),
      bundle = createLineBundle(pairs * STRANDS * (SEGMENTS - 1) * 2, 0.22),
      jitter = Array.from({ length: pairs * STRANDS }, () => [gauss(R), gauss(R), gauss(R), R()]);
    // Faint axes through 0σ with a tick every 1σ.
    const ext = 3.2 * SIGMA,
      tick = 0.06,
      pts: number[] = [];
    pts.push(-ext, 0, 0, ext, 0, 0, 0, -ext, 0, 0, ext, 0, 0, 0, -ext, 0, 0, ext);
    for (let s = -3; s <= 3; s++) {
      if (!s) continue;
      const p = s * SIGMA;
      pts.push(p, -tick, 0, p, tick, 0, -tick, p, 0, tick, p, 0, 0, -tick, p, 0, tick, p);
    }
    const axesGeometry = new BufferGeometry();
    axesGeometry.setAttribute("position", new Float32BufferAttribute(pts, 3));
    const axes = new LineSegments(
      axesGeometry,
      new LineBasicMaterial({
        color: 0xe7eaec,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    );
    cloud.commit();
    core.commit();
    return {
      K,
      colors,
      cloud,
      core,
      rings,
      bundle,
      jitter,
      Z,
      axes,
      t: view.frames.length - 1,
      built: false,
      mus: [] as Vector3[],
      transmat: [] as number[][],
      frame: view.frames.length - 1,
      labelKey: "",
    };
  }, [view]);
  useEffect(
    () => () => {
      for (const ring of sim.rings) {
        ring.geometry.dispose();
        (ring.material as LineBasicMaterial).dispose();
      }
      sim.axes.geometry.dispose();
      (sim.axes.material as LineBasicMaterial).dispose();
      labels.set([]);
      showTip(tip, null, 0, 0, 0);
    },
    [sim, labels, tip],
  );
  const coreNodes = useMemo(() => view.states.map((s) => ({ id: s.index, label: s.name })), [view]);

  const curve = useMemo(
    () => ({
      path: new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3()),
      points: Array.from({ length: SEGMENTS }, () => new Vector3()),
      dir: new Vector3(),
      side: new Vector3(),
      mid: new Vector3(),
      color: new Color(),
    }),
    [],
  );

  /** Write every attribute for (possibly fractional) EM position t. */
  function build(t: number) {
    const { K, cloud, core, rings, bundle, jitter, Z, colors } = sim;
    const F = interpolate(view, t),
      pi = stationary(F.transmat);
    const mus = F.mu.map((m) => new Vector3(m[0], m[1], m[2]).multiplyScalar(SIGMA));
    sim.mus = mus;
    sim.transmat = F.transmat;
    sim.frame = F.frame;
    for (let s = 0; s < K; s++) {
      // Visible samples follow the long-run share of time in the state.
      const visible = Math.round(CLOUD * (0.22 + 0.78 * Math.min(1, pi[s] * 2.2)));
      for (let i = 0; i < CLOUD; i++) {
        const k = s * CLOUD + i;
        cloud.position.setXYZ(
          k,
          mus[s].x + Z[k * 3] * F.sd[s][0] * SIGMA,
          mus[s].y + Z[k * 3 + 1] * F.sd[s][1] * SIGMA,
          mus[s].z + Z[k * 3 + 2] * F.sd[s][2] * SIGMA,
        );
        cloud.alpha.setX(k, i < visible ? 0.16 : 0);
      }
      core.position.setXYZ(s, mus[s].x, mus[s].y, mus[s].z);
      core.position.setXYZ(K + s, mus[s].x, mus[s].y, mus[s].z);
      const p = F.transmat[s][s];
      rings[s].position.copy(mus[s]);
      rings[s].scale.setScalar(0.45 + 0.25 * p);
      (rings[s].material as LineBasicMaterial).opacity = 0.08 + 0.75 * Math.pow(p, 4);
    }
    const { path, points, dir, side, mid, color } = curve;
    let v = 0,
      pair = 0;
    for (let i = 0; i < K; i++)
      for (let j = 0; j < K; j++) {
        if (i === j) continue;
        const p = F.transmat[i][j],
          strands = p < 0.002 ? 0 : Math.min(STRANDS, 1 + Math.round(p * 44));
        const a = mus[i],
          b = mus[j],
          len = a.distanceTo(b);
        dir.subVectors(b, a).normalize();
        side.crossVectors(dir, UP).normalize();
        mid
          .copy(a)
          .add(b)
          .multiplyScalar(0.5)
          .addScaledVector(side, len * 0.22)
          .addScaledVector(UP, len * 0.12);
        for (let s = 0; s < STRANDS; s++) {
          const J = jitter[pair * STRANDS + s],
            spread = 0.06 + 0.9 * p;
          path.v0.copy(a);
          path.v2.copy(b);
          path.v1.set(mid.x + J[0] * spread, mid.y + J[1] * spread, mid.z + J[2] * spread);
          const w = s < strands ? Math.min(1, 0.25 + p * 3.2) : 0;
          for (let k = 0; k < SEGMENTS; k++) path.getPoint(k / (SEGMENTS - 1), points[k]);
          for (let k = 1; k < SEGMENTS; k++)
            for (const q of [k - 1, k]) {
              const tt = q / (SEGMENTS - 1),
                P = points[q];
              color.copy(colors[i]).lerp(colors[j], tt);
              bundle.position.setXYZ(v, P.x, P.y, P.z);
              bundle.t.setX(v, tt);
              bundle.color.setXYZ(v, color.r, color.g, color.b);
              bundle.w.setX(v, w);
              bundle.key.setXY(v, i, j);
              bundle.phase.setX(v, J[3]);
              v++;
            }
        }
        pair++;
      }
    cloud.commit();
    core.commit();
    bundle.commit();
  }

  function setLabels() {
    const f = view.frames[sim.frame],
      now = f.dominant[f.dominant.length - 1],
      occ = occupancy(f, sim.K),
      days = f.dominant.length;
    const list: LabelSpec[] = view.states.map((st) => ({
      pos: sim.mus[st.index].clone().add(new Vector3(0, 0.95, 0)),
      cls: "state" + (st.index === now ? " today" : ""),
      color: st.color,
      pri: 3,
      html: `${esc(st.name)}${st.index === now ? " · now" : ""}<small>stays ${(sim.transmat[st.index][st.index] * 100).toFixed(0)}% · ${occ[st.index]} of last ${days} days</small>`,
    }));
    const e = 3.5 * SIGMA;
    for (const [[x, y, z], text] of AXIS_ENDS)
      list.push({ pos: new Vector3(x * e, y * e, z * e), cls: "axis", pri: 1, html: text });
    labels.set(list);
  }

  function tooltip(id: number) {
    const st = view.states[id],
      m = view.frames[sim.frame].mu[id],
      row = sim.transmat[id];
    const exit = row
      .map((q, j) => [j, q] as const)
      .filter(([j]) => j !== id)
      .sort((a, b) => b[1] - a[1])[0];
    return `<strong style="color:${st.color}">${esc(st.name)}</strong>20d return ${sigma(m[0])}<br>20d vol ${sigma(m[1])}<br>drawdown ${sigma(m[2])}<br>stays next day ${(row[id] * 100).toFixed(1)}%${exit ? `<br>most likely exit → ${esc(view.states[exit[0]].name)} ${(exit[1] * 100).toFixed(1)}%` : ""}`;
  }

  useFrame(({ camera, size, scene }, delta) => {
    const g = group.current;
    if (!g) return;
    const d = target - sim.t;
    if (!sim.built || Math.abs(d) > 0.001) {
      if (!sim.built || reduced) sim.t = target;
      else {
        sim.t += d * Math.min(1, Math.min(delta, 0.05) * 9);
        if (Math.abs(target - sim.t) < 0.002) sim.t = target;
      }
      build(sim.t);
      sim.built = true;
      setLabels();
    }
    for (const ring of sim.rings) ring.quaternion.copy(camera.quaternion);
    const hit = pickNearest(
      pointer.current,
      sim.mus.map((m, s) => [s, m] as [number, Vector3]),
      g,
      camera,
      size.width,
      size.height,
    );
    const id = hit?.id ?? null;
    for (const m of [sim.bundle.material, sim.cloud.material, sim.core.material])
      m.uniforms.uHover.value = id ?? -1;
    scene.userData.hover = id;
    showTip(tip, hit ? tooltip(hit.id) : null, hit?.x ?? 0, hit?.y ?? 0, size.width);
    labels.place(g, camera, size.width, size.height);
  });

  return (
    <group ref={group} position={[-view.center[0], -view.center[1], -view.center[2]]}>
      <primitive object={sim.axes} />
      <GlowPoints cloud={sim.cloud} />
      <GlowPoints cloud={sim.core} nodes={coreNodes} />
      {sim.rings.map((ring, i) => (
        <primitive key={i} object={ring} />
      ))}
      <GlowCurves bundle={sim.bundle} reduced={reduced} />
    </group>
  );
}
