import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { WorkspaceSubnav } from "@/app/shell/WorkspaceSubnav";

const RegimeProduct = lazy(() =>
  import("@/dynamics/RegimeProduct").then((module) => ({ default: module.RegimeProduct })),
);

// Markets › Regimes: the market regime product on its own. /dynamics keeps the full lab (F5).
export const Route = createFileRoute("/regimes")({
  head: () => ({
    meta: [
      { title: "Regimes · Markets — FinSight" },
      {
        name: "description",
        content: "Point-in-time market regime product: now, replay and compare.",
      },
    ],
  }),
  component: RegimesRoute,
});

function RegimesRoute() {
  return (
    <ForgeShell>
      <WorkspaceSubnav inline />
      <Suspense fallback={<p className="font-mono text-sm text-faint">LOADING REGIMES</p>}>
        <RegimeProduct />
      </Suspense>
    </ForgeShell>
  );
}
