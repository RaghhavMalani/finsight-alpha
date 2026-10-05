import { useLayoutEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { Color, InstancedMesh, Object3D } from "three";
import type { Curve, SceneNode } from "./types";

export function NodeCloud({
  nodes,
  hover,
  onHover,
  extraValues = [],
  connections,
}: {
  nodes: SceneNode[];
  hover: number | null;
  onHover: (id: number | null) => void;
  extraValues?: string[];
  connections: Curve[];
}) {
  const mesh = useRef<InstancedMesh>(null);
  const neighbors = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const curve of connections) {
      if (curve.weight <= 0) continue;
      for (const [from, to] of [
        [curve.from, curve.to],
        [curve.to, curve.from],
      ]) {
        if (!map.has(from)) map.set(from, new Set());
        map.get(from)!.add(to);
      }
    }
    return map;
  }, [connections]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new Object3D();
    nodes.forEach((node, i) => {
      object.position.set(...node.position);
      object.scale.setScalar(node.radius);
      object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [nodes]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    nodes.forEach((node, i) => {
      const connected = hover === null || node.id === hover || neighbors.get(hover)?.has(node.id);
      mesh.current!.setColorAt(i, new Color(node.color).multiplyScalar(connected ? 1.2 : 0.18));
    });
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [nodes, neighbors, hover]);
  const active = nodes.find((n) => n.id === hover);
  return (
    <>
      <instancedMesh
        ref={mesh}
        userData={{ modelNodes: nodes }}
        args={[undefined, undefined, nodes.length]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(e.instanceId == null ? null : nodes[e.instanceId].id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {active && (
        <Html position={active.position} center style={{ pointerEvents: "none" }}>
          <div className="obs-tooltip" role="tooltip">
            <strong style={{ color: active.color }}>{active.label}</strong>
            {[...active.values, ...extraValues].map((v, i) => (
              <div key={i}>{v}</div>
            ))}
          </div>
        </Html>
      )}
    </>
  );
}
