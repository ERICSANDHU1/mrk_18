"use client";

import { motion, useMotionTemplate, type MotionValue } from "framer-motion";

/* §1.10 DOM dim layer — radial brightness mask over the overlay, synced to the
   3D spotlight's projected screen position so HTML windows dim with the canvas.
   Inside the pool: clear; outside: ~80% black veil (subject stays brightest). */
export default function DimMask({
  spotX,
  spotY,
}: {
  spotX: MotionValue<number>;
  spotY: MotionValue<number>;
}) {
  const background = useMotionTemplate`radial-gradient(circle 40vmax at ${spotX}% ${spotY}%, rgba(10,10,11,0) 0%, rgba(10,10,11,0) 28%, rgba(10,10,11,0.82) 78%)`;
  return (
    <motion.div
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, background }}
    />
  );
}
