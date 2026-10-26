import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { FactorsShell } from "@/factors/FactorsShell";
import { FactorsWorkspace } from "@/factors/FactorsWorkspace";
export const Route = createFileRoute("/factors")({
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    ticker: typeof s.ticker === "string" ? s.ticker.toUpperCase() : undefined,
    country: typeof s.country === "string" ? s.country : s.ticker === "IN-MKT" ? "INDIA" : "US",
    at: typeof s.at === "string" ? s.at : "2026-10-10T13:59:59.414508Z",
    panel: ["catalog", "audit", "ledger"].includes(String(s.panel)) ? String(s.panel) : "catalog",
  }),
  component: () => (
    <FactorsShell>
      <FactorsWorkspace />
    </FactorsShell>
  ),
});
