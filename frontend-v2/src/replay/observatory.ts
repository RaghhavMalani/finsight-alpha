import { loadReplayManifest } from "./client";
import type { Manifest } from "../components/observatory/types";
import type { ReplayManifest } from "./contracts";
export function observatoryManifest(m: ReplayManifest): Manifest {
  const artifacts: Manifest["artifacts"] = {};
  for (const [id, e] of Object.entries(m.artifacts)) {
    if (id.startsWith("observatory:") && e.status === "AVAILABLE")
      artifacts[id.slice("observatory:".length)] = {
        url: e.url!,
        sha256: e.sha256!,
        input_hash: e.input_hash!,
        as_of: e.as_of,
      };
  }
  return { schema_version: "model-observatory-manifest/1", as_of: m.as_of, artifacts };
}
export async function loadObservatoryManifest() {
  return observatoryManifest(await loadReplayManifest());
}
