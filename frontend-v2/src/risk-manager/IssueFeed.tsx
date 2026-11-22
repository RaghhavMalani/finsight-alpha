import { partition, type Issue } from "./contracts";
import { sortIssues, displayText, tone } from "./filters";
import type { RiskBundle } from "./client";
import { issueOrigin, issuesOrigin, RiskCopy, RiskId, RiskNum, RiskTime } from "./prov";
export function IssueFeed({
  bundle,
  issues,
  selected,
  onSelect,
}: {
  bundle: RiskBundle;
  issues: Issue[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = sortIssues(issues);
  return (
    <section
      aria-label="Risk issue feed"
      data-risk-feed
      className="min-w-0 border border-divider bg-background"
    >
      <div className="mono-caps flex items-center justify-between border-b border-divider bg-raised px-4 py-3 text-[10px]">
        <span>ISSUE FEED</span>
        <span className="text-faint">
          <RiskNum
            o={issuesOrigin(bundle, "count of retained Issues matching the reader's filters")}
            v={rows.length}
            label="Issues in view"
            inert
          />{" "}
          IN VIEW · READ ONLY
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="mono-caps border-b border-divider bg-raised/40 text-[8px] text-faint">
            <tr>
              <th scope="col" className="px-3 py-3">
                Severity
              </th>
              <th scope="col" className="px-3">
                Subject / Finding
              </th>
              <th scope="col" className="hidden px-3 xl:table-cell">
                First seen
              </th>
              <th scope="col" className="px-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr
                key={issue.issue_id}
                className={
                  selected === issue.issue_id
                    ? "border-b border-divider bg-primary/5"
                    : "border-b border-divider hover:bg-raised/60"
                }
              >
                <td className={"px-3 py-3 align-top font-mono text-[9px] " + tone(issue.severity)}>
                  {issue.severity}
                </td>
                <td className="min-w-[230px] px-3 py-3">
                  <button
                    onClick={() => onSelect(issue.issue_id)}
                    data-testid="risk-issue-select"
                    aria-pressed={selected === issue.issue_id}
                    className="w-full text-left font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <RiskCopy>{displayText(issue.title)}</RiskCopy>
                  </button>
                  <div className="mono-caps mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[8px] text-faint">
                    <span>{issue.category.replaceAll("_", " ")}</span>
                    <span>
                      · <RiskId>{issue.scope.subject_id}</RiskId>
                    </span>
                    <span>· {issue.country}</span>
                    <span>· {issue.evidence_class}</span>
                    <span>· {issue.currency}</span>
                  </div>
                  <div className="mt-1 text-[9px] text-muted-foreground">
                    Evidence:{" "}
                    <time title={issue.evidence_at ?? "No measurement"}>
                      <RiskTime
                        o={issueOrigin(bundle, issue, "evidence_at")}
                        v={issue.evidence_at}
                        label="Evidence at"
                      />
                    </time>
                  </div>
                </td>
                <td className="hidden px-3 align-top font-mono text-[9px] text-muted-foreground xl:table-cell">
                  <time title={issue.first_seen_at}>
                    <RiskTime
                      o={issueOrigin(bundle, issue, "first_seen_at")}
                      v={issue.first_seen_at}
                      label="First seen"
                    />
                  </time>
                </td>
                <td className="px-3 align-top font-mono text-[8px]">
                  <span>{issue.status}</span>
                  <div className="mt-1 text-faint">{partition(issue).replaceAll("_", " ")}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="p-6 text-sm text-muted-foreground">
          No findings in this filter. Check coverage before interpreting this as a clear assessment.
        </p>
      )}
    </section>
  );
}
