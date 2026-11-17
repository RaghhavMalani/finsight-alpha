import { ForgeShell } from "./shell/ForgeShell";
import { WorkspaceSubnav } from "./shell/WorkspaceSubnav";
import { SECTIONS, type SectionId } from "./workspaces";
export function WorkspacePlaceholder({ workspace }: { workspace: SectionId }) {
  const item = SECTIONS.find((w) => w.id === workspace);
  return (
    <ForgeShell>
      <WorkspaceSubnav skipAgents inline />
      <p className="text-sm text-muted-foreground" data-placeholder={workspace}>
        {item && "future" in item ? item.future : "No published content for this workspace."}
      </p>
    </ForgeShell>
  );
}
