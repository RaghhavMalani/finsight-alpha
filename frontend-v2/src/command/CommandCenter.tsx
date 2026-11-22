import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadQuakes, loadSatellites, useFeed, type Feed } from "@/components/globe/feeds";
import type { Quake, Satellite } from "@/components/globe/geo-data";
import type { GlobeMarker } from "@/components/globe/GlobeScene";
import { loadLand, type LandData } from "@/components/globe/land";
import { loadReplayManifest } from "@/replay/client";
import { changeDataMode, localLiveAllowed, useDataMode } from "@/replay/mode";
import { useLiveSpine, type SpineState } from "./live";
import {
  clock,
  destination,
  fmt,
  freshness,
  isIndia,
  lag,
  MARKER,
  num,
  provenance,
  stamp,
  summary,
  text,
  WORKSPACE_KEY,
  type FeedHealth,
  type LiveEvent,
} from "./records";
import { Num, ProvenanceProvider, Stamp } from "@/visual/Num";
import { liveOrigin, num as numOf, ref } from "@/visual/origins";
import { CELESTRAK_GROUPS, USGS_MONTH_FEED } from "@/components/globe/geo-data";
import "./command.css";

const GlobeScene = lazy(() => import("@/components/globe/GlobeScene"));

export function LiveDot({ state, label }: { state: "fresh" | "stale" | "dead"; label: string }) {
  return (
    <span className={`live-dot live-dot-${state}`} title={label}>
      <i aria-hidden="true" />
      <span className="sr-only">{state}</span>
    </span>
  );
}

/** Live records arrive from the backlog or the stream; seq names the exact record. */
const EVENTS = "GET /live/recent · /live/stream";
const HEALTH = "GET /live/health";
/** Source, delay, confidence and licence of the record: shown with every value it carries. */
const recordNote = (e: LiveEvent) =>
  `${e.type} · source ${e.source} (${e.source_id}) · delay ${e.provenance.delay} · confidence ${e.confidence} · licence ${e.licence.status} / ${e.licence.redistribution}`;
const at = (e: LiveEvent, ptr: string) => liveOrigin(EVENTS, ptr, e, { note: recordNote(e) });

/**
 * The keyboard and pointer path to a record's origin: a button beside the row's link (never
 * inside it) that opens the popover with seq, clocks, source and licence.
 */
function RecordOrigin({ e }: { e: LiveEvent }) {
  return (
    <Num
      n={numOf(at(e, "/seq"), e.seq, "int")}
      display={`#${e.seq}`}
      label={`Origin of ${e.type} record`}
      className="cmd-prov"
    />
  );
}
/** Verbatim record text (a headline, a place) may contain digits; it is shown as recorded. */
const Verbatim = ({ children }: { children: React.ReactNode }) => (
  <span data-num-exempt="copy">{children}</span>
);
const Ident = ({ children }: { children: React.ReactNode }) => (
  <span data-num-exempt="id">{children}</span>
);
function LiveNum({
  e,
  field,
  label,
  display,
}: {
  e: LiveEvent;
  field: string;
  label: string;
  display: (v: number) => string;
}) {
  const v = num(e.payload[field]);
  return (
    <Num
      n={numOf(at(e, `/payload/${field}`), v, "x", `the record has no numeric /payload/${field}`)}
      display={v === null ? undefined : display(v)}
      label={label}
      inert
      className="vx-inherit"
    />
  );
}
function LiveClock({
  e,
  field,
  label,
}: {
  e: LiveEvent;
  field: "available_at" | "observed_at";
  label: string;
}) {
  return (
    <Stamp
      s={ref(at(e, `/${field}`), e[field])}
      display={clock(e[field])}
      label={label}
      inert
      className="vx-inherit"
    />
  );
}

