import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePlaceholder } from "@/app/WorkspacePlaceholder";
export const Route = createFileRoute("/factors")({
  component: () => <WorkspacePlaceholder workspace="factors" />,
});
