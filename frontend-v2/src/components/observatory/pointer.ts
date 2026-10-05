import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Camera, type Object3D } from "three";
import { PANEL } from "./SceneFrame";

/** Pointer position in canvas pixels, tracked outside React. */
export function useCanvasPointer() {
  const gl = useThree((s) => s.gl);
  const pointer = useRef({ x: 0, y: 0, inside: false });
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true };
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl]);
  return pointer;
}

const tmp = new Vector3();
/** Nearest anchor within 18px of the pointer, in screen space (cheaper and steadier than rays). */
export function pickNearest(
  pointer: { x: number; y: number; inside: boolean },
  anchors: Iterable<[id: number, local: Vector3]>,
  group: Object3D,
  camera: Camera,
  width: number,
  height: number,
) {
  if (!pointer.inside) return null;
  let best: { id: number; x: number; y: number } | null = null,
    bestD = 18 * 18;
  for (const [id, local] of anchors) {
    tmp.copy(local);
    group.localToWorld(tmp);
    tmp.project(camera);
    if (tmp.z > 1) continue;
    const x = (tmp.x * 0.5 + 0.5) * width,
      y = (-tmp.y * 0.5 + 0.5) * height,
      d = (x - pointer.x) ** 2 + (y - pointer.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { id, x, y };
    }
  }
  return best;
}

/** Show `html` next to (x, y), flipping left if it would run under the docked readout. */
export function showTip(
  tip: HTMLElement | null,
  html: string | null,
  x: number,
  y: number,
  width: number,
) {
  if (!tip) return;
  if (html == null) {
    tip.style.opacity = "0";
    return;
  }
  if (tip.dataset.html !== html) {
    tip.innerHTML = html;
    tip.dataset.html = html;
  }
  tip.style.opacity = "1";
  const panel = width > 900 ? PANEL : 0,
    tw = tip.offsetWidth;
  const left = x + 16 + tw > width - panel ? x - 16 - tw : x + 16;
  tip.style.transform = `translate(${left.toFixed(1)}px,${(y - 10).toFixed(1)}px)`;
}