/** The record summary, with each number carrying the record it came from. */
function Summary({ e }: { e: LiveEvent }) {
  const p = e.payload;
  const kind = text(p.kind);
  switch (e.type) {
    case "geo.event":
      if (kind === "earthquake")
        return (
          <>
            {num(p.mag) !== null && (
              <>
                M<LiveNum e={e} field="mag" label="Magnitude" display={(v) => v.toFixed(1)} />{" "}
              </>
            )}
            <Verbatim>{text(p.place) ?? text(p.title) ?? "Earthquake"}</Verbatim>
          </>
        );
      return <Verbatim>{summary(e)}</Verbatim>;
    case "market.tick":
      return (
        <>
          <span data-num-exempt="ticker">{text(p.ticker) ?? "?"}</span>{" "}
          {num(p.close) !== null ? (
            <LiveNum e={e} field="close" label="Close" display={fmt} />
          ) : (
            "close n/a"
          )}
          {text(p.currency) ? ` ${text(p.currency)}` : ""}
        </>
      );
    case "macro.release":
      return (
        <>
          <Ident>{text(p.series) ?? "series"}</Ident>{" "}
          <LiveNum e={e} field="value" label="Value" display={(v) => String(v)} />
          {text(p.units) ? <Verbatim> {text(p.units)}</Verbatim> : ""}
        </>
      );
    case "prediction.update":
      return (
        <>
          <Verbatim>{text(p.question) ?? text(p.event_title) ?? "market"}</Verbatim>
          {num(p.yes_price) !== null && (
            <>
              {" "}
              · yes <LiveNum e={e} field="yes_price" label="Yes price" display={(v) => String(v)} />
            </>
          )}
        </>
      );
    case "risk.alert":
    case "feed.health":
      return <Ident>{summary(e)}</Ident>;
    default:
      return <Verbatim>{summary(e)}</Verbatim>;
  }
}

/** A feed row's value names the snapshot entry or the feed.health record it was read from. */
function feedOrigin(f: FeedHealth, field: string) {
  const via = f.via ?? { src: HEALTH, ptr: "/feeds", as_of: null };
  return liveOrigin(via.src, `${via.ptr}/${field}`, via, {
    asOf: via.as_of ?? null,
    note: via.seq != null ? "From the latest feed.health record for this feed." : undefined,
  });
}

function Row({ event, fresh }: { event: LiveEvent; fresh: boolean }) {
  const target = destination(event);
  return (
    <li className={fresh ? "cmd-new" : undefined} data-type={event.type} data-seq={event.seq}>
      <Link to={target.to as never} search={target.search as never} title={provenance(event)}>
        <span className="cmd-row-main">
          <b className={`cmd-type cmd-type-${event.type.split(".")[0]}`}>{event.type}</b>
          <span className="cmd-row-text">
            <Summary e={event} />
          </span>
        </span>
        <span className="cmd-row-meta">
          <Ident>{event.source}</Ident> · avail{" "}
          <LiveClock e={event} field="available_at" label="Available at" /> ·{" "}
          <span data-num-exempt="key-label">{WORKSPACE_KEY[target.to]}</span> ›
        </span>
      </Link>
      <RecordOrigin e={event} />
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
    case "reconnecting":
      return "Stream interrupted · reconnecting to /live/stream…";
    case "polling":
      return (
        <span data-num-exempt="copy">{`Polling /live/recent every 15 s · ${state.detail}.`}</span>
      );
  }
}

