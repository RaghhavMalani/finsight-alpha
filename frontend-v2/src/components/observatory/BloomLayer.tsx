import { Bloom, EffectComposer } from "@react-three/postprocessing";
export default function BloomLayer() {
  return (
    <EffectComposer multisampling={0} resolutionScale={0.7}>
      <Bloom mipmapBlur radius={0.3} levels={5} intensity={1.2} luminanceThreshold={0.1} />
    </EffectComposer>
  );
}
