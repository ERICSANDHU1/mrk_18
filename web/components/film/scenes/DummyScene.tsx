"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useFilmStore, localFor, SCENES, SCENE_SPACING } from "../store";

/* Phase-0 placeholder scene: one labeled cube per frame, parked at its own
   world-x slot, scrubbed by its own local progress. Proves the engine +
   ±1 mounting + camera pan + spotlight, with no story art yet. */

const WARM = ["#FF6A00", "#FF9E2C", "#E0490E", "#F2C879"];

export default function DummyScene({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = WARM[index % WARM.length];

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const local = localFor(index, useFilmStore.getState().g);
    m.rotation.y = local * Math.PI * 2;
    m.rotation.x = local * Math.PI;
    m.scale.setScalar(0.7 + 0.3 * Math.sin(local * Math.PI));
  });

  return (
    <group position={[index * SCENE_SPACING, 0, 0]}>
      <mesh ref={ref}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.12}
          metalness={0.3}
          roughness={0.45}
        />
      </mesh>
      <Text position={[0, 1.7, 0]} fontSize={0.42} color="#F4F1EC" anchorX="center" anchorY="middle">
        {SCENES[index].id}
      </Text>
    </group>
  );
}
