import { useEffect, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Camera, type Object3D } from "three";

/**
 * A label anchored to a point in a scene group. Priority decides who keeps the space:
 * pri ≥ 3 (states, folds) is always shown and is nudged a line up or down to clear a collision;
 * pri 2 (default) and below give way.
 */
export type LabelSpec = {
  pos: Vector3;
  html: string;
  cls?: string;
  color?: string;
  dx?: number;
  dy?: number;
  align?: "left" | "right" | "center";
  pri?: number;
};
type Slot = HTMLDivElement & {
  _L?: LabelSpec | null;
  _html?: string;
  _cls?: string;
  _sized?: string;
  _w?: number;
  _h?: number;
  _nudge?: number;
};
type Rect = { x: number; y: number; w: number; h: number };

const NUDGES = [0, -1, 1, -2, 2];
const tmp = new Vector3();
const hits = (r: Rect, q: Rect) =>
  r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y;

/**
 * Pooled HTML labels projected from 3D each frame, with priority-based collision handling.
 * Elements matching `obstacles` (siblings of the root, such as the title overlay) are treated
 * as already placed, so labels move or give way instead of running under them.
 */
export class LabelLayer {
  private pool: Slot[] = [];
  constructor(
    private root: HTMLElement,
    private obstacles = "",
  ) {}

  set(list: LabelSpec[]) {
    while (this.pool.length < list.length) {
      const d = document.createElement("div") as Slot;
      d.className = "lb";
      this.root.appendChild(d);
      this.pool.push(d);
    }
    this.pool.forEach((d, i) => {
      const L = list[i];
      if (!L) {
        d.hidden = true;
        d._L = null;
        return;
      }
      d.hidden = false;
      d._L = L;
      if (d._html !== L.html) {
        d.innerHTML = L.html;
        d._html = L.html;
      }
      const cls = "lb " + (L.cls ?? "");
      if (d._cls !== cls) {
        d.className = cls;
        d._cls = cls;
      }
      if (L.color) d.style.color = L.color;
      else d.style.removeProperty("color");
    });
  }

  place(group: Object3D, camera: Camera, width: number, height: number) {
    const placed: Rect[] = [];
    if (this.obstacles && this.root.parentElement) {
      const origin = this.root.getBoundingClientRect();
      for (const el of this.root.parentElement.querySelectorAll<HTMLElement>(this.obstacles)) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height)
          placed.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
      }
    }
    const items: { d: Slot; L: LabelSpec; x: number; y: number }[] = [];
    for (const d of this.pool) {
      const L = d._L;
      if (!L) continue;
      tmp.copy(L.pos);
      group.localToWorld(tmp);
      tmp.project(camera);
      if (tmp.z > 1) {
        d.style.visibility = "hidden";
        continue;
      }
      const sized = `${d._cls}|${d._html}`;
      if (d._sized !== sized) {
        d._w = d.offsetWidth;
        d._h = d.offsetHeight;
        d._sized = sized;
      }
      items.push({
        d,
        L,
        x: (tmp.x * 0.5 + 0.5) * width + (L.dx ?? 0),
        y: (-tmp.y * 0.5 + 0.5) * height + (L.dy ?? 0),
      });
    }
    // Feature names on one column keep their order and never stack on each other.
    const feats = items.filter((it) => it.L.cls?.split(" ").includes("feat"));
    feats.sort((a, b) => a.y - b.y);
    for (let k = 1; k < feats.length; k++) feats[k].y = Math.max(feats[k].y, feats[k - 1].y + 15);
    items.sort((a, b) => (b.L.pri ?? 2) - (a.L.pri ?? 2));
    for (const { d, L, x, y } of items) {
      const w = d._w ?? 0,
        h = d._h ?? 0,
        pri = L.pri ?? 2;
      const ox = L.align === "right" ? -w : L.align === "left" ? 0 : -w / 2;
      const rect = (n: number): Rect => ({
        x: x + ox - 3,
        y: y - h / 2 - 2 + n * (h + 2),
        w: w + 6,
        h: h + 4,
      });
      // Try the previous nudge first so labels don't flicker between slots as the camera moves.
      const tries = pri >= 3 ? [d._nudge ?? 0, ...NUDGES] : [0];
      let nudge = tries.find((n) => !placed.some((q) => hits(rect(n), q)));
      if (nudge === undefined) {
        if (pri < 3) {
          d.style.visibility = "hidden";
          continue;
        }
        nudge = 0;
      }
      d._nudge = nudge;
      placed.push(rect(nudge));
      d.style.visibility = "visible";
      d.style.transform = `translate(${(x + ox).toFixed(1)}px,${(y - h / 2 + nudge * (h + 2)).toFixed(1)}px)`;
    }
  }

  dispose() {
    for (const d of this.pool) d.remove();
    this.pool = [];
  }
}

/** Keep a label layer showing `specs`, projected from `group` every frame. */
export function useProjectedLabels(
  labels: LabelLayer,
  specs: LabelSpec[],
  group: RefObject<Object3D | null>,
) {
  useEffect(() => labels.set(specs), [labels, specs]);
  useEffect(() => () => labels.set([]), [labels]);
  useFrame(({ camera, size }) => {
    if (group.current) labels.place(group.current, camera, size.width, size.height);
  });
}
