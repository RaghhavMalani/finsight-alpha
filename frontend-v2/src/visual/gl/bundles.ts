import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";
import { GlowPointMaterial, PulseMaterial } from "./PulseMaterial";

export function dynamicAttribute(geometry: BufferGeometry, name: string, size: number, n: number) {
  const attribute = new BufferAttribute(new Float32Array(n * size), size);
  attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
}

/** A preallocated LineSegments geometry the scene rewrites in place, outside React. */
export function createLineBundle(vertices: number, speed: number) {
  const geometry = new BufferGeometry();
  const material = new PulseMaterial(speed);
  const attributes = {
    position: dynamicAttribute(geometry, "position", 3, vertices),
    t: dynamicAttribute(geometry, "aT", 1, vertices),
    color: dynamicAttribute(geometry, "aColor", 3, vertices),
    w: dynamicAttribute(geometry, "aW", 1, vertices),
    key: dynamicAttribute(geometry, "aKey", 2, vertices),
    layer: dynamicAttribute(geometry, "aLayer", 1, vertices),
    phase: dynamicAttribute(geometry, "aPhase", 1, vertices),
  };
  return {
    geometry,
    material,
    ...attributes,
    vertices,
    /** Upload everything the scene wrote since the last commit. */
    commit() {
      for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type LineBundle = ReturnType<typeof createLineBundle>;

/** Preallocated point sprites the scene rewrites in place: clouds, state cores, feature nodes. */
export function createPointCloud(points: number) {
  const geometry = new BufferGeometry();
  const material = new GlowPointMaterial();
  const attributes = {
    position: dynamicAttribute(geometry, "position", 3, points),
    color: dynamicAttribute(geometry, "aColor", 3, points),
    size: dynamicAttribute(geometry, "aSize", 1, points),
    alpha: dynamicAttribute(geometry, "aAlpha", 1, points),
    key: dynamicAttribute(geometry, "aKey", 1, points),
    layer: dynamicAttribute(geometry, "aLayer", 1, points),
  };
  return {
    geometry,
    material,
    ...attributes,
    points,
    commit() {
      for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type PointCloud = ReturnType<typeof createPointCloud>;
