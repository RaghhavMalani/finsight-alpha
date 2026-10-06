import { useEffect, useState } from "react";
import type { TrajectoryNode } from "@/forge/runs/trajectory-model";

export type ReplaySpeed = 1 | 2;

export function ReplayControls({
  nodes,
  currentSequence,
  active,
  speed,
  reducedMotion,
  onActivate,
  onStep,
  onSpeed,
}: {
  nodes: readonly TrajectoryNode[];
  currentSequence: number;
  active: boolean;
  speed: ReplaySpeed;
  reducedMotion: boolean;
  onActivate: () => void;
  onStep: (sequence: number) => void;
  onSpeed: (speed: ReplaySpeed) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const currentIndex = Math.max(
    0,
    nodes.findIndex((node) => node.sequence === currentSequence),
  );
  const [playIndex, setPlayIndex] = useState(currentIndex);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    if (!playing) setPlayIndex(currentIndex);
  }, [currentIndex, playing]);

  useEffect(() => {
    if (!playing || !active) return;
    if (reducedMotion) {
      onStep(nodes[nodes.length - 1].sequence);
      setPlaying(false);
      return;
    }
    if (playIndex >= nodes.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const nextIndex = playIndex + 1;
      setPlayIndex(nextIndex);
      onStep(nodes[nextIndex].sequence);
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [active, nodes, onStep, playIndex, playing, reducedMotion, speed]);

  if (!active) {
    return (
      <section
        className="border-t border-[#1D232B] bg-[#090C0F] px-3 py-3"
        aria-label="Deterministic replay"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#DCE0E4]">
              Deterministic replay
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[#7F8993]">
              Walk the already-frozen action sequence. No model, tool, or engine is executed.
            </p>
          </div>
          <button
            type="button"
            onClick={onActivate}
            className="border border-[#FFB000] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#FFB000] transition-colors hover:bg-[#FFB000] hover:text-[#07090B] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
          >
            Enter replay →
          </button>
        </div>
      </section>
    );
  }

  const previous = nodes[Math.max(0, currentIndex - 1)];
  const next = nodes[Math.min(nodes.length - 1, currentIndex + 1)];
  const atEnd = currentIndex === nodes.length - 1;

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (atEnd) {
      setPlayIndex(0);
      onStep(nodes[0].sequence);
    } else {
      setPlayIndex(currentIndex);
    }
    setPlaying(true);
  };

  return (
    <section
      className="border-t border-[#4B3B1E] bg-[#100F0B]"
      aria-label="Deterministic replay controls"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[#2F291C] px-3 py-2.5">
        <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FFB000]">
          Replay
        </span>
        <button
          type="button"
          onClick={() => onStep(previous.sequence)}
          disabled={currentIndex === 0}
          aria-label="Previous frozen action"
          className="grid size-8 place-items-center border border-[#3A3529] font-mono text-[13px] text-[#D6D0C1] hover:border-[#FFB000] hover:text-[#FFB000] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-pressed={playing}
          className="min-w-20 border border-[#FFB000] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#07090B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
        >
          {playing ? "Pause" : atEnd ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onStep(next.sequence)}
          disabled={atEnd}
          aria-label="Next frozen action"
          className="grid size-8 place-items-center border border-[#3A3529] font-mono text-[13px] text-[#D6D0C1] hover:border-[#FFB000] hover:text-[#FFB000] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
        >
          ▶
        </button>
        <div className="ml-1 flex border border-[#3A3529]" aria-label="Replay speed">
          {([1, 2] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSpeed(item)}
              aria-pressed={speed === item}
              className={`px-2.5 py-1.5 font-mono text-[9px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFB000] ${speed === item ? "bg-[#FFB000] text-[#07090B]" : "text-[#A79F8D] hover:text-[#E6E8EB]"}`}
            >
              {item}×
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[15rem] flex-1 items-center gap-3 lg:max-w-md">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#847B67]">
            Scrub
          </span>
          <input
            type="range"
            min={0}
            max={nodes.length - 1}
            step={1}
            value={currentIndex}
            onChange={(event) => {
              setPlaying(false);
              onStep(nodes[Number(event.target.value)].sequence);
            }}
            aria-label="Replay position"
            className="h-1 w-full cursor-pointer accent-[#FFB000]"
          />
          <output className="w-12 text-right font-mono text-[10px] tabular-nums text-[#D6D0C1]">
            {currentIndex + 1}/{nodes.length}
          </output>
        </label>
      </div>

      <ol className="flex min-w-0 overflow-x-auto px-3 py-3" aria-label="Frozen replay sequence">
        {nodes.map((node, index) => {
          const state =
            index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending";
          return (
            <li key={node.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  onStep(node.sequence);
                }}
                aria-current={state === "current" ? "step" : undefined}
                className="group flex min-w-[7rem] items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB000]"
              >
                <span
                  className={`font-mono text-[12px] ${state === "complete" ? "text-[#35C78A]" : state === "current" ? "text-[#FFB000]" : "text-[#59636E]"}`}
                  aria-hidden="true"
                >
                  {state === "complete" ? "✓" : state === "current" ? "●" : "○"}
                </span>
                <span
                  className={`truncate font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${state === "current" ? "text-[#FFB000]" : state === "complete" ? "text-[#B7C4BC]" : "text-[#65707C]"}`}
                >
                  {node.label}
                </span>
              </button>
              {index < nodes.length - 1 ? (
                <span
                  className={`mx-2 h-px min-w-5 flex-1 ${index < currentIndex ? "bg-[#28694F]" : "bg-[#303842]"}`}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="border-t border-[#2F291C] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#756D5C]">
        {reducedMotion
          ? "Reduced motion · play jumps to final frozen state"
          : "Deterministic visualization cadence · no execution"}
      </div>
    </section>
  );
}
