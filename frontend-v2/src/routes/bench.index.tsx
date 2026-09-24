import { createFileRoute } from "@tanstack/react-router";
import { BenchIndex } from "@/forge/bench/BenchIndex";

export const Route = createFileRoute("/bench/")({
  head: () => ({
    meta: [{ title: "Bench — FinSight Forge" }, { name: "robots", content: "noindex" }],
  }),
  component: BenchIndex,
});
