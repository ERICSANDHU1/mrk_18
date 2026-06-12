"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

export default function Background3D() {
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

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <Scene />
      {/* vignette keeps the canvas ~90% black so orange reads expensive */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,10,11,0.78)_75%)]" />
    </div>
  );
}
