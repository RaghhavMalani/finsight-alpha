import { EpistemicBadge } from "@/epistemic/EpistemicValue";
import type { TrajectoryNode, TrajectoryViewModel } from "@/forge/runs/trajectory-model";
import { formatNodeCost, formatNodeLatency } from "@/forge/runs/trajectory-model";

const NODE_WIDTH = 144;
const NODE_HEIGHT = 118;
const STEP_X = 172;

function nodePosition(node: TrajectoryNode, index: number) {
  return {
    x: 28 + index * STEP_X,
    y: 34 + node.experimentDepth * 54,
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
  const width = Math.max(720, model.nodes.length * STEP_X + 48);
  const height = Math.max(
    340,
    ...model.nodes.map((node) => 34 + node.experimentDepth * 54 + NODE_HEIGHT + 34),
  );
  const positions = new Map(
    model.nodes.map((node, index) => [node.id, nodePosition(node, index)] as const),
  );

  return (
    <div className="overflow-x-auto" data-testid="trajectory-2d">
      <div
        className="relative bg-[linear-gradient(#151a20_1px,transparent_1px),linear-gradient(90deg,#151a20_1px,transparent_1px)] bg-[size:32px_32px]"
        style={{ minWidth: width, height }}
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
              <path d="M0 0L8 4L0 8Z" fill="#4c5762" />
            </marker>
          </defs>
          {model.edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            const sourceX = source.x + NODE_WIDTH;
            const sourceY = source.y + NODE_HEIGHT / 2;
            const targetX = target.x;
            const targetY = target.y + NODE_HEIGHT / 2;
            const bend = (sourceX + targetX) / 2;
            return (
              <path
                key={edge.id}
                d={`M${sourceX} ${sourceY} C${bend} ${sourceY},${bend} ${targetY},${targetX - 7} ${targetY}`}
                fill="none"
                stroke="#4c5762"
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
                style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(node.sequence)}
                  aria-pressed={active}
                  aria-label={`${node.label}, action ${node.sequence}, ${node.tokens} tokens, ${formatNodeCost(node.cost)}, ${formatNodeLatency(node.latency)}, verifier ${node.verifierState}`}
                  className={`group relative h-[118px] w-full border bg-[#090c0f] p-3 text-left transition-[background-color,border-color,transform] duration-150 hover:bg-[#0f1419] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000] ${
                    active
                      ? "border-[#FFB000] bg-[#13120e]"
                      : "border-[#303842] hover:border-[#59636e]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ backgroundColor: verifierTone }}
                  />
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-mono text-[8px] text-[#65707c]">
                        {String(node.sequence).padStart(2, "0")}
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold tracking-[0.04em] text-[#E6E8EB]">
                        {node.label}
                      </span>
                    </span>
                    <EpistemicBadge type={node.epistemicType} />
                  </span>
                  <span className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[8px] tabular-nums">
                    <span className="text-[#88929c]">{node.tokens.toLocaleString()} tok</span>
                    <span className="text-right text-[#FFB000]">{formatNodeCost(node.cost)}</span>
                    <span className="truncate text-[#52A8FF]" title={node.engine}>
                      {node.engine.replace("gpt-5.6-", "")}
                    </span>
                    <span className="text-right text-[#88929c]">
                      {formatNodeLatency(node.latency)}
                    </span>
                  </span>
                  {active ? (
                    <span className="absolute bottom-2 right-2 font-mono text-[7px] font-semibold uppercase tracking-[0.12em] text-[#FFB000]">
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
          className="absolute bottom-2 left-3 flex gap-4 font-mono text-[7px] uppercase tracking-[0.1em] text-[#4f5963]"
        >
          <span>X / progression →</span>
          <span>Y / experiment depth ↓</span>
          <span>Time is printed per node</span>
        </div>
      </div>
    </div>
  );
}
