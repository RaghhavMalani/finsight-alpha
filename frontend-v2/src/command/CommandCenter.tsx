import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadQuakes, loadSatellites, useFeed, type Feed } from "@/components/globe/feeds";
import type { Quake, Satellite } from "@/components/globe/geo-data";
import type { GlobeMarker } from "@/components/globe/GlobeScene";
import { loadLand, type LandData } from "@/components/globe/land";
import { loadReplayManifest } from "@/replay/client";
import { changeDataMode, localLiveAllowed, useDataMode } from "@/replay/mode";
import {
  freshness,
  num,
  text,
  useLiveSpine,
  type FeedHealth,
  type LiveEvent,
  type SpineState,
} from "./live";
import "./command.css";

const GlobeScene = lazy(() => import("@/components/globe/GlobeScene"));

const clock = (iso: string) => iso.slice(11, 19) + "Z";
const stamp = (iso: string) => iso.slice(0, 19).replace("T", " ") + "Z";
const fmt = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lag = (s: number | null | undefined) =>
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
function provenance(e: LiveEvent) {
  return [
    `${e.type} · seq ${e.seq}`,
    `source ${e.source} (${e.source_id})`,
    `observed_at ${e.observed_at}`,
    `available_at ${e.available_at}`,
    `delay ${e.provenance.delay}`,
    `confidence ${e.confidence} · licence ${e.licence.status} / ${e.licence.redistribution}`,
  ].join("\n");
}

const isIndia = (e: LiveEvent) =>
  e.source === "nse" ||
  text(e.payload.currency) === "INR" ||
  /\.(NS|BO)$/.test(text(e.payload.ticker) ?? "");

/** One-line summary built only from the record's own fields. */
function summary(e: LiveEvent): string {
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
      return `${text(p.severity) ?? ""} ${text(p.check_id) ?? e.source_id} · ${text(p.subject) ?? ""} · ${text(p.outcome) ?? ""}`;
    case "research.progress":
      return text(p.question) ?? "research suggestion";
    case "feed.health":
      return `${text(p.feed) ?? e.source_id} ${text(p.status) ?? ""}`;
  }
}

