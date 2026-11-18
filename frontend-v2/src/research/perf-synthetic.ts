import type { GraphNode, ResearchGraph } from "./contract";

/**
 * Verifier-only scale probe. scripts/verify-research.mjs sets window.__researchSynthetic
 * before load to measure frame time with ~200 nodes. No URL or control reaches this; the
 * page marks itself SYNTHETIC and the added nodes carry no numbers and no sources.
 */
export function synthesize(
  graph: ResearchGraph,
  target: number,
): ResearchGraph & { synthetic: true } {
  const extra = Math.max(0, target - graph.nodes.length);
  const nodes: GraphNode[] = [...graph.nodes];
  const edges = [...graph.edges];
  for (let i = 0; i < extra; i++) {
    const id = `SYN:${i}`;
    nodes.push({
      id,
      kind: i % 3 === 0 ? "counterfactual" : "experiment",
      group: "SYNTHETIC",
      country: i % 2 ? "INDIA" : "US",
      label: { t: "synthetic scale probe", src: "synthetic", ptr: "" },
      state: "inconclusive",
      edgeKind: "ROBUSTNESS",
      facts: [],
    });
    edges.push({ from: "H", to: id, kind: "ROBUSTNESS", src: "synthetic", ptr: "" });
    edges.push({ from: id, to: "F", kind: "HOLM_FAMILY", src: "synthetic", ptr: "" });
  }
  return { ...graph, nodes, edges, synthetic: true };
}
