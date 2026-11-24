import type { Revision } from "./contracts";
import type { RouteProv } from "@/visual/route-origin";

export function RevisionObservatory({
  revision,
  mirror,
  cutoff,
  onCutoff,
  country,
  V,
  M,
}: {
  revision: Revision;
  mirror: Record<string, unknown>;
  cutoff?: string;
  onCutoff: (cutoff: string) => void;
  country: string;
  /** Origins in the revisions and disagreement artifacts. */
  V: RouteProv;
  M: RouteProv;
}) {
  const S = "/payload/summary";
  const count = (v: unknown) => (typeof v === "number" ? v : null);
  if (country === "INDIA")
    return (
      <section className="data-panel">
        <h2>
          India revision evidence <span>UNAVAILABLE</span>
        </h2>
        <p>
          RBI/MOSPI release vintages and dataset-specific publication permission have not been
          admitted. IIMA is CAPTURE_ONLY and cannot supply historical release revisions.
        </p>
      </section>
    );
  const selectedYear = cutoff?.slice(0, 4) ?? revision.yearly.at(-1)?.year;
  return (
    <div className="data-detail-grid">
      <section className="data-panel">
        <h2>
          Revision Observatory <span>{revision.status}</span>
        </h2>
        <p>
          UNRATE · actual captured ALFRED vintage intervals. Availability is conservative: next New
          York midnight after the vintage day.
        </p>
        {revision.status === "UNAVAILABLE" ? (
          <p className="data-unavailable">{V.T(`${S}/reason`, revision.reason, "Reason")}</p>
        ) : (
          <>
            <div className="data-metrics">
              <div>
                <b>
                  {V.N(
                    `${S}/periods`,
                    revision.periods,
                    "Observation periods",
                    String(revision.periods),
                  )}
                </b>
                <span>observation periods</span>
              </div>
              <div>
                <b>
                  {V.N(
                    `${S}/revised_periods`,
                    revision.revised_periods,
                    "Periods revised",
                    String(revision.revised_periods),
                  )}
                </b>
                <span>periods revised</span>
              </div>
              <div>
                <b>
                  {V.N(
                    `${S}/transitions`,
                    revision.transitions,
                    "Value transitions",
                    String(revision.transitions),
                  )}
                </b>
                <span>value transitions</span>
              </div>
            </div>
            <div className="revision-grid" role="table" aria-label="Annual revision evidence">
              <div role="row" className="revision-row">
                <span>YEAR</span>
                <span>PERIODS</span>
                <span>REVISED</span>
                <span>TRANSITIONS</span>
              </div>
              {revision.yearly
                .filter((row) => !selectedYear || row.year <= selectedYear)
                .map((row) => {
                  const at = `${S}/yearly/${revision.yearly.indexOf(row)}`;
                  return (
                    <div role="row" className="revision-row" key={row.year}>
                      <strong data-num-exempt="date">{row.year}</strong>
                      <span>
                        {V.N(
                          `${at}/periods`,
                          row.periods,
                          `${row.year} periods`,
                          String(row.periods),
                        )}
                      </span>
                      <span
                        className="revision-bar"
                        style={{
                          backgroundSize: (100 * row.revised_periods) / row.periods + "% 100%",
                        }}
                      >
                        {V.N(
                          `${at}/revised_periods`,
                          row.revised_periods,
                          `${row.year} periods revised`,
                          String(row.revised_periods),
                        )}
                      </span>
                      <span>
                        {V.N(
                          `${at}/transitions`,
                          row.transitions,
                          `${row.year} transitions`,
                          String(row.transitions),
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
            <label>
              Annual observation window through <span data-num-exempt="date">{selectedYear}</span>.
              Capture vintage stays fixed.
              <input
                type="range"
                aria-label="Annual observation cutoff"
                min={0}
                max={Math.max(0, revision.yearly.length - 1)}
                value={Math.max(
                  0,
                  revision.yearly.findIndex((row) => row.year === selectedYear),
                )}
                onChange={(e) => onCutoff(revision.yearly[Number(e.target.value)].year + "-12-31")}
              />
            </label>
          </>
        )}
        <p className="data-note">
          Annual aggregates only. No raw vintage matrix, daily price deltas or model inference.
        </p>
      </section>
      <section className="data-panel">
        <h2>
          Mirror consistency <span>{String(mirror.status)}</span>
        </h2>
        <p>{String(mirror.meaning)}</p>
        <div className="data-metrics">
          <div>
            <b>
              {M.N(`${S}/pairs`, count(mirror.pairs), "Comparable periods", String(mirror.pairs))}
            </b>
            <span>comparable periods</span>
          </div>
          <div>
            <b>
              {mirror.different == null
                ? "—"
                : M.N(
                    `${S}/different`,
                    count(mirror.different),
                    "Different values",
                    String(mirror.different),
                  )}
            </b>
            <span>different values</span>
          </div>
        </div>
        <p>
          {mirror.information_basis == null
            ? "No admitted compatible comparison"
            : M.T(`${S}/information_basis`, String(mirror.information_basis), "Information basis")}
        </p>
        <p className="data-note" data-num-exempt="id">
          ALFRED UNRATE and BLS LNS14000000 share the same economic upstream. This is a mirror
          check, not independent confirmation.
        </p>
      </section>
    </div>
  );
}
