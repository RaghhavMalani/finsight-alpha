import { api } from "@/lib/api";
import {
  adaptMarketRegime,
  type Fracture,
  type MarketRegimeArtifact,
  type Vector,
} from "@/dynamics/market-regime-contracts";

export type ProductAsset = {
  asset: string;
  source: string;
  scope: string;
  available: boolean;
  reason: string | null;
  cutoffs: string[];
};
export type ProductCatalog = {
  schema_version: string;
  assets: ProductAsset[];
  provider_requirements: string[];
  read_only: true;
  network_downloads: false;
};
export type Publication = {
  stream: string;
  status: string;
  observations: number;
  sources: string[];
  revisions: string[];
  quality: string[];
  available_through: string | null;
  source_as_of: string | null;
  publication_evidence: string[];
};
export type Transition = {
  observed_at: string;
  available_at: string;
  regime: string;
  vector: Vector;
  fracture: Fracture;
  transition: boolean;
};
export type ProductSnapshot = {
  schema_version: string;
  analytics_version: string;
  asset: string;
  scope: string;
  as_of: string;
  state_at: string | null;
  input_hash: string;
  snapshot_hash: string;
  status: string;
  reason: string | null;
  claims: Record<string, false>;
  analysis: MarketRegimeArtifact | null;
  provenance: Publication[];
  definitions: Record<string, string>;
  attribution_target: string;
  timeline: Transition[];
  cache_identity: { input_hash: string; as_of: string; asset: string; analytics_version: string };
  note: string;
};
export type ProductComparison = {
  schema_version: string;
  asset: string;
  claims: Record<string, false>;
  left: ProductSnapshot;
  right: ProductSnapshot;
  vector_delta: Vector;
};

const keys = ["V", "L", "M", "H", "F", "S", "C"] as const;
const parts = {
  volatility: "V",
  correlation: "C",
  liquidity: "L",
  event: "H",
  factor: "F",
  macro: "S",
} as const;
const claims = [
  "market_claim_eligible",
  "causal_claim_eligible",
  "validated_alpha",
  "trusted_graph",
  "precise_edge_confidence",
];
const streams = ["daily", "intraday", "factors", "macro", "events"];
const fail = (name: string): never => {
  throw new Error(`Product evidence failed closed: ${name}`);
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail("object");
const strings = (v: unknown): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0)
    ? v
    : fail("string list");
const timestamp = (v: unknown): number =>
  typeof v === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
    ? Date.parse(v)
    : fail("timezone-aware timestamp");
const hash = (v: unknown) => {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) fail("hash");
};
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : fail("finite number");
function falseClaims(v: unknown) {
  const c = object(v);
  if (
    Object.keys(c).sort().join() !== [...claims].sort().join() ||
    claims.some((k) => c[k] !== false)
  )
    fail("claim eligibility");
}
function identity(asset: unknown, scope: unknown) {
  if (
    !(scope === "REAL_PIT" && ["SPY", "QQQ", "IWM"].includes(asset as string)) &&
    !(scope === "SYNTHETIC" && asset === "DEMO")
  )
    fail("asset / evidence scope");
}
function vector(v: unknown) {
  const r = object(v);
  if (Object.keys(r).sort().join() !== [...keys].sort().join()) fail("vector keys");
  for (const k of keys)
    if (r[k] !== null && (number(r[k]) < (k === "M" ? -1 : 0) || number(r[k]) > 1))
      fail("vector range");
}
function ledger(v: unknown, current: Vector, previous: Vector | null) {
  const r = object(v),
    contributions = object(r.contributions),
    weights = object(r.weights);
  if (Object.keys(contributions).sort().join() !== Object.keys(parts).sort().join())
    fail("fracture components");
  let sum = 0,
    count = 0;
  for (const [name, key] of Object.entries(parts)) {
    if (Math.abs(number(weights[name]) - 1 / 6) > 1e-8) fail("frozen fracture weight");
    const a = current[key],
      b = previous?.[key];
    if (a == null || b == null) {
      if (contributions[name] !== null) fail("missing fracture component");
    } else {
      const value = number(contributions[name]);
      if (Math.abs(value - Math.abs(a - b) / 6) > 2e-8) fail("fracture arithmetic");
      sum += value;
      count++;
    }
  }
  if (
    Math.abs(number(r.coverage) - count / 6) > 2e-8 ||
    Math.abs(number(r.available_contribution_sum) - sum) > 2e-8
  )
    fail("fracture coverage");
  if (count === 6) {
    if (r.status !== "COMPLETE" || Math.abs(number(r.score) - sum) > 2e-8) fail("fracture score");
  } else if (r.score !== null || r.status !== "UNRESOLVED")
    fail("partial fracture presented as complete");
}

