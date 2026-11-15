/** Visual directions for the research graph, kept tiny so the route chunk can import it. */
export const LOOKS = ["bloom", "depth", "constellation"] as const;
export type Look = (typeof LOOKS)[number];
export const DEFAULT_LOOK: Look = "bloom";
export const LOOK_LABEL: Record<Look, string> = {
  bloom: "Neural bloom",
  depth: "Depth field",
  constellation: "Constellation",
};
export const isLook = (v: unknown): v is Look => LOOKS.includes(v as Look);
