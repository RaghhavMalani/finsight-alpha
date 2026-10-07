import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loading } from "@/markets/ui";

const OptionsScreen = lazy(() => import("@/markets/OptionsScreen"));

export const Route = createFileRoute("/markets/options")({
  head: () => ({ meta: [{ title: "Options · Markets — FinSight" }] }),
  component: () => (
    <Suspense fallback={<Loading label="Options" />}>
      <OptionsScreen />
    </Suspense>
  ),
});
