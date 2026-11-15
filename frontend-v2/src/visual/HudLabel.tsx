import type { ReactNode } from "react";
import type { ColorName } from "./tokens";
import "./visual.css";

/** A thin mono key over its value, the unit of every HUD readout. No box, no border. */
export function HudLabel({
  k,
  children,
  tone,
  wide,
}: {
  k: ReactNode;
  children: ReactNode;
  tone?: ColorName;
  wide?: boolean;
}) {
  return (
    <div className={`vx-hud ${wide ? "vx-hud-wide" : ""}`}>
      <span className="vx-hud-k">{k}</span>
      <span className="vx-hud-v" style={tone ? { color: `var(--vx-${tone})` } : undefined}>
        {children}
      </span>
    </div>
  );
}

/** A section kicker: spaced mono capitals with a short glowing rule. */
export function HudKicker({ children, tone = "cyan" }: { children: ReactNode; tone?: ColorName }) {
  return (
    <div className="vx-kicker" style={{ color: `var(--vx-${tone})` }}>
      <i aria-hidden="true" />
      {children}
    </div>
  );
}
