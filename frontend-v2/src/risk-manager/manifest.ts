import { sha256 } from "../replay/client.ts";
import { validateReplayManifest, type ReplayManifest } from "../replay/contracts.ts";
import { strictJSON } from "./strict-json.ts";
import { RISK_READ_PLAN } from "./read-plan.generated.ts";

const snapshots = new Map<string, Promise<ReplayManifest>>();
export async function checkRiskReadManifest(
  raw: ArrayBuffer,
  full = false,
): Promise<ReplayManifest> {
  const binding = full ? RISK_READ_PLAN.global : RISK_READ_PLAN.projection;
  if (raw.byteLength !== binding.bytes || (await sha256(raw)) !== binding.sha256)
    throw new Error("Risk read manifest checksum or byte count mismatch.");
  return validateReplayManifest(strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
}

/** Initial selection is bounded; explicit historical interaction can read the sealed global view. */
export function loadRiskReadManifest(full = false): Promise<ReplayManifest> {
  const binding = full ? RISK_READ_PLAN.global : RISK_READ_PLAN.projection;
  if (!snapshots.has(binding.url))
    snapshots.set(
      binding.url,
      fetch(binding.url, { credentials: "omit" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Checked Risk read manifest unavailable.");
          return checkRiskReadManifest(await response.arrayBuffer(), full);
        })
        .catch((error) => {
          snapshots.delete(binding.url);
          throw error;
        }),
    );
  return snapshots.get(binding.url)!;
}
