import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { viridisRgb } from "@/lib/vol-surface";

// Build a 2D density landscape from Monte-Carlo paths:
// rows = time steps, cols = price bins, values = probability density.
export type Landscape = {
  timeCount: number;
  bins: number[]; // bin centers (prices)
  density: number[][]; // density[t][k]
  min: number;
  max: number;
  pMin: number;
  pMax: number;
};

function buildLandscape(paths: number[][], binCount: number): Landscape {
  const T = paths[0].length;
  let pMin = Infinity, pMax = -Infinity;
  for (const p of paths) for (const v of p) { if (v < pMin) pMin = v; if (v > pMax) pMax = v; }
  const bins: number[] = [];
  const step = (pMax - pMin) / (binCount - 1);
  for (let i = 0; i < binCount; i++) bins.push(pMin + i * step);
  const density: number[][] = Array.from({ length: T }, () => new Array(binCount).fill(0));
  for (const p of paths) {
    for (let t = 0; t < T; t++) {
      const v = p[t];
      const b = Math.min(binCount - 1, Math.max(0, Math.round((v - pMin) / step)));
      density[t][b]++;
    }
  }
  // normalize by column max
  let max = 0;
  for (let t = 0; t < T; t++) {
    // Gaussian smooth along price axis
    const smooth = new Array(binCount).fill(0);
    for (let k = 0; k < binCount; k++) {
      let s = 0, w = 0;
      for (let dk = -3; dk <= 3; dk++) {
        const kk = k + dk;
        if (kk < 0 || kk >= binCount) continue;
        const ww = Math.exp(-(dk * dk) / 4);
        s += density[t][kk] * ww;
        w += ww;
      }
      smooth[k] = s / w;
    }
    density[t] = smooth;
    for (const v of smooth) if (v > max) max = v;
  }
  return { timeCount: T, bins, density, min: 0, max, pMin, pMax };
}

function Landscape3D({
  paths,
  buildKey,
  onHover,
  spot,
}: {
  paths: number[][];
  buildKey: number;
  onHover: (info: { t: number; price: number; density: number; point: THREE.Vector3 } | null) => void;
  spot: number;
}) {
  const landscape = useMemo(() => buildLandscape(paths, 64), [paths]);
  const size = 6;
  const heightScale = 2.6;

  const { geometry, wireGeometry } = useMemo(() => {
    const cols = landscape.bins.length; // price axis (Z)
    const rows = landscape.timeCount;    // time axis (X)
    const g = new THREE.PlaneGeometry(size * 2, size * 2, rows - 1, cols - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const idx = c * rows + r;
        const v = landscape.density[r][c] / (landscape.max || 1);
        const y = Math.pow(v, 0.7) * heightScale;
        pos.setY(idx, y);
        const [cr, cg, cb] = viridisRgb(v);
        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const wire = new THREE.WireframeGeometry(g);
    return { geometry: g, wireGeometry: wire };
  }, [landscape]);

  // Sweep animation: scale X (time axis) from 0 to full over ~800ms.
  const groupRef = useRef<THREE.Group>(null!);
  const sweepStart = useRef(performance.now());
  useEffect(() => { sweepStart.current = performance.now(); }, [buildKey]);
  const [userInteracting, setUserInteracting] = useState(false);
  const reducedMotion = useMemo(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const t = Math.min(1, (performance.now() - sweepStart.current) / 800);
    const eased = 1 - Math.pow(1 - t, 3);
    groupRef.current.scale.x = Math.max(0.001, eased);
    if (!userInteracting && !reducedMotion && t >= 1) {
      groupRef.current.rotation.y += dt * 0.06;
    }
  });

  useEffect(() => {
    const c = document.querySelectorAll("canvas");
    const listeners: Array<() => void> = [];
    c.forEach((canvas) => {
      const down = () => setUserInteracting(true);
      canvas.addEventListener("pointerdown", down);
      listeners.push(() => canvas.removeEventListener("pointerdown", down));
    });
    return () => listeners.forEach((l) => l());
  }, []);

  function handleMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    const uv = e.uv;
    if (!uv) return;
    const rows = landscape.timeCount;
    const cols = landscape.bins.length;
    // Because plane was rotated X, UV.x still maps to segX (rows/time), UV.y to segY (cols/price)
    const rIdx = Math.min(rows - 1, Math.max(0, Math.round(uv.x * (rows - 1))));
    const cIdx = Math.min(cols - 1, Math.max(0, Math.round((1 - uv.y) * (cols - 1))));
    onHover({
      t: rIdx / (rows - 1),
      price: landscape.bins[cIdx],
      density: landscape.density[rIdx][cIdx] / (landscape.max || 1),
      point: e.point.clone(),
    });
  }

  // Spot ridge line at Z=spot
  const spotZ = ((spot - landscape.pMin) / (landscape.pMax - landscape.pMin || 1) - 0.5) * (size * 2);

  return (
    <group ref={groupRef}>
      {/* Base plate */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 2, size * 2]} />
        <meshBasicMaterial color="#0A0C0E" />
      </mesh>

      <mesh geometry={geometry} onPointerMove={handleMove} onPointerOut={() => onHover(null)}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.75} metalness={0.05} />
      </mesh>
      <lineSegments geometry={wireGeometry}>
        <lineBasicMaterial color="#F0A929" transparent opacity={0.15} />
      </lineSegments>

      {/* Spot reference plane */}
      <Line points={[[-size, 0.02, spotZ], [size, 0.02, spotZ]]} color="#F0A929" lineWidth={1.5} />
      <Line points={[[-size, heightScale + 0.4, spotZ], [size, heightScale + 0.4, spotZ]]} color="#F0A929" lineWidth={0.75} transparent opacity={0.4} />

      {/* Axes */}
      <Line points={[[-size, 0, size], [size, 0, size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, 0, -size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, heightScale, size]]} color="#636C74" lineWidth={1} />

      <Text position={[0, -0.4, size + 0.6]} fontSize={0.35} color="#F0A929" anchorX="center">TIME →</Text>
      <Text position={[-size - 0.6, -0.4, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.35} color="#F0A929" anchorX="center">PRICE</Text>
      <Text position={[-size - 0.4, heightScale + 0.4, size]} fontSize={0.35} color="#F0A929" anchorX="center">P</Text>

      {/* Price ticks */}
      {[landscape.pMin, (landscape.pMin + landscape.pMax) / 2, landscape.pMax].map((p, i) => {
        const z = ((p - landscape.pMin) / (landscape.pMax - landscape.pMin || 1) - 0.5) * (size * 2);
        return (
          <Text key={i} position={[-size - 0.15, -0.05, z]} rotation={[0, Math.PI / 2, 0]} fontSize={0.22} color="#9AA2A9" anchorX="center">
            {p.toFixed(0)}
          </Text>
        );
      })}
    </group>
  );
}

