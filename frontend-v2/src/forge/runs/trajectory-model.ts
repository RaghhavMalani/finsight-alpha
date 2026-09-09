import type {
  EpistemicType,
  ResearchMetric,
  RunAction,
  RunDetail,
  RunTurn,
} from "@/forge/contracts/observer";

export type TrajectoryVerifierState = "PASS" | "FAIL" | "INFO";

export type TrajectoryNode = Readonly<{
  id: string;
  sequence: number;
  label: string;
  tool: string;
  kind: "WORLD" | "ACTION" | "DECISION";
  status: string;
  stage: string | null;
  engine: string;
  certificationLevel: string | null;
  epistemicType: EpistemicType;
  verifierState: TrajectoryVerifierState;
  tokens: number;
  cost: number;
  latency: number;
  cumulativeLatency: number;
  experimentDepth: number;
  resultHash: string;
  evidenceHash: string | null;
  metrics: readonly ResearchMetric[];
  action: RunAction;
  turn: RunTurn | null;
}>;

export type TrajectoryEdge = Readonly<{
  id: string;
  source: string;
  target: string;
}>;

export type TrajectoryViewModel = Readonly<{
  nodes: readonly TrajectoryNode[];
  edges: readonly TrajectoryEdge[];
  maxTokens: number;
  maxCost: number;
  maxLatency: number;
}>;

const LABEL_BY_TOOL: Readonly<Record<string, string>> = {
  "research.inspect_hypothesis": "WORLD",
  "research.run_screen": "SCREEN",
  "research.promote_event_replay": "EVENT REPLAY",
  "research.add_costs": "COSTS",
  "research.run_latency_sensitivity": "LATENCY",
  "research.run_counterfactual_stress": "STRESS",
  "research.revise_hypothesis": "REVISE",
  "research.abandon": "ABANDON",
};

function labelForAction(action: RunAction, run: RunDetail): string {
  if (action.tool === "research.submit") return run.decision?.verdict ?? "DECISION";
  if (LABEL_BY_TOOL[action.tool]) return LABEL_BY_TOOL[action.tool];
  if (action.stage) return action.stage.replaceAll("_", " ");
  return action.tool
    .replace(/^research\./, "")
    .replaceAll("_", " ")
    .toUpperCase();
}

function depthForAction(action: RunAction, previousDepth: number): number {
  const stage = (action.stage ?? action.tool).toUpperCase();
  if (stage.includes("COUNTERFACTUAL") || stage.includes("STRESS")) return 3;
  if (stage.includes("LATENCY")) return 2.35;
  if (stage.includes("COST") || stage.includes("SLIPPAGE")) return 1.8;
  if (stage.includes("EVENT") || action.highFidelityRun) return 1.2;
  if (stage.includes("SCREEN") || action.engineRun) return 0.6;
  if (action.tool === "research.submit" || action.tool === "research.abandon") {
    return previousDepth;
  }
  return 0;
}

function epistemicTypeForAction(action: RunAction): EpistemicType {
  const metricType = action.metrics[0]?.provenance.epistemicType;
  if (metricType) return metricType;
  if (action.tool === "research.inspect_hypothesis") return "HISTORICAL";
  if (action.engineRun) return "COMPUTED";
  return "MODEL";
}

function verifierStateForAction(action: RunAction, run: RunDetail): TrajectoryVerifierState {
  const acceptableStatus = action.status === "OK" || action.status === "OBSERVED";
  const checks = run.verificationChecks;
  const relevantChecks = [checks.trajectory_actions, checks.model_action_binding];
  if (action.engineRun) relevantChecks.push(checks.required_evidence);
  if (action.tool === "research.submit") {
    relevantChecks.push(checks.decision_binding, checks.verdict);
  }
  return acceptableStatus && relevantChecks.every((value) => value !== false) ? "PASS" : "FAIL";
}

export function buildTrajectoryViewModel(run: RunDetail): TrajectoryViewModel {
  const turnsBySequence = new Map(run.turns.map((turn) => [turn.sequence, turn]));
  let cumulativeLatency = 0;
  let previousDepth = 0;

  const nodes = run.actions.map((action): TrajectoryNode => {
    const turn = turnsBySequence.get(action.sequence) ?? null;
    const tokens = turn ? turn.inputTokens.value + turn.outputTokens.value : 0;
    const cost = turn?.cost.value ?? 0;
    const latency = turn?.latency.value ?? 0;
    cumulativeLatency += latency;
    const experimentDepth = depthForAction(action, previousDepth);
    previousDepth = experimentDepth;
    const label = labelForAction(action, run);

    return {
      id: `action-${action.sequence}`,
      sequence: action.sequence,
      label,
      tool: action.tool,
      kind:
        action.tool === "research.inspect_hypothesis"
          ? "WORLD"
          : action.tool === "research.submit" || action.tool === "research.abandon"
            ? "DECISION"
            : "ACTION",
      status: action.status,
      stage: action.stage,
      engine: action.engine ?? (action.engineRun ? "UNAVAILABLE" : run.model),
      certificationLevel: action.certificationLevel,
      epistemicType: epistemicTypeForAction(action),
      verifierState: verifierStateForAction(action, run),
      tokens,
      cost,
      latency,
      cumulativeLatency,
      experimentDepth,
      resultHash: action.resultHash,
      evidenceHash: action.evidenceHash,
      metrics: action.metrics,
      action,
      turn,
    };
  });

  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `${nodes[index].id}-${node.id}`,
      source: nodes[index].id,
      target: node.id,
    })),
    maxTokens: Math.max(1, ...nodes.map((node) => node.tokens)),
    maxCost: Math.max(0.000001, ...nodes.map((node) => node.cost)),
    maxLatency: Math.max(0.001, ...nodes.map((node) => node.cumulativeLatency)),
  };
}

export function formatNodeCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function formatNodeLatency(value: number): string {
  return `${value.toFixed(2)}s`;
}
