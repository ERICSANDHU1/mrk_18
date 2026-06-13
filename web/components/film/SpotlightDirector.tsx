"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { useFilmStore, SCENE_SPACING } from "./store";

/* §1.10 Spotlight system. One director drives BOTH the 3D SpotLight (tracks the
   active subject with ~0.15 eased lag) AND the DOM dim mask: it projects the
   tracked point to screen space and writes spotX/spotY (viewport %) which
   <DimMask/> consumes, so canvas and HTML dim as one world. */
export default function SpotlightDirector({
  spotX,
  spotY,
}: {
  spotX: MotionValue<number>;
  spotY: MotionValue<number>;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(new THREE.Object3D());
  const cur = useRef(new THREE.Vector3(0, 0, 0));
  const proj = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const { activeScene, localProgress } = useFilmStore.getState();
    const tx = (activeScene + localProgress) * SCENE_SPACING;
    cur.current.x += (tx - cur.current.x) * 0.15; // eased operator lag
    cur.current.y += (0 - cur.current.y) * 0.15;

    if (light.current) {
      light.current.position.set(cur.current.x, 5.5, 5);
      target.current.position.copy(cur.current);
      target.current.updateMatrixWorld();
      light.current.target = target.current;
    }

    proj.current.copy(cur.current).project(camera);
    spotX.set((proj.current.x * 0.5 + 0.5) * 100);
    spotY.set((-proj.current.y * 0.5 + 0.5) * 100);
  });

  return (
    <>
      <primitive object={target.current} />
      <spotLight
        ref={light}
        angle={0.55}
        penumbra={0.6}
        intensity={120}
        distance={32}
        decay={1.4}
        color="#FFE6C8"
      />
      {/* outside the pool sits at ~18% (spec §1.10), never crushed to black */}
      <ambientLight intensity={0.18} />
    </>
  );
}
