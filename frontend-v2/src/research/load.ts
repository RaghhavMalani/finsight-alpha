import { useEffect, useState } from "react";
import { sha256Hex, validateGraph, type ResearchGraph } from "./contract";
import { RESEARCH_GRAPH_PIN } from "./pin.generated";

export type GraphLoad =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ok"; graph: ResearchGraph; sha256: string; url: string };

/**
 * Fetch the projection and refuse it unless its length and bytes match the pin compiled
 * into this route at build time. Every failure, including a missing Web Crypto (plain
 * http on a non-local host), ends in UNAVAILABLE with its reason; nothing hangs.
 */
export async function loadResearchGraph(): Promise<GraphLoad> {
  const { url, sha256, bytes: expected } = RESEARCH_GRAPH_PIN;
  try {
    if (!globalThis.crypto?.subtle)
      return {
        status: "unavailable",
        reason:
          "This page cannot verify the evidence: Web Crypto is unavailable (a secure context is required).",
      };
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok)
      return { status: "unavailable", reason: `${url} returned HTTP ${response.status}` };
    const declared = response.headers.get("content-length");
    if (
      declared != null &&
      !response.headers.get("content-encoding") &&
      Number(declared) !== expected
    )
      return {
        status: "unavailable",
        reason: `Length mismatch: expected ${expected} bytes, the server declared ${declared}. The projection is not drawn.`,
      };
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== expected)
      return {
        status: "unavailable",
        reason: `Length mismatch: expected ${expected} bytes, received ${bytes.byteLength}. The projection is not drawn.`,
      };
    const digest = await sha256Hex(bytes);
    if (digest !== sha256)
      return {
        status: "unavailable",
        reason: `SHA-256 mismatch: expected ${sha256.slice(0, 16)}…, received ${digest.slice(0, 16)}…. The research projection changed after this build; it is not drawn.`,
      };
    const graph = validateGraph(JSON.parse(new TextDecoder().decode(bytes)));
    return { status: "ok", graph, sha256: digest, url };
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Could not verify ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function useResearchGraph(): GraphLoad {
  const [state, setState] = useState<GraphLoad>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadResearchGraph()
      .catch((error: unknown) => ({ status: "unavailable" as const, reason: String(error) }))
      .then((s) => {
        if (alive) setState(s);
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
