// Forge v2 (U4): shared media-query state. New in v2; no v1 counterpart.
import { useEffect, useState } from "react";

/** Whether a media query matches; `initial` until it is known (no window during render). */
export function useMediaQuery(query: string, initial: boolean) {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** True when the reader asks for reduced motion. Starts true so nothing animates before it is known. */
export function useReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)", true);
}
