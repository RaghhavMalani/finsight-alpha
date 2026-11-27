// Forge v2 (U4): shared prefers-reduced-motion state. New in v2; no v1 counterpart.
import { useEffect, useState } from "react";

/** True when the reader asks for reduced motion. Starts true so nothing animates before it is known. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
