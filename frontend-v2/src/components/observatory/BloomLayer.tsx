import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * three's UnrealBloomPass at radius 0.55 and threshold 0.05; OutputPass applies ACES tone
 * mapping and sRGB. Rendering at priority 1 takes over the frame from R3F's default render.
 */
export default function BloomLayer({ strength }: { strength: number }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    camera = useThree((s) => s.camera),
    size = useThree((s) => s.size),
    dpr = useThree((s) => s.viewport.dpr);
  const { composer, bloom } = useMemo(() => {
    const composer = new EffectComposer(gl);
    const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.8, 0.55, 0.05);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
  }, [gl, scene, camera]);
  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    // The blur chain is capped at 1440 device pixels wide. At a 1440px stage it matches the
    // reference exactly; on larger or high-DPI canvases the glow keeps the same apparent size
    // while costing a fraction (the full-size chain held integrated GPUs at 1440p under 60fps).
    const scale = Math.min(1, 1440 / (size.width * dpr));
    bloom.setSize(size.width * dpr * scale, size.height * dpr * scale);
  }, [composer, bloom, dpr, size.width, size.height]);
  useEffect(() => {
    bloom.strength = strength;
  }, [bloom, strength]);
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
