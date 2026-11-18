/** Pure record helpers for F1 Command: parsing, summaries, destinations. No React, no network. */
/** Typed events on the live spine (`src/live/model.py` EVENT_TYPES). */
export const LIVE_TYPES = [
  "market.tick",
  "geo.event",
  "macro.release",
  "news.headline",
  "prediction.update",
  "risk.alert",
  "research.progress",
  "feed.health",
] as const;
export type LiveType = (typeof LIVE_TYPES)[number];

export type LiveEvent = {
  seq: number;
  id: string;
  type: LiveType;
  source: string;
  source_id: string;
  revision: string;
  observed_at: string;
  available_at: string;
  effective_at: string | null;
  licence: { status: string; attribution: string; terms_url: string; redistribution: string };
  confidence: string;
  provenance: { feed: string; url: string; fetched_at: string; delay: string } & Record<
    string,
    unknown
  >;
  payload: Record<string, unknown>;
};

export type FeedHealth = {
  feed: string;
  status: string;
  reason?: string | null;
  event_type?: string;
  cadence_s?: number;
  delay?: string;
  lag_s?: number | null;
  last_success_at?: string | null;
  last_attempt_at?: string | null;
};

export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isInstant = (v: unknown): v is string => isText(v) && Number.isFinite(Date.parse(v));

/** A record is shown only when every required field is present; anything else is dropped, never repaired. */
export function parseLiveEvent(raw: unknown): LiveEvent | null {
  if (!isObject(raw)) return null;
  const { seq, type, licence, provenance, payload } = raw;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
  if (!LIVE_TYPES.includes(type as LiveType)) return null;
  for (const key of ["id", "source", "source_id", "revision", "confidence"])
    if (!isText(raw[key])) return null;
  if (!isInstant(raw.observed_at) || !isInstant(raw.available_at)) return null;
  if (raw.effective_at !== null && !isInstant(raw.effective_at)) return null;
  if (!isObject(licence) || !isText(licence.status) || !isText(licence.redistribution)) return null;
  if (!isObject(provenance) || !isText(provenance.feed) || !isText(provenance.delay)) return null;
  if (!isObject(payload)) return null;
  return raw as unknown as LiveEvent;
}

export const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export const text = (v: unknown): string | null => (isText(v) ? v : null);

export function parseFeeds(raw: unknown): FeedHealth[] {
  if (!isObject(raw) || !Array.isArray(raw.feeds)) return [];
  return raw.feeds.filter(
    (f): f is FeedHealth => isObject(f) && isText(f.feed) && isText(f.status),
  );
}

/** fresh / stale / dead, from the feed's own status, cadence and lag. Unknown is never "fresh". */
export function freshness(feed: FeedHealth): "fresh" | "stale" | "dead" {
  if (feed.status === "DOWN" || feed.status === "UNAVAILABLE" || !feed.last_success_at)
    return "dead";
  const lag = num(feed.lag_s),
    cadence = num(feed.cadence_s);
  if (feed.status !== "UP" || lag === null) return "stale";
  return cadence !== null && lag > cadence * 2 + 60 ? "stale" : "fresh";
}

export const clock = (iso: string) => iso.slice(11, 19) + "Z";
export const stamp = (iso: string) => iso.slice(0, 19).replace("T", " ") + "Z";
export const fmt = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const lag = (s: number | null | undefined) =>
  s == null
    ? "no success yet"
    : s < 90
      ? `lag ${Math.round(s)}s`
      : s < 5400
        ? `lag ${Math.round(s / 60)}m`
        : s < 172800
          ? `lag ${Math.round(s / 3600)}h`
          : `lag ${Math.round(s / 86400)}d`;

/** Source, clocks and licence of one record, for hover and the visible source line. */
export function provenance(e: LiveEvent) {
  return [
    `${e.type} · seq ${e.seq}`,
    `source ${e.source} (${e.source_id})`,
    `observed_at ${e.observed_at}`,
    `available_at ${e.available_at}`,
    `delay ${e.provenance.delay}`,
    `confidence ${e.confidence} · licence ${e.licence.status} / ${e.licence.redistribution}`,
  ].join("\n");
}

export const isIndia = (e: LiveEvent) =>
  e.source === "nse" ||
  text(e.payload.currency) === "INR" ||
  /\.(NS|BO)$/.test(text(e.payload.ticker) ?? "");

/** One-line summary built only from the record's own fields. */
export function summary(e: LiveEvent): string {
  const p = e.payload;
  const kind = text(p.kind);
  switch (e.type) {
    case "geo.event":
      if (kind === "earthquake")
        return `${num(p.mag) !== null ? `M${num(p.mag)!.toFixed(1)} ` : ""}${text(p.place) ?? text(p.title) ?? "Earthquake"}`;
      if (kind === "nws_alert")
        return `${text(p.event) ?? "NWS alert"}${text(p.area) ? ` · ${text(p.area)}` : ""}`;
      if (kind === "gdelt_event")
        return `GDELT ${text(p.event_code) ?? ""} · ${text(p.place) ?? text(p.country) ?? "unplaced"}`;
      return text(p.name) ?? text(p.title) ?? kind ?? "geo event";
    case "market.tick": {
      const close = num(p.close);
      return `${text(p.ticker) ?? "?"} ${close !== null ? fmt(close) : "close n/a"}${text(p.currency) ? ` ${text(p.currency)}` : ""}`;
    }
    case "macro.release": {
      const value = num(p.value);
      return `${text(p.series) ?? "series"} ${value !== null ? value : "n/a"}${text(p.units) ? ` ${text(p.units)}` : ""}`;
    }
    case "news.headline":
      return text(p.title) ?? "headline";
    case "prediction.update": {
      const yes = num(p.yes_price);
      return `${text(p.question) ?? text(p.event_title) ?? "market"}${yes !== null ? ` · yes ${yes}` : ""}`;
    }
    case "risk.alert":
      return `${text(p.severity) ?? "n/a"} ${text(p.check_id) ?? e.source_id} · ${text(p.subject) ?? "n/a"} · ${text(p.outcome) ?? "n/a"}`;
    case "research.progress":
      return text(p.question) ?? "research suggestion";
    case "feed.health":
      return `${text(p.feed) ?? e.source_id} ${text(p.status) ?? ""}`;
  }
}

/** Where a click takes the reader, with the record's own context. */
export function destination(e: LiveEvent): { to: string; search: Record<string, string> } {
  const p = e.payload;
  switch (e.type) {
    case "geo.event":
      return { to: "/globe", search: {} };
    case "market.tick":
      return { to: "/markets", search: text(p.ticker) ? { ticker: text(p.ticker)! } : {} };
    case "risk.alert":
      return { to: "/risk", search: {} };
    case "feed.health":
      return { to: "/data", search: { section: "health" } };
    case "macro.release":
      return { to: "/data", search: { section: "revisions" } };
    case "research.progress":
      return { to: "/research", search: text(p.question) ? { q: text(p.question)! } : {} };
    case "news.headline":
      return { to: "/research", search: text(p.title) ? { q: text(p.title)! } : {} };
    case "prediction.update":
      return {
        to: "/research",
        search: text(p.question) ? { q: text(p.question)! } : {},
      };
  }
}

export const WORKSPACE_KEY: Record<string, string> = {
  "/globe": "F3",
  "/markets": "F6",
  "/risk": "Alt 7",
  "/data": "Alt 7",
  "/research": "F2",
};

export const MARKER: Record<string, string> = {
  earthquake: "#ffd166",
  gdelt_event: "#ff8a5b",
  nws_alert: "#ff6fd8",
};
