import type { Catalog, CatalogItem } from "./contracts";
import type { RouteProv } from "@/visual/route-origin";
import { useFactorProv } from "./prov";
function coverage(P: RouteProv, at: string, i: CatalogItem, a = false) {
  const x = a ? i.analysis_coverage : i.observed_coverage;
  const f = `${at}/${a ? "analysis_coverage" : "observed_coverage"}`;
  return x ? (
    <>
      {P.D(
        `${f}/first_observed_date`,
        x.first_observed_date,
        "First observed",
        x.first_observed_date,
      )}{" "}
      →{" "}
      {P.D(`${f}/last_observed_date`, x.last_observed_date, "Last observed", x.last_observed_date)}{" "}
      · {P.N(`${f}/observations`, x.observations, "Observations", x.observations.toLocaleString())}{" "}
      observations
    </>
  ) : a ? (
    "Not consumed by retained assessment"
  ) : (
    "UNAVAILABLE · sealed library coverage absent"
  );
}
export function EvidenceCatalogue({
  artifactId,
  data,
  selected,
  onSelect,
}: {
  artifactId: string | undefined;
  data: Catalog;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const P = useFactorProv(artifactId);
  const items = data.payload.items;
  const i = items.find((x) => x.factor_id === selected);
  const iAt = `/payload/items/${i ? items.indexOf(i) : -1}`;
  const factorReturns = items.filter((x) => x.role === "FACTOR_RETURN").length;
  return (
    <div className="factor-catalog">
      <section className="factor-panel">
        <div className="factor-section-head">
          <h2>Source library</h2>
          <span>
            {P.N("/payload/items", factorReturns, "Factor returns", String(factorReturns), {
              formula: "count of /payload/items where role = FACTOR_RETURN",
            })}{" "}
            factor returns + RF component
          </span>
        </div>
        {items.map((x, xi) => (
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
              <small>{coverage(P, `/payload/items/${xi}`, x)}</small>
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
              <dd>{coverage(P, iAt, i)}</dd>
              <dt>Retained analysis</dt>
              <dd>{coverage(P, iAt, i, true)}</dd>
              <dt>Available from</dt>
              <dd>
                {P.D(`${iAt}/available_from`, i.available_from, "Available from", i.available_from)}
              </dd>
              <dt>Capture clock</dt>
              <dd>{P.D(`${iAt}/capture_time`, i.capture_time, "Capture clock", i.capture_time)}</dd>
              <dt>Calendar</dt>
              <dd>
                {i.calendar_status.mic} · {i.calendar_status.status} ·{" "}
                <span data-num-exempt="id">
                  {i.calendar_status.version ?? "No evidenced version"}
                </span>
              </dd>
              <dt>Source age</dt>
              <dd>
                {i.staleness.age_calendar_days == null
                  ? "Unavailable"
                  : P.N(
                      `${iAt}/staleness/age_calendar_days`,
                      i.staleness.age_calendar_days,
                      "Source age (calendar days)",
                      String(i.staleness.age_calendar_days),
                    )}{" "}
                calendar days · {i.staleness.status}
              </dd>
              <dt>Permission</dt>
              <dd>
                {i.licence_status.status} · {i.licence_status.permitted_uses.join(" / ")} · DERIVED
                REFERENCES ONLY
              </dd>
              <dt>Source version</dt>
              <dd className="factor-hash" data-num-exempt="id">
                {i.source_version}
              </dd>
              <dt data-num-exempt="copy">Capture SHA-256</dt>
              <dd className="factor-hash" data-num-exempt="id">
                {i.capture_sha256}
              </dd>
            </dl>
            <p className="factor-footnote" data-num-exempt="copy">
              {i.source.attribution}
            </p>
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
