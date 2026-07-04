"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

export default function Background3D({
  variant = "landing",
  className = "pointer-events-none fixed inset-0 -z-10",
}: {
  variant?: "landing" | "column";
  className?: string;
}) {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setSupported(!!(c.getContext("webgl2") || c.getContext("webgl")));
    } catch {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  // The objects float over the light page backdrop — no dark vignette anymore.
  return (
    <div className={className} aria-hidden>
      <Scene variant={variant} />
    </div>
  );
}
