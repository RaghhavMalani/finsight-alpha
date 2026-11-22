import { arcRgb, cssRgb, SITE_COLORS, shortName, type ArcKind } from "./geo-overlay";
import {
  STATUS_WORDS,
  type GeoAnswer,
  type GeoEvent,
  type GeoLoad,
  type GeoProjection,
} from "./geo-graph";

export type GeoView = "point_in_time" | "retrospective";
export type GeoSelection = {
  event: Pick<GeoEvent, "id" | "origin" | "label" | "kind" | "lat" | "lon" | "magnitude" | "time">;
  /** The answer to show, or why there is none (a failed live request, an unknown event). */
  answer: GeoAnswer | null;
  note: string | null;
  retrospective: GeoAnswer | null;
  pending?: boolean;
} | null;

const day = (iso: string) => iso.slice(0, 10);
const km = (n: number) => `${Math.round(n).toLocaleString("en-US")} km`;
const ARC_KEY: [ArcKind, string][] = [
  ["proximity", "event → site: proximity 1 − d/r"],
  ["operates", "site → company: operates confidence"],
  ["supplies", "company → customer: supplies confidence"],
  ["listed_as", "company → security: listing confidence"],
];

/** The Global Eye v2 propagation panel: status in words, reached securities and their cited chains. */
export function GeoPanel({
  geo,
  selection,
  view,
  onView,
  onScenario,
  onClear,
  arcs,
  choices,
}: {
  onClear: () => void;
  /** Earthquakes of M5 and above in the loaded feed, newest first, for keyboard selection. */
  choices: { id: string; label: string }[];
  geo: GeoLoad;
  selection: GeoSelection;
  view: GeoView;
  onView: (v: GeoView) => void;
  onScenario: (id: string) => void;
  arcs: number;
}) {
  if (geo.status === "loading")
    return (
      <section className="ge-prop" aria-label="Propagation" data-geo-propagation="loading">
        <div className="ge-eyebrow">Propagation · cited knowledge graph</div>
        <p className="ge-lead">Verifying the graph projection…</p>
      </section>
    );
  if (geo.status === "unavailable")
    return (
      <section className="ge-prop" aria-label="Propagation" data-geo-propagation="unavailable">
        <div className="ge-eyebrow">Propagation · cited knowledge graph</div>
        <p className="ge-prop-unavail" role="alert" data-geo-unavailable>
          UNAVAILABLE — the graph projection was refused: {geo.reason} No sites, companies or
          propagation arcs are drawn.
        </p>
      </section>
    );
  const p = geo.projection;
  const answer = selection?.answer ?? null;
  return (
    <section
      className="ge-prop"
      aria-label="Propagation"
      data-geo-propagation="ok"
      data-geo-event={selection?.event.id ?? ""}
      data-geo-status={answer?.status ?? ""}
    >
      <div className="ge-eyebrow">Propagation · cited knowledge graph</div>
      {!selection ? (
        <p className="ge-lead">
          Select an earthquake on the globe or in Latest events, or a scenario below, to trace it
          through cited edges: event → site in radius → operator → customer → security.
        </p>
      ) : (
        <>
          <div className="ge-prop-head">
            <span
              className={`ge-origin ${selection.event.origin}`}
              data-geo-origin={selection.event.origin}
            >
              {selection.event.origin === "scenario"
                ? "Scenario · hypothetical — not a recorded event"
                : selection.event.origin === "live"
                  ? "Live · USGS"
                  : "Recorded · USGS"}
            </span>
            <strong>{selection.event.label}</strong>
            <span className="mono">
              {selection.event.kind}
              {selection.event.magnitude != null
                ? ` M${selection.event.magnitude.toFixed(1)}`
                : ""}{" "}
              · {selection.event.time.slice(0, 16).replace("T", " ")}Z ·{" "}
              {selection.event.lat.toFixed(2)}°, {selection.event.lon.toFixed(2)}°
            </span>
          </div>
          {selection.retrospective && (
            <div className="ge-seg ge-view" role="radiogroup" aria-label="Answer as of">
              <button
                type="button"
                role="radio"
                aria-checked={view === "point_in_time"}
                onClick={() => onView("point_in_time")}
              >
                At event time
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={view === "retrospective"}
                onClick={() => onView("retrospective")}
              >
                Graph as checked {day(p.graph.knowledge_cutoff)}
              </button>
            </div>
          )}
          {view === "retrospective" && selection.retrospective && (
            <p className="ge-fine" data-geo-retrospective>
              Retrospective: the same place and magnitude against relationships this project checked
              on {day(p.graph.knowledge_cutoff)}, after the event. Not what was knowable when it
              happened.
            </p>
          )}
          {selection.pending ? (
            <p className="ge-lead" role="status">
              Waiting for POST /geo/graph/propagate…
            </p>
          ) : answer ? (
            <AnswerView
              p={p}
              answer={answer}
              arcs={arcs}
              scenario={selection.event.origin === "scenario"}
            />
          ) : (
            <p className="ge-prop-unavail" role="status" data-geo-status-word="UNAVAILABLE">
              <b>UNAVAILABLE</b> — {selection.note ?? "no answer for this event."}
            </p>
          )}
          {selection.note && answer && <p className="ge-fine">{selection.note}</p>}
          {selection.event.origin === "scenario" && (
            <p className="ge-fine">
              Dated at the graph&apos;s knowledge cutoff, {day(p.graph.knowledge_cutoff)}, so the
              cited relationships exist. Its place and size are declared inputs, not observations.
            </p>
          )}
          <button type="button" className="ge-clear" onClick={onClear}>
            Clear selection
          </button>
        </>
      )}
      <label className="ge-pick">
        <span>Earthquakes M5+ ({choices.length})</span>
        <select
          value={choices.some((c) => c.id === selection?.event.id) ? selection!.event.id : ""}
          onChange={(e) => e.target.value && onScenario(e.target.value)}
          data-geo-choice
        >
          <option value="">Choose an earthquake…</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="ge-eyebrow">Scenarios</div>
      <ol className="ge-list ge-scen">
        {p.scenarios.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={selection?.event.id === s.id}
              onClick={() => onScenario(s.id)}
              data-geo-scenario={s.id}
            >
              <b className="mono">{s.magnitude != null ? `M${s.magnitude.toFixed(1)}` : s.kind}</b>
              <span>{s.label.replace(/^Scenario: /, "")}</span>
              <em className="mono">{s.point_in_time.status}</em>
            </button>
          </li>
        ))}
      </ol>
      <p className="ge-fine" data-geo-precision>
        {p.precision} Companies and securities have no coordinates in the graph; they are drawn on
        tiers above the event, not at a place. {p.radius_rule} Graph {p.graph.version}, seed SHA-256{" "}
        <code>{p.graph.seed_sha256_lf.slice(0, 12)}</code>, {p.graph.nodes} nodes, {p.graph.edges}{" "}
        cited edges.
      </p>
    </section>
  );
}

