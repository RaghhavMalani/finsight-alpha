export type PublicationLicense = {
  status: string;
  permitted_uses: string[];
  dataset_key: string;
  valid_through: string | null;
};
export type ReplayEntry = {
  status: "AVAILABLE" | "UNAVAILABLE";
  kind: string;
  url: string | null;
  sha256: string | null;
  bytes: number;
  sources: string[];
  licence: PublicationLicense;
  input_hash: string | null;
  as_of: string;
  observed_at: string | null;
  available_at: string | null;
  reason: string | null;
  scope: string;
};
export type ReplayManifest = {
  schema_version: "terminal-replay/1";
  as_of: string;
  artifacts: Record<string, ReplayEntry>;
  routes: Record<string, string>;
  claims: { market_claim_eligible: false; causal_claim_eligible: false; validated_alpha: false };
};
export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}
const fail = (reason: string): never => {
  throw new ReplayError(reason);
};
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown) =>
  typeof value === "string" &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Price fields are forbidden at any depth; interval endpoints are statistics, not OHLC. */
export function assertDerivedPayload(value: unknown, path = "root"): void {
  if (typeof value === "number" && !Number.isFinite(value))
    fail(`Non-finite artifact value at ${path}.`);
  if (
    typeof value === "string" &&
    /["']?(?:raw_prices|last_price|adj_close|ohlcv)["']?\s*[:=]/i.test(value)
  )
    fail(`Raw price evidence at ${path}.`);
  if (Array.isArray(value)) {
    value.forEach((x, i) => assertDerivedPayload(x, `${path}[${i}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const forbidden = new Set([
    "price",
    "prices",
    "rawprices",
    "rawprice",
    "lastprice",
    "prevclose",
    "adjclose",
    "adjustedclose",
    "spot",
    "ohlc",
    "ohlcv",
    "candles",
    "bars",
    "open",
    "close",
    "volume",
    "mark",
    "entryprice",
    "last",
    "bid",
    "ask",
  ]);
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_ -]/g, "");
    if (
      forbidden.has(normalized) ||
      (["high", "low"].includes(normalized) &&
        !/(?:ci\d*|interval)(?:\.[^.]+)?$/.test(path) &&
        !path.endsWith(".known_graph_condition_groups") &&
        !/^root\.summary\.epistemic_states\[\d+\]\.counts$/.test(path))
    )
      fail(`Raw price field ${path}.${key} is forbidden in Replay.`);
    assertDerivedPayload(child, `${path}.${key}`);
  }
}

export function validateReplayManifest(value: unknown): ReplayManifest {
  assertDerivedPayload(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Replay manifest is malformed.");
  const m = value as ReplayManifest;
  if (m.schema_version !== "terminal-replay/1" || !time(m.as_of))
    fail("Unknown Replay manifest schema or cutoff.");
  if (
    !m.claims ||
    Object.keys(m.claims).sort().join() !==
      "causal_claim_eligible,market_claim_eligible,validated_alpha" ||
    Object.values(m.claims).some((v) => v !== false)
  )
    fail("Replay cannot grant research claims.");
  if (
    !m.artifacts ||
    typeof m.artifacts !== "object" ||
    Array.isArray(m.artifacts) ||
    !m.routes ||
    typeof m.routes !== "object" ||
    Array.isArray(m.routes)
  )
    fail("Replay registries are missing.");
  for (const [id, e] of Object.entries(m.artifacts)) {
    if (
      !/^[a-zA-Z0-9_.:^/-]+$/.test(id) ||
      !e ||
      !["AVAILABLE", "UNAVAILABLE"].includes(e.status) ||
      typeof e.kind !== "string" ||
      typeof e.scope !== "string"
    )
      fail(`Invalid Replay identity: ${id}.`);
    if (
      !time(e.as_of) ||
      Date.parse(e.as_of) > Date.parse(m.as_of) ||
      !Array.isArray(e.sources) ||
      !e.sources.length ||
      !e.sources.every((s) => typeof s === "string" && s.length > 0)
    )
      fail(`Invalid provenance: ${id}.`);
    if (
      !e.licence ||
      typeof e.licence.dataset_key !== "string" ||
      !e.licence.dataset_key ||
      typeof e.licence.status !== "string" ||
      !Array.isArray(e.licence.permitted_uses)
    )
      fail(`Missing publication licence: ${id}.`);
    if (e.status === "UNAVAILABLE") {
      if (e.url !== null || e.sha256 !== null || e.bytes !== 0 || !e.reason)
        fail(`Unavailable artifact must not have a public payload: ${id}.`);
      continue;
    }
    if (
      !e.url ||
      !/^\/artifacts\/(?:replay|observatory)\/[a-zA-Z0-9_.-]+\.json$/.test(e.url) ||
      !hash(e.sha256) ||
      !Number.isSafeInteger(e.bytes) ||
      e.bytes <= 0 ||
      e.bytes > 16_000_000 ||
      !hash(e.input_hash)
    )
      fail(`Invalid checked artifact: ${id}.`);
    if (
      !["FIRST_PARTY", "PUBLIC_DOMAIN", "ACTIVE"].includes(e.licence.status) ||
      !e.licence.permitted_uses.includes("publish_derived")
    )
      fail(`Publication not licensed: ${id}.`);
    if (
      e.licence.valid_through !== null &&
      (!time(e.licence.valid_through) ||
        Date.parse(e.licence.valid_through) <= Math.max(Date.parse(m.as_of), Date.now()))
    )
      fail(`Publication licence expired: ${id}.`);
    if (
      !time(e.observed_at) ||
      !time(e.available_at) ||
      Date.parse(e.observed_at!) > Date.parse(e.available_at!) ||
      Date.parse(e.available_at!) > Date.parse(e.as_of)
    )
      fail(`Artifact crosses its availability cutoff: ${id}.`);
  }
  for (const [route, id] of Object.entries(m.routes))
    if (!route.startsWith("/") || route.startsWith("//") || !m.artifacts[id])
      fail(`Unlisted Replay route: ${route}.`);
  return m;
}

export type MarketWeek = {
  week: string;
  relative_performance: number;
  drawdown: number;
  realized_volatility: number | null;
  regime: string | null;
};
export type MarketReplay = {
  schema_version: "market-replay/1";
  ticker: string;
  as_of: string;
  method: {
    granularity: "weekly";
    base: 100;
    volatility_window_sessions: 20;
    annualization_sessions: 252;
    regime_semantics: string;
  };
  weeks: MarketWeek[];
};
export function validateMarketReplay(value: unknown, ticker: string, cutoff: string): MarketReplay {
  assertDerivedPayload(value);
  const p = value as MarketReplay;
  if (!p || Object.keys(p).sort().join() !== "as_of,method,schema_version,ticker,weeks")
    fail("Unknown Market Replay field.");
  if (
    p.method &&
    Object.keys(p.method).some(
      (k) =>
        ![
          "granularity",
          "base",
          "volatility_window_sessions",
          "annualization_sessions",
          "regime_semantics",
          "hmm",
        ].includes(k),
    )
  )
    fail("Unknown Market methodology field.");
  if (
    !p ||
    p.schema_version !== "market-replay/1" ||
    p.ticker !== ticker ||
    p.as_of !== cutoff ||
    p.method?.granularity !== "weekly" ||
    p.method?.base !== 100 ||
    p.method?.volatility_window_sessions !== 20 ||
    p.method?.annualization_sessions !== 252 ||
    typeof p.method?.regime_semantics !== "string" ||
    !Array.isArray(p.weeks) ||
    !p.weeks.length
  )
    fail("Market Replay identity or methodology mismatch.");
  if (p.weeks[0].relative_performance !== 100) fail("Relative performance must begin at 100.");
  let previous = 0;
  for (const w of p.weeks) {
    const t = Date.parse(w.week);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(w.week) ||
      !Number.isFinite(t) ||
      new Date(t).toISOString().slice(0, 10) !== w.week ||
      Object.keys(w).sort().join() !==
        "drawdown,realized_volatility,regime,relative_performance,week" ||
      t <= previous ||
      t > Date.parse(cutoff) ||
      !Number.isFinite(w.relative_performance) ||
      w.relative_performance <= 0 ||
      !Number.isFinite(w.drawdown) ||
      w.drawdown < -1 ||
      w.drawdown > 0 ||
      (w.realized_volatility !== null &&
        (!Number.isFinite(w.realized_volatility) || w.realized_volatility < 0)) ||
      (w.regime !== null && typeof w.regime !== "string")
    )
      fail("Invalid weekly derived Market observation.");
    if (
      previous &&
      Math.floor((t + 3 * 86400000) / (7 * 86400000)) ===
        Math.floor((previous + 3 * 86400000) / (7 * 86400000))
    )
      fail("Replay has more than one observation per week.");
    previous = t;
  }
  return p;
}