function Panel({
  title,
  count,
  children,
  label,
}: {
  title: string;
  count?: React.ReactNode;
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
      events.filter((e) => {
        const lat = num(e.payload.lat),
          lon = num(e.payload.lon);
        return (
          e.type === "geo.event" &&
          lat !== null &&
          lon !== null &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180 &&
          // The globe already draws USGS quakes from its own public feed; one mark per quake.
          e.source !== "usgs"
        );
      }),
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
  // The status panel names why there are no records; the other panels say it in one word.
  const absent = connected ? null : "—";

  const feedChip = (f: Feed<unknown>, label: string, endpoint: string) => (
    <span className={`cmd-chip ${f.status}`} title={f.note ?? undefined}>
      globe · {label} ·{" "}
      {f.status === "live" && f.at ? (
        <Stamp
          s={ref(
            liveOrigin(
              endpoint,
              "",
              {},
              {
                note: "Public feed read directly by this browser. The time is the browser-clock fetch time, not a source timestamp.",
              },
            ),
            new Date(f.at).toISOString(),
          )}
          display={`${new Date(f.at).toISOString().slice(11, 16)}Z`}
          label={`${label} fetched at`}
          inert
          className="vx-inherit"
        />
      ) : (
        f.status
      )}
    </span>
  );
  // A count of the records this page holds from the spine, not a value from any one record.
  const held = (n: number, label: string) => (
    <Num
      n={numOf(
        liveOrigin(EVENTS, "", {}, { formula: `count of ${label} held by this page` }),
        n,
        "int",
      )}
      label={label}
      inert
      className="vx-inherit"
    />
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
                  <b data-num-exempt="ticker">{text(e.payload.ticker)}</b>
                  <span className="cmd-num">
                    <LiveNum
                      e={e}
                      field="close"
                      label={`${text(e.payload.ticker)} close`}
                      display={fmt}
                    />
                    {text(e.payload.currency) ? ` ${text(e.payload.currency)}` : ""}
                  </span>
                  <span className="cmd-row-meta">
                    <Ident>{e.source}</Ident> ·{" "}
                    <LiveClock e={e} field="observed_at" label="Observed at" />
                  </span>
                </Link>
                <RecordOrigin e={e} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="cmd-empty">{absent ?? `No ${name} market.tick records yet.`}</p>
        )}
        {delays.map((f) => (
          <p
            key={f.feed}
            className="cmd-delay"
            title={f.reason ?? undefined}
            data-num-exempt="copy"
          >
            {f.feed}: {f.delay ?? "delay label missing"}
            {f.status !== "UP" ? ` · ${f.status}` : ""}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ProvenanceProvider>
      <div className="cmd" data-spine={spine.state.kind} data-mode={mode}>
        <div className="cmd-stage" aria-hidden="true" data-markers={markers.length}>
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
              <div className="cmd-eyebrow" data-num-exempt="key-label">
                F1 · Command
              </div>
              <h1>Mission control</h1>
              <p className="cmd-spine" role="status" data-spine-state={spine.state.kind}>
                <LiveDot
                  state={
                    connected
                      ? "fresh"
                      : spine.state.kind === "connecting" || spine.state.kind === "reconnecting"
                        ? "stale"
                        : "dead"
                  }
                  label={spine.state.kind}
                />
                <span>{spineLine(spine.state, live)}</span>
              </p>
              {(spine.state.kind === "not-running" || spine.state.kind === "unauthorized") && (
                <p className="cmd-detail" data-num-exempt="copy">
                  {spine.state.detail}
                </p>
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
                {feedChip(quakes, "USGS", USGS_MONTH_FEED)}
                {feedChip(sats, "CelesTrak", Object.values(CELESTRAK_GROUPS).join(" + "))}
                {connected && (
                  <span className="cmd-chip live">
                    spine · {held(events.length, "Records")} records
                  </span>
                )}
              </div>
            </header>
            <Panel
              title="Event stream"
              label="Live event stream"
              count={connected ? held(events.length, "Records") : undefined}
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
              count={connected ? held(alerts.length, "Open risk alerts") : undefined}
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
              count={connected ? held(research.length, "Research suggestions") : undefined}
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
                            <span className="cmd-row-text">
                              <Summary e={e} />
                            </span>
                          </span>
                          {names.length > 0 && (
                            <span className="cmd-tickers" data-num-exempt="ticker">
                              {names.map((n) => (
                                <i key={n}>{n}</i>
                              ))}
                            </span>
                          )}
                          <span className="cmd-row-meta">
                            <Ident>{e.source}</Ident> · avail{" "}
                            <LiveClock e={e} field="available_at" label="Available at" /> ·{" "}
                            <span data-num-exempt="key-label">F2</span> Research ›
                          </span>
                        </Link>
                        <RecordOrigin e={e} />
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
              count={
                spine.healthAt ? (
                  <>
                    as of{" "}
                    <Stamp
                      s={ref(liveOrigin(HEALTH, "/now"), spine.healthAt)}
                      display={clock(spine.healthAt)}
                      label="Health as of"
                      inert
                      className="vx-inherit"
                    />
                  </>
                ) : undefined
              }
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
                          <b data-num-exempt="id">{f.feed}</b>
                          <span className="cmd-row-meta">
                            {state} · {f.status} ·{" "}
                            {f.lag_s == null ? (
                              lag(f.lag_s)
                            ) : (
                              <Num
                                n={numOf(feedOrigin(f, "lag_s"), f.lag_s, "sec")}
                                display={lag(f.lag_s)}
                                label={`${f.feed} lag (s)`}
                                inert
                                className="vx-inherit"
                              />
                            )}
                          </span>
                        </Link>
                        <Stamp
                          s={ref(feedOrigin(f, "last_success_at"), f.last_success_at)}
                          display="src"
                          label={`${f.feed} last success`}
                          className="cmd-prov"
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cmd-empty">{absent ?? "/live/health lists no feeds."}</p>
              )}
              {spine.healthAt && (
                <p className="cmd-delay">
                  Source: GET /live/health ·{" "}
                  <Stamp
                    s={ref(liveOrigin(HEALTH, "/now"), spine.healthAt)}
                    display={stamp(spine.healthAt)}
                    label="Health snapshot"
                    inert
                    className="vx-inherit"
                  />
                </p>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </ProvenanceProvider>
  );
}
