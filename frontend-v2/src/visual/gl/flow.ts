import { AdditiveBlending, BufferGeometry, ShaderMaterial } from "three";
import { dynamicAttribute } from "./bundles";

/**
 * Particles that travel along cubic Bézier paths, evaluated on the GPU. Each particle names
 * its path's four control points, a phase and an activity (0 hides it) and the clock time it stops (aUntil). The scene sets
 * activity only while the recorded state says something is flowing along that edge, and
 * drives uTime from the replay clock, so a paused replay holds every particle still.
 */
export class FlowMaterial extends ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uScale: { value: 400 } },
      vertexShader: `
        attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aP3;
        attribute vec3 aColor; attribute float aPhase; attribute float aActive; attribute float aSpeed; attribute float aUntil;
        uniform float uTime; uniform float uScale; uniform float uMotion;
        varying vec3 vColor; varying float vA;
        void main(){
          float t = fract(uTime * aSpeed + aPhase);
          float u = 1.0 - t;
          vec3 p = u*u*u*position + 3.0*u*u*t*aP1 + 3.0*u*t*t*aP2 + t*t*t*aP3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = aColor;
          vA = aActive * uMotion * sin(3.14159 * t) * (uTime < aUntil ? 1.0 : 0.0);
          gl_PointSize = max(1.0, 0.07 * uScale / (-mv.z)) * (vA > 0.0 ? 1.0 : 0.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vA;
        void main(){
          if (vA <= 0.0) discard;
          float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vColor * 1.6, pow(1.0 - d * 2.0, 2.0) * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
}

export function createFlowField(particles: number) {
  const geometry = new BufferGeometry();
  const material = new FlowMaterial();
  const attributes = {
    p0: dynamicAttribute(geometry, "position", 3, particles),
    p1: dynamicAttribute(geometry, "aP1", 3, particles),
    p2: dynamicAttribute(geometry, "aP2", 3, particles),
    p3: dynamicAttribute(geometry, "aP3", 3, particles),
    color: dynamicAttribute(geometry, "aColor", 3, particles),
    phase: dynamicAttribute(geometry, "aPhase", 1, particles),
    active: dynamicAttribute(geometry, "aActive", 1, particles),
    speed: dynamicAttribute(geometry, "aSpeed", 1, particles),
    until: dynamicAttribute(geometry, "aUntil", 1, particles),
  };
  return {
    geometry,
    material,
    ...attributes,
    particles,
    commit() {
      for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type FlowField = ReturnType<typeof createFlowField>;

/**
 * Evidence nodes: a hot core inside a soft halo, with an optional hollow ring for states
 * that are known but empty (unavailable). aPulse makes a running node breathe; aFlare is the
 * clock time of its last transition, which plays a single expanding ring and then rests.
 */
export class PulseNodeMaterial extends ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uScale: { value: 400 },
        uFocus: { value: -1 },
        uPulseHz: { value: 1.6 },
        uFlare: { value: 1.1 },
      },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aKey;
        attribute float aPulse; attribute float aFlare; attribute float aRing; attribute float aLift;
        uniform float uTime; uniform float uScale; uniform float uMotion; uniform float uFocus;
        uniform float uPulseHz; uniform float uFlare;
        varying vec3 vColor; varying float vA; varying float vRing; varying float vF; varying float vPx;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float since = uTime - aFlare;
          float f = (aFlare > -1.0 && since >= 0.0 && since < uFlare) ? 1.0 - since / uFlare : 0.0;
          f *= uMotion;
          float breathe = aPulse * uMotion * (0.5 + 0.5 * sin(uTime * 6.2832 * uPulseHz));
          float focus = uFocus < 0.0 ? 1.0 : (abs(aKey - uFocus) < 0.5 ? 1.35 : aLift);
          float size = aSize * (1.0 + 0.35 * breathe) * (1.0 + 2.6 * f);
          vColor = aColor;
          vA = aAlpha * focus * (1.0 + 0.6 * breathe);
          vRing = aRing; vF = f;
          gl_PointSize = max(2.0, size * uScale / (-mv.z));
          vPx = gl_PointSize;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vA; varying float vRing; varying float vF; varying float vPx;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float growth = 1.0 + 2.6 * vF;
          float r = d * growth;
          float core = r < 1.0 ? pow(1.0 - r, 2.4) : 0.0;
          float halo = r < 1.0 ? pow(1.0 - r, 1.2) * 0.35 : 0.0;
          float ringR = 0.62;
          float ring = vRing * exp(-pow((r - ringR) * 9.0, 2.0)) * 0.9;
          float fill = (1.0 - vRing) * (core + halo) + ring + vRing * halo * 0.25;
          float flareRing = vF * exp(-pow((d - (1.0 - vF)) * 7.0, 2.0)) * 1.2;
          float a = (fill + flareRing) * vA;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor * (1.0 + 0.8 * core), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
}

export function createPulseNodes(count: number) {
  const geometry = new BufferGeometry();
  const material = new PulseNodeMaterial();
  const attributes = {
    position: dynamicAttribute(geometry, "position", 3, count),
    color: dynamicAttribute(geometry, "aColor", 3, count),
    size: dynamicAttribute(geometry, "aSize", 1, count),
    alpha: dynamicAttribute(geometry, "aAlpha", 1, count),
    key: dynamicAttribute(geometry, "aKey", 1, count),
    pulse: dynamicAttribute(geometry, "aPulse", 1, count),
    flare: dynamicAttribute(geometry, "aFlare", 1, count),
    ring: dynamicAttribute(geometry, "aRing", 1, count),
    lift: dynamicAttribute(geometry, "aLift", 1, count),
  };
  return {
    geometry,
    material,
    ...attributes,
    count,
    commit() {
      for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type PulseNodes = ReturnType<typeof createPulseNodes>;
