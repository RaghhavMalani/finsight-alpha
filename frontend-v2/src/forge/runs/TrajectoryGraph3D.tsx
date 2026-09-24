import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { TrajectoryNode, TrajectoryViewModel } from "@/forge/runs/trajectory-model";
import { formatNodeCost, formatNodeLatency } from "@/forge/runs/trajectory-model";

type Point = readonly [number, number, number];

function pointForNode(
  node: TrajectoryNode,
  index: number,
  count: number,
  maxLatency: number,
): Point {
  return [
    (index - (count - 1) / 2) * 2.35,
    node.experimentDepth * 0.78,
    -(node.cumulativeLatency / maxLatency) * 3.2,
  ];
}

function costColor(node: TrajectoryNode, maxCost: number): string {
  const ratio = node.cost / maxCost;
  if (ratio > 0.72) return "#FFB000";
  if (ratio > 0.38) return "#b77b15";
  return "#72531d";
}

function TraceNode({
  node,
  position,
  maxTokens,
  maxCost,
  selected,
  onSelect,
}: {
  node: TrajectoryNode;
  position: Point;
  maxTokens: number;
  maxCost: number;
  selected: boolean;
  onSelect: (sequence: number) => void;
}) {
  const size = 0.48 + (node.tokens / maxTokens) * 0.42;
  const border = node.verifierState === "PASS" ? "#35C78A" : "#FF5A57";
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node.sequence);
  };

  return (
    <group position={position}>
      <mesh onClick={select} scale={selected ? 1.1 : 1}>
        <boxGeometry args={[size * 1.35, size, size]} />
        <meshStandardMaterial
          color={costColor(node, maxCost)}
          emissive={selected ? "#3d2900" : "#000000"}
          emissiveIntensity={selected ? 0.55 : 0}
          roughness={0.72}
          metalness={0.08}
        />
      </mesh>
      <mesh scale={selected ? 1.16 : 1.08}>
        <boxGeometry args={[size * 1.35, size, size]} />
        <meshBasicMaterial color={border} wireframe transparent opacity={selected ? 1 : 0.72} />
      </mesh>
      <Html center position={[0, size * 0.95, 0]} distanceFactor={8} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={() => onSelect(node.sequence)}
          aria-pressed={selected}
          className={`min-w-28 border bg-[#080b0e]/95 px-2 py-1.5 text-left font-mono text-[8px] uppercase tracking-[0.08em] backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
            selected ? "border-[#FFB000] text-[#FFB000]" : "border-[#35404a] text-[#d9dee2]"
          }`}
        >
          <span className="block font-semibold">{node.label}</span>
          <span className="mt-1 block text-[7px] text-[#7f8993]">
            {node.tokens.toLocaleString()} tok · {formatNodeCost(node.cost)} ·{" "}
            {formatNodeLatency(node.latency)}
          </span>
        </button>
      </Html>
    </group>
  );
}

function TraceScene({
  model,
  selectedSequence,
  onSelect,
  reducedMotion,
}: {
  model: TrajectoryViewModel;
  selectedSequence: number;
  onSelect: (sequence: number) => void;
  reducedMotion: boolean;
}) {
  const points = new Map(
    model.nodes.map(
      (node, index) =>
        [node.id, pointForNode(node, index, model.nodes.length, model.maxLatency)] as const,
    ),
  );

  return (
    <>
      <color attach="background" args={["#07090B"]} />
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 7, 5]} intensity={2.2} color="#dce7ee" />
      <gridHelper args={[18, 18, "#303842", "#171d23"]} position={[0, -0.95, -1.4]} />
      {model.edges.map((edge) => {
        const source = points.get(edge.source);
        const target = points.get(edge.target);
        return source && target ? (
          <Line key={edge.id} points={[source, target]} color="#59636e" lineWidth={1.2} />
        ) : null;
      })}
      {model.nodes.map((node) => (
        <TraceNode
          key={node.id}
          node={node}
          position={points.get(node.id) ?? [0, 0, 0]}
          maxTokens={model.maxTokens}
          maxCost={model.maxCost}
          selected={node.sequence === selectedSequence}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={18}
        target={[0, 0.7, -1.3]}
      />
    </>
  );
}

export default function TrajectoryGraph3D({
  model,
  selectedSequence,
  onSelect,
  reducedMotion,
}: {
  model: TrajectoryViewModel;
  selectedSequence: number;
  onSelect: (sequence: number) => void;
  reducedMotion: boolean;
}) {
  return (
    <div className="relative h-[420px] min-h-[360px]" data-testid="trajectory-3d">
      <Canvas
        camera={{ position: [4.6, 5.2, 10.5], fov: 44, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <TraceScene
          model={model}
          selectedSequence={selectedSequence}
          onSelect={onSelect}
          reducedMotion={reducedMotion}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 left-3 border border-[#29313a] bg-[#080b0e]/90 px-2 py-1.5 font-mono text-[7px] uppercase tracking-[0.1em] text-[#7f8993]">
        X progression · Y experiment depth · Z cumulative elapsed
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 text-right font-mono text-[7px] uppercase leading-4 tracking-[0.08em] text-[#65707c]">
        Size / tokens
        <br />
        Brightness / cost
        <br />
        Border / verifier
      </div>
    </div>
  );
}
