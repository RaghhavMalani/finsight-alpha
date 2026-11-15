import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createLineBundle } from "@/visual/gl/bundles";
import { createFlowField, createPulseNodes } from "@/visual/gl/flow";
import { BLOOM, HEX, MOTION, rgb } from "@/visual/tokens";
import type { ResearchGraph } from "./contract";
import type { SceneBus, SceneMetrics } from "./bus";
import { bezier, type Layout } from "./layouts";
import type { Replay } from "./model";
import { paintAt } from "./paint";

const BloomLayer = lazy(() => import("@/visual/gl/BloomLayer"));
const SEG = 14,
  PARTICLES_PER_EDGE = 5;

export type Insets = { top: number; bottom: number; left: number; right: number };

class Boundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Frames the layout's nodes in the stage area the HUD leaves free, without distortion. */
function CameraFit({ layout, insets }: { layout: Layout; insets: Insets }) {
  const camera = useThree((s) => s.camera),
    size = useThree((s) => s.size),
    controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const { width: w, height: h } = size;
    const freeW = Math.max(120, w - insets.left - insets.right),
      freeH = Math.max(120, h - insets.top - insets.bottom);
    camera.fov = layout.camera.fov;
    camera.aspect = w / h;
    camera.setViewOffset(
      w,
      h,
      -(insets.left - insets.right) / 2,
      -(insets.top - insets.bottom) / 2,
      w,
      h,
    );
    camera.updateProjectionMatrix();
    const dir = new Vector3(...layout.camera.dir).normalize(),
      target = new Vector3(...layout.camera.target),
      right = new Vector3(0, 1, 0).cross(dir).normalize(),
      up = new Vector3().crossVectors(dir, right);
    const tan = Math.tan((camera.fov * Math.PI) / 360),
      tanV = tan * (freeH / h),
      tanH = tan * (freeW / h);
    let d = 1;
    const q = new Vector3();
    for (const p of layout.pos) {
      q.set(p[0], p[1], p[2]).sub(target);
      const x = Math.abs(q.dot(right)) + 0.7,
        y = Math.abs(q.dot(up)) + 0.7,
        z = q.dot(dir);
      d = Math.max(d, z + x / tanH, z + y / tanV);
    }
    camera.position.copy(target).addScaledVector(dir, d);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = d * 0.4;
      controls.maxDistance = d * 1.8;
      controls.update();
    }
  }, [camera, size, controls, layout, insets]);
  return null;
}

