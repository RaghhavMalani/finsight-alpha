import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { FactorsWorkspace } from "@/factors/FactorsWorkspace";
import { CUTOFFS } from "@/factors/contracts";
export const Route = createFileRoute("/factors")({
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    ticker: typeof s.ticker === "string" ? s.ticker.toUpperCase() : undefined,
    country: typeof s.country === "string" ? s.country : s.ticker === "IN-MKT" ? "INDIA" : "US",
    at: typeof s.at === "string" ? s.at : CUTOFFS.at(-1)!,
    panel: ["catalog", "audit", "ledger"].includes(String(s.panel)) ? String(s.panel) : "catalog",
  }),
  component: () => (
    <ForgeShell>
      <FactorsWorkspace />
    </ForgeShell>
  ),
});
