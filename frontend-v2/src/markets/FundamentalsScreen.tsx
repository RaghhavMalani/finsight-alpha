import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { fiscalYears, LINE_ITEMS, type FactPoint, type Fundamentals } from "./contracts";
import { compactMoney, money, num, pct } from "./format";
import { useFundamentals } from "./queries";
import { Chip, Kpis, Loading, Note, Panel, Unavailable } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);
function yearsAgo(n: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
}

export default function FundamentalsScreen() {
  const { ticker } = useSearch({ from: "/markets" });
  const [asOf, setAsOf] = useState(today);
  const f = useFundamentals(ticker, asOf);
  return (
    <div className="mk-grid">
      <Panel
        title={`Fundamentals · ${ticker}`}
        className="mk-span"
        meta={<Chip>SEC EDGAR XBRL · 10-K annual facts</Chip>}
      >
        <div className="mk-controls">
          <label className="mk-field mk-field-inline">
            <span>As of</span>
            <input
              type="date"
              value={asOf}
              max={today()}
              min="2009-01-01"
              onChange={(e) => e.target.value && setAsOf(e.target.value)}
            />
          </label>
          {[
            ["Today", today()],
            ["1 year ago", yearsAgo(1)],
            ["3 years ago", yearsAgo(3)],
            ["5 years ago", yearsAgo(5)],
          ].map(([label, date]) => (
            <button
              key={label}
              type="button"
              className="mk-ghost"
              aria-pressed={asOf === date}
              onClick={() => setAsOf(date)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mk-banner">
          Only filings dated on or before <b>{asOf}</b> are used. Every value below is what was
          public on that date, including the restatements filed by then and none filed after.
        </p>
        {f.isPending ? (
          <Loading label="filings" />
        ) : f.isError ? (
          <Unavailable what="Fundamentals" error={f.error} retry={() => void f.refetch()} />
        ) : (
          <Statements f={f.data} />
        )}
      </Panel>
    </div>
  );
}

function Cell({ p, eps }: { p: FactPoint | undefined; eps: boolean }) {
  if (!p) return <td>—</td>;
  return (
    <td
      title={`Period end ${p.end} · filed ${p.filed ?? "unknown"} · ${p.form ?? ""} ${p.accn ?? ""}`}
    >
      {eps ? money(p.val) : compactMoney(p.val)}
    </td>
  );
}

function Statements({ f }: { f: Fundamentals }) {
  const years = fiscalYears(f, 5);
  if (!years.length)
    return (
      <p className="mk-line">
        No annual 10-K facts for {f.ticker} were filed on or before {f.as_of}.
      </p>
    );
  const at = (key: (typeof LINE_ITEMS)[number][0], year: number) =>
    f.history[key].find((p) => p.year === year);
  const ends = new Map(years.map((y) => [y, at("revenue", y)?.end ?? at("assets", y)?.end]));
  const r = f.ratios;
  return (
    <>
      <p className="mk-line">
        <b>{f.name ?? f.ticker}</b> · latest fiscal year FY{f.latest_year ?? "—"} · newest filing
        used {f.latest_filed ?? "—"}
      </p>
      <Kpis
        items={[
          { label: "Revenue growth (YoY)", value: pct(f.revenue_growth, 1, true) },
          { label: "Gross margin", value: pct(r.gross_margin, 1) },
          { label: "Operating margin", value: pct(r.operating_margin, 1) },
          { label: "Net margin", value: pct(r.net_margin, 1) },
          { label: "ROE", value: pct(r.roe, 1) },
          { label: "ROA", value: pct(r.roa, 1) },
          { label: "Current ratio", value: num(r.current_ratio) },
          { label: "Liabilities / equity", value: num(r.debt_to_equity) },
        ]}
      />
      <div className="mk-table-wrap">
        <table className="mk-table">
          <caption className="sr-only">
            Annual line items by fiscal year; hover a value for its filing
          </caption>
          <thead>
            <tr>
              <th scope="col">Line item</th>
              {years.map((y) => (
                <th key={y} scope="col">
                  FY{y}
                  <small>{ends.get(y) ? `ends ${ends.get(y)}` : ""}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINE_ITEMS.map(([key, label]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                {years.map((y) => (
                  <Cell key={y} p={at(key, y)} eps={key === "eps_diluted"} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Vintages points={f.history.revenue} />
      <Note>
        Ratios divide numbers from the same fiscal year only; a dash means one side was not
        reported. Liabilities / equity uses total liabilities, not only debt.
      </Note>
    </>
  );
}

/** Which filing each revenue figure comes from: the vintage a reader had on the as-of date. */
function Vintages({ points }: { points: FactPoint[] }) {
  if (!points.length) return null;
  return (
    <details className="mk-details">
      <summary>Revenue by filing (vintage)</summary>
      <div className="mk-table-wrap">
        <table className="mk-table">
          <thead>
            <tr>
              <th scope="col">Fiscal year</th>
              <th scope="col">Period end</th>
              <th scope="col">Value</th>
              <th scope="col">Filed</th>
              <th scope="col">Form</th>
              <th scope="col">Accession</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.end}>
                <th scope="row">FY{p.year}</th>
                <td>{p.end}</td>
                <td>{compactMoney(p.val)}</td>
                <td>{p.filed ?? "—"}</td>
                <td>{p.form ?? "—"}</td>
                <td>{p.accn ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
