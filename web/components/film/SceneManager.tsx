"use client";

import { useFilmStore, SCENES } from "./store";
import DummyScene from "./scenes/DummyScene";

/* Mounts only the active scene ± 1 neighbour (spec §5.1 rule 4). Re-renders
   only when activeScene changes (zustand selector), never per frame. As real
   frames land, swap DummyScene for the matching F0N_* Scene component. */
export default function SceneManager() {
  const active = useFilmStore((s) => s.activeScene);
  const indices = [active - 1, active, active + 1].filter((i) => i >= 0 && i < SCENES.length);
  return (
    <>
      {indices.map((i) => (
        <DummyScene key={i} index={i} />
      ))}
    </>
  );
}
