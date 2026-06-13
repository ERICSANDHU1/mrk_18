"use client";

import { useFrame } from "@react-three/fiber";
import { useFilmStore, SCENE_SPACING } from "./store";

/* Single camera on the master timeline (spec §5.1). Phase 0: pans along the
   row of dummy scenes — at local 0 it centres the active cube, at local 1 it
   has glided to the next — proving "camera driven by scroll" + continuity. */
export default function MasterCamera() {
  useFrame(({ camera }) => {
    const { activeScene, localProgress } = useFilmStore.getState();
    const targetX = (activeScene + localProgress) * SCENE_SPACING;
    camera.position.x += (targetX - camera.position.x) * 0.12;
    camera.position.y += (1.2 - camera.position.y) * 0.1;
    camera.position.z += (6 - camera.position.z) * 0.1;
    camera.lookAt(camera.position.x, 0, 0);
  });
  return null;
}