function ScreenTracker({
  point,
  onScreen,
}: {
  point: THREE.Vector3 | null;
  onScreen: (s: { x: number; y: number } | null) => void;
}) {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!point) { onScreen(null); return; }
    const v = point.clone().project(camera);
    onScreen({ x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height });
  });
  return null;
}

export default function MonteCarloLandscape({
  paths,
  buildKey,
  spot,
  horizonDays,
}: {
  paths: number[][];
  buildKey: number;
  spot: number;
  horizonDays: number;
}) {
  const [hover, setHover] = useState<{ t: number; price: number; density: number; point: THREE.Vector3 } | null>(null);
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="relative h-full w-full bg-[#050607]">
      <div className="mono-caps pointer-events-none absolute left-3 top-3 z-10 text-[10px] text-primary">
        PROBABILITY LANDSCAPE · {paths.length.toLocaleString()} PATHS · T+{horizonDays}D
      </div>
      <div className="mono-caps pointer-events-none absolute right-3 top-3 z-10 text-[9px] text-faint">
        DRAG · ORBIT   SCROLL · ZOOM
      </div>
      <Canvas
        camera={{ position: [10, 8, 12], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor("#050607")}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[8, 12, 6]} intensity={0.9} color="#F0A929" />
        <directionalLight position={[-6, 6, -4]} intensity={0.55} color="#45B9D3" />
        <Landscape3D paths={paths} buildKey={buildKey} spot={spot} onHover={setHover} />
        <ScreenTracker point={hover?.point ?? null} onScreen={setScreen} />
        <OrbitControls enablePan={false} minDistance={9} maxDistance={26} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.08} />
      </Canvas>
      {hover && screen && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full border border-primary bg-panel/95 px-2 py-1 font-mono text-[10px] text-foreground amber-glow"
          style={{ left: screen.x, top: screen.y - 8 }}
        >
          <div className="mono-caps text-[9px] text-primary">T+{Math.round(hover.t * horizonDays)}d</div>
          <div className="mono-caps text-[9px] text-muted-foreground">PRICE {hover.price.toFixed(2)}</div>
          <div className="mono-caps text-[9px] text-info">P {(hover.density * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}

