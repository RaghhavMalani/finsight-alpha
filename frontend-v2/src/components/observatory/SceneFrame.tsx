import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  InstancedMesh,
  Mesh,
  LineSegments,
  ShaderMaterial,
  Vector3,
  PerspectiveCamera,
} from "three";
import type { Vec3, SceneNode } from "./types";

const BloomLayer = lazy(() => import("./BloomLayer"));
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
      <div className="obs-empty">
        3D rendering unavailable. The evidence and model readouts remain available.
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
  curves: number;
  nodes: number;
  hover: boolean;
};
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = size.width < 600 ? 60 : 45;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width]);
  return null;
}
declare global {
  interface Window {
    __observatoryMetrics?: Metrics;
    __observatorySamples?: Metrics[];
    __observatoryProbe?: () => {
      geometryIds: string[];
      motion: number[];
      camera: number[];
      nodes: { id: number; label: string; x: number; y: number }[];
    };
  }
}
function Monitor({
  curves,
  nodes,
  hover,
  onMetrics,
}: {
  curves: number;
  nodes: number;
  hover: boolean;
  onMetrics: (m: Metrics) => void;
}) {
  const { gl, size, scene, camera } = useThree();
  const samples = useRef<number[]>([]),
    elapsed = useRef(0),
    calls = useRef(0);
  useEffect(() => {
    window.__observatorySamples = [];
    delete window.__observatoryMetrics;
    gl.info.autoReset = false;
    // Read-only instrumentation for production hover/motion verification.
    window.__observatoryProbe = () => {
      const geometryIds: string[] = [],
        motion: number[] = [],
        projected: { id: number; label: string; x: number; y: number }[] = [];
      const bounds = gl.domElement.getBoundingClientRect();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials)
            if (material instanceof ShaderMaterial && material.uniforms.uMotion) {
              geometryIds.push(object.geometry.uuid);
              motion.push(material.uniforms.uMotion.value);
            }
        }
        if (object instanceof InstancedMesh)
          for (const node of (object.userData.modelNodes ?? []) as SceneNode[]) {
            const p = object.localToWorld(new Vector3(...node.position)).project(camera);
            projected.push({
              id: node.id,
              label: node.label,
              x: bounds.left + ((p.x + 1) * bounds.width) / 2,
              y: bounds.top + ((1 - p.y) * bounds.height) / 2,
            });
          }
      });
      return { geometryIds, motion, camera: camera.matrixWorld.elements.slice(), nodes: projected };
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
    if (elapsed.current < 5) return;
    const values = samples.current.sort((a, b) => a - b);
    const context = gl.getContext(),
      extension = context.getExtension("WEBGL_debug_renderer_info");
    const metric = {
      median: values[Math.floor(values.length * 0.5)] ?? 0,
      p5: values[Math.floor(values.length * 0.05)] ?? 0,
      calls: calls.current,
      frames: values.length,
      gpu: extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : "Renderer disclosure unavailable",
      viewport: `${size.width}×${size.height} canvas · ${innerWidth}×${innerHeight} viewport · DPR ${gl.getPixelRatio()}`,
      curves,
      nodes,
      hover,
    };
    window.__observatoryMetrics = metric;
    window.__observatorySamples?.push(metric);
    onMetrics(metric);
    samples.current = [];
    elapsed.current = 0;
  });
  return null;
}
export function SceneFrame({
  children,
  curves,
  nodes,
  hover,
  reduced,
  onMetrics,
  camera = [0, 1, 15],
}: {
  children: ReactNode;
  curves: number;
  nodes: number;
  hover: number | null;
  reduced: boolean;
  onMetrics: (m: Metrics) => void;
  camera?: Vec3;
}) {
  const [inside, setInside] = useState(false);
  return (
    <>
      <div
        className="obs-gl"
        onPointerEnter={() => setInside(true)}
        onPointerLeave={() => {
          setInside(false);
        }}
      >
        <CanvasBoundary>
          <Canvas
            camera={{ position: camera, fov: 45 }}
            dpr={1}
            gl={{ antialias: false, powerPreference: "high-performance" }}
          >
            <color attach="background" args={["#000000"]} />
            <ResponsiveCamera />
            {children}
            <OrbitControls
              autoRotate={!reduced && !inside && hover == null}
              autoRotateSpeed={0.3}
              enableDamping
              dampingFactor={0.07}
              minDistance={7}
              maxDistance={28}
            />
            <BloomBoundary onError={() => undefined}>
              <Suspense fallback={null}>
                <BloomLayer />
              </Suspense>
            </BloomBoundary>
            <Monitor curves={curves} nodes={nodes} hover={hover !== null} onMetrics={onMetrics} />
          </Canvas>
        </CanvasBoundary>
      </div>
    </>
  );
}
