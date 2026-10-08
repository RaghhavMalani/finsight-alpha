import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePlaceholder } from "@/app/WorkspacePlaceholder";
export const Route = createFileRoute("/data")({
  component: () => <WorkspacePlaceholder workspace="data" />,
});
