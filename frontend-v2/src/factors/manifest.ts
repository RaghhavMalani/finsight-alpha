import { sha256 } from "../replay/client.ts";
import {
  assertDerivedPayload,
  validateReplayManifest,
  type ReplayManifest,
} from "../replay/contracts.ts";
import { FACTOR_READ_PLAN } from "./read-plan.generated.ts";

let manifestPromise: Promise<ReplayManifest> | null = null;
const payloads = new Map<string, Promise<unknown>>();

export async function checkFactorReadManifest(raw: ArrayBuffer): Promise<ReplayManifest> {
  const binding = FACTOR_READ_PLAN.projection;
  if (raw.byteLength !== binding.bytes || (await sha256(raw)) !== binding.sha256)
    throw new Error("Factor read manifest checksum or byte count mismatch.");
  return validateReplayManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
}

export function loadFactorReadManifest(): Promise<ReplayManifest> {
  manifestPromise ??= fetch(FACTOR_READ_PLAN.projection.url, { credentials: "omit" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Checked Factor read manifest unavailable.");
      return checkFactorReadManifest(await response.arrayBuffer());
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
}

export async function readFactorArtifact(identity: string): Promise<unknown> {
  const manifest = await loadFactorReadManifest();
  const entry = manifest.artifacts[identity];
  if (!entry || entry.status !== "AVAILABLE")
    throw new Error("No checked Factor artifact for this selection.");
  const key = identity + ":" + entry.sha256;
  if (!payloads.has(key))
    payloads.set(
      key,
      fetch(entry.url!, { credentials: "omit" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Checked Factor artifact unavailable.");
          const raw = await response.arrayBuffer();
          if (raw.byteLength !== entry.bytes || (await sha256(raw)) !== entry.sha256)
            throw new Error("Factor artifact checksum or byte count mismatch.");
          const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
          assertDerivedPayload(value);
          return value;
        })
        .catch((error) => {
          payloads.delete(key);
          throw error;
        }),
    );
  return structuredClone(await payloads.get(key));
}
