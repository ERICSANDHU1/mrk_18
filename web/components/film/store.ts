"use client";

import { create } from "zustand";

/* ---------------------------------------------------------------------------
   Film master store + scene registry (master spec §1.5, §5.1).
   - g  : global film progress 0→1 across the whole ~4350vh film
   - v  : smoothed, clamped scroll velocity (drives "how violently")
   - activeScene / localProgress : derived; scenes get their own local from g
   R3F reads this transiently via getState() inside useFrame (no re-renders).
   Only `activeScene` is meant to be subscribed reactively (mount ±1).
--------------------------------------------------------------------------- */

export const FILM_VH = 4350; // total film scroll length (spec §1.5)
export const SCENE_SPACING = 4; // world-x gap between dummy scenes (Phase 0 placeholder)

export type SceneDef = { id: string; name: string; start: number; end: number };

// global-progress fractions — master spec §5.1 (keep the ratios)
export const SCENES: SceneDef[] = [
  { id: "F01", name: "The Falling Page", start: 0.0, end: 0.069 },
  { id: "F02", name: "Landing & Awakening", start: 0.069, end: 0.126 },
  { id: "F03", name: "The Walk", start: 0.126, end: 0.218 },
  { id: "F04", name: "The Call", start: 0.218, end: 0.299 },
  { id: "F05", name: "Live Call Intelligence", start: 0.299, end: 0.437 },
  { id: "F06", name: "Approve", start: 0.437, end: 0.483 },
  { id: "F07", name: "Platform Tornado", start: 0.483, end: 0.575 },
  { id: "F08", name: "Ads Are Live", start: 0.575, end: 0.678 },
  { id: "F09", name: "Eagle Eye", start: 0.678, end: 0.759 },
  { id: "F10", name: "The Agent at Work", start: 0.759, end: 0.874 },
  { id: "F11", name: "Learned from yesterday", start: 0.874, end: 0.931 },
  { id: "F12", name: "Finale", start: 0.931, end: 1.0 },
];

export function sceneFromG(g: number): { scene: number; local: number } {
  const c = Math.min(0.999999, Math.max(0, g));
  let i = SCENES.findIndex((s) => c >= s.start && c < s.end);
  if (i === -1) i = c <= 0 ? 0 : SCENES.length - 1;
  const s = SCENES[i];
  return { scene: i, local: clamp01((c - s.start) / (s.end - s.start)) };
}

/** local progress 0→1 of a specific scene given global g (clamped). */
export function localFor(index: number, g: number): number {
  const s = SCENES[index];
  if (!s) return 0;
  return clamp01((g - s.start) / (s.end - s.start));
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

type FilmState = {
  g: number;
  v: number;
  activeScene: number;
  localProgress: number;
  /** called every frame from the scroll loop; only notifies React when the
      active scene actually changes (so SceneManager re-mounts minimally). */
  setLive: (g: number, v: number) => void;
};

export const useFilmStore = create<FilmState>((set, get) => ({
  g: 0,
  v: 0,
  activeScene: 0,
  localProgress: 0,
  setLive: (g, v) => {
    const { scene, local } = sceneFromG(g);
    if (get().activeScene !== scene) set({ g, v, localProgress: local, activeScene: scene });
    else set({ g, v, localProgress: local });
  },
}));
