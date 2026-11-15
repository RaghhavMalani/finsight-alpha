import { useEffect, useState } from "react";
import { sha256Hex, validateGraph, type ResearchGraph } from "./contract";
import { RESEARCH_GRAPH_PIN } from "./pin.generated";

export type GraphLoad =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ok"; graph: ResearchGraph; sha256: string; url: string };

/**
 * Fetch the projection and refuse it unless its bytes hash to the SHA-256 compiled into
 * this route at build time. A substituted or edited file never reaches the renderer.
 */
export async function loadResearchGraph(): Promise<GraphLoad> {
  const { url, sha256 } = RESEARCH_GRAPH_PIN;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch (error) {
    return { status: "unavailable", reason: `Could not fetch ${url}: ${String(error)}` };
  }
  if (!response.ok)
    return { status: "unavailable", reason: `${url} returned HTTP ${response.status}` };
  const bytes = await response.arrayBuffer();
  const digest = await sha256Hex(bytes);
  if (digest !== sha256)
    return {
      status: "unavailable",
      reason: `SHA-256 mismatch: expected ${sha256.slice(0, 16)}…, received ${digest.slice(0, 16)}…. The research projection changed after this build; it is not drawn.`,
    };
  try {
    const graph = validateGraph(JSON.parse(new TextDecoder().decode(bytes)));
    return { status: "ok", graph, sha256: digest, url };
  } catch (error) {
    return { status: "unavailable", reason: (error as Error).message };
  }
}

export function useResearchGraph(): GraphLoad {
  const [state, setState] = useState<GraphLoad>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void loadResearchGraph().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
