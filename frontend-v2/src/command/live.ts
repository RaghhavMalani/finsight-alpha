import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

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

export type SpineState =
  | { kind: "local-only" }
  | { kind: "replay" }
  | { kind: "connecting" }
  | { kind: "not-running"; detail: string }
  | { kind: "unauthorized"; detail: string }
  | { kind: "streaming" }
  | { kind: "polling"; detail: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
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

const MAX_EVENTS = 400;
function merge(current: LiveEvent[], incoming: LiveEvent[]): LiveEvent[] {
  if (!incoming.length) return current;
  const bySeq = new Map(current.map((e) => [e.seq, e]));
  for (const e of incoming) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, MAX_EVENTS);
}

async function readDetail(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof body?.detail === "string" ? body.detail : response.statusText;
}

class SpineError extends Error {
  constructor(
    readonly state: SpineState,
    message: string,
  ) {
    super(message);
  }
}

async function get(path: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: "include", signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SpineError(
      { kind: "not-running", detail: `No answer from ${API_BASE}` },
      "unreachable",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new SpineError({ kind: "unauthorized", detail: await readDetail(response) }, "401");
  if (response.status === 503) {
    const detail = await readDetail(response);
    throw new SpineError(
      /local only/i.test(detail) ? { kind: "local-only" } : { kind: "not-running", detail },
      "503",
    );
  }
  if (!response.ok)
    throw new SpineError(
      { kind: "not-running", detail: `${response.status} ${await readDetail(response)}` },
      String(response.status),
    );
  return response.json();
}

const POLL_MS = 15_000;
const HEALTH_MS = 30_000;

/**
 * Reads the local live spine: `/live/health`, a `/live/recent` backlog, then `/live/stream` (SSE).
 * If the stream drops, it polls `/live/recent?since=<seq>`. Nothing is requested unless `enabled`.
 */
export function useLiveSpine(enabled: boolean, allowed: boolean) {
  const [state, setState] = useState<SpineState>({ kind: allowed ? "replay" : "local-only" });
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [feeds, setFeeds] = useState<FeedHealth[]>([]);
  const [healthAt, setHealthAt] = useState<string | null>(null);
  const last = useRef(-1);
  useEffect(() => {
    if (!enabled) {
      setState({ kind: allowed ? "replay" : "local-only" });
      return;
    }
    const controller = new AbortController(),
      { signal } = controller;
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let health: ReturnType<typeof setInterval> | null = null;
    const accept = (raw: unknown[]) => {
      const parsed = raw.map(parseLiveEvent).filter((e): e is LiveEvent => !!e);
      if (!parsed.length) return;
      last.current = Math.max(last.current, ...parsed.map((e) => e.seq));
      setEvents((current) => merge(current, parsed));
      const healthRecords = parsed.filter((e) => e.type === "feed.health");
      if (healthRecords.length)
        setFeeds((current) => {
          const next = new Map(current.map((f) => [f.feed, f]));
          for (const record of healthRecords.sort((a, b) => a.seq - b.seq)) {
            const snap = record.payload as Partial<FeedHealth>;
            if (isText(snap.feed) && isText(snap.status))
              next.set(snap.feed, { ...next.get(snap.feed), ...(snap as FeedHealth) });
          }
          return [...next.values()];
        });
    };
    const fail = (error: unknown) => {
      if (signal.aborted) return;
      setState(
        error instanceof SpineError
          ? error.state
          : { kind: "not-running", detail: error instanceof Error ? error.message : "unknown" },
      );
    };
    const readHealth = async () => {
      const body = await get("/live/health", signal);
      if (isObject(body) && body.mode === "NOT_RUNNING")
        throw new SpineError(
          { kind: "not-running", detail: text(body.reason) ?? "NOT_RUNNING" },
          "not running",
        );
      setFeeds(parseFeeds(body));
      setHealthAt(isObject(body) ? text(body.now) : null);
    };
    const recent = async () => {
      const since = last.current >= 0 ? `&since=${last.current}` : "";
      const body = await get(`/live/recent?limit=200${since}`, signal);
      accept(isObject(body) && Array.isArray(body.events) ? body.events : []);
    };
    const startPolling = (detail: string) => {
      source?.close();
      source = null;
      setState({ kind: "polling", detail });
      if (!poll) poll = setInterval(() => void recent().catch(fail), POLL_MS);
    };
    void (async () => {
      setState({ kind: "connecting" });
      try {
        await readHealth();
        await recent();
      } catch (error) {
        fail(error);
        return;
      }
      if (signal.aborted) return;
      health = setInterval(() => void readHealth().catch(fail), HEALTH_MS);
      if (typeof EventSource === "undefined") {
        startPolling("EventSource unavailable in this browser");
        return;
      }
      const since = last.current >= 0 ? `?since_seq=${last.current}` : "";
      source = new EventSource(`${API_BASE}/live/stream${since}`, { withCredentials: true });
      source.onopen = () => setState({ kind: "streaming" });
      const onFrame = (message: MessageEvent<string>) => {
        try {
          accept([JSON.parse(message.data)]);
        } catch {
          /* a malformed frame is dropped, not repaired */
        }
      };
      for (const type of LIVE_TYPES) source.addEventListener(type, onFrame as EventListener);
      source.addEventListener("gap", () => void recent().catch(fail));
      // A reconnecting stream keeps its state; the health check reports a stopped spine.
      source.onerror = () => {
        if (source?.readyState === EventSource.CLOSED)
          startPolling("stream closed; polling /live/recent");
      };
    })();
    return () => {
      controller.abort();
      source?.close();
      if (poll) clearInterval(poll);
      if (health) clearInterval(health);
    };
  }, [enabled, allowed]);
  return { state, events, feeds, healthAt };
}
