import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_LOOK, isLook, type Look } from "@/research/looks";

// The workspace (and three.js inside it) loads lazily; this route chunk stays small.
const ResearchPage = lazy(() => import("@/research/ResearchPage"));

export const Route = createFileRoute("/research")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { look: Look; renderer?: "2d"; q?: string } => {
    // A question suggested elsewhere (F1 Command) travels as ?q=; it is shown, never run.
    const q =
      typeof search.q === "string"
        ? Array.from(search.q.replace(/[^\P{C}]+/gu, " ").trim())
            .slice(0, 400) // by code point, so no lone surrogate is left
            .join("")
        : "";
    return {
      look: isLook(search.look) ? search.look : DEFAULT_LOOK,
      ...(search.renderer === "2d" ? { renderer: "2d" as const } : {}),
      ...(q ? { q } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Research — FinSight" },
      {
        name: "description",
        content:
          "Replay of the sealed Research OS study as a living evidence graph: every number links to its frozen source file and SHA-256.",
      },
    ],
  }),
  component: ResearchRoute,
});

function ResearchRoute() {
  const search = Route.useSearch();
  return (
    <Suspense fallback={<div className="p-8 font-mono text-faint">LOADING RESEARCH</div>}>
      <ResearchPage look={search.look} renderer={search.renderer ?? "auto"} question={search.q} />
    </Suspense>
  );
}
