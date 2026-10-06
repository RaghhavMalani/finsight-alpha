import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import type { LineBundle } from "./bundles";

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
