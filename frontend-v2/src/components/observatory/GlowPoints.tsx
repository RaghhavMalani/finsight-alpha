import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import type { PointCloud } from "./bundles";

/** `nodes` names the first vertices for the read-only verification probe. */
export function GlowPoints({
  cloud,
  nodes,
}: {
  cloud: PointCloud;
  nodes?: { id: number; label: string }[];
}) {
  useEffect(() => () => cloud.dispose(), [cloud]);
  useFrame(({ gl, size, camera }) => {
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 38;
    // World-unit sprite size: pixels per world unit at depth 1.
    cloud.material.uniforms.uScale.value =
      (gl.getPixelRatio() * (size.height / 2)) / Math.tan((fov * Math.PI) / 360);
  });
  return (
    <points
      geometry={cloud.geometry}
      material={cloud.material}
      frustumCulled={false}
      userData={{ modelNodes: nodes ?? [] }}
    />
  );
}
