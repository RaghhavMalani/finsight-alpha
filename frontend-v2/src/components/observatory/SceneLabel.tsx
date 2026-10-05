import type { ComponentProps } from "react";
import { Billboard, Text } from "@react-three/drei";
export function SceneLabel({ position, ...props }: ComponentProps<typeof Text>) {
  return (
    <Billboard position={position}>
      <Text {...props} />
    </Billboard>
  );
}
