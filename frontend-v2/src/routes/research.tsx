import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePlaceholder } from "@/app/WorkspacePlaceholder";
export const Route = createFileRoute("/research")({
  component: () => <WorkspacePlaceholder workspace="research" />,
});
