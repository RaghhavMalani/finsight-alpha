import type { NumFormat, NumValue, Origin, RefValue } from "./Num";

/** The fields of a checked Replay manifest entry that an origin may name. */
export type ReplaySource = {
  url: string | null;
  sha256: string | null;
  as_of?: string | null;
};

/**
 * A value read from a checked Replay artifact. The digest is the one the manifest names; when the
 * entry is missing the origin says so instead of inventing a file or a SHA.
 */
export function replayOrigin(
  entry: ReplaySource | null | undefined,
  ptr: string,
  extra: Partial<Origin> = {},
): Origin {
  return {
    kind: "replay",
    src: entry?.url ?? "Replay artifact not in the checked manifest",
    sha256: entry?.sha256 ?? null,
    asOf: entry?.as_of ?? null,
    ptr,
    ...extra,
  };
}

/** A value from a local API response. Not sealed: no file, no SHA-256. */
export function liveOrigin(
  endpoint: string,
  ptr: string,
  record: { seq?: number | null; available_at?: string | null; observed_at?: string | null } = {},
  extra: Partial<Origin> = {},
): Origin {
  return {
    kind: "live",
    src: endpoint,
    ptr,
    seq: record.seq ?? null,
    availableAt: record.available_at ?? null,
    observedAt: record.observed_at ?? null,
    ...extra,
  };
}

/** A number with an origin. Non-finite and missing values stay missing (never zero). */
export function num(
  origin: Origin,
  v: number | null | undefined,
  fmt: NumFormat = "x",
  reason?: string,
): NumValue {
  const ok = typeof v === "number" && Number.isFinite(v);
  return {
    ...origin,
    v: ok ? v : null,
    fmt,
    reason: ok ? origin.reason : (reason ?? origin.reason ?? "not present in the source"),
  };
}

/** A string reference (time, hash) with an origin. */
export function ref(origin: Origin, v: string | null | undefined, reason?: string): RefValue {
  return { ...origin, v: v ?? null, reason: v ? origin.reason : (reason ?? origin.reason) };
}
