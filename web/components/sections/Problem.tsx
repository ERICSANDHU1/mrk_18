"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Reveal from "../ui/Reveal";
import Stat from "../ui/Stat";

const BAND = [
  { value: 11, suffix: "/11", label: "founders: green metrics, flat revenue" },
  { value: 27, suffix: " hrs", label: "/week lost to marketing they shouldn't touch" },
  { value: 2, suffix: "", label: "avg customers their green campaigns drove" },
  { value: 1, suffix: "", label: "honest second opinion missing" },
];

/* deterministic seeded random — scroll-scrub must be perfectly reversible */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOLTEN = new THREE.Color("#FF6A00");
const AMBER = new THREE.Color("#FF9E2C");
const EMBER = new THREE.Color("#E0490E");
const GOLD = new THREE.Color("#F2C879");

/* ---------------- the funnel ---------------- */

function Funnel() {
  const geometry = useMemo(() => {
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.16, -1.05), // exit lip
      new THREE.Vector2(0.14, -0.55), // neck
      new THREE.Vector2(0.22, -0.25),
      new THREE.Vector2(0.85, 1.05), // cone wall
      new THREE.Vector2(1.45, 1.95), // mouth
      new THREE.Vector2(1.52, 2.0), // rim
    ];
    return new THREE.LatheGeometry(profile, 72);
  }, []);

  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        color="#141416"
        metalness={0.7}
        roughness={0.32}
        clearcoat={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* glowing cracks on the cone wall — molten seams the money escapes through */
function Cracks() {
  const cracks = useMemo(() => {
    const rng = mulberry32(7);
    return [0, 1, 2].map((k) => {
      const baseAngle = (k / 3) * Math.PI * 2 + 0.5;
      const pts: THREE.Vector3[] = [];
      const STEPS = 9;
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        // walk down the cone wall: y from 1.5 → -0.1, radius shrinks with the cone
        const y = 1.5 - t * 1.6;
        const coneR = 0.22 + ((y + 0.25) / 1.3) * 0.63;
        const angle = baseAngle + (rng() - 0.5) * 0.5;
        const r = Math.max(coneR, 0.16) * 1.02;
        pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return { geometry: new THREE.TubeGeometry(curve, 32, 0.016, 5, false), exit: pts[STEPS] };
    });
  }, []);

  return (
    <>
      {cracks.map((c, i) => (
        <mesh key={i} geometry={c.geometry}>
          <meshBasicMaterial color={i === 1 ? "#FF9E2C" : "#FF6A00"} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* crack exit points (must match Cracks() geometry — same seed) */
function useCrackExits() {
  return useMemo(() => {
    const rng = mulberry32(7);
    return [0, 1, 2].map((k) => {
      const baseAngle = (k / 3) * Math.PI * 2 + 0.5;
      let last = new THREE.Vector3();
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const y = 1.5 - t * 1.6;
        const coneR = 0.22 + ((y + 0.25) / 1.3) * 0.63;
        const angle = baseAngle + (rng() - 0.5) * 0.5;
        const r = Math.max(coneR, 0.16) * 1.02;
        last = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      }
      return last;
    });
  }, []);
}

/* ---------------- particle streams ---------------- */

type StreamProps = { progress: MotionValue<number> };

/** coins pouring into the funnel mouth from above */
function Inflow({ progress }: StreamProps) {
  const COUNT = 240;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => {
    const rng = mulberry32(21);
    return Array.from({ length: COUNT }, () => ({
      phase: rng(),
      angle: rng() * Math.PI * 2,
      radius: 0.15 + rng() * 0.95,
      spin: rng() * Math.PI * 2,
    }));
  }, []);

  useFrame(() => {
    const p = progress.get();
    const mesh = ref.current;
    if (!mesh) return;
    const pour = THREE.MathUtils.clamp((p - 0.06) / 0.08, 0, 1); // tap opens
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      const t = (p * 2.6 + s.phase) % 1;
      if (pour <= 0 || s.phase > pour + 0.6) {
        dummy.scale.setScalar(0);
      } else {
        // fall from sky disc → funnel mouth → converge into the neck
        const fall = THREE.MathUtils.clamp(t / 0.55, 0, 1);
        const sink = THREE.MathUtils.clamp((t - 0.55) / 0.45, 0, 1);
        const r = s.radius * (1 - sink * 0.85);
        const y = THREE.MathUtils.lerp(4.4, 1.9, fall) - sink * 2.1;
        dummy.position.set(
          Math.cos(s.angle + sink * 1.6) * r,
          y,
          Math.sin(s.angle + sink * 1.6) * r
        );
        dummy.rotation.set(s.spin + t * 9, s.angle, t * 7);
        dummy.scale.setScalar(0.55 + 0.45 * (1 - sink * 0.5));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <cylinderGeometry args={[0.055, 0.055, 0.014, 14]} />
      <meshStandardMaterial
        color={GOLD}
        emissive={AMBER}
        emissiveIntensity={0.55}
        metalness={0.9}
        roughness={0.25}
      />
    </instancedMesh>
  );
}

/** embers spraying out of the cracks and dying on the floor — the leak */
function Leaks({ progress }: StreamProps) {
  const COUNT = 360;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const exits = useCrackExits();
  const seeds = useMemo(() => {
    const rng = mulberry32(99);
    return Array.from({ length: COUNT }, (_, i) => ({
      crack: i % 3,
      phase: rng(),
      dir: new THREE.Vector3(rng() - 0.5, -0.2 - rng() * 0.4, rng() - 0.5).normalize(),
      speed: 1.4 + rng() * 1.6,
    }));
  }, []);

  useFrame(() => {
    const p = progress.get();
    const mesh = ref.current;
    if (!mesh) return;
    const leak = THREE.MathUtils.clamp((p - 0.28) / 0.1, 0, 1); // cracks give way
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      const t = (p * 3.2 + s.phase) % 1;
      if (leak <= 0 || s.phase > leak + 0.5) {
        dummy.scale.setScalar(0);
      } else {
        const exit = exits[s.crack];
        const out = s.dir.clone().multiplyScalar(t * s.speed);
        // push away from the funnel axis + gravity arc
        const radial = new THREE.Vector3(exit.x, 0, exit.z).normalize().multiplyScalar(t * 1.3);
        dummy.position.set(
          exit.x + out.x + radial.x,
          Math.max(exit.y + out.y * 2 - t * t * 3.4, -2.35),
          exit.z + out.z + radial.z
        );
        dummy.scale.setScalar(0.9 * (1 - t) + 0.08);
        dummy.rotation.set(t * 12, 0, t * 8);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.034, 8, 8]} />
      <meshBasicMaterial color={EMBER} toneMapped={false} transparent opacity={0.9} />
    </instancedMesh>
  );
}

/** the thin honest trickle that actually reaches customers */
function Trickle({ progress }: StreamProps) {
  const COUNT = 22;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => {
    const rng = mulberry32(5);
    return Array.from({ length: COUNT }, () => ({ phase: rng(), wob: rng() * Math.PI * 2 }));
  }, []);

  useFrame(() => {
    const p = progress.get();
    const mesh = ref.current;
    if (!mesh) return;
    const open = THREE.MathUtils.clamp((p - 0.5) / 0.1, 0, 1);
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      const t = (p * 2.2 + s.phase) % 1;
      if (open <= 0 || s.phase > open + 0.4) {
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(
          Math.sin(s.wob + t * 4) * 0.03,
          THREE.MathUtils.lerp(-1.1, -2.3, t),
          Math.cos(s.wob + t * 4) * 0.03
        );
        dummy.scale.setScalar(0.5);
        dummy.rotation.x = t * 6;
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <cylinderGeometry args={[0.05, 0.05, 0.013, 12]} />
      <meshStandardMaterial
        color={GOLD}
        emissive={GOLD}
        emissiveIntensity={0.4}
        metalness={0.9}
        roughness={0.3}
      />
    </instancedMesh>
  );
}

/** glow pool of burnt money spreading on the floor */
function FloorGlow({ progress }: StreamProps) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, "rgba(255,106,0,0.85)");
    g.addColorStop(0.45, "rgba(224,73,14,0.35)");
    g.addColorStop(1, "rgba(224,73,14,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  }, []);

  useFrame(() => {
    const p = progress.get();
    if (!ref.current) return;
    const grow = THREE.MathUtils.clamp((p - 0.3) / 0.5, 0, 1);
    ref.current.scale.setScalar(0.4 + grow * 3.4);
    material.opacity = grow * 0.85;
  });

  return (
    <mesh ref={ref} material={material} position={[0, -2.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** camera sinks with the money + soft mouse parallax */
function Rig({ progress }: StreamProps) {
  useFrame(({ camera, pointer }) => {
    const p = progress.get();
    const y = THREE.MathUtils.lerp(1.6, -0.4, THREE.MathUtils.clamp(p * 1.15, 0, 1));
    camera.position.x += (pointer.x * 0.5 - camera.position.x) * 0.06;
    camera.position.y += (y + pointer.y * 0.25 - camera.position.y) * 0.08;
    camera.lookAt(0, y * 0.45, 0);
  });
  return null;
}

/** demand-mode renderer: draw frames only while the scroll progress or pointer moves */
function Invalidator({ progress }: StreamProps) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const unsub = progress.on("change", () => invalidate());
    const onMove = () => invalidate();
    window.addEventListener("pointermove", onMove, { passive: true });
    invalidate();
    return () => {
      unsub();
      window.removeEventListener("pointermove", onMove);
    };
  }, [progress, invalidate]);
  return null;
}

function LeakScene({ progress }: StreamProps) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.7} color="#FFF3E4" />
      <pointLight position={[0, -0.6, 0]} intensity={1.4} color="#FF9E2C" distance={4} />
      <Funnel />
      <Cracks />
      <Inflow progress={progress} />
      <Leaks progress={progress} />
      <Trickle progress={progress} />
      <FloorGlow progress={progress} />
      <Rig progress={progress} />
      <Invalidator progress={progress} />
    </>
  );
}

/* ---------------- DOM overlay cards ---------------- */

function LeakCard({
  progress,
  at,
  side,
  top,
  title,
  sub,
  tone = "ink",
}: {
  progress: MotionValue<number>;
  at: number;
  side: "left" | "right";
  top: string;
  title: string;
  sub: string;
  tone?: "ink" | "leak";
}) {
  const opacity = useTransform(progress, [at, at + 0.05, at + 0.32, at + 0.38], [0, 1, 1, 0]);
  const x = useTransform(progress, [at, at + 0.05], side === "left" ? [-28, 0] : [28, 0]);
  return (
    <motion.div
      style={{ opacity, x, top }}
      className={`glass absolute z-10 w-60 rounded-xl p-4 md:w-72 ${
        side === "left" ? "left-4 md:left-[8%]" : "right-4 md:right-[8%]"
      }`}
    >
      <div
        className={`text-lg font-extrabold tracking-tight ${
          tone === "leak" ? "text-gradient" : "text-ink"
        }`}
      >
        {title}
      </div>
      <div className="mt-1 text-[13px] leading-snug text-muted">{sub}</div>
    </motion.div>
  );
}

export default function Problem() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 22, mass: 0.35 });

  const verdictOpacity = useTransform(progress, [0.78, 0.86], [0, 1]);
  const verdictY = useTransform(progress, [0.78, 0.86], [30, 0]);

  return (
    <section className="relative">
      {/* heading (normal flow) */}
      <div className="mx-auto max-w-6xl px-6 pt-32">
        <Reveal>
          <span className="text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
            01 — The problem
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            You pour ₹73,000 in.{" "}
            <em className="text-gradient italic">Two customers come out.</em>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Scroll, and watch where a founder&apos;s month of marketing money actually goes.
          </p>
        </Reveal>
      </div>

      {/* the 3D leak — tall scrub track with a sticky stage */}
      <div ref={wrapRef} className="relative h-[280vh]">
        <div className="sticky top-0 h-screen overflow-hidden">
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [0, 1.6, 7.2], fov: 42 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            className="!absolute inset-0"
          >
            <LeakScene progress={progress} />
          </Canvas>

          {/* money in — right side */}
          <LeakCard progress={progress} at={0.08} side="right" top="18%" title="₹40,000 · Meta ads" sub="poured in — the dashboard glows green" />
          <LeakCard progress={progress} at={0.18} side="right" top="38%" title="₹25,000 · agency retainer" sub="buys a PDF that says “all good”" />
          <LeakCard progress={progress} at={0.27} side="right" top="58%" title="₹8,000 · boosted posts" sub="likes arrive. sales don't." />

          {/* the leaks — left side */}
          <LeakCard progress={progress} at={0.38} side="left" top="26%" tone="leak" title="79% untracked" sub="conversions your dashboard never sees leak straight through" />
          <LeakCard progress={progress} at={0.5} side="left" top="46%" tone="leak" title="CAC ₹450 vs price ₹599" sub="every sale arrives losing money" />
          <LeakCard progress={progress} at={0.62} side="left" top="66%" tone="leak" title="27 hrs / week" sub="your own time — the most expensive leak of all" />

          {/* the verdict */}
          <motion.div
            style={{ opacity: verdictOpacity, y: verdictY }}
            className="absolute inset-x-0 bottom-[9%] z-10 px-6 text-center"
          >
            <div className="text-[clamp(1.6rem,4vw,3rem)] font-extrabold tracking-tight">
              ₹73,000 leaked. <span className="text-gradient">2 customers arrived.</span>
            </div>
            <div className="mt-2 text-[14px] text-muted">
              The dashboard never showed you the cracks. mrk18 exists to show you the cracks.
            </div>
          </motion.div>
        </div>
      </div>

      {/* counters band */}
      <div className="mx-auto max-w-6xl px-6 pb-32">
        <Reveal delay={0.1}>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-stroke pt-12 md:grid-cols-4">
            {BAND.map((s) => (
              <Stat key={s.label} value={s.value} suffix={s.suffix} label={s.label} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
