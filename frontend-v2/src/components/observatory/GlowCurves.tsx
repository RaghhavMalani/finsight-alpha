import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, QuadraticBezierCurve3, Vector3 } from "three";
import { createLineBundle, type LineBundle } from "./bundles";
import type { Curve } from "./types";

/** One batched draw call per bundle. Model changes rewrite attributes; motion and hover are uniforms. */
export function GlowCurves({ bundle, reduced }: { bundle: LineBundle; reduced: boolean }) {
  useEffect(() => () => bundle.dispose(), [bundle]);
  useFrame(({ clock }) => {
    bundle.material.uniforms.uTime.value = clock.elapsedTime;
    bundle.material.uniforms.uMotion.value = reduced ? 0 : 1;
  });
  return (
    <lineSegments geometry={bundle.geometry} material={bundle.material} frustumCulled={false} />
  );
}

/** Fixed quadratic arcs drawn through a bundle. */
export function StaticCurves({
  curves,
  hover,
  reduced,
}: {
  curves: Curve[];
  hover: number | null;
  reduced: boolean;
}) {
  const bundle = useMemo(() => {
    const segments = 18,
      b = createLineBundle(curves.length * segments * 2, 0.14);
    let v = 0;
    for (const c of curves) {
      const path = new QuadraticBezierCurve3(
          new Vector3(...c.start),
          new Vector3(...c.control),
          new Vector3(...c.end),
        ),
        points = path.getPoints(segments),
        color = new Color(c.color);
      for (let i = 0; i < segments; i++)
        for (const k of [i, i + 1]) {
          b.position.setXYZ(v, points[k].x, points[k].y, points[k].z);
          b.t.setX(v, k / segments);
          b.color.setXYZ(v, color.r, color.g, color.b);
          b.w.setX(v, c.weight);
          b.key.setXY(v, c.from, c.to);
          v++;
        }
    }
    b.commit();
    return b;
  }, [curves]);
  useFrame(() => {
    bundle.material.uniforms.uHover.value = hover ?? -1;
    // Additive radiance scales with the number of arcs drawn, keeping relative weights.
    bundle.material.uniforms.uGain.value = Math.min(1, 1000 / Math.max(1, curves.length));
  });
  return <GlowCurves bundle={bundle} reduced={reduced} />;
}
