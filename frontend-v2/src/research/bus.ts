/**
 * The mutable channel between the DOM HUD and whichever renderer is mounted (WebGL or 2D).
 * Per-frame values live here instead of React state so the page never re-renders per frame.
 */
export class SceneBus {
  /** Replay clock in seconds. */
  t = 0;
  /** Events applied. */
  step = 0;
  /** Node index under pointer or keyboard focus; -1 for none. */
  focus = -1;
  /** Node whose HUD is open; -1 for none. */
  selected = -1;
  /** Bumped when something other than the clock changes what must be painted. */
  version = 0;
  reduced = false;
  /** Screen positions written by the renderer: x, y, visible per node and per label. */
  onProject: ((nodes: Float32Array, labels: Float32Array) => void) | null = null;
  touch() {
    this.version++;
  }
}

export type SceneMetrics = {
  median: number;
  p5: number;
  frames: number;
  nodes: number;
  edges: number;
  particles: number;
  renderer: string;
};
declare global {
  interface Window {
    __researchMetrics?: SceneMetrics;
    /** Verifier-only scale probe; never set by the product. */
    __researchSynthetic?: { nodes: number };
  }
}