function AnswerView({
  p,
  answer,
  arcs,
  scenario,
}: {
  p: GeoProjection;
  answer: GeoAnswer;
  arcs: number;
  scenario: boolean;
}) {
  const name = (id: string) => shortName(p.nodes[id], id);
  const full = (id: string) => p.nodes[id]?.name ?? id;
  // Missing is not zero: an answer that never looked at sites says so.
  const NE = "not evaluated";
  const words = STATUS_WORDS[answer.status];
  return (
    <>
      <p className={`ge-word ${answer.status}`} role="status" data-geo-status-word={answer.status}>
        <b>{answer.status}</b>
        <span>
          — {words}
          {answer.status === "AVAILABLE"
            ? `: ${answer.securities.length} ${answer.securities.length === 1 ? "security" : "securities"}.`
            : "."}
          {answer.reason && answer.status !== "AVAILABLE" ? ` ${answer.reason}.` : ""}
        </span>
      </p>
      {answer.securities.length > 0 && (
        <>
          <div className="ge-eyebrow">Reached securities · best chain each</div>
          <ol className="ge-secs">
            {answer.securities.map((r) => (
              <li key={r.security} data-geo-security={r.security}>
                <details>
                  <summary>
                    <b className="mono" title={full(r.security)}>
                      {name(r.security)}
                    </b>
                    <span>
                      chain score <span className="mono">{r.score.toFixed(4)}</span> · via{" "}
                      <span title={full(r.best_chain.site)}>{name(r.best_chain.site)}</span> ≈{" "}
                      {km(r.best_chain.distance_km)}
                    </span>
                  </summary>
                  <ol className="ge-hops">
                    {r.best_chain.hops.map((h) => (
                      <li key={h.id} data-geo-hop={h.id}>
                        <div>
                          <b>
                            <span title={full(h.src)}>{name(h.src)}</span> →{" "}
                            <span title={full(h.dst)}>{name(h.dst)}</span>
                          </b>{" "}
                          <span className="mono ge-hop-type">
                            {h.type}
                            {h.confidence < 1 ? ` · confidence ${h.confidence}` : ""}
                          </span>
                        </div>
                        <div>{h.mechanism}</div>
                        <div className="ge-src">
                          <a href={h.source.url} target="_blank" rel="noreferrer">
                            {h.source.title}
                          </a>{" "}
                          · {h.source.date} ({h.source.date_basis})
                          {h.source.locator ? ` · ${h.source.locator}` : ""}
                        </div>
                        {h.source.excerpt && <q>{h.source.excerpt}</q>}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="ge-rows mono">
        <div>
          <span>Declared radius</span>
          <b>{answer.radius_km != null ? km(answer.radius_km) : "none"}</b>
        </div>
        <div>
          <span>Nearest sourced site</span>
          <b>
            {answer.nearest_site_km != null
              ? `≈ ${km(answer.nearest_site_km)}`
              : answer.evaluated
                ? "none"
                : NE}
          </b>
        </div>
        <div>
          <span>Sites in radius</span>
          <b data-geo-count="sites">{answer.evaluated ? answer.sites.length : NE}</b>
        </div>
        <div>
          <span>Cited chains</span>
          <b data-geo-count="chains">
            {answer.evaluated && answer.chains_total != null ? answer.chains_total : NE}
          </b>
        </div>
        <div>
          <span>Arcs drawn</span>
          <b data-geo-count="arcs">{answer.evaluated ? arcs : NE}</b>
        </div>
      </div>
      {answer.sites.length > 0 && (
        <details className="ge-sites">
          <summary>
            {answer.sites.length} sourced {answer.sites.length === 1 ? "site" : "sites"} in the
            radius ({answer.sites.filter((s) => !s.linked).length} with no cited link)
          </summary>
          <ul>
            {answer.sites.map((s) => (
              <li key={s.site}>
                {p.nodes[s.site]?.name ?? s.site} · ≈ {km(s.distance_km)}
                {s.linked ? "" : " · no cited link to a security"} ·{" "}
                <span className="ge-faint">{p.nodes[s.site]?.location_precision}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(answer.status === "AVAILABLE" || answer.status === "PARTIAL") && (
        <div className="ge-legend" aria-label="Arc legend">
          <p>
            Arc brightness encodes each arc&apos;s value from 0 to 1; hue names the edge type
            {scenario ? " (an amber family for a hypothetical scenario)" : ""}; line width is
            constant. Arcs are drawn additively, so where two overlap the crossing looks brighter
            than either value.
          </p>
          <ul>
            {ARC_KEY.map(([k, label]) => (
              <li key={k}>
                <span className="ge-ramp">
                  {[0.25, 0.5, 0.75, 1].map((v) => (
                    <i
                      key={v}
                      data-geo-swatch={k}
                      data-value={v}
                      style={{ background: cssRgb(arcRgb(k, v, scenario)) }}
                      title={`value ${v}`}
                    />
                  ))}
                </span>
                {label}
              </li>
            ))}
          </ul>
          <p className="ge-ramp-scale mono">
            <span>0.25</span>
            <span>0.5</span>
            <span>0.75</span>
            <span>1</span>
          </p>
          <p>
            Sites:{" "}
            {Object.entries(SITE_COLORS).map(([t, c]) => (
              <span key={t} className="ge-dot">
                <i style={{ background: c }} />
                {t}
              </span>
            ))}{" "}
            · the {scenario ? "pale amber" : "yellow"} ring is the declared radius.
          </p>
        </div>
      )}
    </>
  );
}
