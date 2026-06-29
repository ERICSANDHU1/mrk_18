"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/** Front dot-matrix screen with a yellow U-smile, drawn to a canvas texture. */
function makeFaceTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.Texture();
  ctx.fillStyle = "#0b0c0b";
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.47;
  const step = size / 44;
  // dim dot-matrix grid, clipped to a circle
  ctx.fillStyle = "rgba(150,162,150,0.16)";
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > R * R) continue;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the smile — a U of brighter yellow dots
  ctx.fillStyle = "#ecd34e";
  const sr = size * 0.17;
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * (0.2 + (0.6 * i) / 14);
    const x = cx + Math.cos(a) * sr;
    const y = cy + Math.sin(a) * sr + size * 0.03;
    ctx.beginPath();
    ctx.arc(x, y, step * 0.33, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** Matte back with concentric rings + four gold pogo pins. */
function makeBackTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.Texture();
  ctx.fillStyle = "#202022";
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  [0.36, 0.2].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, size * r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = "#d6a23f";
  const off = size * 0.05;
  const rad = size * 0.04;
  ([[-off, -off], [off, -off], [-off, off], [off, off]] as const).forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, rad, 0, Math.PI * 2);
    ctx.fill();
  });
  return new THREE.CanvasTexture(c);
}

function Device() {
  const face = useMemo(() => makeFaceTexture(), []);
  const back = useMemo(() => makeBackTexture(), []);
  return (
    <group rotation={[0.12, 0, 0]}>
      {/* glossy black body — a flattened sphere reads as a smooth pebble */}
      <mesh scale={[1, 1, 0.34]}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshPhysicalMaterial
          color="#0a0a0a"
          roughness={0.2}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
      </mesh>
      {/* front dot-matrix screen + smile */}
      <mesh position={[0, 0, 0.345]}>
        <circleGeometry args={[0.66, 64]} />
        <meshStandardMaterial
          map={face}
          emissiveMap={face}
          emissive="#ffffff"
          emissiveIntensity={0.7}
          roughness={0.5}
          metalness={0}
          toneMapped={false}
        />
      </mesh>
      {/* matte back with pogo pins */}
      <mesh position={[0, 0, -0.345]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.8, 64]} />
        <meshStandardMaterial map={back} roughness={0.85} metalness={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function DeviceScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.5, 4], fov: 38 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <Device />
      {/* procedural studio reflections for the wet-look glossy black (no external HDRI) */}
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 2.5, 2]} scale={[4, 4, 1]} />
        <Lightformer intensity={1.2} position={[-3, 0, 2]} scale={[3, 3, 1]} />
        <Lightformer intensity={1} position={[3, -1, 1]} scale={[2, 2, 1]} color="#ffd9a8" />
      </Environment>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={1.6}
        enableDamping
        minPolarAngle={1.0}
        maxPolarAngle={1.75}
      />
    </Canvas>
  );
}
