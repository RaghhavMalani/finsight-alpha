/**
 * Build metadata from checked retained public bytes. This is not a publication:
 * no provider, Python runtime, Git selector, glob or scientific program runs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, isAbsolute } from "node:path";
import { format } from "prettier";
import { deriveRiskReadManifest, verifyRiskReadProjection } from "./risk-read-manifest.mjs";
import { validateReplayManifest } from "../src/replay/contracts.ts";
import { validateDataEnvelope, validateDataBinding } from "../src/data-organ/contracts.ts";
import { strictJSON } from "../src/risk-manager/strict-json.ts";
import { PINNED_CUTOFF, REPLAY_BINDINGS, FILE_BINDINGS } from "../src/risk-manager/bindings.ts";

const KINDS = ["issues", "health", "coverage", "disagreement", "lineage"];
const SOURCES = [
  "alfred:UNRATE",
  "bls:LNS14000000",
  "iima:daily-factors",
  "ken-french:daily-factors",
];
const ORIGIN_SOURCES = [
  ...SOURCES,
  "alpaca:iex",
  "india:fundamentals",
  "mospi:cpi-combined",
  "nse:bhavcopy",
  "nse:india-vix",
  "rbi:policy-repo",
  "yfinance",
];
const LEGACY_GAP = {
  origin_id: "8ffbf62700f73b5d1bc4bdd1dd9edfb10d815445e9f839d14092968c87ce55a3",
  source: "iima:daily-factors",
  diagnostic_id: "56f095517555152343b851b87cce444fcb7ac48a14bbfb26a4625395296d047e",
};
const healthKeys =
  "diagnostic_id source status window_start window_end rows library_start duplicates quarantined non_monotonic zero_observations robust_outliers missing_sessions calendar_status calendar_reason cleaning_stage clock_quality finding observation_age_seconds capture_age_seconds age_reference publication_lag_status publication_lag_median_seconds publication_lag_max_seconds adjustment_evidence_status ohlcv_status freshness_status".split(
    " ",
  );
const legacyOptionalHealth = new Set(
  "age_reference capture_age_seconds observation_age_seconds freshness_status publication_lag_max_seconds publication_lag_median_seconds publication_lag_status adjustment_evidence_status ohlcv_status".split(
    " ",
  ),
);
const sourceKeys =
  "source source_url source_version_id capture_sha256 captured_at clock_quality schema_hash licence calendar field_definition unit feed_scope price_basis adapter_version adapter_metadata_hash".split(
    " ",
  );
const licenceKeys =
  "status permitted_uses dataset_key valid_through attribution source_urls terms_url basis".split(
    " ",
  );
const calendarKeys =
  "mic status reason version source_url source_sha256 start end sessions_hash meaning".split(" ");
const entryKeys =
  "status kind url sha256 bytes sources licence input_hash as_of observed_at available_at reason scope".split(
    " ",
  );
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const hashLike = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stable = (value) =>
  JSON.stringify(value, function (_key, item) {
    return item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => compare(a, b)))
      : item;
  });
const equal = (a, b, reason) => assert.equal(stable(a), stable(b), reason);
function record(value, allowed, required = allowed) {
  assert(value && typeof value === "object" && !Array.isArray(value), "Retained record required");
  assert(
    Object.keys(value).every((key) => allowed.includes(key)),
    "Unreviewed retained field",
  );
  assert(
    required.every((key) => Object.hasOwn(value, key)),
    "Missing retained field",
  );
  return value;
}
function clock(value) {
  assert(typeof value === "string", "Retained UTC timestamp required");
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  assert(match && Number(match[1].slice(0, 4)) > 0, "Explicit retained UTC timestamp required");
  const millis = Date.parse(match[1] + "Z");
  assert(
    Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 19) === match[1],
    "Invalid retained UTC calendar clock",
  );
  // Chronology uses all retained microseconds, rather than Date.parse's millisecond truncation.
  return BigInt(millis) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function text(value, optional = false, max = 4096) {
  assert(
    (optional && value === null) ||
      (typeof value === "string" && value.length > 0 && Array.from(value).length <= max),
    "Retained scalar text required",
  );
}
function day(value, optional = false) {
  if (optional && value === null) return;
  text(value);
  assert(
    Number(value.slice(0, 4)) > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value,
    "Retained ISO date required",
  );
}
function licence(value, cutoff, source) {
  record(value, licenceKeys, ["status", "permitted_uses", "dataset_key", "valid_through"]);
  assert(
    ["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN"].includes(value.status),
    "Retained derived permission absent",
  );
  equal(value.permitted_uses, ["publish_derived"], "Retained derived grant substituted");
  if (source) assert.equal(value.dataset_key, source, "Retained grant subject substituted");
  if (value.valid_through !== null)
    assert(clock(value.valid_through) > clock(cutoff), "Expired retained grant");
}
function source(value, cutoff) {
  record(
    value,
    sourceKeys,
    sourceKeys.filter((key) => !["adapter_version", "adapter_metadata_hash"].includes(key)),
  );
  assert(SOURCES.includes(value.source), "Unreviewed retained source");
  assert(clock(value.captured_at) <= clock(cutoff), "Future retained source");
  for (const key of ["source_version_id", "capture_sha256", "schema_hash"])
    assert(hashLike(value[key]), "Invalid retained source identity");
  for (const key of [
    "source_url",
    "clock_quality",
    "field_definition",
    "unit",
    "feed_scope",
    "price_basis",
  ])
    text(value[key]);
  if (Object.hasOwn(value, "adapter_version")) {
    text(value.adapter_version);
    assert(hashLike(value.adapter_metadata_hash), "Retained adapter identity invalid");
  } else assert(!Object.hasOwn(value, "adapter_metadata_hash"), "Retained adapter version absent");
  licence(value.licence, cutoff, value.source);
  record(value.calendar, calendarKeys, ["status"]);
  for (const [key, item] of Object.entries(value.calendar)) text(item, key === "reason");
}
function payload(kind, value, cutoff, legacy, profiles) {
  if (kind === "health") {
    const seen = new Set();
    for (const row of value.items) {
      record(
        row,
        healthKeys,
        legacy ? healthKeys.filter((key) => !legacyOptionalHealth.has(key)) : healthKeys,
      );
      for (const [key, allowed] of Object.entries({
        status: ["AVAILABLE", "PARTIAL"],
        calendar_status: ["AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE"],
        clock_quality: ["CAPTURE_ONLY", "CONSERVATIVE_VINTAGE_DAY"],
        cleaning_stage: ["CAPTURED_INPUT"],
        publication_lag_status: ["AVAILABLE", "UNAVAILABLE"],
        adjustment_evidence_status: ["NOT_APPLICABLE"],
        ohlcv_status: ["UNAVAILABLE"],
        freshness_status: ["HISTORICAL_WINDOW", "STALE", "UNKNOWN", "WITHIN_PROFILE"],
      }))
        if (row[key] !== undefined)
          assert(allowed.includes(row[key]), "Unknown retained health enum");
      for (const key of [
        "observation_age_seconds",
        "capture_age_seconds",
        "publication_lag_max_seconds",
        "publication_lag_median_seconds",
      ]) {
        if (row[key] !== undefined && row[key] !== null)
          assert(
            typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] >= 0,
            "Invalid retained health age/lag",
          );
      }
      if (row.missing_sessions !== null)
        assert(count(row.missing_sessions), "Invalid retained session count");
      for (const key of ["window_start", "window_end", "library_start"])
        day(row[key], key === "library_start");
      assert(
        row.window_start <= row.window_end && row.window_end <= cutoff.slice(0, 10),
        "Retained health window chronology",
      );
      text(row.finding);
      text(row.calendar_reason, true);
      if (row.publication_lag_status === "AVAILABLE")
        assert(
          row.publication_lag_median_seconds !== null && row.publication_lag_max_seconds !== null,
          "Available retained lag lacks values",
        );
      if (profiles.health && !legacy)
        assert(
          profiles.health
            .get(row.source)
            ?.includes(stable([row.clock_quality, row.calendar_status, row.finding])),
          "Retained health source definition changed",
        );
      assert(!seen.has(row.diagnostic_id), "Duplicate health diagnostic");
      seen.add(row.diagnostic_id);
      if (row.age_reference)
        assert(clock(row.age_reference) <= clock(cutoff), "Future retained health");
    }
  } else if (kind === "issues") {
    const seen = new Set();
    for (const row of value.items) {
      record(row, [
        "id",
        "source",
        "severity",
        "kind",
        "status",
        "reason",
        "first_seen_at",
        "last_seen_at",
        "occurrences",
        "evidence",
      ]);
      text(row.reason, false, 600);
      assert(hashLike(row.id), "Invalid upstream origin identity");
      if (row.kind === "PARTIAL_SOURCE_HEALTH") {
        assert(
          row.evidence.length === 1 &&
            row.id === hash(stable([row.evidence[0], "health"])) &&
            row.severity === "MEDIUM" &&
            row.status === "OPEN" &&
            row.occurrences === 1,
          "Retained health origin derivation substituted",
        );
      } else if (row.kind === "SOURCE_ATTEMPT_FAILED" && Array.from(row.reason).length < 280)
        assert.equal(
          row.id,
          hash(stable([row.source, row.reason])),
          "Retained source attempt derivation substituted",
        );
      assert(!seen.has(row.id), "Duplicate upstream origin");
      seen.add(row.id);
      assert(
        ["SOURCE_ATTEMPT_FAILED", "PARTIAL_SOURCE_HEALTH"].includes(row.kind),
        "Unknown origin kind",
      );
      assert(
        ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(row.severity),
        "Unknown origin severity",
      );
      assert(ORIGIN_SOURCES.includes(row.source), "Unknown origin source");
      assert(
        clock(row.first_seen_at) <= clock(row.last_seen_at) &&
          clock(row.last_seen_at) <= clock(cutoff),
        "Upstream origin chronology",
      );
      assert(
        row.evidence.length > 0 && row.occurrences > 0,
        "Origin lacks diagnostic/occurrence proof",
      );
    }
  } else if (kind === "coverage") {
    for (const row of value.items) {
      text(row.reason, true);
      if (SOURCES.includes(row.source)) licence(row.licence, cutoff, row.source);
      if (profiles.coverage)
        equal(
          Object.fromEntries(
            Object.entries(row).filter(([key]) => !["rows", "status", "reason"].includes(key)),
          ),
          profiles.coverage.get(row.source),
          "Retained coverage definition changed",
        );
    }
  } else if (kind === "lineage") {
    for (const row of value.items) {
      source(row.source, cutoff);
      assert.equal(
        row.licence_resolution_hash,
        hash(stable(row.source.licence)),
        "Retained licence resolution substituted",
      );
      if (profiles.sources)
        assert(
          profiles.sources.includes(
            stable(
              Object.fromEntries(
                Object.entries(row.source).filter(
                  ([key]) => !["source_version_id", "capture_sha256", "captured_at"].includes(key),
                ),
              ),
            ),
          ),
          "Retained source definition changed",
        );
    }
  } else if (kind === "disagreement") {
    record(value, ["sources", "summary"]);
    record(
      value.summary,
      [
        "status",
        "pairs",
        "different",
        "max_absolute_delta",
        "meaning",
        "reasons",
        "comparison_cutoff",
        "information_basis",
      ],
      [
        "status",
        "pairs",
        "different",
        "max_absolute_delta",
        "meaning",
        "comparison_cutoff",
        "information_basis",
      ],
    );
    assert(
      Array.isArray(value.sources) && value.sources.every((item) => typeof item === "string"),
      "Retained mirror sources must be strings",
    );
    assert(
      value.summary.different === null || count(value.summary.different),
      "Invalid retained disagreement count",
    );
    assert(
      value.summary.max_absolute_delta === null ||
        (typeof value.summary.max_absolute_delta === "number" &&
          Number.isFinite(value.summary.max_absolute_delta) &&
          value.summary.max_absolute_delta >= 0),
      "Invalid retained disagreement delta",
    );
    const time = value.summary.comparison_cutoff;
    text(time);
    assert(/(?:Z|\+00:00)$/.test(time), "Retained mirror cutoff needs explicit UTC");
    const normalized = time.endsWith("Z") ? time : time.slice(0, -6) + "Z";
    assert(clock(normalized) <= clock(cutoff), "Future retained mirror comparison");
    assert(
      ["AVAILABLE", "UNAVAILABLE"].includes(value.summary.status),
      "Unknown retained mirror status",
    );
    text(value.summary.meaning);
    text(value.summary.information_basis);
    if (value.summary.reasons !== undefined)
      assert(
        Array.isArray(value.summary.reasons) &&
          value.summary.reasons.every((item) => typeof item === "string"),
        "Retained mirror reasons must be strings",
      );
    if (profiles.disagreement) {
      assert.equal(value.summary.meaning, profiles.disagreement.meaning);
      assert(
        [
          profiles.disagreement.information_basis,
          profiles.disagreement.information_basis.replace(
            " Retained prior capture; current refresh unavailable.",
            "",
          ),
        ].includes(value.summary.information_basis),
        "Retained mirror information basis changed",
      );
    }
  }
}
function bindingEqual(entry, binding) {
  equal(
    Object.fromEntries(
      ["kind", "sha256", "bytes", "as_of", "available_at", "sources"].map((key) => [
        key,
        entry[key],
      ]),
    ),
    Object.fromEntries(
      ["kind", "sha256", "bytes", "as_of", "available_at", "sources"].map((key) => [
        key,
        binding[key],
      ]),
    ),
    "Frozen scientific/baseline binding changed",
  );
}

/** In-memory reader injection exists solely for the isolated future-publication fixture. */
export function deriveMonitoringCatalog(manifestInput, readArtifact) {
  const manifest = validateReplayManifest(manifestInput);
  const cache = new Map();
  const profiles = {};
  function read(identity, expectedKind) {
    if (cache.has(identity)) return cache.get(identity);
    const match = /^data-organ:(health|issues|coverage|disagreement|lineage):([a-f0-9]{64})$/.exec(
      identity,
    );
    assert(
      match && (!expectedKind || match[1] === expectedKind),
      "Retained route/kind substitution",
    );
    const [, kind, digest] = match;
    const entry = record(manifest.artifacts[identity], entryKeys);
    assert.equal(entry.kind, "data-organ-" + kind);
    assert.equal(entry.url, "/artifacts/replay/" + identity.replaceAll(":", "-") + ".json");
    assert.equal(entry.status, "AVAILABLE");
    assert.equal(entry.scope, "REAL_DERIVED_DIAGNOSTICS");
    equal(entry.sources, SOURCES, "Retained source substitution");
    assert.equal(entry.sha256, digest);
    assert(hashLike(entry.input_hash) && count(entry.bytes), "Invalid retained entry identity");
    assert(
      entry.as_of === entry.available_at &&
        entry.as_of === entry.observed_at &&
        clock(entry.as_of) <= clock(manifest.as_of),
      "Retained entry chronology",
    );
    licence(entry.licence, entry.as_of, "project:data-organ-diagnostics");
    assert.equal(entry.licence.status, "FIRST_PARTY");
    assert.equal(entry.reason, null);
    equal(
      entry.licence,
      manifest.artifacts[REPLAY_BINDINGS.data_health.artifact_id].licence,
      "Retained Data publication grant changed",
    );
    const raw = readArtifact(entry.url);
    assert.equal(raw.length, entry.bytes, "Retained byte count changed");
    assert.equal(hash(raw), digest, "Retained artifact checksum changed");
    const value = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    record(value, [
      "schema_version",
      "kind",
      "scope",
      "as_of",
      "sources",
      "input_hash",
      "claims",
      "payload",
    ]);
    validateDataEnvelope(value, kind);
    validateDataBinding(value, entry);
    const frozen = Object.values(REPLAY_BINDINGS).find(
      (binding) => binding.artifact_id === identity,
    );
    payload(kind, value.payload, entry.as_of, Boolean(frozen), profiles);
    cache.set(identity, value);
    return value;
  }
  const baselineLineage = read(REPLAY_BINDINGS.data_lineage.artifact_id, "lineage");
  profiles.sources = baselineLineage.payload.items.map((row) =>
    stable(
      Object.fromEntries(
        Object.entries(row.source).filter(
          ([key]) => !["source_version_id", "capture_sha256", "captured_at"].includes(key),
        ),
      ),
    ),
  );
  const baselineHealth = read(REPLAY_BINDINGS.data_health.artifact_id, "health");
  profiles.health = new Map(
    SOURCES.map((source) => [
      source,
      baselineHealth.payload.items
        .filter((row) => row.source === source)
        .map((row) => stable([row.clock_quality, row.calendar_status, row.finding])),
    ]),
  );
  const baselineCoverage = read(REPLAY_BINDINGS.data_coverage.artifact_id, "coverage");
  profiles.coverage = new Map(
    baselineCoverage.payload.items.map((row) => [
      row.source,
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !["rows", "status", "reason"].includes(key)),
      ),
    ]),
  );
  profiles.disagreement = read(
    REPLAY_BINDINGS.data_disagreement.artifact_id,
    "disagreement",
  ).payload.summary;
  for (const [alias, binding] of Object.entries(REPLAY_BINDINGS)) {
    const entry = manifest.artifacts[binding.artifact_id];
    assert(entry, "Frozen artifact removed");
    bindingEqual(entry, binding);
    if (alias.startsWith("health_history_") || alias.startsWith("data_")) read(binding.artifact_id);
  }
  const groups = new Map();
  const health = new Map();
  for (const [identity, entry] of Object.entries(manifest.artifacts)) {
    const match = /^data-organ:(health|issues|coverage|disagreement|lineage):[a-f0-9]{64}$/.exec(
      identity,
    );
    if (!match) continue;
    if (match[1] === "health") health.set(identity, { entry, value: read(identity, "health") });
    if (clock(entry.as_of) < clock(PINNED_CUTOFF)) continue;
    const key = entry.as_of + "|" + entry.input_hash;
    const group = groups.get(key) ?? {};
    assert(!group[match[1]], "Ambiguous retained monitoring bundle");
    group[match[1]] = { artifact_id: identity, entry };
    groups.set(key, group);
  }
  const originalOrigins = read(REPLAY_BINDINGS.data_issues.artifact_id, "issues").payload.items;
  const bundles = [];
  for (const group of [...groups.values()].sort((a, b) =>
    Number(clock(Object.values(a)[0].entry.as_of) - clock(Object.values(b)[0].entry.as_of)),
  )) {
    if (!KINDS.every((kind) => group[kind]) || Object.keys(group).length !== KINDS.length) continue;
    const artifacts = Object.fromEntries(KINDS.map((kind) => ["data_" + kind, group[kind]]));
    const entries = Object.values(artifacts).map((spec) => spec.entry);
    assert.equal(
      new Set(entries.map((entry) => entry.as_of + "|" + entry.input_hash)).size,
      1,
      "Mixed retained monitoring bundle",
    );
    const cutoff = entries[0].as_of;
    const values = Object.fromEntries(
      Object.entries(artifacts).map(([alias, spec]) => [
        alias,
        read(spec.artifact_id, alias.slice(5)),
      ]),
    );
    const required = new Set(
      values.data_issues.payload.items
        .filter((origin) => origin.kind === "PARTIAL_SOURCE_HEALTH")
        .flatMap((origin) => origin.evidence),
    );
    const healthHistory = Object.fromEntries(
      Object.entries(REPLAY_BINDINGS)
        .filter(([alias]) => alias.startsWith("health_history_"))
        .map(([, binding]) => [binding.artifact_id, manifest.artifacts[binding.artifact_id]]),
    );
    const diagnostics = new Map();
    for (const [identity, { entry, value }] of health) {
      if (clock(entry.as_of) > clock(cutoff)) continue;
      if (value.payload.items.some((row) => required.has(row.diagnostic_id)))
        healthHistory[identity] = entry;
      for (const row of value.payload.items) {
        if (diagnostics.has(row.diagnostic_id))
          equal(diagnostics.get(row.diagnostic_id), row, "Conflicting health diagnostic");
        diagnostics.set(row.diagnostic_id, row);
      }
    }
    const unresolved = [];
    for (const origin of values.data_issues.payload.items.filter(
      (origin) => origin.kind === "PARTIAL_SOURCE_HEALTH",
    )) {
      for (const diagnostic of origin.evidence) {
        if (diagnostics.has(diagnostic)) {
          const row = diagnostics.get(diagnostic);
          assert(
            row.source === origin.source && row.status === "PARTIAL",
            "Retained health diagnostic source/status substituted",
          );
          assert.equal(
            origin.reason,
            row.quarantined + " invalid observations quarantined. " + (row.calendar_reason ?? ""),
            "Retained health reason/diagnostic substituted",
          );
        } else {
          const gap = { origin_id: origin.id, source: origin.source, diagnostic_id: diagnostic };
          equal(gap, LEGACY_GAP, "New unresolved retained diagnostic");
          equal(
            origin,
            originalOrigins.find((item) => item.id === LEGACY_GAP.origin_id),
            "Approved legacy origin changed",
          );
          unresolved.push(gap);
        }
      }
    }
    const expected = new Map();
    for (const [alias, binding] of Object.entries(REPLAY_BINDINGS).filter(
      ([alias]) => !alias.startsWith("data_") && !alias.startsWith("health_history_"),
    )) {
      expected.set(binding.artifact_id, {
        input_id: binding.artifact_id,
        sha256: binding.sha256,
        bytes: binding.bytes,
      });
    }
    for (const spec of Object.values(artifacts))
      expected.set(spec.artifact_id, {
        input_id: spec.artifact_id,
        sha256: spec.entry.sha256,
        bytes: spec.entry.bytes,
      });
    for (const [identity, entry] of Object.entries(healthHistory)) {
      assert(clock(entry.available_at) <= clock(cutoff), "Health history crosses monitoring epoch");
      expected.set(identity, { input_id: identity, sha256: entry.sha256, bytes: entry.bytes });
    }
    for (const [alias, binding] of Object.entries(FILE_BINDINGS))
      expected.set(alias, { input_id: alias, sha256: binding.sha256, bytes: binding.bytes });
    bundles.push({
      evaluation_cutoff: cutoff,
      artifacts,
      health_history: healthHistory,
      unresolved_diagnostics: unresolved,
      inputs: [...expected.values()].sort((a, b) => compare(a.input_id, b.input_id)),
    });
  }
  assert(
    bundles.length && bundles[0].evaluation_cutoff === PINNED_CUTOFF,
    "Original monitoring epoch missing",
  );
  const current = bundles.filter((bundle) =>
    KINDS.every(
      (kind) => bundle.artifacts["data_" + kind].artifact_id === manifest.routes["/data/" + kind],
    ),
  );
  assert.equal(current.length, 1, "Current monitoring route substitution or mixed bundle");
  assert.equal(
    current[0].evaluation_cutoff,
    bundles.at(-1).evaluation_cutoff,
    "Current monitoring rollback",
  );
  return { schema_version: "risk-monitoring-catalog/1", bundles };
}

