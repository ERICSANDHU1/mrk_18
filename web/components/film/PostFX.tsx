"use client";

import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";

/* Cinematic post chain (spec §1.3): clamped bloom + grain + vignette.
   Radial motion blur (F7 only) is added in that frame's phase later. */
export default function PostFX() {
  return (
    <EffectComposer>
      <Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
      <Noise opacity={0.04} />
      <Vignette offset={0.28} darkness={0.85} />
    </EffectComposer>
  );
}
