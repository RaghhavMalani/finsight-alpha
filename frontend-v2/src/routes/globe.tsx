import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const GlobePage = lazy(() => import("@/components/globe/GlobePage"));

export const Route = createFileRoute("/globe")({
  head: () => ({
    meta: [
      { title: "God's Eye — FinSight" },
      {
        name: "description",
        content:
          "Live USGS earthquakes and CelesTrak satellites over market hubs, computed into the neural net's Geo events inputs.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="p-8 font-mono text-faint">LOADING GOD'S EYE</div>}>
      <GlobePage />
    </Suspense>
  ),
});
