import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { generateVolSurface, viridisRgb } from "@/lib/vol-surface";

function SurfaceMesh({
  symbol,
  spot,
  onHover,
}: {
  symbol: string;
  spot: number;
  onHover: (info: { strike: number; expiry: number; iv: number; point: THREE.Vector3 } | null) => void;
}) {
  const surface = useMemo(() => generateVolSurface(symbol, spot), [symbol, spot]);
  const meshRef = useRef<THREE.Mesh>(null!);
  const wireRef = useRef<THREE.LineSegments>(null!);

  const size = 6; // half-extent of the plot (X, Z)
  const heightScale = 2.8;

  const { geometry, wireGeometry, ivMin, ivMax } = useMemo(() => {
    const cols = surface.strikes.length;
    const rows = surface.expiries.length;
    const g = new THREE.PlaneGeometry(size * 2, size * 2, cols - 1, rows - 1);
    g.rotateX(-Math.PI / 2);

    let ivMin = Infinity;
    let ivMax = -Infinity;
    for (const row of surface.iv) for (const v of row) {
      if (v < ivMin) ivMin = v;
      if (v > ivMax) ivMax = v;
    }
    const range = ivMax - ivMin || 1;

    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const v = surface.iv[r][c];
        const t = (v - ivMin) / range;
        const y = t * heightScale;
        pos.setY(idx, y);
        const [cr, cg, cb] = viridisRgb(t);
        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();

    const wire = new THREE.WireframeGeometry(g);

    return { geometry: g, wireGeometry: wire, ivMin, ivMax };
  }, [surface]);

  // Auto-rotate group
  const groupRef = useRef<THREE.Group>(null!);
  const [userInteracting, setUserInteracting] = useState(false);
  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((_, dt) => {
    if (groupRef.current && !userInteracting && !reducedMotion) {
      groupRef.current.rotation.y += dt * 0.08;
    }
  });

  useEffect(() => {
    const c = document.querySelector("canvas");
    if (!c) return;
    const down = () => setUserInteracting(true);
    c.addEventListener("pointerdown", down);
    return () => c.removeEventListener("pointerdown", down);
  }, []);

  function handleMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    const uv = e.uv;
    if (!uv) return;
    const cols = surface.strikes.length;
    const rows = surface.expiries.length;
    const cIdx = Math.round(uv.x * (cols - 1));
    const rIdx = Math.round((1 - uv.y) * (rows - 1));
    const strike = spot * (1 + surface.strikes[cIdx] / 100);
    const expiry = surface.expiries[rIdx];
    const iv = surface.iv[rIdx][cIdx];
    onHover({ strike, expiry, iv, point: e.point.clone() });
  }

  function handleOut() {
    onHover(null);
  }

  return (
    <group ref={groupRef}>
      {/* Base grid plate */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 2, size * 2]} />
        <meshBasicMaterial color="#0A0C0E" />
      </mesh>

      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      >
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.7}
          metalness={0.1}
          flatShading={false}
        />
      </mesh>
      <lineSegments ref={wireRef} geometry={wireGeometry}>
        <lineBasicMaterial color="#F0A929" transparent opacity={0.22} />
      </lineSegments>

      {/* Axes */}
      <Line points={[[-size, 0, size], [size, 0, size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, 0, -size]]} color="#636C74" lineWidth={1} />
      <Line points={[[-size, 0, size], [-size, heightScale, size]]} color="#636C74" lineWidth={1} />

      <Text position={[0, -0.4, size + 0.6]} fontSize={0.35} color="#F0A929" anchorX="center">
        STRIKE
      </Text>
      <Text
        position={[-size - 0.6, -0.4, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.35}
        color="#F0A929"
        anchorX="center"
      >
        EXPIRY
      </Text>
      <Text
        position={[-size - 0.4, heightScale + 0.4, size]}
        fontSize={0.35}
        color="#F0A929"
        anchorX="center"
      >
        IV%
      </Text>

      {/* IV scale labels on the vertical axis */}
      {[0, 0.5, 1].map((t) => (
        <Text
          key={t}
          position={[-size - 0.1, t * heightScale, size + 0.15]}
          fontSize={0.22}
          color="#9AA2A9"
          anchorX="right"
        >
          {(ivMin + (ivMax - ivMin) * t).toFixed(0)}
        </Text>
      ))}

      {/* Strike labels */}
      {[-20, 0, 20].map((k) => {
        const x = (k / 25) * size;
        return (
          <Text key={k} position={[x, -0.05, size + 0.3]} fontSize={0.22} color="#9AA2A9" anchorX="center">
            {k >= 0 ? `+${k}%` : `${k}%`}
          </Text>
        );
      })}
      {/* Expiry labels */}
      {[7, 90, 365].map((d) => {
        const idx = surface.expiries.indexOf(d);
        const z = -size + (idx / (surface.expiries.length - 1)) * (size * 2);
        return (
          <Text
            key={d}
            position={[-size - 0.15, -0.05, z]}
            rotation={[0, Math.PI / 2, 0]}
            fontSize={0.22}
            color="#9AA2A9"
            anchorX="center"
          >
            {d}d
          </Text>
        );
      })}
    </group>
  );
}

