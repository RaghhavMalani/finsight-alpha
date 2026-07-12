import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { generateGreeksSurface, type Greek } from "@/lib/greeks-surface";
import { viridisRgb } from "@/lib/vol-surface";

function GreeksMesh({
  symbol,
  spot,
  greek,
  onHover,
}: {
  symbol: string;
  spot: number;
  greek: Greek;
  onHover: (info: { strike: number; expiry: number; val: number; point: THREE.Vector3 } | null) => void;
}) {
  const surface = useMemo(() => generateGreeksSurface(symbol, spot, greek), [symbol, spot, greek]);
  const size = 6;
  const heightScale = 2.8;
  const { geometry, wireGeometry } = useMemo(() => {
    const cols = surface.strikes.length;
    const rows = surface.expiries.length;
    const g = new THREE.PlaneGeometry(size * 2, size * 2, cols - 1, rows - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const range = surface.max - surface.min || 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const v = surface.values[r][c];
        const t = (v - surface.min) / range;
        pos.setY(idx, t * heightScale);
        const [cr, cg, cb] = viridisRgb(t);
        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return { geometry: g, wireGeometry: new THREE.WireframeGeometry(g) };
  }, [surface]);

  const groupRef = useRef<THREE.Group>(null!);
  const [userInteracting, setUserInteracting] = useState(false);
  useFrame((_, dt) => {
    if (groupRef.current && !userInteracting) groupRef.current.rotation.y += dt * 0.08;
  });
  useEffect(() => {
    const canvases = document.querySelectorAll("canvas");
    const cleanups: Array<() => void> = [];
    canvases.forEach((c) => {
      const h = () => setUserInteracting(true);
      c.addEventListener("pointerdown", h);
      cleanups.push(() => c.removeEventListener("pointerdown", h));
    });
    return () => cleanups.forEach((c) => c());
  }, []);

  function handleMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    const uv = e.uv;
    if (!uv) return;
    const cols = surface.strikes.length;
    const rows = surface.expiries.length;
    const cIdx = Math.round(uv.x * (cols - 1));
    const rIdx = Math.round((1 - uv.y) * (rows - 1));
    onHover({
      strike: spot * (1 + surface.strikes[cIdx] / 100),
      expiry: surface.expiries[rIdx],
      val: surface.values[rIdx][cIdx],
      point: e.point.clone(),
    });
  }

  return (
    <group ref={groupRef}>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 2, size * 2]} />
        <meshBasicMaterial color="#0A0C0E" />
      </mesh>
      <mesh geometry={geometry} onPointerMove={handleMove} onPointerOut={() => onHover(null)}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} metalness={0.1} />
      </mesh>
      <lineSegments geometry={wireGeometry}>
        <lineBasicMaterial color="#F0A929" transparent opacity={0.22} />
      </lineSegments>
      <Line points={[[-size, 0, size], [size, 0, size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, 0, -size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, heightScale, size]]} color="#636C74" lineWidth={1} />
      <Text position={[0, -0.4, size + 0.6]} fontSize={0.35} color="#F0A929" anchorX="center">STRIKE</Text>
      <Text position={[-size - 0.6, -0.4, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.35} color="#F0A929" anchorX="center">EXPIRY</Text>
      <Text position={[-size - 0.4, heightScale + 0.4, size]} fontSize={0.35} color="#F0A929" anchorX="center">{greek}</Text>
      {[0, 0.5, 1].map((t) => (
        <Text key={t} position={[-size - 0.1, t * heightScale, size + 0.15]} fontSize={0.22} color="#9AA2A9" anchorX="right">
          {(surface.min + range(surface) * t).toFixed(greek === "GAMMA" ? 4 : 2)}
        </Text>
      ))}
    </group>
  );
}
function range(s: { min: number; max: number }) { return s.max - s.min || 1; }

function ScreenTracker({ point, onScreen }: { point: THREE.Vector3 | null; onScreen: (s: { x: number; y: number } | null) => void }) {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!point) { onScreen(null); return; }
    const v = point.clone().project(camera);
    onScreen({ x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height });
  });
  return null;
}

export default function GreeksSurfaceCanvas({ symbol, spot, greek }: { symbol: string; spot: number; greek: Greek }) {
  const [hover, setHover] = useState<{ strike: number; expiry: number; val: number; point: THREE.Vector3 } | null>(null);
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [10, 8, 12], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor("#050607")}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[8, 12, 6]} intensity={0.9} color="#F0A929" />
        <directionalLight position={[-6, 6, -4]} intensity={0.5} color="#45B9D3" />
        <GreeksMesh symbol={symbol} spot={spot} greek={greek} onHover={setHover} />
        <ScreenTracker point={hover?.point ?? null} onScreen={setScreen} />
        <OrbitControls enablePan={false} minDistance={9} maxDistance={26} minPolarAngle={0.2} maxPolarAngle={Math.PI / 2 - 0.08} />
      </Canvas>
      {hover && screen && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full border border-primary bg-panel/95 px-2 py-1 font-mono text-[10px] text-foreground amber-glow"
          style={{ left: screen.x, top: screen.y - 8 }}
        >
          <div className="mono-caps text-[9px] text-primary">STRIKE {hover.strike.toFixed(2)}</div>
          <div className="mono-caps text-[9px] text-muted-foreground">EXPIRY {hover.expiry}d</div>
          <div className="mono-caps text-[9px] text-info">{greek} {hover.val.toFixed(greek === "GAMMA" ? 4 : 3)}</div>
        </div>
      )}
    </div>
  );
}

