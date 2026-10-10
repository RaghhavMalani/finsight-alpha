import { assertDerivedPayload, ReplayError, type ReplayEntry } from "../replay/contracts.ts";

export const DATA_KINDS = [
  "health",
  "revisions",
  "disagreement",
  "coverage",
  "lineage",
  "issues",
  "costs",
] as const;
export type DataKind = (typeof DATA_KINDS)[number];
export type Health = {
  source: string;
  status: string;
  clock_quality: string;
  rows: number;
  quarantined: number;
  duplicates: number;
  non_monotonic: number;
  robust_outliers: number;
  zero_observations: number;
  missing_sessions: number | null;
  calendar_status: string;
  calendar_reason: string | null;
  window_start: string;
  window_end: string;
  diagnostic_id: string;
};
export type Coverage = {
  source: string;
  country: string;
  label: string;
  scope: string;
  status: string;
  rows: number;
  reason: string | null;
  clock_quality: string;
  fields: string[];
  source_url: string;
  licence: { status: string; permitted_uses: string[]; attribution?: string };
};
export type Revision = {
  status: string;
  reason?: string;
  periods?: number;
  revised_periods?: number;
  transitions?: number;
  yearly: {
    year: string;
    periods: number;
    revised_periods: number;
    transitions: number;
    absolute_revision_sum: number;
  }[];
};
export type Lineage = {
  status: string;
  signal_id: string;
  signal_sha256: string;
  admission_id: string;
  admission_seal: string;
  source_version_id: string;
  capture_sha256: string;
  schema_hash: string;
  licence_resolution_hash: string;
  source: {
    source: string;
    source_url: string;
    captured_at: string;
    clock_quality: string;
    licence: { status: string; attribution?: string };
    field_definition: string;
    feed_scope: string;
    calendar: { mic?: string; status: string; version?: string; reason?: string };
  };
};
export type Issue = {
  id: string;
  source: string;
  severity: string;
  kind: string;
  status: string;
  reason: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  evidence: string[];
};
export type Cost = {
  statutory_subtotal: string;
  statutory_status: string;
  statutory_missing: string[];
  all_in_estimated_trading_cost: string | null;
  all_in_status: string;
  all_in_missing: string[];
  trade_date: string;
  rounding: string;
  components: {
    name: string;
    status: string;
    amount: string | null;
    rate?: string;
    reason?: string;
    effective_from?: string;
    evidenced_through?: string;
    evidence?: {
      source_url: string;
      source_sha256: string;
      publication_date: string;
      captured_at: string;
    };
  }[];
};
export type DataEnvelope = {
  schema_version: "data-organ-replay/1";
  kind: DataKind;
  scope: "REAL_DERIVED_DIAGNOSTICS" | "LOCAL_ONLY";
  as_of: string;
  input_hash: string;
  sources: string[];
  claims: Record<string, false>;
  payload: Record<string, unknown>;
};
export type DataSnapshot = Record<DataKind, DataEnvelope>;
export function validateDataBinding(value: DataEnvelope, entry: ReplayEntry) {
  if (
    !entry ||
    entry.status !== "AVAILABLE" ||
    entry.kind !== "data-organ-" + value.kind ||
    entry.scope !== value.scope ||
    entry.input_hash !== value.input_hash ||
    entry.as_of !== value.as_of ||
    JSON.stringify(entry.sources) !== JSON.stringify(value.sources)
  )
    throw new ReplayError("Data evidence receipt/manifest binding mismatch");
}
const fail = (message: string): never => {
  throw new ReplayError("Data evidence unavailable: " + message);
};
const hash = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const numericalSources = [
  "ken-french:daily-factors",
  "iima:daily-factors",
  "alfred:UNRATE",
  "bls:LNS14000000",
];
const licenceKeys = [
  "status",
  "permitted_uses",
  "dataset_key",
  "valid_through",
  "attribution",
  "source_urls",
  "terms_url",
  "basis",
];
const calendarKeys = [
  "mic",
  "status",
  "reason",
  "version",
  "source_url",
  "source_sha256",
  "start",
  "end",
  "sessions_hash",
  "meaning",
];
const clock = (x: unknown) =>
  typeof x === "string" && /(Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const count = (x: unknown) => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected a record");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some((k) => !keys.includes(k))) fail("unreviewed public field");
  return r;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) fail("expected rows");
  return value as Record<string, unknown>[];
}
export function validateDataEnvelope(value: unknown, kind: DataKind): DataEnvelope {
  assertDerivedPayload(value);
  const r = record(value, [
    "schema_version",
    "kind",
    "scope",
    "as_of",
    "sources",
    "input_hash",
    "claims",
    "payload",
  ]);
  if (
    r.schema_version !== "data-organ-replay/1" ||
    r.kind !== kind ||
    !["REAL_DERIVED_DIAGNOSTICS", "LOCAL_ONLY"].includes(String(r.scope)) ||
    !hash(r.input_hash) ||
    typeof r.as_of !== "string" ||
    !/(Z|[+-]\d\d:\d\d)$/.test(r.as_of) ||
    !Number.isFinite(Date.parse(r.as_of))
  )
    fail("identity, clock or scope");
  const claims = record(r.claims, [
    "inference_certified",
    "validated_alpha",
    "causal_claim_eligible",
    "market_claim_eligible",
  ]);
  if (Object.keys(claims).length !== 4 || Object.values(claims).some((v) => v !== false))
    fail("claim promotion");
  if (!Array.isArray(r.sources) || !r.sources.every((s) => typeof s === "string")) fail("sources");
  if (
    r.scope === "REAL_DERIVED_DIAGNOSTICS" &&
    (r.sources as string[]).some((s) => !numericalSources.includes(s))
  )
    fail("unlicensed public numerical source");
  const p = record(
    r.payload,
    kind === "revisions"
      ? ["source", "summary"]
      : kind === "disagreement"
        ? ["sources", "summary"]
        : kind === "costs"
          ? ["label", "example"]
          : ["items"],
  );
  if (["health", "coverage", "lineage", "issues"].includes(kind)) {
    const allowed = {
      health: [
        "diagnostic_id",
        "source",
        "status",
        "window_start",
        "window_end",
        "rows",
        "library_start",
        "duplicates",
        "quarantined",
        "non_monotonic",
        "zero_observations",
        "robust_outliers",
        "missing_sessions",
        "calendar_status",
        "calendar_reason",
        "cleaning_stage",
        "clock_quality",
        "finding",
        "observation_age_seconds",
        "capture_age_seconds",
        "age_reference",
        "publication_lag_status",
        "publication_lag_median_seconds",
        "publication_lag_max_seconds",
        "adjustment_evidence_status",
        "ohlcv_status",
        "freshness_status",
      ],
      coverage: [
        "source",
        "country",
        "label",
        "fields",
        "cadence",
        "clock_quality",
        "calendar",
        "scope",
        "source_url",
        "status",
        "rows",
        "reason",
        "licence",
      ],
      lineage: [
        "status",
        "signal_id",
        "signal_sha256",
        "admission_id",
        "admission_seal",
        "source_version_id",
        "capture_sha256",
        "schema_hash",
        "licence_resolution_hash",
        "source",
        "source_bytes",
      ],
      issues: [
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
      ],
    }[kind as "health" | "coverage" | "lineage" | "issues"];
    for (const item of rows(p.items)) {
      const row = record(item, allowed);
      if (kind === "health") {
        if (
          !hash(row.diagnostic_id) ||
          !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(row.status)) ||
          ![
            "CAPTURE_ONLY",
            "CONSERVATIVE_VINTAGE_DAY",
            "CONSERVATIVE_MARKET_TIME",
            "PUBLICATION_TIMESTAMP",
            "RECEIVE_TIMESTAMP_CAPTURED",
          ].includes(String(row.clock_quality))
        )
          fail("health status/clock");
        for (const key of [
          "rows",
          "quarantined",
          "duplicates",
          "non_monotonic",
          "robust_outliers",
          "zero_observations",
        ])
          if (
            typeof row[key] !== "number" ||
            !Number.isSafeInteger(row[key]) ||
            Number(row[key]) < 0
          )
            fail("invalid anomaly count");
        if (row.calendar_status === "UNAVAILABLE" && row.missing_sessions !== null)
          fail("manufactured calendar coverage");
        if (
          r.scope === "REAL_DERIVED_DIAGNOSTICS" &&
          !numericalSources.includes(String(row.source))
        )
          fail("unlicensed numerical health");
        if (
          row.clock_quality === "CAPTURE_ONLY" &&
          ((row.publication_lag_status ?? "UNAVAILABLE") !== "UNAVAILABLE" ||
            (row.publication_lag_median_seconds ?? null) !== null ||
            (row.publication_lag_max_seconds ?? null) !== null)
        )
          fail("manufactured capture-only publication lags");
      }
      if (kind === "coverage") {
        const licence = record(row.licence, licenceKeys);
        if (
          !count(row.rows) ||
          !["ADMITTED", "RETAINED", "UNAVAILABLE"].includes(String(row.status))
        )
          fail("coverage admission");
        if (
          r.scope === "REAL_DERIVED_DIAGNOSTICS" &&
          !numericalSources.includes(String(row.source)) &&
          row.rows !== 0
        )
          fail("restricted numerical coverage");
        if (
          r.scope === "REAL_DERIVED_DIAGNOSTICS" &&
          !numericalSources.includes(String(row.source)) &&
          (licence.status !== "UNVERIFIED" ||
            !Array.isArray(licence.permitted_uses) ||
            licence.permitted_uses.length)
        )
          fail("unverified restricted permission");
      }
      if (kind === "lineage") {
        for (const key of [
          "signal_id",
          "signal_sha256",
          "admission_id",
          "admission_seal",
          "source_version_id",
          "capture_sha256",
          "schema_hash",
          "licence_resolution_hash",
        ])
          if (!hash(row[key])) fail("lineage hash");
        const source = record(row.source, [
          "source",
          "source_url",
          "source_version_id",
          "capture_sha256",
          "captured_at",
          "clock_quality",
          "schema_hash",
          "licence",
          "calendar",
          "field_definition",
          "unit",
          "feed_scope",
          "price_basis",
          "adapter_version",
          "adapter_metadata_hash",
        ]);
        record(source.licence, licenceKeys);
        record(source.calendar, calendarKeys);
        if (
          row.status !== "VERIFIED" ||
          row.source_bytes !== "LOCAL_ONLY" ||
          !clock(source.captured_at) ||
          row.source_version_id !== source.source_version_id ||
          row.capture_sha256 !== source.capture_sha256 ||
          row.schema_hash !== source.schema_hash ||
          Date.parse(String(source.captured_at)) > Date.parse(String(r.as_of))
        )
          fail("lineage source binding");
        if (
          r.scope === "REAL_DERIVED_DIAGNOSTICS" &&
          !numericalSources.includes(String(source.source))
        )
          fail("unlicensed lineage");
      }
      if (
        kind === "issues" &&
        (!hash(row.id) ||
          !clock(row.first_seen_at) ||
          !clock(row.last_seen_at) ||
          !count(row.occurrences) ||
          row.status !== "OPEN" ||
          !Array.isArray(row.evidence) ||
          !row.evidence.every(hash))
      )
        fail("issue history");
    }
  } else if (kind === "revisions") {
    if (p.source !== "alfred:UNRATE") fail("unreviewed revision series");
    const summary = record(p.summary, [
      "status",
      "reason",
      "periods",
      "revised_periods",
      "transitions",
      "semantics",
      "yearly",
    ]);
    for (const row of rows(summary.yearly)) {
      record(row, ["year", "periods", "revised_periods", "transitions", "absolute_revision_sum"]);
      if (
        typeof row.periods !== "number" ||
        row.periods < 6 ||
        typeof row.year !== "string" ||
        !/^\d{4}$/.test(row.year)
      )
        fail("insufficient revision aggregation");
      if (
        !count(row.revised_periods) ||
        !count(row.transitions) ||
        Number(row.revised_periods) > Number(row.periods) ||
        typeof row.absolute_revision_sum !== "number" ||
        !Number.isFinite(row.absolute_revision_sum) ||
        row.absolute_revision_sum < 0
      )
        fail("revision aggregates");
    }
  } else if (kind === "disagreement") {
    const summary = record(p.summary, [
      "status",
      "pairs",
      "different",
      "max_absolute_delta",
      "meaning",
      "reasons",
      "comparison_cutoff",
      "information_basis",
    ]);
    if (
      summary.status === "AVAILABLE" &&
      (!Array.isArray(p.sources) ||
        p.sources.slice().sort().join() !== "alfred:UNRATE,bls:LNS14000000" ||
        Number(summary.pairs) < 6)
    )
      fail("unreviewed price comparison");
    if (
      !count(summary.pairs) ||
      (summary.status === "AVAILABLE" &&
        (!count(summary.different) ||
          Number(summary.different) > Number(summary.pairs) ||
          typeof summary.max_absolute_delta !== "number" ||
          !Number.isFinite(summary.max_absolute_delta) ||
          summary.max_absolute_delta < 0))
    )
      fail("disagreement aggregates");
  } else {
    const c = record(p.example, [
      "schema_version",
      "identity",
      "trade_date",
      "notional",
      "side",
      "settlement",
      "currency",
      "components",
      "statutory_subtotal",
      "statutory_status",
      "statutory_missing",
      "all_in_estimated_trading_cost",
      "all_in_status",
      "all_in_missing",
      "rounding",
      "scope",
    ]);
    if (c.all_in_status !== "AVAILABLE" && c.all_in_estimated_trading_cost !== null)
      fail("partial costs cannot claim an all-in total");
    for (const item of rows(c.components)) {
      const component = record(item, [
        "name",
        "status",
        "amount",
        "reason",
        "rate",
        "effective_from",
        "evidenced_through",
        "evidence",
      ]);
      if (component.evidence) {
        const evidence = record(component.evidence, [
          "source_url",
          "source_sha256",
          "captured_at",
          "publication_date",
          "clock_quality",
          "representation",
        ]);
        if (!hash(evidence.source_sha256) || !clock(evidence.captured_at))
          fail("cost source evidence");
      }
      if (
        component.status === "AVAILABLE" &&
        (typeof component.amount !== "string" || !/^\d+(\.\d+)?$/.test(component.amount))
      )
        fail("cost amount");
    }
  }
  return r as DataEnvelope;
}
