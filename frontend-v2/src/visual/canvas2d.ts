import { COLOR, type ColorName } from "./tokens";

/**
 * 2D canvas versions of the glow primitives, for browsers without WebGL. Additive
 * ("lighter") compositing on black gives the same light-on-darkness reading as the bloom
 * pass; there is no animation here, only the recorded state at the current replay step.
 */
export function clearVoid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = COLOR.void;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
}

export function rgba(name: ColorName, alpha: number) {
  const n = parseInt(COLOR[name].slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/** A quadratic glow curve: a wide faint stroke under a thin bright one. */
export function glowCurve(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  c: [number, number],
  b: [number, number],
  color: ColorName,
  alpha: number,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  ctx.lineWidth = width * 4;
  ctx.strokeStyle = rgba(color, alpha * 0.18);
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.stroke();
}

/** A glowing node: radial halo plus hot core, or a hollow ring for empty states. */
export function glowNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: ColorName,
  alpha: number,
  ring = false,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, rgba(color, ring ? 0.1 * alpha : alpha));
  g.addColorStop(0.3, rgba(color, 0.35 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
