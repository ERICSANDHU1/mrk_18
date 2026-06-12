"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type ShapeDef = {
  kind: "icosa" | "sphere" | "torus" | "capsule";
  color: string;
  pos: [number, number, number];
  size: number;
  speed: number;
};

const SHAPES: ShapeDef[] = [
  { kind: "icosa", color: "#FF6A00", pos: [-4.8, 1.7, -2.2], size: 1.05, speed: 0.22 },
  { kind: "sphere", color: "#F2C879", pos: [4.9, 2.3, -3.2], size: 0.65, speed: 0.3 },
  { kind: "torus", color: "#E0490E", pos: [5.4, -1.9, -1.6], size: 0.85, speed: 0.18 },
  { kind: "icosa", color: "#8C5A2B", pos: [-5.6, -2.3, -2.6], size: 0.8, speed: 0.26 },
  { kind: "capsule", color: "#FF9E2C", pos: [-2.7, 3.3, -4.2], size: 0.55, speed: 0.2 },
  { kind: "sphere", color: "#E0490E", pos: [2.5, -3.2, -2.2], size: 0.5, speed: 0.34 },
  { kind: "torus", color: "#F2C879", pos: [-0.9, -2.8, -5.2], size: 0.7, speed: 0.16 },
  { kind: "icosa", color: "#FF9E2C", pos: [1.7, 3.5, -5.6], size: 0.9, speed: 0.24 },
];

function Shape({ def }: { def: ShapeDef }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (REDUCED || !ref.current) return;
    ref.current.rotation.x += delta * def.speed;
    ref.current.rotation.y += delta * def.speed * 0.7;
  });

  return (
    <Float
      speed={REDUCED ? 0 : 1.1}
      rotationIntensity={REDUCED ? 0 : 0.35}
      floatIntensity={REDUCED ? 0 : 0.9}
    >
      <mesh ref={ref} position={def.pos} scale={def.size}>
        {def.kind === "icosa" && <icosahedronGeometry args={[1, 0]} />}
        {def.kind === "sphere" && <sphereGeometry args={[1, 48, 48]} />}
        {def.kind === "torus" && <torusGeometry args={[0.8, 0.32, 24, 64]} />}
        {def.kind === "capsule" && <capsuleGeometry args={[0.5, 1, 8, 24]} />}
        <meshPhysicalMaterial
          color={def.color}
          metalness={0.55}
          roughness={0.22}
          clearcoat={0.65}
          clearcoatRoughness={0.3}
          emissive={def.color}
          emissiveIntensity={0.06}
        />
      </mesh>
    </Float>
  );
}

function Dust() {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 18;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (REDUCED || !ref.current) return;
    ref.current.rotation.y += delta * 0.012;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#FFB36B"
        size={0.04}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function CameraRig() {
  const { camera, pointer } = useThree();
  const scrollDrift = useRef(0);

  useFrame((_, delta) => {
    if (REDUCED) return;
    const max = document.body.scrollHeight - window.innerHeight;
    scrollDrift.current = max > 0 ? window.scrollY / max : 0;

    const targetX = pointer.x * 0.85;
    const targetY = -pointer.y * 0.55 - scrollDrift.current * 1.6;
    const k = Math.min(1, delta * 2.4);
    camera.position.x += (targetX - camera.position.x) * k;
    camera.position.y += (targetY - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function Scene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 9], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ opacity: 0.6 }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 4]} intensity={2.1} color="#FFF3E4" />
      <directionalLight position={[-6, -3, -5]} intensity={1.1} color="#FF9E2C" />
      <pointLight position={[0, 2, 3]} intensity={0.7} color="#F2C879" />
      {SHAPES.map((s, i) => (
        <Shape key={i} def={s} />
      ))}
      <Dust />
      <CameraRig />
    </Canvas>
  );
}
