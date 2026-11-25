import type { ForgeProv } from "@/forge/shared/forge-prov";
import { formatNodeCost, formatNodeLatency, type TrajectoryNode } from "./trajectory-model";

const NO_TURN = "no model turn is recorded for this action";

/**
 * A trajectory node's numbers with their origins in the run projection (`/forge/runs/<id>`).
 * Node `index` is the action's position in /run/actions. Usage comes from the action's model
 * turn; an action without one shows its usage as unavailable, never as zero.
 */
export function nodeNums(P: ForgeProv, node: TrajectoryNode, index: number, inert = false) {
  const t = node.turn;
  const missing = { reason: NO_TURN };
  return {
    sequence: P.N(
      `/run/actions/${index}/sequence`,
      node.sequence,
      "Action sequence",
      String(node.sequence).padStart(2, "0"),
      {},
      "x",
      inert,
    ),
    tokens: P.N(
      t ? t.inputTokens.provenance.fieldPath : "/model_turns",
      t ? node.tokens : null,
      "Tokens",
      node.tokens.toLocaleString(),
      t
        ? {
            // Both summed fields are named, so the popover does not point at the input side only.
            ptr2: t.outputTokens.provenance.fieldPath,
            formula: `${t.inputTokens.provenance.fieldPath} + ${t.outputTokens.provenance.fieldPath}`,
          }
        : missing,
      "x",
      inert,
    ),
    cost: P.N(
      t ? t.cost.provenance.fieldPath : "/model_turns",
      t ? node.cost : null,
      "Cost",
      formatNodeCost(node.cost),
      t ? { note: "Token estimate, not an invoice." } : missing,
      "x",
      inert,
    ),
    latency: P.N(
      t ? t.latency.provenance.fieldPath : "/model_turns",
      t ? node.latency : null,
      "Elapsed",
      formatNodeLatency(node.latency),
      t ? {} : missing,
      "x",
      inert,
    ),
    cumulative: P.N(
      "/model_turns",
      node.cumulativeLatency,
      "Cumulative latency",
      formatNodeLatency(node.cumulativeLatency),
      {
        formula: `sum of /model_turns/*/latency_seconds for actions up to sequence ${node.sequence}`,
        note: "Actions without a recorded model turn add nothing to the sum.",
      },
      "x",
      inert,
    ),
  };
}
