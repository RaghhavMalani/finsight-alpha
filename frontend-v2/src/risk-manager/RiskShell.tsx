import type { ReactNode } from "react";
import { TerminalShell } from "@/app/terminal/TerminalShell";
import { loadRiskReadManifest } from "./manifest";

/** Risk navigation starts with the unchanged checked, bounded Risk manifest. */
export function RiskShell({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  return (
    <TerminalShell bleed={bleed} loadManifest={loadRiskReadManifest}>
      {children}
    </TerminalShell>
  );
}
