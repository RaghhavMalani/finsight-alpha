import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "prettier";
import {
  KNOWN_IDS,
  KNOWN_ENTRIES,
  KNOWN_METADATA_ENTRIES,
  stable,
} from "../src/factors/contracts.ts";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { strictJSON } from "../src/risk-manager/strict-json.ts";

const hash = (raw) => createHash("sha256").update(raw).digest("hex");

/** A read view of reviewed Factor entries; the authoritative global history stays intact. */
export function deriveFactorReadManifest(manifest) {
  validateReplayManifest(manifest);
  const reviewed = { ...KNOWN_METADATA_ENTRIES, ...KNOWN_ENTRIES };
  for (const [identity, entry] of Object.entries(reviewed))
    assert.equal(
      stable(manifest.artifacts[identity]),
      stable(entry),
      "Reviewed Factor entry changed",
    );
  for (const [selection, kinds] of Object.entries(KNOWN_IDS)) {
    const [country, cutoff] = selection.split("|");
    for (const [kind, identity] of Object.entries(kinds)) {
      const route =
        "/factor-evidence/" + kind + "?" + new URLSearchParams({ as_of: cutoff, country });
      assert.equal(manifest.routes[route], identity, "Reviewed Factor route changed");
    }
  }
  return validateReplayManifest({
    ...manifest,
    artifacts: Object.fromEntries(
      Object.entries(manifest.artifacts).filter(([identity]) => Object.hasOwn(reviewed, identity)),
    ),
    routes: Object.fromEntries(
      Object.entries(manifest.routes).filter(([, identity]) => Object.hasOwn(reviewed, identity)),
    ),
  });
}

export function verifyFactorReadProjection(manifest, projection) {
  assert.deepEqual(
    stable(projection),
    stable(deriveFactorReadManifest(manifest)),
    "Factor read projection changed",
  );
  return true;
}

/** Only metadata is generated; retained manifests and numerical artifacts are never written. */
export async function generateFactorReadManifest() {
  const source = new URL("../public/replay-manifest.json", import.meta.url);
  const snapshot = readFileSync(source);
  const manifest = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(snapshot));
  const projection = deriveFactorReadManifest(manifest);
  verifyFactorReadProjection(manifest, projection);
  const raw = Buffer.from(JSON.stringify(projection) + "\n");
  const plan = {
    projection: { url: "/factor-read-manifest.json", sha256: hash(raw), bytes: raw.length },
    global: { url: "/replay-manifest.json", sha256: hash(snapshot), bytes: snapshot.length },
  };
  const planSource = await format(
    "// Generated from checked public retained metadata; do not edit or commit.\nexport const FACTOR_READ_PLAN = " +
      JSON.stringify(plan) +
      " as const;\n",
    {
      parser: "typescript",
      printWidth: 100,
      semi: true,
      singleQuote: false,
      trailingComma: "all",
      endOfLine: "lf",
    },
  );
  assert(snapshot.equals(readFileSync(source)), "Manifest changed during Factor read admission");
  writeFileSync(new URL("../public/factor-read-manifest.json", import.meta.url), raw);
  writeFileSync(new URL("../src/factors/read-plan.generated.ts", import.meta.url), planSource);
  return { projection, raw, plan };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { projection, raw } = await generateFactorReadManifest();
  console.log(
    "Checked " +
      Object.keys(projection.artifacts).length +
      " reviewed Factor entries; " +
      raw.length +
      " metadata bytes.",
  );
}