export function adaptProductCatalog(value: unknown): ProductCatalog {
  const r = object(value);
  if (
    r.schema_version !== "regime-product-catalog/1" ||
    r.read_only !== true ||
    r.network_downloads !== false ||
    !Array.isArray(r.assets)
  )
    fail("catalog contract");
  const seen = new Set();
  for (const value of r.assets as unknown[]) {
    const a = object(value);
    identity(a.asset, a.scope);
    if (
      !["real", "demo-full", "demo-sparse"].includes(a.source as string) ||
      (a.source === "real") !== (a.scope === "REAL_PIT")
    )
      fail("source / scope");
    const key = `${a.asset}:${a.source}`;
    if (seen.has(key)) fail("duplicate catalog asset");
    seen.add(key);
    if (typeof a.available !== "boolean" || (a.reason !== null && typeof a.reason !== "string"))
      fail("availability");
    let previous = -Infinity;
    for (const cutoff of strings(a.cutoffs)) {
      const t = timestamp(cutoff);
      if (t <= previous) fail("cutoff order");
      previous = t;
    }
  }
  if (
    ["SPY:real", "QQQ:real", "IWM:real", "DEMO:demo-full", "DEMO:demo-sparse"].some(
      (k) => !seen.has(k),
    )
  )
    fail("supported universe");
  strings(r.provider_requirements);
  return value as ProductCatalog;
}

