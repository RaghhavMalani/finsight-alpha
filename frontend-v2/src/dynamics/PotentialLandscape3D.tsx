import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { DynamicsExperiment } from "@/dynamics/contracts";

type Point = readonly [number, number, number];

function buildDomain(experiment: DynamicsExperiment): [number, number] {
  const observed = experiment.series.map((point) => point.observed);
  const minimum = Math.min(...observed, experiment.parameters.mu);
  const maximum = Math.max(...observed, experiment.parameters.mu);
  const padding = Math.max((maximum - minimum) * 0.24, 0.2);
  return [minimum - padding, maximum + padding];
}

function potentialHeight(
  value: number,
  mu: number,
  theta: number,
  domain: [number, number],
): number {
  const edge = Math.max(Math.abs(domain[0] - mu), Math.abs(domain[1] - mu), 0.01);
  const maximum = 0.5 * theta * edge * edge;
  return -1.15 + (0.5 * theta * (value - mu) * (value - mu) * 4.2) / maximum;
}

function xPosition(value: number, domain: [number, number]): number {
  return -5 + ((value - domain[0]) / (domain[1] - domain[0])) * 10;
}

function buildGeometry(
  experiment: DynamicsExperiment,
  domain: [number, number],
): THREE.BufferGeometry {
  const theta = experiment.parameters.theta;
  const mu = experiment.parameters.mu;
  const columns = 45;
  const rows = 17;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const z = -4 + (row / (rows - 1)) * 8;
    for (let column = 0; column < columns; column += 1) {
      const ratio = column / (columns - 1);
      const value = domain[0] + ratio * (domain[1] - domain[0]);
      positions.push(xPosition(value, domain), potentialHeight(value, mu, theta, domain), z);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Landscape({
  experiment,
  reducedMotion,
}: {
  experiment: DynamicsExperiment;
  reducedMotion: boolean;
}) {
  const domain = useMemo(() => buildDomain(experiment), [experiment]);
  const geometry = useMemo(() => buildGeometry(experiment, domain), [domain, experiment]);
  const theta = experiment.parameters.theta;
  const mu = experiment.parameters.mu;
  const holdout = experiment.series.slice(-Math.max(2, experiment.holdoutWindow.observations));
  const trajectory = holdout.map((point, index): Point => [
    xPosition(point.observed, domain),
    potentialHeight(point.observed, mu, theta, domain) + 0.08,
    -3.7 + (index / Math.max(holdout.length - 1, 1)) * 7.4,
  ]);
  const finalPoint = trajectory.at(-1) ?? ([0, 0, 0] as const);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#12344A"
          emissive="#06141D"
          emissiveIntensity={0.85}
          metalness={0.1}
          roughness={0.76}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#3A7496" wireframe transparent opacity={0.25} />
      </mesh>
      <Line points={trajectory} color="#FFB000" lineWidth={1.65} transparent opacity={0.76} />
      {trajectory.slice(0, -1).map((point, index) => (
        <mesh key={`${point[2]}-${index}`} position={point}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color="#FFB000" transparent opacity={0.56} />
        </mesh>
      ))}
      <StateProbe point={finalPoint} reducedMotion={reducedMotion} />
      <group position={[xPosition(mu, domain), -1.02, -3.65]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.12, 0.2, 24]} />
          <meshBasicMaterial color="#E6E8EB" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
        <Html center position={[0, 0.48, 0]} distanceFactor={8} zIndexRange={[30, 0]}>
          <div className="whitespace-nowrap border border-[#3A4650] bg-[#080B0E]/95 px-2 py-1.5 font-mono text-[9px] tracking-[0.08em] text-[#D4DADE] backdrop-blur-sm">
            μ / EQUILIBRIUM BASIN
          </div>
        </Html>
      </group>
    </>
  );
}

function StateProbe({ point, reducedMotion }: { point: Point; reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.12;
    ref.current.scale.setScalar(scale);
  });
  return (
    <group position={point}>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.17, 0]} />
        <meshStandardMaterial color="#FFB000" emissive="#FF8A00" emissiveIntensity={1.7} />
      </mesh>
      <pointLight color="#FFB000" intensity={7} distance={2.5} />
    </group>
  );
}

function Scene({
  experiment,
  reducedMotion,
}: {
  experiment: DynamicsExperiment;
  reducedMotion: boolean;
}) {
  return (
    <>
      <color attach="background" args={["#07090B"]} />
      <fog attach="fog" args={["#07090B", 12, 24]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 8, 5]} intensity={2.2} color="#E6EEF2" />
      <pointLight position={[-4, 1, -2]} intensity={9} distance={7} color="#1B709E" />
      <gridHelper args={[18, 18, "#25313A", "#131A20"]} position={[0, -1.18, 0]} />
      <Landscape experiment={experiment} reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.07}
        minDistance={8}
        maxDistance={22}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export default function PotentialLandscape3D({
  experiment,
  reducedMotion,
}: {
  experiment: DynamicsExperiment;
  reducedMotion: boolean;
}) {
  const [cameraVersion, setCameraVersion] = useState(0);
  return (
    <div
      className="relative h-[500px] min-h-[420px] overflow-hidden"
      data-testid="dynamics-potential-3d"
    >
      <Canvas
        key={cameraVersion}
        camera={{ position: [8.4, 6.2, 10.8], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Scene experiment={experiment} reducedMotion={reducedMotion} />
      </Canvas>
      <button
        type="button"
        onClick={() => setCameraVersion((version) => version + 1)}
        className="absolute left-3 top-3 border border-[#303842] bg-[#080B0E]/92 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A6AFB8] backdrop-blur-sm transition-colors hover:border-[#FFB000] hover:text-[#FFB000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
      >
        Reset view
      </button>
      <div className="pointer-events-none absolute bottom-3 left-3 border border-[#29313A] bg-[#080B0E]/92 px-2.5 py-2 font-mono text-[9px] uppercase leading-5 tracking-[0.08em] text-[#7F8993]">
        X / observable state
        <br />Y / inferred potential U(X)
        <br />Z / future holdout time
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-60 border border-[#4B3B1E] bg-[#100E09]/92 px-2.5 py-2 text-right font-mono text-[9px] uppercase leading-5 tracking-[0.08em] text-[#CFA857]">
        Amber trace / observed holdout
        <br />
        Surface / fitted OU potential
      </div>
    </div>
  );
}
