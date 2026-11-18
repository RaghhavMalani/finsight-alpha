import { Link, useRouterState } from "@tanstack/react-router";
import { activeWorkspace, SUBNAV, WORKSPACES } from "@/app/workspaces";

/**
 * Thin mono section tabs for the active workspace. The Forge shell already draws the Forge
 * tabs itself, so `skipAgents` avoids a second row there.
 */
export function WorkspaceSubnav({
  search,
  linkFor,
  skipAgents = false,
  inline = false,
}: {
  search?: Record<string, unknown>;
  /** Typed destination for a tab path; falls back to the path with `search`. */
  linkFor?: (to: string) => { to: string; search?: unknown } | null;
  skipAgents?: boolean;
  inline?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const workspace = activeWorkspace(pathname);
  const tabs = SUBNAV[workspace];
  if (!tabs || (skipAgents && workspace === "agents")) return null;
  const label = WORKSPACES.find((w) => w.id === workspace)!.label;
  return (
    <nav
      className={`shell-subnav${inline ? " shell-subnav-inline" : ""}`}
      aria-label={`${label[0]}${label.slice(1).toLowerCase()} sections`}
      data-subnav={workspace}
    >
      {tabs.map(([text, to]) => {
        const next = linkFor?.(to) ?? { to, search };
        return (
          <Link
            key={to}
            to={next.to as never}
            search={next.search as never}
            aria-current={pathname === to || pathname.startsWith(`${to}/`) ? "page" : undefined}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