/** Where a click takes the reader, with the record's own context. */
function destination(e: LiveEvent): { to: string; search: Record<string, string> } {
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

const WORKSPACE_KEY: Record<string, string> = {
  "/globe": "F3",
  "/markets": "F6",
  "/risk": "Alt 7",
  "/data": "Alt 7",
  "/research": "F2",
};

const MARKER: Record<string, string> = {
  earthquake: "#ffd166",
  gdelt_event: "#ff8a5b",
  nws_alert: "#ff6fd8",
};

export function LiveDot({ state, label }: { state: "fresh" | "stale" | "dead"; label: string }) {
  return (
    <span className={`live-dot live-dot-${state}`} title={label}>
      <i aria-hidden="true" />
      <span className="sr-only">{state}</span>
    </span>
  );
}

function Row({ event, fresh }: { event: LiveEvent; fresh: boolean }) {
  const target = destination(event);
  return (
    <li className={fresh ? "cmd-new" : undefined} data-type={event.type} data-seq={event.seq}>
      <Link to={target.to as never} search={target.search as never} title={provenance(event)}>
        <span className="cmd-row-main">
          <b className={`cmd-type cmd-type-${event.type.split(".")[0]}`}>{event.type}</b>
          <span className="cmd-row-text">{summary(event)}</span>
        </span>
        <span className="cmd-row-meta">
          {event.source} · avail {clock(event.available_at)} · {WORKSPACE_KEY[target.to]} ›
        </span>
      </Link>
    </li>
  );
}

function spineLine(state: SpineState, live: boolean) {
  switch (state.kind) {
    case "local-only":
      return "Live data is local only. This public build shows checked Replay feeds on the globe.";
    case "replay":
      return "Replay mode · the live spine is read only in Local Live.";
    case "connecting":
      return "Connecting to the local live spine…";
    case "not-running":
      return "Live spine not running — start with `python -m finsight live`.";
    case "unauthorized":
      return "Live spine needs a signed-in local session.";
    case "streaming":
      return live ? "Streaming /live/stream." : "";
    case "polling":
      return `Polling /live/recent every 15 s · ${state.detail}.`;
  }
}

function Panel({
  title,
  count,
  children,
  label,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="cmd-panel" aria-label={label}>
      <h2>
        {title}
        {count && <span>{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function CommandCenter() {
  const mode = useDataMode();
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(localLiveAllowed());
    setReady(true);
  }, []);
  const spine = useLiveSpine(ready && allowed && mode === "live", allowed);
  const quakes = useFeed<Quake[]>(loadQuakes, [], 5 * 60_000);
  const sats = useFeed<Satellite[]>(loadSatellites, [], 2 * 3600_000);
  const [land, setLand] = useState<LandData | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    void loadLand().then(setLand);
    if (mode === "live") {
      setNow(Date.now());
      return;
    }
    let alive = true;
    loadReplayManifest()
      .then((m) => alive && setNow(Date.parse(m.as_of)))
      .catch(() => alive && setNow(Date.now()));
    return () => {
      alive = false;
    };
  }, [mode]);
  const noop = useCallback(() => undefined, []);

  // Records present when the reader arrived do not animate; only later arrivals do.
  const baseline = useRef<number | null>(null);
  const { events } = spine;
  if (baseline.current === null && events.length) baseline.current = events[0].seq;
  const isFresh = (e: LiveEvent) => baseline.current !== null && e.seq > baseline.current;

  const geo = useMemo(
    () =>
      events.filter(
        (e) => e.type === "geo.event" && num(e.payload.lat) !== null && num(e.payload.lon) !== null,
      ),
    [events],
  );
  const markers = useMemo<GlobeMarker[]>(
    () =>
      geo.map((e) => ({
        id: e.id,
        lat: num(e.payload.lat)!,
        lon: num(e.payload.lon)!,
        color: MARKER[text(e.payload.kind) ?? ""] ?? "#3fe0ff",
        height:
          text(e.payload.kind) === "earthquake" && num(e.payload.mag) !== null
            ? Math.min(0.3, 0.04 + num(e.payload.mag)! * 0.025)
            : 0.08,
      })),
    [geo],
  );
  const ticks = useMemo(() => {
    const latest = new Map<string, LiveEvent>();
    for (const e of events)
      if (e.type === "market.tick" && text(e.payload.ticker)) {
        const key = `${e.source}|${text(e.payload.ticker)}`;
        if (!latest.has(key)) latest.set(key, e);
      }
    const all = [...latest.values()];
    return { us: all.filter((e) => !isIndia(e)), india: all.filter(isIndia) };
  }, [events]);
  const alerts = useMemo(() => {
    const latest = new Map<string, LiveEvent>();
    for (const e of events)
      if (e.type === "risk.alert" && !latest.has(e.source_id)) latest.set(e.source_id, e);
    return [...latest.values()].filter((e) => text(e.payload.outcome) !== "CLEAR");
  }, [events]);
  const research = useMemo(() => events.filter((e) => e.type === "research.progress"), [events]);
  const stream = events.slice(0, 40);
  const live = mode === "live" && allowed;
  const connected = spine.state.kind === "streaming" || spine.state.kind === "polling";
  const absent = connected ? null : "No records — live spine not connected.";

  const feedChip = (f: Feed<unknown>, label: string) => (
    <span className={`cmd-chip ${f.status}`} title={f.note ?? undefined}>
      {label} ·{" "}
      {f.status === "live" && f.at
        ? `live ${new Date(f.at).toISOString().slice(11, 16)}Z`
        : f.status}
    </span>
  );

  const market = (rows: LiveEvent[], name: string, feedsFor: string[]) => {
    const delays = spine.feeds.filter((f) => feedsFor.includes(f.feed));
    return (
      <div className="cmd-market" data-market={name}>
        <h3>{name}</h3>
        {rows.length ? (
          <ul>
            {rows.map((e) => (
              <li key={e.id} className={isFresh(e) ? "cmd-new" : undefined}>
                <Link
                  to="/markets"
                  search={{ ticker: text(e.payload.ticker)! } as never}
                  title={provenance(e)}
                >
                  <b>{text(e.payload.ticker)}</b>
                  <span className="cmd-num">
                    {num(e.payload.close) !== null ? fmt(num(e.payload.close)!) : "n/a"}
                    {text(e.payload.currency) ? ` ${text(e.payload.currency)}` : ""}
                  </span>
                  <span className="cmd-row-meta">
                    {e.source} · {clock(e.observed_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cmd-empty">{absent ?? `No ${name} market.tick records yet.`}</p>
        )}
        {delays.map((f) => (
          <p key={f.feed} className="cmd-delay" title={f.reason ?? undefined}>
            {f.feed}: {f.delay ?? "delay label missing"}
            {f.status !== "UP" ? ` · ${f.status}` : ""}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="cmd" data-spine={spine.state.kind} data-mode={mode}>
      <div className="cmd-stage" aria-hidden="true">
        {now > 0 && (
          <Suspense fallback={null}>
            <GlobeScene
              land={land}
              quakes={quakes.data}
              tles={sats.data}
              now={now}
              layers={{ quakes: true, satellites: true, hubs: true }}
              sensor={null}
              reduced
              selected={null}
              onPick={noop}
              onLook={noop}
              onSatellites={noop}
              labelsRoot={null}
              view={[24, 110, 3.3]}
              markers={markers}
            />
          </Suspense>
        )}
      </div>
      <div className="cmd-hud">
        <div className="cmd-col cmd-left">
          <header className="cmd-panel cmd-title">
            <div className="cmd-eyebrow">F1 · Command</div>
            <h1>Mission control</h1>
            <p className="cmd-spine" role="status" data-spine-state={spine.state.kind}>
              <LiveDot
                state={connected ? "fresh" : spine.state.kind === "connecting" ? "stale" : "dead"}
                label={spine.state.kind}
              />
              <span>{spineLine(spine.state, live)}</span>
            </p>
            {(spine.state.kind === "not-running" || spine.state.kind === "unauthorized") && (
              <p className="cmd-detail">{spine.state.detail}</p>
            )}
            {spine.state.kind === "unauthorized" && (
              <p className="cmd-detail">
                <Link to="/login">Local sign in ›</Link>
              </p>
            )}
            {spine.state.kind === "replay" && (
              <button
                type="button"
                className="cmd-button"
                onClick={() => void changeDataMode("live", client)}
              >
                Switch to Local Live
              </button>
            )}
            <div className="cmd-chips">
              {feedChip(quakes, "USGS")}
              {feedChip(sats, "CelesTrak")}
              {connected && <span className="cmd-chip live">spine · {events.length} records</span>}
            </div>
          </header>
          <Panel
            title="Event stream"
            label="Live event stream"
            count={connected ? String(events.length) : undefined}
          >
            {stream.length ? (
              <ul className="cmd-list cmd-stream">
                {stream.map((e) => (
                  <Row key={e.seq} event={e} fresh={isFresh(e)} />
                ))}
              </ul>
            ) : (
              <p className="cmd-empty">
                {absent ??
                  "Connected · no records yet. Events land here and on the globe as they arrive."}
              </p>
            )}
          </Panel>
        </div>
        <div className="cmd-col cmd-right">
          <Panel title="Markets" label="US and India market strip">
            <div className="cmd-markets">
              {market(ticks.us, "US", ["yfinance_us", "alpaca_iex"])}
              {market(ticks.india, "India", ["nse"])}
            </div>
          </Panel>
          <Panel
            title="Risk alerts"
            label="Current risk alerts"
            count={connected ? String(alerts.length) : undefined}
          >
            {alerts.length ? (
              <ul className="cmd-list">
                {alerts.map((e) => (
                  <Row key={e.seq} event={e} fresh={isFresh(e)} />
                ))}
              </ul>
            ) : (
              <p className="cmd-empty">{absent ?? "No open risk.alert records."}</p>
            )}
          </Panel>
          <Panel
            title="Research in flight"
            label="Research suggestions"
            count={connected ? String(research.length) : undefined}
          >
            {research.length ? (
              <ul className="cmd-list">
                {research.slice(0, 8).map((e) => {
                  const exposure = e.payload.exposure as
                    { securities?: { ticker?: unknown; security?: unknown }[] } | undefined;
                  const names = (exposure?.securities ?? [])
                    .map((s) => text(s.ticker) ?? text(s.security))
                    .filter((s): s is string => !!s);
                  return (
                    <li
                      key={e.seq}
                      className={isFresh(e) ? "cmd-new" : undefined}
                      data-type={e.type}
                    >
                      <Link
                        to="/research"
                        search={{ q: text(e.payload.question) ?? "" } as never}
                        title={provenance(e)}
                      >
                        <span className="cmd-row-main">
                          <b className="cmd-type cmd-type-research">
                            {text(e.payload.status) ?? "SUGGESTED"}
                          </b>
                          <span className="cmd-row-text">{summary(e)}</span>
                        </span>
                        {names.length > 0 && (
                          <span className="cmd-tickers">
                            {names.map((n) => (
                              <i key={n}>{n}</i>
                            ))}
                          </span>
                        )}
                        <span className="cmd-row-meta">
                          {e.source} · avail {clock(e.available_at)} · F2 Research ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cmd-empty">{absent ?? "No research.progress records."}</p>
            )}
          </Panel>
          <Panel
            title="Feed health"
            label="Live feed health"
            count={spine.healthAt ? `as of ${clock(spine.healthAt)}` : undefined}
          >
            {spine.feeds.length ? (
              <ul className="cmd-list cmd-feeds">
                {spine.feeds.map((f: FeedHealth) => {
                  const state = freshness(f);
                  return (
                    <li key={f.feed} data-feed={f.feed} data-fresh={state}>
                      <Link
                        to="/data"
                        search={{ section: "health" } as never}
                        title={[
                          `${f.feed} · ${f.status}`,
                          f.reason ? `reason ${f.reason}` : "",
                          `last success ${f.last_success_at ?? "never"}`,
                          `delay ${f.delay ?? "missing"}`,
                          spine.healthAt ? `from /live/health at ${spine.healthAt}` : "",
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      >
                        <LiveDot state={state} label={`${f.feed} ${state}`} />
                        <b>{f.feed}</b>
                        <span className="cmd-row-meta">
                          {state} · {f.status} · {lag(f.lag_s)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cmd-empty">{absent ?? "/live/health lists no feeds."}</p>
            )}
            {spine.healthAt && (
              <p className="cmd-delay">Source: GET /live/health · {stamp(spine.healthAt)}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
