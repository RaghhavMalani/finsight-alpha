import { createFileRoute } from "@tanstack/react-router";
import { WorldIndex } from "@/forge/worlds/WorldIndex";

export const Route = createFileRoute("/worlds")({
  head: () => ({
    meta: [{ title: "Worlds — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  component: WorldIndex,
});
