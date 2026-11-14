import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { FactorsShell } from "@/factors/FactorsShell";
import { FactorsWorkspace } from "@/factors/FactorsWorkspace";

// Preserve the wire selection. The shell validates it; checked evidence resolves workspace defaults.
export const Route = createFileRoute("/factors")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({ ...search }),
  component: () => (
    <FactorsShell>
      <FactorsWorkspace />
    </FactorsShell>
  ),
});
