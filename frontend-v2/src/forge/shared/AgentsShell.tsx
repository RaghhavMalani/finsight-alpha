import type { ReactNode } from "react";
import { ForgeShell } from "@/app/shell/ForgeShell";
import { useDataMode } from "@/replay/mode";
import "./agents.css";

export function AgentsShell({
  children,
  evidence = "real-api",
}: {
  children: ReactNode;
  evidence?: "real-api" | "synthetic" | "worlds" | "catalog";
}) {
  const mode = useDataMode();
  const label = {
    "real-api": "Real API execution · synthetic research tasks",
    synthetic: "Synthetic reference experiment · not market evidence",
    worlds: "Synthetic task worlds · standalone manifests unavailable",
    catalog: "Artifact catalog · real API runs and synthetic reference experiments",
  }[evidence];
  return (
    <ForgeShell>
      <div className="agents-page" data-evidence={evidence} data-transport={mode}>
        <aside className="agents-state" aria-label="Agents evidence boundary">
          <span className="agents-transport">
            {mode === "replay" ? "Replay · recorded artifacts" : "Local Live API · frozen records"}
          </span>
          <span>{label}</span>
          <span className="agents-muted">Read only · no model execution</span>
        </aside>
        {children}
      </div>
    </ForgeShell>
  );
}
