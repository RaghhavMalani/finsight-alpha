import { MOTION, STATE, type ColorName, type EvidenceState } from "@/visual/tokens";
import type { EventKind, GraphNode, ResearchGraph } from "./contract";

/**
 * Replay: recorded events in recorded order, with real gaps compressed onto a short clock.
 * Same-instant events stay close; long pauses (the day between v0.1 and the skeptic) become
 * a beat, not a wait. Nothing is reordered and nothing is invented.
 */
export type Replay = {
  /** Replay-clock second at which event i is applied. */
  times: number[];
  duration: number;
};
export function buildReplay(graph: ResearchGraph, seconds: number = MOTION.replaySeconds): Replay {
  const raw: number[] = [];
  let t = 0,
    prev = NaN;
  for (const e of graph.timeline) {
    const at = Date.parse(e.at),
      gap = Number.isNaN(prev) ? 0 : Math.max(0, (at - prev) / 1000);
    t += Number.isNaN(prev)
      ? 0
      : gap === 0
        ? 0.02
        : 0.05 + 0.6 * Math.min(1, Math.log10(1 + gap) / 5);
    raw.push(t);
    prev = at;
  }
  const scale = raw.length && raw[raw.length - 1] > 0 ? (seconds - 0.6) / raw[raw.length - 1] : 1;
  return { times: raw.map((x) => 0.3 + x * scale), duration: seconds };
}

/** Number of events applied at replay time t. */
export function stepAt(replay: Replay, t: number): number {
  let lo = 0,
    hi = replay.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (replay.times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type NodeView = {
  /** What the node shows at this step. */
  state: EvidenceState;
  /** Open work: breathes while true. */
  running: boolean;
  /** Replay time of the last transition, for a single flare; -2 when none. */
  flareAt: number;
  flareKind: EventKind | null;
};

/** Every node's visible state after `step` events. */
export function viewsAt(graph: ResearchGraph, replay: Replay, step: number): NodeView[] {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const views: NodeView[] = graph.nodes.map(() => ({
    state: "dormant",
    running: false,
    flareAt: -2,
    flareKind: null,
  }));
  for (let i = 0; i < step && i < graph.timeline.length; i++) {
    const e = graph.timeline[i],
      k = index.get(e.node)!,
      n = graph.nodes[k],
      v = views[k];
    v.flareAt = replay.times[i];
    v.flareKind = e.kind;
    switch (e.kind) {
      case "freeze":
        v.state = "frozen";
        v.running = false;
        break;
      case "start":
      case "holdout":
        v.state = n.kind === "skeptic" ? "challenge" : "running";
        v.running = true;
        break;
      case "challenge":
        v.state = "challenge";
        v.running = true;
        break;
      case "resolve":
        v.state = n.state;
        v.running = false;
        break;
      case "fail":
        v.state = "falsified";
        v.running = false;
        break;
      case "reject":
        v.state = n.state;
        v.running = false;
        break;
      case "challenged":
        v.state = n.finalState ?? "challenged";
        v.running = false;
        break;
    }
  }
  return views;
}

export const stateColor = (s: EvidenceState): ColorName => STATE[s].color;

/** The colour a transition flares in: failures and challenges are louder than resolves. */
export function flareColor(kind: EventKind | null, state: EvidenceState): ColorName {
  if (kind === "fail" || kind === "reject") return "red";
  if (kind === "challenged") return "amber";
  if (kind === "challenge") return "magenta";
  if (kind === "start" || kind === "holdout") return "amber";
  return stateColor(state);
}

/** A running skeptic reads as challenging; once sealed, as a recorded challenge. */
export const stateLabel = (v: NodeView, n?: GraphNode) =>
  v.running && v.state === "challenge"
    ? "challenging"
    : n?.rule && v.state === "inconclusive"
      ? "preregistered rule not met"
      : n?.rule && v.state === "verified"
        ? "preregistered rule met"
        : STATE_LABEL[v.state];

export const KIND_LABEL: Record<GraphNode["kind"], string> = {
  hypothesis: "Hypothesis",
  question: "Question",
  experiment: "Experiment",
  counterfactual: "Counterfactual",
  finding: "Finding",
  verifier: "Verifier",
  check: "Check",
  skeptic: "Skeptic challenge",
};

export const STATE_LABEL: Record<EvidenceState, string> = {
  dormant: "not yet recorded",
  running: "running",
  verified: "verified",
  inconclusive: "inconclusive",
  unavailable: "unavailable",
  falsified: "failed",
  repaired: "rejected, then reproduced",
  held: "control held",
  recorded: "recorded · no preregistered rule",
  uncalibrated: "not calibrated",
  challenge: "challenge recorded",
  challenged: "challenged · gate closed",
  frozen: "frozen",
};

/** Base sprite size (world units) per node, before state. */
export function nodeSize(n: GraphNode): number {
  switch (n.kind) {
    case "hypothesis":
      return 1.25;
    case "finding":
      return 1.0;
    case "skeptic":
      return 0.95;
    case "question":
      return 0.5;
    case "verifier":
      return 0.62;
    case "experiment":
      return n.edgeKind === "EXECUTION" || n.edgeKind === "BASELINE" ? 0.5 : 0.36;
    case "counterfactual":
      return 0.36;
    case "check":
      return 0.26;
  }
}
