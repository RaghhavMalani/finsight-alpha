import { createFileRoute } from "@tanstack/react-router";
import { ArtifactIndex } from "@/forge/artifacts/ArtifactIndex";

export const Route = createFileRoute("/artifacts")({
  head: () => ({
    meta: [{ title: "Artifacts — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  component: ArtifactIndex,
});