function Graph({
  graph,
  layout,
  replay,
  bus,
  labelCount,
}: {
  graph: ResearchGraph;
  layout: Layout;
  replay: Replay;
  bus: SceneBus;
  labelCount: number;
}) {
  const index = useMemo(() => new Map(graph.nodes.map((n, i) => [n.id, i])), [graph]);
  const sim = useMemo(() => {
    const E = graph.edges.length,
      N = graph.nodes.length;
    const lines = createLineBundle(E * SEG * 2, 0);
    lines.material.uniforms.uMotion.value = 0;
    lines.material.uniforms.uGain.value = layout.star ? 0.8 : 1;
    const flow = createFlowField(E * PARTICLES_PER_EDGE);
    const nodes = createPulseNodes(N);
    let v = 0;
    graph.edges.forEach((e, k) => {
      const a = layout.pos[index.get(e.from)!],
        b = layout.pos[index.get(e.to)!],
        [c1, c2] = layout.ctrl[k];
      let prev = a;
      for (let s = 1; s <= SEG; s++) {
        const next = bezier(a, c1, c2, b, s / SEG);
        for (const [p, t] of [
          [prev, (s - 1) / SEG],
          [next, s / SEG],
        ] as const) {
          lines.position.setXYZ(v, p[0], p[1], p[2]);
          lines.t.setX(v, t);
          lines.key.setXY(v, index.get(e.from)!, index.get(e.to)!);
          lines.layer.setX(v, 0);
          lines.phase.setX(v, 0);
          v++;
        }
        prev = next;
      }
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      for (let j = 0; j < PARTICLES_PER_EDGE; j++) {
        const i = k * PARTICLES_PER_EDGE + j;
        flow.p0.setXYZ(i, ...a);
        flow.p1.setXYZ(i, ...c1);
        flow.p2.setXYZ(i, ...c2);
        flow.p3.setXYZ(i, ...b);
        flow.phase.setX(i, j / PARTICLES_PER_EDGE + ((k * 0.137) % 1) * 0.2);
        flow.speed.setX(i, Math.min(1.4, (MOTION.flow * 6) / length));
      }
    });
    graph.nodes.forEach((_, i) => {
      nodes.position.setXYZ(i, ...layout.pos[i]);
      nodes.key.setX(i, i);
    });
    lines.commit();
    flow.commit();
    nodes.commit();
    const guideGeometry = new BufferGeometry();
    guideGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        layout.guides.flatMap((line) => line.slice(1).flatMap((p, i) => [...line[i], ...p])),
        3,
      ),
    );
    const guides = new LineSegments(
      guideGeometry,
      new LineBasicMaterial({
        color: HEX.cyan,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
      }),
    );
    return {
      lines,
      flow,
      nodes,
      guides,
      painted: -1,
      version: -1,
      lastCam: new Float32Array(16),
      w: 0,
      h: 0,
    };
  }, [graph, layout, index]);
  useEffect(
    () => () => {
      sim.lines.dispose();
      sim.flow.dispose();
      sim.nodes.dispose();
      sim.guides.geometry.dispose();
      (sim.guides.material as LineBasicMaterial).dispose();
    },
    [sim],
  );
  const proj = useMemo(
    () => ({
      nodes: new Float32Array(graph.nodes.length * 3),
      labels: new Float32Array(labelCount * 3),
    }),
    [graph, labelCount],
  );

  function paint() {
    const p = paintAt(graph, layout, replay, bus.step, bus.selected);
    const { lines, flow, nodes } = sim;
    p.nodes.forEach((n, i) => {
      const c = rgb(n.color);
      nodes.color.setXYZ(i, ...c);
      nodes.size.setX(i, n.size);
      nodes.alpha.setX(i, n.alpha);
      nodes.ring.setX(i, n.ring ? 1 : 0);
      nodes.pulse.setX(i, n.pulse);
      nodes.flare.setX(i, n.flareAt);
      nodes.lift.setX(i, 1);
    });
    let v = 0;
    p.edges.forEach((e, k) => {
      const c = rgb(e.color);
      for (let s = 0; s < SEG * 2; s++, v++) {
        lines.color.setXYZ(v, ...c);
        lines.w.setX(v, e.w);
      }
      for (let j = 0; j < PARTICLES_PER_EDGE; j++) {
        const i = k * PARTICLES_PER_EDGE + j;
        flow.color.setXYZ(i, ...c);
        flow.active.setX(i, e.flowing ? 1 : 0);
        flow.until.setX(i, e.until);
      }
    });
    lines.commit();
    flow.commit();
    nodes.commit();
  }

  const v3 = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size, gl }) => {
    const motion = bus.reduced ? 0 : 1;
    sim.nodes.material.uniforms.uTime.value = bus.t;
    sim.nodes.material.uniforms.uMotion.value = motion;
    sim.flow.material.uniforms.uTime.value = bus.t;
    sim.flow.material.uniforms.uMotion.value = motion;
    const scale =
      (gl.getPixelRatio() * (size.height / 2)) /
      Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360);
    sim.nodes.material.uniforms.uScale.value = scale;
    sim.flow.material.uniforms.uScale.value = scale;
    const focus = bus.selected >= 0 ? bus.selected : bus.focus;
    sim.nodes.material.uniforms.uFocus.value =
      bus.focus >= 0 && bus.focus !== bus.selected ? bus.focus : -1;
    sim.lines.material.uniforms.uHover.value = focus;
    if (sim.painted !== bus.step || sim.version !== bus.version) {
      sim.painted = bus.step;
      sim.version = bus.version;
      paint();
    }
    // Project nodes and labels to the DOM layer only when the view changed.
    const m = camera.matrixWorld.elements;
    let moved = size.width !== sim.w || size.height !== sim.h;
    for (let i = 0; i < 16 && !moved; i++) moved = Math.abs(m[i] - sim.lastCam[i]) > 1e-6;
    if (moved && bus.onProject) {
      sim.lastCam.set(m);
      sim.w = size.width;
      sim.h = size.height;
      const write = (out: Float32Array, i: number, p: readonly number[]) => {
        v3.set(p[0], p[1], p[2]).project(camera);
        out[i * 3] = ((v3.x + 1) / 2) * size.width;
        out[i * 3 + 1] = ((1 - v3.y) / 2) * size.height;
        out[i * 3 + 2] = v3.z < 1 ? 1 : 0;
      };
      layout.pos.forEach((p, i) => write(proj.nodes, i, p));
      layout.labels.forEach((l, i) => write(proj.labels, i, l.at));
      bus.onProject(proj.nodes, proj.labels);
    }
  });
  return (
    <group>
      <primitive object={sim.guides} />
      <lineSegments
        geometry={sim.lines.geometry}
        material={sim.lines.material}
        frustumCulled={false}
      />
      <points geometry={sim.flow.geometry} material={sim.flow.material} frustumCulled={false} />
      <points geometry={sim.nodes.geometry} material={sim.nodes.material} frustumCulled={false} />
    </group>
  );
}

