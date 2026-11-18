/**
 * The research graph has one look: Neural Bloom, whose radius encodes each trial's t.
 * Older ?look= values (depth, constellation) fall back to it.
 */
export const LOOKS = ["bloom"] as const;
export type Look = (typeof LOOKS)[number];
export const DEFAULT_LOOK: Look = "bloom";
export const LOOK_LABEL: Record<Look, string> = { bloom: "Neural bloom" };
export const isLook = (v: unknown): v is Look => LOOKS.includes(v as Look);
