"use client";

import { useEffect, useState } from "react";
import SplashCursor from "./SplashCursor";

/* Mounts the WebGL splash-cursor fluid only where it makes sense and won't hurt
   perf: a fine pointer (desktop mouse), a wide viewport, and no reduced-motion
   preference. On touch / small / reduced-motion it renders nothing. */
export default function CursorFluid() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.innerWidth >= 1024;
    setEnabled(finePointer && wide && !reduced);
  }, []);

  if (!enabled) return null;
  return (
    <SplashCursor
      SPLAT_RADIUS={0.18}
      DENSITY_DISSIPATION={4}
      CURL={2.5}
      COLOR_UPDATE_SPEED={8}
    />
  );
}
