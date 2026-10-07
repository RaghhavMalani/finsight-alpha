import {
  assertDerivedPayload,
  ReplayError,
  validateReplayManifest,
  type ReplayManifest,
} from "./contracts.ts";

let manifestPromise: Promise<ReplayManifest> | null = null;
const payloads = new Map<string, Promise<unknown>>();
export async function sha256(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function loadReplayManifest(): Promise<ReplayManifest> {
  manifestPromise ??= fetch("/replay-manifest.json", { credentials: "omit" })
    .then(async (r) => {
      if (!r.ok) throw new ReplayError("Checked Replay manifest unavailable.");
      return validateReplayManifest(await r.json());
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
}
export async function readReplayArtifact(id: string): Promise<unknown> {
  const manifest = await loadReplayManifest();
  const entry = manifest.artifacts[id];
  if (!entry || entry.status !== "AVAILABLE")
    throw new ReplayError(
      entry?.reason ?? "No checked, publication-licensed artifact for this selection.",
    );
  const key = `${id}:${entry.sha256}`;
  if (!payloads.has(key))
    payloads.set(
      key,
      (async () => {
        const response = await fetch(entry.url!, { credentials: "omit" });
        if (!response.ok) throw new ReplayError("Checked artifact unavailable.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== entry.bytes || (await sha256(bytes)) !== entry.sha256)
          throw new ReplayError("Replay artifact SHA-256 or byte count mismatch.");
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        assertDerivedPayload(value);
        return value;
      })().catch((error) => {
        payloads.delete(key);
        throw error;
      }),
    );
  return structuredClone(await payloads.get(key));
}
export function canonicalRoute(path: string): string {
  const url = new URL(path, "https://replay.invalid");
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}
export async function readReplayRoute(path: string) {
  const manifest = await loadReplayManifest();
  const key = canonicalRoute(path);
  const id = manifest.routes[key];
  if (id) return readReplayArtifact(id);
  const url = new URL(key, "https://replay.invalid");
  if (
    url.pathname === "/forge/runs" &&
    manifest.routes["/forge/runs?baseline_id=forge-v0.2.5"] &&
    [...url.searchParams.keys()].every((k) => ["baseline_id", "model", "verdict"].includes(k)) &&
    url.searchParams.get("baseline_id") === "forge-v0.2.5"
  ) {
    const p = (await readReplayArtifact(
      manifest.routes["/forge/runs?baseline_id=forge-v0.2.5"],
    )) as { items: Record<string, unknown>[]; matched: number };
    p.items = p.items.filter(
      (r) =>
        (!url.searchParams.has("model") || r.model === url.searchParams.get("model")) &&
        (!url.searchParams.has("verdict") ||
          (r.decision as { verdict?: string })?.verdict === url.searchParams.get("verdict")),
    );
    p.matched = p.items.length;
    return p;
  }
  throw new ReplayError(
    "No public Replay for this function. Use local Live with configured credentials; coverage is never fabricated.",
  );
}
