import type { ReplayManifest } from "../../replay/contracts";

export type VerifiedSelection = {
  artifactId: string;
  clocks: readonly { label: string; value: string }[];
  limitations?: readonly string[];
};
type Snapshot = Pick<ReplayManifest, "artifacts"> & { as_of: string; basis?: string };
/** Full closed seed validation is needed only when the generic fallback is loaded. */
export async function validateNavigationSeed(value: unknown): Promise<Snapshot> {
  const object = (value: unknown, keys: readonly string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new Error("Navigation seed contains an undeclared or missing field.");
    return value as Record<string, unknown>;
  };
  const text = (v: unknown, max = 4096): v is string =>
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= max &&
    ![...v].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
  const stable = (v: unknown) =>
    JSON.stringify(v, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : item,
    );
  if (new TextEncoder().encode(JSON.stringify(value)).length > 48 * 1024)
    throw new Error("Navigation seed byte bound exceeded.");
  const seed = object(value, [
    "schema_version",
    "generator_contract",
    "manifestBinding",
    "bindings",
    "payloadDigest",
  ]);
  const manifest = object(seed.manifestBinding, ["sha256", "bytes", "asOf"]);
  if (
    seed.schema_version !== "terminal-navigation-seed/1" ||
    seed.generator_contract !== "terminal-generator/1" ||
    !hash(seed.payloadDigest) ||
    !hash(manifest.sha256) ||
    !Number.isSafeInteger(manifest.bytes) ||
    Number(manifest.bytes) <= 0 ||
    Number(manifest.bytes) > 2 * 1024 * 1024 ||
    !date(manifest.asOf)
  )
    throw new Error("Navigation seed identity or source binding is invalid.");
  const bindings = object(seed.bindings, ["market:IN-MKT", "market:US-MKT"]);
  for (const [id, entry] of Object.entries(bindings)) {
    const india = id === "market:IN-MKT";
    const r = object(entry, [
      "status",
      "kind",
      "url",
      "sha256",
      "bytes",
      "sources",
      "licence",
      "input_hash",
      "as_of",
      "observed_at",
      "available_at",
      "reason",
      "scope",
    ]);
    const licence = object(r.licence, [
      "status",
      "permitted_uses",
      "dataset_key",
      "valid_through",
      "attribution",
      "source_urls",
      "terms_url",
      "basis",
    ]);
    if (
      r.status !== "AVAILABLE" ||
      r.kind !== "market-series" ||
      r.scope !== "FACTOR_RESEARCH" ||
      r.url !== "/artifacts/replay/market-" + id.slice(7) + ".json" ||
      !Array.isArray(r.sources) ||
      r.sources.length !== 1 ||
      r.sources[0] !== (india ? "IIMA" : "KENNETH_FRENCH") ||
      licence.dataset_key !== (india ? "iima:daily-factors" : "ken-french:daily-factors") ||
      !text(r.url) ||
      !/^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(r.url) ||
      !hash(r.sha256) ||
      !hash(r.input_hash) ||
      !Number.isSafeInteger(r.bytes) ||
      Number(r.bytes) <= 0 ||
      Number(r.bytes) > 16 * 1024 * 1024 ||
      !Array.isArray(r.sources) ||
      !r.sources.length ||
      !r.sources.every((source) => text(source, 160)) ||
      !date(r.as_of) ||
      !date(r.observed_at) ||
      !date(r.available_at) ||
      r.reason !== null ||
      !["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN", "TEST_ONLY"].includes(String(licence.status)) ||
      !Array.isArray(licence.permitted_uses) ||
      !licence.permitted_uses.every((use) => text(use)) ||
      !licence.permitted_uses.includes("publish_derived") ||
      !text(licence.dataset_key) ||
      !text(licence.attribution) ||
      !text(licence.basis) ||
      !text(licence.terms_url) ||
      !Array.isArray(licence.source_urls) ||
      !licence.source_urls.length ||
      !licence.source_urls.every((url) => text(url)) ||
      (licence.valid_through !== null &&
        (!date(licence.valid_through) ||
          Date.parse(String(licence.valid_through)) <= Date.parse(String(r.as_of))))
    )
      throw new Error("Navigation source is not an available admitted public derivative.");
  }
  const seal = {
    schema_version: seed.schema_version,
    generator_contract: seed.generator_contract,
    manifestBinding: manifest,
    bindings,
  };
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(seal)))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== seed.payloadDigest) throw new Error("Navigation seed digest mismatch.");
  return {
    artifacts: bindings as Snapshot["artifacts"],
    as_of: String(manifest.asOf),
    basis: "Build-verified navigation seed",
  };
}
