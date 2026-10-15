import { useEffect, useState } from "react";
import { readCoverage, type RiskBundle } from "./client";
import { type Coverage } from "./contracts";
export function CoverageMatrix({ bundle }: { bundle: RiskBundle }) {
  const [rows, setRows] = useState<Coverage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("ALL");
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError(null);
    void readCoverage(bundle, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setRows(page.payload.coverage);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Coverage unavailable.");
      });
    return () => controller.abort();
  }, [bundle]);
  if (error)
    return (
      <p role="alert" className="border border-down/40 p-4 text-down">
        COVERAGE UNAVAILABLE · {error}
      </p>
    );
  if (!rows)
    return (
      <p role="status" className="border border-divider p-6 text-muted-foreground">
        Verifying full coverage evidence… No check is assumed clear.
      </p>
    );
  const selected = rows.filter((r) => category === "ALL" || r.category === category);
  return (
    <section aria-label="Risk coverage matrix" className="border border-divider">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-raised p-4">
        <div>
          <h2 className="mono-caps text-[11px]">COVERAGE MATRIX · {rows.length} CONTRACT SLOTS</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Availability describes evaluation coverage. NOT_EVALUATED never means no risk.
          </p>
        </div>
        <select
          aria-label="Coverage category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-divider bg-background p-2 font-mono text-[10px]"
        >
          {["ALL", "PORTFOLIO", "MODEL", "DATA", "RESEARCH_HYGIENE", "SIMULATOR", "SYSTEM"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </header>
      <div className="grid grid-cols-3 border-b border-divider">
        {(["AVAILABLE", "PARTIAL", "UNAVAILABLE"] as const).map((status) => (
          <div key={status} className="border-r border-divider p-4">
            <div className="mono-caps text-[8px] text-faint">{status}</div>
            <div className="mt-1 font-mono text-xl">
              {rows.filter((r) => r.availability === status).length}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="mono-caps border-b border-divider text-[8px] text-faint">
            <tr>
              <th scope="col" className="p-3">
                Check / Subject
              </th>
              <th scope="col" className="p-3">
                Coverage
              </th>
              <th scope="col" className="p-3">
                Outcome / Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {selected.map((row) => (
              <tr key={row.check_id} className="border-b border-divider">
                <td className="min-w-[180px] p-3">
                  <div className="font-mono text-[9px]">{row.check_id.split(":")[0]}</div>
                  <div className="mt-1 text-faint">
                    {row.scope.subject_id} · {row.evidence_class}
                  </div>
                </td>
                <td
                  className={
                    "p-3 font-mono text-[9px] " +
                    (row.availability === "UNAVAILABLE"
                      ? "text-muted-foreground"
                      : row.availability === "PARTIAL"
                        ? "text-primary"
                        : "text-foreground")
                  }
                >
                  {row.availability}
                </td>
                <td className="min-w-[240px] p-3">
                  <div className="mono-caps text-[8px] text-primary">{row.outcome}</div>
                  <p className="mt-1 text-muted-foreground">{row.reason}</p>
                  {row.reason_code && (
                    <p className="mt-1 font-mono text-[8px] text-faint">{row.reason_code}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