function HoverChip({
  info,
}: {
  info: { strike: number; expiry: number; iv: number; point: THREE.Vector3 } | null;
}) {
  const { camera, size } = useThree();
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);

  useFrame(() => {
    if (!info) {
      if (screen) setScreen(null);
      return;
    }
    const v = info.point.clone().project(camera);
    setScreen({
      x: (v.x * 0.5 + 0.5) * size.width,
      y: (-v.y * 0.5 + 0.5) * size.height,
    });
  });

  if (!info || !screen) return null;
  return (
    <Html screen={screen} iv={info.iv} strike={info.strike} expiry={info.expiry} />
  );
}

function Html({ screen, strike, expiry, iv }: { screen: { x: number; y: number }; strike: number; expiry: number; iv: number }) {
  return null; // placeholder — the real HTML overlay lives in the parent component
}

export default function VolatilitySurfaceCanvas({ symbol, spot }: { symbol: string; spot: number }) {
  const [hover, setHover] = useState<{ strike: number; expiry: number; iv: number; point: THREE.Vector3 } | null>(null);
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <Canvas
        camera={{ position: [10, 8, 12], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor("#050607")}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[8, 12, 6]} intensity={0.9} color="#F0A929" />
        <directionalLight position={[-6, 6, -4]} intensity={0.5} color="#45B9D3" />
        <SurfaceMesh
          symbol={symbol}
          spot={spot}
          onHover={(info) => {
            setHover(info);
          }}
        />
        <ScreenTracker point={hover?.point ?? null} onScreen={setScreen} />
        <OrbitControls
          enablePan={false}
          minDistance={9}
          maxDistance={26}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2 - 0.08}
        />
      </Canvas>
      {hover && screen && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full border border-primary bg-panel/95 px-2 py-1 font-mono text-[10px] text-foreground amber-glow"
          style={{ left: screen.x, top: screen.y - 8 }}
        >
          <div className="mono-caps text-[9px] text-primary">STRIKE {hover.strike.toFixed(2)}</div>
          <div className="mono-caps text-[9px] text-muted-foreground">EXPIRY {hover.expiry}d</div>
          <div className="mono-caps text-[9px] text-info">IV {hover.iv.toFixed(1)}%</div>
        </div>
      )}
    </div>
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
    if (!point) {
      onScreen(null);
      return;
    }
    const v = point.clone().project(camera);
    onScreen({
      x: (v.x * 0.5 + 0.5) * size.width,
      y: (-v.y * 0.5 + 0.5) * size.height,
    });
  });
  return null;
}

