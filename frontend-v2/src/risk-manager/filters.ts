import { partition, severityOrder, type Issue } from "./contracts.ts";
export type Filters = {
  view: string;
  category: string;
  severity: string;
  country: string;
  status: string;
  evidenceClass: string;
  query: string;
};
export function filterIssues(issues: Issue[], filter: Filters): Issue[] {
  const query = filter.query.toLowerCase();
  return issues.filter(
    (issue) =>
      partition(issue) === filter.view &&
      (filter.category === "ALL" || issue.category === filter.category) &&
      (filter.severity === "ALL" || issue.severity === filter.severity) &&
      (filter.country === "ALL" || issue.country === filter.country) &&
      (filter.status === "ALL" || issue.status === filter.status) &&
      (filter.evidenceClass === "ALL" || issue.evidence_class === filter.evidenceClass) &&
      [issue.title, issue.scope.subject_id, issue.reason_code, issue.rule_id]
        .join(" ")
        .toLowerCase()
        .includes(query),
  );
}
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      Date.parse(b.evidence_at ?? b.first_seen_at) - Date.parse(a.evidence_at ?? a.first_seen_at) ||
      a.issue_id.localeCompare(b.issue_id),
  );
}
/** Display correction only; original evidence bytes and identity remain unchanged. */
export function displayText(text: string): string {
  return text.replaceAll("Â·", "·");
}

export const tone = (severity: string) =>
  severity === "CRITICAL" || severity === "HIGH"
    ? "text-down"
    : severity === "MEDIUM"
      ? "text-primary"
      : "text-muted-foreground";
