import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { DataWorkspace } from "@/data-organ/DataWorkspace";
import { normalizeTicker } from "@/markets/contracts";
import { ForgeShell } from "@/app/shell/ForgeShell";
export const Route = createFileRoute("/data")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    ticker: normalizeTicker(String(search.ticker ?? "")) ?? undefined,
    section: ["health", "revisions", "lineage", "costs", "issues"].includes(String(search.section))
      ? String(search.section)
      : undefined,
    country: ["ALL", "US", "INDIA"].includes(String(search.country))
      ? String(search.country)
      : "ALL",
    source:
      typeof search.source === "string" && /^[a-zA-Z0-9:-]{1,80}$/.test(search.source)
        ? search.source
        : undefined,
    cutoff:
      typeof search.cutoff === "string" && /^202[0-5]-12-31$/.test(search.cutoff)
        ? search.cutoff
        : undefined,
  }),
  component: () => (
    <ForgeShell>
      <DataWorkspace />
    </ForgeShell>
  ),
});
