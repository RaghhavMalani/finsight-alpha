import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, QuadraticBezierCurve3, Vector3 } from "three";
import { PulseMaterial } from "./PulseMaterial";
import type { Curve } from "./types";

/** One batched geometry. Only model-frame changes rebuild it; animation/hover are uniforms. */
export function GlowCurves({
  curves,
  hover,
  reduced,
  group = -1,
  stage = 100,
  head = 0,
  ribbons = false,
}: {
  curves: Curve[];
  hover: number | null;
  reduced: boolean;
  group?: number;
  stage?: number;
  head?: number;
  ribbons?: boolean;
}) {
  const material = useMemo(() => new PulseMaterial(), []);
  const geometry = useMemo(() => {
    const positions: number[] = [],
      t: number[] = [],
      weights: number[] = [],
      colors: number[] = [],
      nodes: number[] = [],
      steps: number[] = [],
      offsets: number[] = [];
    const emit = (p: Vector3, progress: number, c: Curve, color: Color, offset: Vector3) => {
      positions.push(p.x, p.y, p.z);
      t.push(progress);
      weights.push(c.weight);
      colors.push(color.r, color.g, color.b);
      nodes.push(c.from, c.to);
      steps.push(c.group ?? 0, c.stage ?? 0);
      offsets.push(offset.x, offset.y, offset.z);
    };
    const zero = new Vector3();
    curves.forEach((c) => {
      const path = new QuadraticBezierCurve3(
        new Vector3(...c.start),
        new Vector3(...c.control),
        new Vector3(...c.end),
      );
      const points = path.getPoints(18),
        color = new Color(c.color);
      for (let i = 0; i < 18; i++) {
        if (ribbons) {
          const normal = points[i + 1]
            .clone()
            .sub(points[i])
            .cross(new Vector3(0, 0, 1))
            .normalize()
            .multiplyScalar(0.006 + c.weight * 0.035);
          const back = normal.clone().negate();
          emit(points[i], i / 18, c, color, normal);
          emit(points[i], i / 18, c, color, back);
          emit(points[i + 1], (i + 1) / 18, c, color, normal);
          emit(points[i + 1], (i + 1) / 18, c, color, normal);
          emit(points[i], i / 18, c, color, back);
          emit(points[i + 1], (i + 1) / 18, c, color, back);
        } else {
          emit(points[i], i / 18, c, color, zero);
          emit(points[i + 1], (i + 1) / 18, c, color, zero);
        }
      }
    });
    const g = new BufferGeometry();
    for (const [key, data, size] of [
      ["position", positions, 3],
      ["aT", t, 1],
      ["aWeight", weights, 1],
      ["aColor", colors, 3],
      ["aNodes", nodes, 2],
      ["aStep", steps, 2],
      ["aOffset", offsets, 3],
    ] as const)
      g.setAttribute(key, new BufferAttribute(new Float32Array(data), size));
    g.computeBoundingSphere();
    return g;
  }, [curves, ribbons]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uHover.value = hover ?? -1;
    material.uniforms.uMotion.value = reduced ? 0 : 1;
    material.uniforms.uHead.value = head;
    material.uniforms.uGroup.value = group;
    material.uniforms.uStage.value = stage;
    // Normalize additive radiance by the actual group density; retain relative model weights.
    material.uniforms.uGain.value = Math.min(1, 1000 / Math.max(1, curves.length));
  });
  return ribbons ? (
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  ) : (
    <lineSegments geometry={geometry} material={material} frustumCulled={false} />
  );
}
