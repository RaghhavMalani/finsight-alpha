import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type {
  RealityTerrainRidge,
  RealityTerrainViewModel,
} from "@/forge/reality/reality-terrain-model";
import { formatRealityMetric } from "@/forge/reality/reality-terrain-model";

const STAGE_X = [-4, -2, 0, 2, 4] as const;
const SURFACE_DEPTH = 2.2;
const FLOOR = -1.35;

type Point = readonly [number, number, number];

function heightFor(value: number, model: RealityTerrainViewModel): number {
  const span = model.maxValue - model.minValue || 1;
  return -0.75 + ((value - model.minValue) / span) * 4.8;
}

function depthFor(index: number, count: number): number {
  return (index - (count - 1) / 2) * SURFACE_DEPTH;
}

function pointForAggregate(model: RealityTerrainViewModel, index: number): Point {
  return [STAGE_X[index], heightFor(model.aggregateRidge.values[index].value, model), -4.05];
}

function buildSurfaceGeometry(model: RealityTerrainViewModel): THREE.BufferGeometry {
  const sourceRidges = model.ridges;
  const ridges = sourceRidges.length === 1 ? [sourceRidges[0], sourceRidges[0]] : sourceRidges;
  const positions: number[] = [];
  for (let ridgeIndex = 0; ridgeIndex < ridges.length; ridgeIndex += 1) {
    const depth =
      sourceRidges.length === 1
        ? ridgeIndex === 0
          ? -0.7
          : 0.7
        : depthFor(ridgeIndex, ridges.length);
    ridges[ridgeIndex].values.forEach((metric, stageIndex) => {
      positions.push(STAGE_X[stageIndex], heightFor(metric.value, model), depth);
    });
  }

  const indices: number[] = [];
  const columns = model.stages.length;
  for (let row = 0; row < ridges.length - 1; row += 1) {
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

function buildStressCurtainGeometry(model: RealityTerrainViewModel): THREE.BufferGeometry {
  const ridges = model.ridges;
  const positions: number[] = [];
  const indices: number[] = [];
  ridges.forEach((ridge, index) => {
    const depth = ridges.length === 1 ? 0 : depthFor(index, ridges.length);
    const priorHeight = heightFor(ridge.values[3].value, model);
    const stressHeight = heightFor(ridge.values[4].value, model);
    const offset = index * 4;
    positions.push(2, priorHeight, depth, 4, stressHeight, depth, 4, FLOOR, depth, 2, FLOOR, depth);
    indices.push(offset, offset + 3, offset + 1, offset + 1, offset + 3, offset + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function TerrainSurface({
  model,
  selectedIndex,
}: {
  model: RealityTerrainViewModel;
  selectedIndex: number;
}) {
  const geometry = useMemo(() => buildSurfaceGeometry(model), [model]);
  const curtain = useMemo(() => buildStressCurtainGeometry(model), [model]);

  useEffect(
    () => () => {
      geometry.dispose();
      curtain.dispose();
    },
    [curtain, geometry],
  );

  const selectedCrossSection = model.ridges.map((ridge, ridgeIndex): Point => [
    STAGE_X[selectedIndex],
    heightFor(ridge.values[selectedIndex].value, model) + 0.025,
    model.ridges.length === 1 ? 0 : depthFor(ridgeIndex, model.ridges.length),
  ]);

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#153B55"
          emissive="#07131C"
          emissiveIntensity={0.7}
          metalness={0.08}
          roughness={0.78}
          transparent
          opacity={0.88}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#3B789E" wireframe transparent opacity={0.28} />
      </mesh>
      <mesh geometry={curtain}>
        <meshStandardMaterial
          color="#FF5A57"
          emissive="#501616"
          emissiveIntensity={selectedIndex === 4 ? 1.5 : 0.65}
          transparent
          opacity={selectedIndex === 4 ? 0.48 : 0.22}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selectedCrossSection.length > 1 ? (
        <Line
          points={selectedCrossSection}
          color="#FFB000"
          lineWidth={2.2}
          transparent
          opacity={0.9}
        />
      ) : null}
      {model.ridges.map((ridge, ridgeIndex) => (
        <TerrainRidge
          key={ridge.id}
          ridge={ridge}
          model={model}
          depth={model.ridges.length === 1 ? 0 : depthFor(ridgeIndex, model.ridges.length)}
        />
      ))}
    </>
  );
}

function TerrainRidge({
  ridge,
  model,
  depth,
}: {
  ridge: RealityTerrainRidge;
  model: RealityTerrainViewModel;
  depth: number;
}) {
  const points = ridge.values.map((metric, index): Point => [
    STAGE_X[index],
    heightFor(metric.value, model) + 0.035,
    depth,
  ]);
  return <Line points={points} color="#52A8FF" lineWidth={1.05} transparent opacity={0.72} />;
}

function ResearchProbe({
  model,
  selectedIndex,
  reducedMotion,
}: {
  model: RealityTerrainViewModel;
  selectedIndex: number;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => pointForAggregate(model, selectedIndex), [model, selectedIndex]);
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);

  useFrame(() => {
    if (!group.current) return;
    if (reducedMotion) {
      group.current.position.set(...target);
      return;
    }
    group.current.position.lerp(targetVector, 0.095);
  });

  useEffect(() => {
    if (group.current && reducedMotion) group.current.position.set(...target);
  }, [reducedMotion, target]);

  const stage = model.stages[selectedIndex];
  return (
    <group ref={group} position={target}>
      <mesh>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial
          color="#FFB000"
          emissive="#FF8A00"
          emissiveIntensity={1.6}
          roughness={0.38}
        />
      </mesh>
      <mesh scale={1.75}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshBasicMaterial color="#FFB000" transparent opacity={0.14} />
      </mesh>
      <Html center position={[0, 0.62, 0]} distanceFactor={8} zIndexRange={[30, 0]}>
        <div className="min-w-32 border border-[#FFB000] bg-[#080B0E]/95 px-2.5 py-2 font-mono backdrop-blur-sm">
          <div className="text-[9px] font-semibold tracking-[0.1em] text-[#FFB000]">
            {stage.label}
          </div>
          <div className="mt-1 text-[12px] font-semibold tabular-nums text-[#E6E8EB]">
            {formatRealityMetric(stage.value)}
          </div>
        </div>
      </Html>
    </group>
  );
}

function StageMarkers({
  model,
  selectedIndex,
  onSelect,
}: {
  model: RealityTerrainViewModel;
  selectedIndex: number;
  onSelect: (checkpointId: string) => void;
}) {
  return (
    <>
      {model.stages.map((stage, index) => {
        const point = pointForAggregate(model, index);
        const selected = index === selectedIndex;
        const stress = index === model.stages.length - 1;
        return (
          <group key={stage.id} position={point}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelect(stage.id);
              }}
              scale={selected ? 1.35 : 1}
            >
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial
                color={stress ? "#FF5A57" : selected ? "#FFB000" : "#52A8FF"}
                emissive={selected ? "#8C5700" : "#06121A"}
                emissiveIntensity={selected ? 1.2 : 0.4}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function TerrainScene({
  model,
  selectedIndex,
  reducedMotion,
  onSelect,
}: {
  model: RealityTerrainViewModel;
  selectedIndex: number;
  reducedMotion: boolean;
  onSelect: (checkpointId: string) => void;
}) {
  const aggregatePoints = model.aggregateRidge.values.map((_, index) =>
    pointForAggregate(model, index),
  );
  const stressSelected = selectedIndex === model.stages.length - 1;

  return (
    <>
      <color attach="background" args={["#07090B"]} />
      <fog attach="fog" args={["#07090B", 13, 25]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[3, 8, 5]} intensity={2.4} color="#DCE7EE" />
      <pointLight
        position={[4, 1.2, 0]}
        intensity={stressSelected ? 22 : 8}
        distance={7}
        color="#FF4D4A"
      />
      <gridHelper args={[18, 18, "#28323B", "#141A20"]} position={[0, FLOOR, 0]} />
      <TerrainSurface model={model} selectedIndex={selectedIndex} />
      <Line points={aggregatePoints} color="#E6E8EB" lineWidth={1.6} transparent opacity={0.56} />
      <StageMarkers model={model} selectedIndex={selectedIndex} onSelect={onSelect} />
      <ResearchProbe model={model} selectedIndex={selectedIndex} reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping={!reducedMotion}
        dampingFactor={0.07}
        minDistance={8}
        maxDistance={22}
        target={[0, 1, 0]}
      />
    </>
  );
}

export default function RealityTerrain3D({
  model,
  selectedId,
  onSelect,
  reducedMotion,
}: {
  model: RealityTerrainViewModel;
  selectedId: string;
  onSelect: (checkpointId: string) => void;
  reducedMotion: boolean;
}) {
  const selectedIndex = Math.max(
    0,
    model.stages.findIndex((stage) => stage.id === selectedId),
  );
  const [cameraVersion, setCameraVersion] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [traversalIndex, setTraversalIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!playing) setTraversalIndex(selectedIndex);
  }, [playing, selectedIndex]);

  useEffect(() => {
    if (!playing) return;
    if (reducedMotion) {
      const lastIndex = model.stages.length - 1;
      setTraversalIndex(lastIndex);
      onSelect(model.stages[lastIndex].id);
      setPlaying(false);
      return;
    }
    if (traversalIndex >= model.stages.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const next = traversalIndex + 1;
      setTraversalIndex(next);
      onSelect(model.stages[next].id);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [model.stages, onSelect, playing, reducedMotion, traversalIndex]);

  const selectStage = (checkpointId: string) => {
    setPlaying(false);
    const nextIndex = model.stages.findIndex((stage) => stage.id === checkpointId);
    if (nextIndex >= 0) setTraversalIndex(nextIndex);
    onSelect(checkpointId);
  };

  const beginTraversal = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (traversalIndex >= model.stages.length - 1) {
      setTraversalIndex(0);
      onSelect(model.stages[0].id);
    }
    setPlaying(true);
  };

  return (
    <div
      className="relative h-[520px] min-h-[420px] overflow-hidden"
      data-testid="reality-terrain-3d"
    >
      <Canvas
        key={cameraVersion}
        camera={{ position: [8.8, 6.8, 11.8], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <TerrainScene
          model={model}
          selectedIndex={selectedIndex}
          reducedMotion={reducedMotion}
          onSelect={selectStage}
        />
      </Canvas>

      <div className="absolute left-3 top-3 flex border border-[#303842] bg-[#080B0E]/92 backdrop-blur-sm">
        <button
          type="button"
          onClick={beginTraversal}
          aria-pressed={playing}
          className="border-r border-[#303842] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#FFB000] hover:bg-[#15140F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
        >
          {playing
            ? "Pause probe"
            : traversalIndex >= model.stages.length - 1
              ? "Replay descent"
              : "Play descent"}
        </button>
        <button
          type="button"
          onClick={() => setCameraVersion((version) => version + 1)}
          className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A6AFB8] hover:bg-[#111820] hover:text-[#E6E8EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000]"
        >
          Reset view
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 border border-[#29313A] bg-[#080B0E]/92 px-2.5 py-2 font-mono text-[9px] uppercase leading-5 tracking-[0.08em] text-[#7F8993]">
        X / execution realism
        <br />Y / regime dimension
        <br />Z / {model.metricLabel} height
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-60 border border-[#572E31] bg-[#110B0C]/92 px-2.5 py-2 text-right font-mono text-[9px] uppercase leading-5 tracking-[0.08em] text-[#FF6C68]">
        Red cut / {model.largestDegradation.label}
        <br />
        {formatRealityMetric(model.largestDegradation.change, true)} Sharpe
      </div>
    </div>
  );
}
