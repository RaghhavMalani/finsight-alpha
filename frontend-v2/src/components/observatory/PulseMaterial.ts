import { AdditiveBlending, ShaderMaterial } from "three";

/**
 * Additive glow for line bundles. Brightness comes from aW (alpha 0.02 + 0.26·w, so overdraw
 * stays below bloom's blow-out), a pulse travels along aT at uSpeed offset by aPhase, hover
 * keeps lines whose aKey pair touches uHover, and aLayer above uMaxLayer is not drawn.
 */
export class PulseMaterial extends ShaderMaterial {
  constructor(speed = 0.16) {
    super({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uHover: { value: -1 },
        uMaxLayer: { value: 99 },
        uGain: { value: 1 },
        uSpeed: { value: speed },
      },
      vertexShader: `
        attribute float aT; attribute vec3 aColor; attribute float aW;
        attribute vec2 aKey; attribute float aLayer; attribute float aPhase;
        varying float vT; varying vec3 vColor; varying float vW;
        varying vec2 vKey; varying float vLayer; varying float vPhase;
        void main(){
          vT=aT; vColor=aColor; vW=aW; vKey=aKey; vLayer=aLayer; vPhase=aPhase;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform float uMotion; uniform float uHover;
        uniform float uMaxLayer; uniform float uGain; uniform float uSpeed;
        varying float vT; varying vec3 vColor; varying float vW;
        varying vec2 vKey; varying float vLayer; varying float vPhase;
        void main(){
          if (vW <= 0.0 || vLayer > uMaxLayer + 0.5) discard;
          float on = (abs(vKey.x - uHover) < 0.5 || abs(vKey.y - uHover) < 0.5) ? 1.0 : 0.0;
          float hov = uHover < 0.0 ? 1.0 : mix(0.10, 2.2, on);
          float head = fract(uTime * uSpeed + vPhase);
          float pulse = exp(-pow((vT - head) * 12.0, 2.0)) * uMotion;
          float a = (0.02 + 0.26 * vW) * hov * uGain;
          gl_FragColor = vec4(vColor * (0.8 + 1.6 * pulse), a * (1.0 + 1.8 * pulse));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
}

/** Soft round sprites sized in world units (aSize·uScale/depth), for clouds, cores and nodes. */
export class GlowPointMaterial extends ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uScale: { value: 400 }, uHover: { value: -1 }, uMaxLayer: { value: 99 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        attribute float aKey; attribute float aLayer; uniform float uScale;
        varying vec3 vColor; varying float vAlpha; varying float vKey; varying float vLayer;
        void main(){
          vColor=aColor; vAlpha=aAlpha; vKey=aKey; vLayer=aLayer;
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=max(1.5, aSize*uScale/(-mv.z));
          gl_Position=projectionMatrix*mv;
        }
      `,
      fragmentShader: `
        uniform float uHover; uniform float uMaxLayer;
        varying vec3 vColor; varying float vAlpha; varying float vKey; varying float vLayer;
        void main(){
          if (vAlpha <= 0.0 || vLayer > uMaxLayer + 0.5) discard;
          float d=length(gl_PointCoord-0.5); if (d>0.5) discard;
          float a=pow(1.0-d*2.0,1.7)*vAlpha;
          float hov = uHover<0.0 ? 1.0 : (abs(vKey-uHover)<0.5 ? 1.4 : 0.22);
          gl_FragColor=vec4(vColor, a*hov);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
}
