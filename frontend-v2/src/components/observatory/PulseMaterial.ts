import { AdditiveBlending, ShaderMaterial } from "three";

export class PulseMaterial extends ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uHead: { value: 0 },
        uMotion: { value: 1 },
        uHover: { value: -1 },
        uGroup: { value: -1 },
        uStage: { value: 100 },
        uGain: { value: 1 },
      },
      vertexShader: `
        attribute float aT; attribute float aWeight; attribute vec3 aColor;
        attribute vec2 aNodes; attribute vec2 aStep; attribute vec3 aOffset;
        varying float vT; varying float vWeight; varying vec3 vColor; varying vec2 vNodes; varying vec2 vStep;
        void main(){ vT=aT; vWeight=aWeight; vColor=aColor; vNodes=aNodes; vStep=aStep;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position+aOffset,1.0); }
      `,
      fragmentShader: `
        uniform float uTime; uniform float uHead; uniform float uMotion; uniform float uHover; uniform float uGroup; uniform float uStage; uniform float uGain;
        varying float vT; varying float vWeight; varying vec3 vColor; varying vec2 vNodes; varying vec2 vStep;
        void main(){
          if(vWeight<=0.0) discard;
          float connected=max(1.0-step(.1,abs(vNodes.x-uHover)),1.0-step(.1,abs(vNodes.y-uHover)));
          float focus=uHover<0.0 ? 1.0 : mix(.15,1.0,connected);
          float eligible=uGroup<0.0 ? 1.0 : (vStep.x<uGroup+.1 && (vStep.x<uGroup-.1 || vStep.y<=uStage+.1) ? 1.0 : .03);
          float phaseFocus=uGroup<0.0 || abs(vStep.x-uGroup)<.1 ? 1.0 : .35;
          float head=fract(uTime*.14+uHead);
          float pulse=exp(-pow((vT-head)*22.0,2.0))*uMotion*phaseFocus;
          float opacity=(.04+.21*sqrt(vWeight))*focus*eligible;
          gl_FragColor=vec4(vColor*(1.0+2.0*pulse)*uGain,opacity*(1.0+.8*pulse));
        }
      `,
    });
  }
}
