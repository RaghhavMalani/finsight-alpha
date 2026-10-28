import type { ReactNode } from "react";
import { TerminalShell } from "../app/terminal/TerminalShell";
import { loadFactorReadManifest } from "./manifest";

/** Factors keeps its checked, bounded manifest reader inside the shared shell. */
export function FactorsShell({
  children,
  bleed = false,
}: {
  children: ReactNode;
  bleed?: boolean;
}) {
  return (
    <TerminalShell bleed={bleed} loadManifest={loadFactorReadManifest}>
      {children}
    </TerminalShell>
  );
}
