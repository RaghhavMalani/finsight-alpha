import type { Catalog, CatalogItem } from "./contracts";
function coverage(i: CatalogItem, a = false) {
  const x = a ? i.analysis_coverage : i.observed_coverage;
  return x
    ? `${x.first_observed_date} → ${x.last_observed_date} · ${x.observations.toLocaleString()} observations`
    : a
      ? "Not consumed by retained assessment"
      : "UNAVAILABLE · sealed library coverage absent";
}
export function EvidenceCatalogue({
  data,
  selected,
  onSelect,
}: {
  data: Catalog;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const i = data.payload.items.find((x) => x.factor_id === selected);
  return (
    <div className="factor-catalog">
      <section className="factor-panel">
        <div className="factor-section-head">
          <h2>Source library</h2>
          <span>4 factor returns + RF component</span>
        </div>
        {data.payload.items.map((x) => (
          <button
            key={x.factor_id}
            className={"factor-source-row " + (x.factor_id === selected ? "is-selected" : "")}
            onClick={() => onSelect(x.factor_id)}
            aria-pressed={x.factor_id === selected}
          >
            <b>{x.definition.split(":")[1]}</b>
            <span>
              <strong>{x.display_name}</strong>
              <small>
                {x.role} · {x.units}
              </small>
              <small>{coverage(x)}</small>
            </span>
            <em>{x.evidence_quality.join(" · ")}</em>
          </button>
        ))}
        <p className="factor-footnote">
          Library coverage describes captured source bytes. It is broader than the retained analysis
          window. Market factor, not a ticker.
        </p>
      </section>
      <section className="factor-panel factor-inspector">
        <div className="factor-section-head">
          <h2>{i?.definition ?? "Select source evidence"}</h2>
          <span>Metadata only</span>
        </div>
        {i ? (
          <>
            <div className="factor-badges">
              {i.evidence_quality.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
            <dl>
              <dt>Library coverage</dt>
              <dd>{coverage(i)}</dd>
              <dt>Retained analysis</dt>
              <dd>{coverage(i, true)}</dd>
              <dt>Available from</dt>
              <dd>{i.available_from}</dd>
              <dt>Capture clock</dt>
              <dd>{i.capture_time}</dd>
              <dt>Calendar</dt>
              <dd>
                {i.calendar_status.mic} · {i.calendar_status.status} ·{" "}
                {i.calendar_status.version ?? "No evidenced version"}
              </dd>
              <dt>Source age</dt>
              <dd>
                {i.staleness.age_calendar_days ?? "Unavailable"} calendar days ·{" "}
                {i.staleness.status}
              </dd>
              <dt>Permission</dt>
              <dd>
                {i.licence_status.status} · {i.licence_status.permitted_uses.join(" / ")} · DERIVED
                REFERENCES ONLY
              </dd>
              <dt>Source version</dt>
              <dd className="factor-hash">{i.source_version}</dd>
              <dt>Capture SHA-256</dt>
              <dd className="factor-hash">{i.capture_sha256}</dd>
            </dl>
            <p className="factor-footnote">{i.source.attribution}</p>
            {i.source.source_urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                Source library ↗
              </a>
            ))}
          </>
        ) : (
          <p>
            Choose a component to inspect source, clock, licence and coverage. MOM opens the
            existing assessment.
          </p>
        )}
      </section>
    </div>
  );
}
