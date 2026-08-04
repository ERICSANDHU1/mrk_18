"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 260, damping: 28, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 260, damping: 28, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    setEnabled(true);
    document.documentElement.classList.add("custom-cursor");

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as HTMLElement | null;
      // over anything interactive (incl. portaled overlays like the Clerk menu),
      // step aside and let the real cursor show — never leave it cursor-less
      setHovering(
        !!target?.closest(
          "a, button, [role='button'], [role='menuitem'], input, textarea, select, label, summary, [data-cursor], [role='dialog'], [role='menu'], .cl-rootBox",
        ),
      );
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => {
      window.removeEventListener("mousemove", move);
      document.documentElement.classList.remove("custom-cursor");
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      {/* dot — hidden over interactive elements so the native cursor leads there */}
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[90] h-1.5 w-1.5 rounded-full"
        style={{ x, y, translateX: "-50%", translateY: "-50%", background: "var(--amber)" }}
        animate={{ opacity: hovering ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        aria-hidden
      />
      {/* ring — also hidden over interactive elements (native arrow takes over) */}
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[90] rounded-full border"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
          borderColor: "rgba(180, 83, 42, 0.55)",
        }}
        animate={{
          width: 32,
          height: 32,
          opacity: hovering ? 0 : 0.7,
        }}
        transition={{ duration: 0.15 }}
        aria-hidden
      />
    </>
  );
}
