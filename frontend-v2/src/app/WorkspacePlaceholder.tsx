import { ForgeShell } from "./shell/ForgeShell";
import { WORKSPACES, type WorkspaceId } from "./workspaces";
export function WorkspacePlaceholder({ workspace }: { workspace: WorkspaceId }) {
  const item = WORKSPACES.find((w) => w.id === workspace);
  return (
    <ForgeShell>
      <p className="text-sm text-muted-foreground" data-placeholder={workspace}>
        {item && "future" in item ? item.future : "No published content for this workspace."}
      </p>
    </ForgeShell>
  );
}
