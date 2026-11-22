import "./visual.css";

export type Liveness = "fresh" | "stale" | "dead" | "off";

/**
 * Feed liveness at a glance. fresh: verified and current; stale: verified but past its
 * window; dead: no feed exists or it failed; off: not enabled in this build (not a fault). The dot never animates on its own; a state change re-keys
 * it, which plays one ring.
 */
export function LiveDot({ state, label }: { state: Liveness; label?: string }) {
  return (
    <span className="vx-live" data-live={state}>
      <i key={state} aria-hidden="true" />
      {label != null && <span>{label}</span>}
      <span className="vx-sr">{` (${state})`}</span>
    </span>
  );
}
