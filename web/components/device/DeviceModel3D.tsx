"use client";

import dynamic from "next/dynamic";

// WebGL scene — client-only (no SSR), so the Canvas never renders on the server.
const DeviceScene = dynamic(() => import("./DeviceScene"), {
  ssr: false,
  loading: () => <div className="h-full w-full" aria-hidden />,
});

export default function DeviceModel3D() {
  return <DeviceScene />;
}
