// Forge v2 (U4): the Run Observer's step-through trajectory list. New in v2; no v1 counterpart.
// It lists the recorded actions in their recorded order and steps the selection through them.
// Playback replays only that order: no action, value or timing is invented.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ForgeProv } from "@/forge2/shared/forge-prov";
import { useReducedMotion } from "@/forge2/shared/motion";
import type { TrajectoryNode, TrajectoryViewModel } from "./trajectory-model";

/** Display pace of playback. A UI constant, not recorded timing (the record has no timestamps). */
const PLAY_INTERVAL_MS = 1200;
const NO_TURN = "no model turn is recorded for this action";

const KEY_STEP: Readonly<Record<string, "prev" | "next" | "first" | "last">> = {
  ArrowUp: "prev",
  k: "prev",
  ArrowDown: "next",
  j: "next",
  Home: "first",
  End: "last",
};

export function TrajectoryStepper({
  model,
  selectedSequence,
  onStep,
  P,
}: {
  model: TrajectoryViewModel;
  selectedSequence: number;
  onStep: (sequence: number) => void;
  P: ForgeProv;
}) {
  const nodes = model.nodes;
  const last = nodes.length - 1;
  const index = Math.max(
    0,
    nodes.findIndex((n) => n.sequence === selectedSequence),
  );
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const active = playing && !reduced && index < last;
  const listRef = useRef<HTMLOListElement>(null);

  // Playback: advance one recorded action per tick, and stop on the last one.
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (index + 1 >= last) setPlaying(false);
      onStep(nodes[index + 1].sequence);
    }, PLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [active, index, last, nodes, onStep]);

  // Keep keyboard focus on the selected step while the reader steps through the list.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !list.contains(document.activeElement)) return;
    list.querySelector<HTMLButtonElement>(`[data-step="${selectedSequence}"]`)?.focus();
  }, [selectedSequence]);

  const go = (to: number) => {
    setPlaying(false);
    const target = nodes[Math.min(last, Math.max(0, to))];
    if (target && target.sequence !== selectedSequence) onStep(target.sequence);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const move = KEY_STEP[event.key];
    if (!move) return;
    event.preventDefault();
    go(move === "prev" ? index - 1 : move === "next" ? index + 1 : move === "first" ? 0 : last);
  };
  const togglePlay = () => {
    if (active) return setPlaying(false);
    if (index >= last) onStep(nodes[0].sequence);
    setPlaying(true);
  };
  const current = nodes[index];

  return (
    <div className="f2-stepper" onKeyDown={onKeyDown}>
      <div className="f2-replay" role="group" aria-label="Replay recorded actions">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
          ◀ Prev
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={reduced || nodes.length < 2}
          aria-pressed={active}
          data-playing={active ? "true" : "false"}
        >
          {active ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === last}>
          Next ▶
        </button>
        <span className="f2-replay-pos" aria-live="polite">
          Step{" "}
          {P.N(`/run/actions/${index}`, index + 1, "Step position", String(index + 1), {
            formula: "1-based position of the selected action in /run/actions",
          })}{" "}
          of{" "}
          {P.N("/run/actions", nodes.length, "Actions", String(nodes.length), {
            formula: "count of /run/actions",
          })}
        </span>
      </div>
      <p className="f2-note">
        {reduced
          ? "Reduced motion is on, so playback is off: the selection changes only when you step."
          : "Play steps through the recorded actions in their recorded order at a fixed display pace. The pace is not recorded timing."}{" "}
        Keys: ↑ ↓ or j k to step, Home and End to jump.
      </p>
      <ol ref={listRef} className="f2-steps" aria-label="Recorded trajectory steps">
        {nodes.map((node, i) => (
          <StepRow
            key={node.id}
            node={node}
            index={i}
            selected={i === index}
            P={P}
            onSelect={() => go(i)}
          />
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  node,
  index,
  selected,
  P,
  onSelect,
}: {
  node: TrajectoryNode;
  index: number;
  selected: boolean;
  P: ForgeProv;
  onSelect: () => void;
}) {
  const t = node.turn;
  return (
    <li>
      <button
        type="button"
        data-step={node.sequence}
        tabIndex={selected ? 0 : -1}
        aria-current={selected ? "step" : undefined}
        onClick={onSelect}
        className="f2-step"
      >
        <span className="f2-step-head">
          <span className="f2-step-seq">
            {P.N(
              `/run/actions/${index}/sequence`,
              node.sequence,
              "Action sequence",
              String(node.sequence).padStart(2, "0"),
              {},
              "x",
              true,
            )}
          </span>
          <span className="f2-step-label">{node.label}</span>
          <span className="f2-step-status" data-verifier={node.verifierState}>
            {node.status}
          </span>
        </span>
        <span className="f2-step-usage">
          {t ? (
            <>
              {P.N(
                t.inputTokens.provenance.fieldPath,
                t.inputTokens.value,
                "Input tokens",
                t.inputTokens.value.toLocaleString("en-US"),
                {},
                "x",
                true,
              )}{" "}
              in /{" "}
              {P.N(
                t.outputTokens.provenance.fieldPath,
                t.outputTokens.value,
                "Output tokens",
                t.outputTokens.value.toLocaleString("en-US"),
                {},
                "x",
                true,
              )}{" "}
              out
            </>
          ) : (
            <>
              tokens{" "}
              {P.N("/model_turns", null, "Tokens", undefined, { reason: NO_TURN }, "x", true)}
            </>
          )}
        </span>
      </button>
    </li>
  );
}