/** Frame-time sampling for the verifier; reads only. */
function Metrics({ graph, layout }: { graph: ResearchGraph; layout: Layout }) {
  const gl = useThree((s) => s.gl);
  const samples = useRef<number[]>([]),
    elapsed = useRef(0);
  useFrame((_, delta) => {
    if (delta > 0) samples.current.push(1 / delta);
    elapsed.current += delta;
    if (elapsed.current < 4) return;
    const values = samples.current.sort((a, b) => a - b);
    const context = gl.getContext(),
      ext = context.getExtension("WEBGL_debug_renderer_info");
    const metric: SceneMetrics = {
      median: values[Math.floor(values.length / 2)] ?? 0,
      p5: values[Math.floor(values.length * 0.05)] ?? 0,
      frames: values.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      particles: graph.edges.length * PARTICLES_PER_EDGE,
      renderer: ext ? String(context.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "undisclosed",
    };
    void layout;
    window.__researchMetrics = metric;
    samples.current = [];
    elapsed.current = 0;
  });
  return null;
}

export default function ResearchScene({
  graph,
  layout,
  replay,
  bus,
  insets,
  onFail,
}: {
  graph: ResearchGraph;
  layout: Layout;
  replay: Replay;
  bus: SceneBus;
  insets: Insets;
  onFail: () => void;
}) {
  const [bloomFailed, setBloomFailed] = useState(false);
  return (
    <Boundary onError={onFail}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: layout.camera.fov, near: 0.1, far: 600, position: [0, 0, 40] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
        }}
        aria-hidden="true"
        tabIndex={-1}
      >
        <color attach="background" args={["#000000"]} />
        {layout.orbit && (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            rotateSpeed={0.5}
          />
        )}
        <CameraFit layout={layout} insets={insets} />
        <Graph
          graph={graph}
          layout={layout}
          replay={replay}
          bus={bus}
          labelCount={layout.labels.length}
        />
        {!bloomFailed && (
          <Boundary onError={() => setBloomFailed(true)}>
            <Suspense fallback={null}>
              <BloomLayer strength={layout.star ? BLOOM.strength * 0.8 : BLOOM.strength} />
            </Suspense>
          </Boundary>
        )}
        <Metrics graph={graph} layout={layout} />
      </Canvas>
    </Boundary>
  );
}