/** Regenerate before every build/check; no committed epoch list can become a pin. */
export async function generateMonitoringCatalog() {
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const snapshotPath = resolve(publicRoot, "replay-manifest.json");
  const snapshot = readFileSync(snapshotPath);
  const readArtifact = (url) => {
    assert(
      /^\/artifacts\/replay\/[a-zA-Z0-9_.-]+\.json$/.test(url),
      "Unreviewed retained artifact path",
    );
    const path = realpathSync(resolve(publicRoot, "." + url));
    const rel = relative(realpathSync(publicRoot), path);
    assert(
      rel && !rel.startsWith("..") && !isAbsolute(rel),
      "Retained artifact escaped public root",
    );
    return readFileSync(path);
  };
  const catalog = deriveMonitoringCatalog(
    strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(snapshot)),
    readArtifact,
  );
  assert(snapshot.equals(readFileSync(snapshotPath)), "Manifest changed during catalog admission");
  const source = await format(
    "// Generated from checked public retained bytes; do not edit or commit.\nexport const MONITORING_CATALOG = " +
      JSON.stringify(catalog) +
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
  writeFileSync(
    new URL("../src/risk-manager/monitoring-catalog.generated.ts", import.meta.url),
    source,
  );
  const manifest = strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(snapshot));
  const projection = deriveRiskReadManifest(manifest, readArtifact);
  verifyRiskReadProjection(manifest, projection);
  const projectedBytes = Buffer.from(JSON.stringify(projection) + "\n");
  const plan = {
    projection: {
      url: "/risk-read-manifest.json",
      sha256: hash(projectedBytes),
      bytes: projectedBytes.length,
    },
    global: { url: "/replay-manifest.json", sha256: hash(snapshot), bytes: snapshot.length },
  };
  const planSource = await format(
    "export const RISK_READ_PLAN = " + JSON.stringify(plan) + " as const;\n",
    {
      parser: "typescript",
      printWidth: 100,
      semi: true,
      singleQuote: false,
      trailingComma: "all",
      endOfLine: "lf",
    },
  );
  assert(
    snapshot.equals(readFileSync(snapshotPath)),
    "Manifest changed during risk read-plan admission",
  );
  writeFileSync(new URL("../public/risk-read-manifest.json", import.meta.url), projectedBytes);
  writeFileSync(new URL("../src/risk-manager/read-plan.generated.ts", import.meta.url), planSource);
  return catalog;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const catalog = await generateMonitoringCatalog();
  console.log(
    "Checked " + catalog.bundles.length + " retained monitoring epochs for Risk Manager.",
  );
}
