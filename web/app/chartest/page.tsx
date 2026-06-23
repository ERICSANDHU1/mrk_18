"use client";

// TEMP isolated viewer for /film/char.glb. Deterministic fit: reset, settle idle
// 1s (clean standing frame), measure SKELETON bones, offset scene to feet@0 +
// centered, scale via a WRAPPER group (so the model's huge authored offset can't
// be amplified). Proves the fit before porting to the film. Delete after.
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";

function boneBox(scene: THREE.Object3D): THREE.Box3 {
  scene.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let sm: THREE.SkinnedMesh | undefined;
  scene.traverse((o) => {
    if ((o as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) sm = o as THREE.SkinnedMesh;
  });
  if (sm?.skeleton?.bones?.length) {
    const v = new THREE.Vector3();
    sm.skeleton.bones.forEach((b) => {
      b.updateWorldMatrix(true, false);
      box.expandByPoint(b.getWorldPosition(v.clone()));
    });
  } else box.setFromObject(scene);
  return box;
}

const TARGET_H = 2.4;

function Char() {
  const { scene, animations } = useGLTF("/film/char.glb");
  const grp = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  useEffect(() => {
    // reset (useGLTF caches the scene → avoid compounding across HMR)
    scene.position.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.rotation.set(0, 0, 0);
    if (grp.current) grp.current.scale.setScalar(1);

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;
    const idle =
      animations.find((c) => /idle/i.test(c.name)) ||
      animations.find((c) => /walk/i.test(c.name)) ||
      animations[0];
    if (idle) mixer.clipAction(idle).play();
    mixer.update(1.0); // settle into a clean standing frame (not the t=0 transient)

    const box = boneBox(scene);
    const h = box.max.y - box.min.y || 1;
    // offset scene (scale 1) so feet sit at y=0 and the body is centered in x/z
    scene.position.set(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2
    );
    // scale on the WRAPPER (no offset amplification)
    if (grp.current) grp.current.scale.setScalar(TARGET_H / h);
    console.log("[fit] idle=" + idle?.name + " boneH=" + h.toFixed(2) + " k=" + (TARGET_H / h).toFixed(2) + " min=" + box.min.toArray().map((n) => n.toFixed(1)).join(","));
    return () => {
      mixer.stopAllAction();
    };
  }, [scene, animations]);
  useFrame((_, dt) => mixerRef.current?.update(dt));
  return (
    <group ref={grp}>
      <primitive object={scene} />
    </group>
  );
}

export default function CharTest() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3a3a3a" }}>
      <Canvas camera={{ position: [0, 1.4, 5], fov: 45 }}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[3, 6, 5]} intensity={2.5} />
        <directionalLight position={[-4, 3, -3]} intensity={1.2} color="#FF6A00" />
        <Suspense fallback={null}>
          <Char />
        </Suspense>
        <gridHelper args={[10, 10]} />
        <OrbitControls target={[0, 1.2, 0]} />
      </Canvas>
    </div>
  );
}

useGLTF.preload("/film/char.glb");