export function adaptProductSnapshot(value: unknown): ProductSnapshot {
  const r = object(value);
  if (
    r.schema_version !== "market-regime-product/1" ||
    r.analytics_version !== "market-regime/0.4.2"
  )
    fail("snapshot version");
  identity(r.asset, r.scope);
  falseClaims(r.claims);
  hash(r.input_hash);
  hash(r.snapshot_hash);
  const cutoff = timestamp(r.as_of),
    cache = object(r.cache_identity);
  if (
    cache.input_hash !== r.input_hash ||
    cache.asset !== r.asset ||
    cache.as_of !== r.as_of ||
    typeof cache.analytics_version !== "string" ||
    !cache.analytics_version.startsWith(r.analytics_version as string)
  )
    fail("cache identity");
  if (typeof r.note !== "string" || (r.reason !== null && typeof r.reason !== "string"))
    fail("disclosure");
  const targets =
    r.scope === "SYNTHETIC"
      ? ["SYNTHETIC_STRATEGY"]
      : ["SUPPLIED_STRATEGY", "ASSET_BUY_AND_HOLD_RETURN"];
  if (!targets.includes(r.attribution_target as string)) fail("attribution target");
  if (Object.values(object(r.definitions)).some((v) => typeof v !== "string")) fail("definitions");
  let analysis: MarketRegimeArtifact | null = null;
  if (r.status === "AVAILABLE") {
    analysis = adaptMarketRegime(r.analysis);
    if (analysis.world.ticker !== r.asset && r.scope === "REAL_PIT") fail("analysis asset");
    if (
      (analysis.world.scope === "PIT_LOCAL") !== (r.scope === "REAL_PIT") ||
      timestamp(analysis.world.as_of) !== cutoff ||
      r.state_at !== analysis.current.available_at
    )
      fail("analysis scope / cutoff");
    if (timestamp(r.state_at) > cutoff) fail("future state");
  } else if (r.status !== "UNAVAILABLE" || r.analysis !== null || r.state_at !== null || !r.reason)
    fail("unavailable contract");
  if (!Array.isArray(r.provenance)) fail("provenance");
  const expected = r.scope === "REAL_PIT" ? streams : ["synthetic"];
  if ((r.provenance as unknown[]).length !== expected.length) fail("stream coverage");
  const seen = new Set();
  for (const value of r.provenance as unknown[]) {
    const p = object(value);
    if (!expected.includes(p.stream as string) || seen.has(p.stream)) fail("stream identity");
    seen.add(p.stream);
    const n = number(p.observations);
    if (!Number.isInteger(n) || n < 0) fail("observation count");
    const sources = strings(p.sources),
      revisions = strings(p.revisions),
      quality = strings(p.quality),
      evidence = strings(p.publication_evidence);
    if (n > 0) {
      if (
        p.status !== "AVAILABLE" ||
        !sources.length ||
        !revisions.length ||
        !quality.length ||
        !evidence.length ||
        timestamp(p.available_through) > cutoff ||
        timestamp(p.source_as_of) < timestamp(p.available_through)
      )
        fail("publication lineage");
    } else if (
      p.status !== "UNAVAILABLE" ||
      p.available_through !== null ||
      p.source_as_of !== null ||
      sources.length ||
      revisions.length ||
      quality.length ||
      evidence.length
    )
      fail("fabricated missing data");
    if (
      quality.some(
        (q) =>
          !(
            (r.scope === "SYNTHETIC" && q === "SYNTHETIC") ||
            (r.scope === "REAL_PIT" && q === "PUBLICATION_TIMESTAMP") ||
            (r.scope === "REAL_PIT" && p.stream === "macro" && q === "CONSERVATIVE_VINTAGE_DAY")
          ),
      )
    )
      fail("publication quality");
  }
  if (!Array.isArray(r.timeline) || r.timeline.length !== (analysis?.timeline.length ?? 0))
    fail("timeline length");
  let previous: Vector | null = null;
  for (let i = 0; i < (r.timeline as unknown[]).length; i++) {
    const t = object((r.timeline as unknown[])[i]),
      canonical = analysis!.timeline[i];
    if (
      t.observed_at !== canonical.observed_at ||
      t.available_at !== canonical.available_at ||
      t.regime !== canonical.regime ||
      timestamp(t.available_at) > cutoff
    )
      fail("timeline PIT identity");
    vector(t.vector);
    const v = t.vector as Vector;
    if (keys.some((k) => v[k] !== canonical.vector[k])) fail("timeline vector mismatch");
    ledger(t.fracture, v, previous);
    const f = t.fracture as Fracture;
    if (
      typeof t.transition !== "boolean" ||
      t.transition !== (f.score !== null && f.score >= 0.1) ||
      (f.score !== null && Math.abs(f.score - number(canonical.fracture)) > 2e-8)
    )
      fail("transition threshold");
    previous = v;
  }
  return value as ProductSnapshot;
}

export function adaptProductComparison(value: unknown): ProductComparison {
  const r = object(value);
  if (r.schema_version !== "regime-compare/1") fail("compare version");
  falseClaims(r.claims);
  const a = adaptProductSnapshot(r.left),
    b = adaptProductSnapshot(r.right);
  if (a.asset !== r.asset || b.asset !== r.asset || a.scope !== b.scope)
    fail("comparison identity");
  const delta = object(r.vector_delta);
  if (Object.keys(delta).sort().join() !== [...keys].sort().join()) fail("delta keys");
  for (const k of keys) {
    const x = a.analysis?.current.vector[k],
      y = b.analysis?.current.vector[k];
    if (x == null || y == null) {
      if (delta[k] !== null) fail("missing comparison dimension");
    } else if (Math.abs(number(delta[k]) - (y - x)) > 2e-8) fail("delta arithmetic");
  }
  return value as ProductComparison;
}

export async function fetchProductCatalog() {
  return adaptProductCatalog(await api<unknown>("/dynamics/regime-product/assets"));
}
export async function fetchProductSnapshot(asset: string, source: string, asOf?: string) {
  const p = new URLSearchParams({ asset, source });
  if (asOf) p.set("as_of", asOf);
  return adaptProductSnapshot(await api<unknown>(`/dynamics/regime-product/snapshot?${p}`));
}
export async function fetchProductComparison(
  asset: string,
  source: string,
  left: string,
  right: string,
) {
  return adaptProductComparison(
    await api<unknown>(
      `/dynamics/regime-product/compare?${new URLSearchParams({ asset, source, left, right })}`,
    ),
  );
}
