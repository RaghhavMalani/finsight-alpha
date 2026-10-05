import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  LineSegments,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const BloomLayer = lazy(() => import("./BloomLayer"));
/** Width the docked readout takes from the stage (320px card + 2×16px margin). */
export const PANEL = 352;

class BloomBoundary extends Component<
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
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="obs-status">
        This view needs WebGL. The readout on the right still shows every number.
      </div>
    ) : (
      this.props.children
    );
  }
}

export type Metrics = {
  median: number;
  p5: number;
  calls: number;
  frames: number;
  gpu: string;
  viewport: string;
  lineVertices: number;
  points: number;
  hover: boolean;
};
type ProbeNode = { id: number; label: string; x: number; y: number };
declare global {
  interface Window {
    __observatoryMetrics?: Metrics;
    __observatorySamples?: Metrics[];
    __observatoryProbe?: () => {
      geometryIds: string[];
      motion: number[];
      camera: number[];
      hover: number | null;
      nodes: ProbeNode[];
    };
  }
}

/** Frame-time windows for tests (window.__observatoryMetrics) and the D-key readout. */
function Monitor({
  onMetrics,
  onFps,
}: {
  onMetrics: (m: Metrics) => void;
  onFps: (fps: number) => void;
}) {
  const { gl, size, scene, camera } = useThree();
  const samples = useRef<number[]>([]),
    elapsed = useRef(0),
    second = useRef({ frames: 0, time: 0 }),
    calls = useRef(0);
  useEffect(() => {
    window.__observatorySamples = [];
    delete window.__observatoryMetrics;
    gl.info.autoReset = false;
    // Read-only instrumentation for production hover/motion verification.
    window.__observatoryProbe = () => {
      const geometryIds: string[] = [],
        motion: number[] = [],
        nodes: ProbeNode[] = [];
      const bounds = gl.domElement.getBoundingClientRect();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments || object instanceof Points) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials)
            if (material instanceof ShaderMaterial && material.uniforms.uMotion) {
              geometryIds.push(object.geometry.uuid);
              motion.push(material.uniforms.uMotion.value);
            }
        }
        if (object instanceof Points) {
          const position = object.geometry.getAttribute("position");
          (object.userData.modelNodes ?? []).forEach(
            (node: { id: number; label: string }, i: number) => {
              const p = object
                .localToWorld(new Vector3(position.getX(i), position.getY(i), position.getZ(i)))
                .project(camera);
              nodes.push({
                id: node.id,
                label: node.label,
                x: bounds.left + ((p.x + 1) * bounds.width) / 2,
                y: bounds.top + ((1 - p.y) * bounds.height) / 2,
              });
            },
          );
        }
      });
      return {
        geometryIds,
        motion,
        camera: camera.matrixWorld.elements.slice(),
        hover: scene.userData.hover ?? null,
        nodes,
      };
    };
    return () => {
      gl.info.autoReset = true;
      delete window.__observatoryProbe;
      delete window.__observatoryMetrics;
    };
  }, [gl, scene, camera]);
  useFrame((_, delta) => {
    calls.current = gl.info.render.calls;
    gl.info.reset();
    if (delta > 0) samples.current.push(1 / delta);
    elapsed.current += delta;
    second.current.frames++;
    second.current.time += delta;
    if (second.current.time >= 1) {
      onFps(second.current.frames / second.current.time);
      second.current = { frames: 0, time: 0 };
    }
    if (elapsed.current < 5) return;
    const values = samples.current.sort((a, b) => a - b);
    const context = gl.getContext(),
      extension = context.getExtension("WEBGL_debug_renderer_info");
    let lineVertices = 0,
      points = 0;
    scene.traverse((object) => {
      if (object instanceof LineSegments) lineVertices += object.geometry.attributes.position.count;
      if (object instanceof Points) points += object.geometry.attributes.position.count;
    });
    const metric = {
      median: values[Math.floor(values.length * 0.5)] ?? 0,
      p5: values[Math.floor(values.length * 0.05)] ?? 0,
      calls: calls.current,
      frames: values.length,
      gpu: extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : "Renderer disclosure unavailable",
      viewport: `${size.width}×${size.height} canvas · ${innerWidth}×${innerHeight} viewport · DPR ${gl.getPixelRatio()}`,
      lineVertices,
      points,
      hover: scene.userData.hover != null,
    };
    window.__observatoryMetrics = metric;
    window.__observatorySamples?.push(metric);
    onMetrics(metric);
    samples.current = [];
    elapsed.current = 0;
  });
  return null;
}

