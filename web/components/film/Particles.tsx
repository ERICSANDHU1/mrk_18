"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFilmStore, SCENE_SPACING } from "./store";

/* The ember particle SINGLETON (spec S3) — never duplicated, retargeted per
   scene. Phase 0: a quiet ember field that follows the active scene band so
   the connective visual language exists from the start. */
const COUNT = 500;

export default function Particles() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(COUNT * 3);
    let seed = 99; // deterministic (no runtime RNG — spec §1.5)
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < COUNT; i++) {
      a[i * 3] = (rng() - 0.5) * 36;
      a[i * 3 + 1] = (rng() - 0.5) * 16;
      a[i * 3 + 2] = (rng() - 0.5) * 12 - 4;
    }
    return a;
  }, []);

  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    const { activeScene, localProgress } = useFilmStore.getState();
    p.position.x = (activeScene + localProgress) * SCENE_SPACING;
    p.rotation.y += dt * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#FF9E2C"
        size={0.06}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
