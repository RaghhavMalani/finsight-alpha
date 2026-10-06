import { EpistemicBadge } from "@/epistemic/EpistemicValue";
import type { TrajectoryNode, TrajectoryViewModel } from "@/forge/runs/trajectory-model";
import { formatNodeCost, formatNodeLatency } from "@/forge/runs/trajectory-model";

type GraphLayout = Readonly<{
  nodeWidth: number;
  nodeHeight: number;
  stepX: number;
  depthScale: number;
  padding: number;
  minHeight: number;
}>;

function layoutFor(count: number): GraphLayout {
  if (count <= 4) {
    return {
      nodeWidth: 168,
      nodeHeight: 126,
      stepX: 198,
      depthScale: 38,
      padding: 30,
      minHeight: 238,
    };
  }
  if (count <= 8) {
    return {
      nodeWidth: 150,
      nodeHeight: 120,
      stepX: 178,
      depthScale: 48,
      padding: 28,
      minHeight: 300,
    };
  }
  return {
    nodeWidth: 138,
    nodeHeight: 114,
    stepX: 162,
    depthScale: 58,
    padding: 26,
    minHeight: 390,
  };
}

function nodePosition(node: TrajectoryNode, index: number, layout: GraphLayout) {
  return {
    x: layout.padding + index * layout.stepX,
    y: layout.padding + node.experimentDepth * layout.depthScale,
  };
}

export function TrajectoryGraph2D({
  model,
  selectedSequence,
  onSelect,
}: {
  model: TrajectoryViewModel;
  selectedSequence: number;
  onSelect: (sequence: number) => void;
}) {
  const layout = layoutFor(model.nodes.length);
  const width =
    layout.padding * 2 + layout.nodeWidth + Math.max(0, model.nodes.length - 1) * layout.stepX;
  const contentHeight = Math.max(
    0,
    ...model.nodes.map(
      (node) => layout.padding + node.experimentDepth * layout.depthScale + layout.nodeHeight + 42,
    ),
  );
  const height = Math.max(layout.minHeight, contentHeight);
  const positions = new Map(
    model.nodes.map((node, index) => [node.id, nodePosition(node, index, layout)] as const),
  );

  return (
    <div className="overflow-x-auto bg-[#07090B]" data-testid="trajectory-2d">
      <div
        className="relative mx-auto bg-[linear-gradient(#151A20_1px,transparent_1px),linear-gradient(90deg,#151A20_1px,transparent_1px)] bg-[size:32px_32px]"
        style={{ width, minWidth: width, height }}
      >
        <svg aria-hidden="true" className="absolute left-0 top-0" width={width} height={height}>
          <defs>
            <marker
              id="trajectory-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8Z" fill="#4C5762" />
            </marker>
          </defs>
          {model.edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            const sourceX = source.x + layout.nodeWidth;
            const sourceY = source.y + layout.nodeHeight / 2;
            const targetX = target.x;
            const targetY = target.y + layout.nodeHeight / 2;
            const bend = (sourceX + targetX) / 2;
            return (
              <path
                key={edge.id}
                d={`M${sourceX} ${sourceY} C${bend} ${sourceY},${bend} ${targetY},${targetX - 7} ${targetY}`}
                fill="none"
                stroke="#4C5762"
                strokeWidth="1.25"
                markerEnd="url(#trajectory-arrow)"
              />
            );
          })}
        </svg>

        <ol aria-label="Ordered trajectory actions" className="absolute inset-0">
          {model.nodes.map((node, index) => {
            const active = node.sequence === selectedSequence;
            const position = positions.get(node.id) ?? { x: 0, y: 0 };
            const verifierTone = node.verifierState === "PASS" ? "#35C78A" : "#FF5A57";
            return (
              <li
                key={node.id}
                className="absolute"
                style={{ left: position.x, top: position.y, width: layout.nodeWidth }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(node.sequence)}
                  aria-pressed={active}
                  aria-label={`${node.label}, action ${node.sequence}, ${node.tokens} tokens, ${formatNodeCost(node.cost)}, ${formatNodeLatency(node.latency)}, verifier ${node.verifierState}`}
                  className={`group relative w-full border bg-[#090C0F] p-3 text-left transition-[background-color,border-color,transform] duration-150 hover:bg-[#0F1419] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
                    active
                      ? "border-[#FFB000] bg-[#13120E]"
                      : "border-[#303842] hover:border-[#59636E]"
                  }`}
                  style={{ height: layout.nodeHeight }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ backgroundColor: verifierTone }}
                  />
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-mono text-[9px] text-[#71808C]">
                        {String(node.sequence).padStart(2, "0")} · {node.verifierState}
                      </span>
                      <span className="mt-1 block text-[12px] font-semibold tracking-[0.04em] text-[#E6E8EB]">
                        {node.label}
                      </span>
                    </span>
                    <EpistemicBadge type={node.epistemicType} />
                  </span>
                  <span className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[9px] tabular-nums">
                    <span className="text-[#9AA4AE]">{node.tokens.toLocaleString()} tok</span>
                    <span className="text-right font-medium text-[#FFB000]">
                      {formatNodeCost(node.cost)}
                    </span>
                    <span className="truncate font-medium text-[#52A8FF]" title={node.engine}>
                      {node.engine.replace("gpt-5.6-", "")}
                    </span>
                    <span className="text-right text-[#9AA4AE]">
                      {formatNodeLatency(node.latency)}
                    </span>
                  </span>
                  {active ? (
                    <span className="absolute bottom-2 right-2 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-[#FFB000]">
                      selected
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>

        <div
          aria-hidden="true"
          className="absolute bottom-2 left-3 flex gap-4 font-mono text-[8px] uppercase tracking-[0.1em] text-[#59636E]"
        >
          <span>X / progression →</span>
          <span>Y / experiment depth ↓</span>
        </div>
      </div>
    </div>
  );
}