export type CameraFit = {
  /** A new key snaps the camera to the preset; the same key only re-fits distance limits. */
  key: string;
  radius: number;
  direction: [number, number, number];
  target: [number, number, number];
  factor: number;
};

/**
 * Frames the scene's bounding sphere in the stage area left of the docked readout.
 * setViewOffset widens the frustum by the panel and renders only the visible part, so the
 * scene centres in the free area without distortion.
 */
function CameraRig({ fit }: { fit: CameraFit }) {
  const camera = useThree((s) => s.camera),
    size = useThree((s) => s.size),
    controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const snapped = useRef("");
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const { width: w, height: h } = size;
    const panel = w > 900 ? PANEL : 0;
    if (panel) camera.setViewOffset(w + panel, h, panel, 0, w, h);
    else {
      camera.clearViewOffset();
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    const vf = MathUtils.degToRad(camera.fov) / 2,
      hf = Math.atan(Math.tan(vf) * ((w - panel) / h));
    const dist = (fit.radius / Math.sin(Math.min(vf, hf))) * fit.factor;
    if (!controls) return;
    controls.minDistance = dist * 0.45;
    controls.maxDistance = dist * 2;
    if (snapped.current !== fit.key) {
      snapped.current = fit.key;
      camera.position
        .set(...fit.direction)
        .normalize()
        .multiplyScalar(dist);
      controls.target.set(...fit.target);
      controls.update();
    }
  }, [camera, size, controls, fit]);
  return null;
}

/** Orbit with damping and no pan; auto-rotation pauses while dragging and resumes after 6s. */
function Controls({ autoRotate }: { autoRotate: boolean }) {
  const ref = useRef<OrbitControlsImpl>(null),
    wanted = useRef(autoRotate),
    idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    wanted.current = autoRotate;
    if (ref.current) ref.current.autoRotate = autoRotate;
  }, [autoRotate]);
  useEffect(() => () => clearTimeout(idle.current), []);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      rotateSpeed={0.6}
      autoRotateSpeed={0.35}
      onStart={() => {
        clearTimeout(idle.current);
        if (ref.current) ref.current.autoRotate = false;
      }}
      onEnd={() => {
        idle.current = setTimeout(() => {
          if (ref.current) ref.current.autoRotate = wanted.current;
        }, 6000);
      }}
    />
  );
}

export function SceneFrame({
  children,
  fit,
  autoRotate,
  bloom,
  onMetrics,
  onFps,
}: {
  children: ReactNode;
  fit: CameraFit;
  autoRotate: boolean;
  bloom: number;
  onMetrics: (m: Metrics) => void;
  onFps: (fps: number) => void;
}) {
  const [bloomFailed, setBloomFailed] = useState(false);
  return (
    <div className="obs-gl">
      <CanvasBoundary>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ fov: 38, near: 0.1, far: 400, position: [0, 0, 30], manual: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
          }}
          aria-label="3D model visualization"
        >
          <color attach="background" args={["#000000"]} />
          <Controls autoRotate={autoRotate} />
          <CameraRig fit={fit} />
          {children}
          {!bloomFailed && (
            <BloomBoundary onError={() => setBloomFailed(true)}>
              <Suspense fallback={null}>
                <BloomLayer strength={bloom} />
              </Suspense>
            </BloomBoundary>
          )}
          <Monitor onMetrics={onMetrics} onFps={onFps} />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}
