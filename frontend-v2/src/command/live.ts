import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import {
  isObject,
  isText,
  LIVE_TYPES,
  parseFeeds,
  parseLiveEvent,
  text,
  type FeedHealth,
  type LiveEvent,
} from "./records";

export type SpineState =
  | { kind: "local-only" }
  | { kind: "replay" }
  | { kind: "connecting" }
  | { kind: "not-running"; detail: string }
  | { kind: "unauthorized"; detail: string }
  | { kind: "streaming" }
  | { kind: "reconnecting" }
  | { kind: "polling"; detail: string };

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
    // A stalled spine must not hold a request (and the health check behind it) open forever.
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]),
    });
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
const REQUEST_MS = 10_000;
const HEALTH_MS = 30_000;
const PAGE = 200;
const MAX_PAGES = 25;

/**
 * Reads the local live spine: a `/live/recent` backlog, the `/live/health` snapshot, then
 * `/live/stream` (SSE). If the stream closes, it polls `/live/recent?since=<seq>`, paging forward
 * so no record is skipped. Health is re-read every 30 s whether or not the spine is up: a spine
 * started after the page loaded is picked up, and one that stops clears everything it showed, so
 * no price or "fresh" dot outlives the spine that produced it. Nothing is requested unless `enabled`.
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
    let up = false;
    // Bumped by down(): an answer to a request sent before the spine went down is ignored.
    let gen = 0;
    // A feed.health record older than the latest /live/health snapshot must not overwrite it.
    let snapshotMs = -Infinity;
    const accept = (raw: unknown[]) => {
      const parsed = raw.map(parseLiveEvent).filter((e): e is LiveEvent => !!e);
      if (!parsed.length) return;
      last.current = Math.max(last.current, ...parsed.map((e) => e.seq));
      setEvents((current) => merge(current, parsed));
      const healthRecords = parsed
        .filter((e) => e.type === "feed.health" && Date.parse(e.available_at) >= snapshotMs)
        .sort((a, b) => a.seq - b.seq);
      if (healthRecords.length)
        setFeeds((current) => {
          const next = new Map(current.map((f) => [f.feed, f]));
          for (const record of healthRecords) {
            const snap = record.payload as Partial<FeedHealth>;
            if (isText(snap.feed) && isText(snap.status))
              next.set(snap.feed, { ...next.get(snap.feed), ...(snap as FeedHealth) });
          }
          return [...next.values()];
        });
    };
    const disconnect = () => {
      source?.close();
      source = null;
      if (poll) clearInterval(poll);
      poll = null;
      up = false;
    };
    // The spine is gone (or refuses us): say why and drop everything it had shown.
    const down = (error: unknown) => {
      if (signal.aborted) return;
      gen++;
      disconnect();
      last.current = -1;
      snapshotMs = -Infinity;
      setEvents([]);
      setFeeds([]);
      setHealthAt(null);
      setState(
        error instanceof SpineError
          ? error.state
          : { kind: "not-running", detail: error instanceof Error ? error.message : "unknown" },
      );
    };
    const downIf = (g: number) => (error: unknown) => {
      if (g === gen) down(error);
    };
    const readHealth = async () => {
      const g = gen;
      const body = await get("/live/health", signal);
      if (g !== gen) return;
      if (isObject(body) && body.mode === "NOT_RUNNING")
        throw new SpineError(
          { kind: "not-running", detail: text(body.reason) ?? "NOT_RUNNING" },
          "not running",
        );
      const at = isObject(body) ? text(body.now) : null;
      snapshotMs = at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : -Infinity;
      setFeeds(parseFeeds(body));
      setHealthAt(at);
    };
    // Without a seq: the newest PAGE records. After one: page forward until a short page. The
    // cursor is this call's own (from each page's last_seq), so a stream frame that lands while a
    // page is in flight cannot make the next page skip rows.
    const recent = async () => {
      const g = gen;
      let cursor = last.current;
      for (let page = 0; page < MAX_PAGES; page++) {
        const since = cursor >= 0 ? `&since=${cursor}` : "";
        const body = await get(`/live/recent?limit=${PAGE}${since}`, signal);
        if (g !== gen) return;
        const rows = isObject(body) && Array.isArray(body.events) ? body.events : [];
        accept(rows);
        const seqs = rows.map((r) => (isObject(r) ? r.seq : null));
        const lastSeq = isObject(body) ? body.last_seq : null;
        for (const s of [lastSeq, ...seqs])
          if (typeof s === "number" && Number.isSafeInteger(s)) cursor = Math.max(cursor, s);
        if (!since || rows.length < PAGE) return;
      }
    };
    const startPolling = (detail: string) => {
      source?.close();
      source = null;
      // Polling is claimed only once a poll has answered.
      const g = gen;
      void recent().then(() => {
        if (signal.aborted || !up || g !== gen) return;
        setState({ kind: "polling", detail });
        if (!poll)
          poll = setInterval(() => {
            const pg = gen;
            void recent().then(() => {
              // Rows are arriving by polling: say so, even while a stream retry is pending.
              if (pg === gen && up && source?.readyState !== 1 /* OPEN */)
                setState({ kind: "polling", detail });
            }, downIf(pg));
          }, POLL_MS);
      }, downIf(g));
    };
    const openStream = () => {
      if (typeof EventSource === "undefined") {
        startPolling("EventSource unavailable in this browser");
        return;
      }
      const since = last.current >= 0 ? `?since_seq=${last.current}` : "";
      source?.close();
      source = new EventSource(`${API_BASE}/live/stream${since}`, { withCredentials: true });
      source.onopen = () => {
        if (poll) clearInterval(poll);
        poll = null;
        setState({ kind: "streaming" });
      };
      const onFrame = (message: MessageEvent<string>) => {
        try {
          accept([JSON.parse(message.data)]);
        } catch {
          /* a malformed frame is dropped, not repaired */
        }
      };
      for (const type of LIVE_TYPES) source.addEventListener(type, onFrame as EventListener);
      source.addEventListener("gap", () => void recent().catch(downIf(gen)));
      source.onerror = () => {
        if (source?.readyState === EventSource.CLOSED)
          startPolling("stream closed; polling /live/recent");
        else setState({ kind: "reconnecting" });
      };
    };
    const connect = async () => {
      await recent();
      await readHealth(); // after the backlog, so the snapshot is what the panel shows
      if (signal.aborted) return;
      up = true;
      openStream();
    };
    // One check at a time: a slow connect must not overlap the next tick and open a second stream.
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!up) await connect();
        else {
          await readHealth();
          // Polling after the stream closed: try the stream again; polling continues until it opens.
          if (up && !source && poll) openStream();
        }
      } catch (error) {
        down(error);
      } finally {
        busy = false;
      }
    };
    setState({ kind: "connecting" });
    void check();
    const health = setInterval(() => void check(), HEALTH_MS);
    return () => {
      controller.abort();
      disconnect();
      clearInterval(health);
    };
  }, [enabled, allowed]);
  return { state, events, feeds, healthAt };
}
