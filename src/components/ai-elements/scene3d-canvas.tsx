"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type Ref } from "react";
import type {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";

import type { Scene3dSpec } from "@/lib/ui/spec";

type Scene = Scene3dSpec["scene"];
type SceneObject = Scene["objects"][number];
type SceneLight = Scene["lights"][number];
type Vec3 = [number, number, number];

const geometryFor = (object: SceneObject) => {
  switch (object.geometry) {
    case "box":
      return (
        <boxGeometry args={object.args as ConstructorParameters<typeof BoxGeometry>} />
      );
    case "sphere":
      return (
        <sphereGeometry
          args={object.args as ConstructorParameters<typeof SphereGeometry>}
        />
      );
    case "cylinder":
      return (
        <cylinderGeometry
          args={object.args as ConstructorParameters<typeof CylinderGeometry>}
        />
      );
    case "torus":
      return (
        <torusGeometry
          args={object.args as ConstructorParameters<typeof TorusGeometry>}
        />
      );
    case "plane":
      return (
        <planeGeometry
          args={object.args as ConstructorParameters<typeof PlaneGeometry>}
        />
      );
  }
};

const MeshBody = ({ object, meshRef }: { object: SceneObject; meshRef?: Ref<Mesh> }) => (
  <mesh
    ref={meshRef}
    position={object.position}
    rotation={object.rotation}
    scale={object.scale}
  >
    {geometryFor(object)}
    <meshStandardMaterial
      color={object.color}
      roughness={object.roughness}
      metalness={object.metalness}
    />
  </mesh>
);

const SpinningMesh = ({ object, spin }: { object: SceneObject; spin: Vec3 }) => {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.x += spin[0] * delta;
    mesh.rotation.y += spin[1] * delta;
    mesh.rotation.z += spin[2] * delta;
  });

  return <MeshBody object={object} meshRef={meshRef} />;
};

const SceneObjectMesh = ({ object }: { object: SceneObject }) =>
  object.spin ? (
    <SpinningMesh object={object} spin={object.spin} />
  ) : (
    <MeshBody object={object} />
  );

const SceneLightSource = ({ light }: { light: SceneLight }) => {
  switch (light.type) {
    case "ambient":
      return <ambientLight intensity={light.intensity} color={light.color} />;
    case "directional":
      return (
        <directionalLight
          position={light.position}
          intensity={light.intensity}
          color={light.color}
        />
      );
    case "point":
      return (
        <pointLight
          position={light.position}
          intensity={light.intensity}
          color={light.color}
        />
      );
  }
};

const CameraLookAt = ({ target }: { target: Vec3 }) => {
  const camera = useThree((state) => state.camera);
  const [x, y, z] = target;

  useEffect(() => {
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
  }, [camera, x, y, z]);

  return null;
};

export const Scene3dCanvas = ({ scene }: { scene: Scene }) => {
  const background =
    scene.background && CSS.supports("color", scene.background)
      ? scene.background
      : undefined;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: scene.camera.position, fov: scene.camera.fov }}
      gl={{ antialias: true, alpha: !background }}
      style={{ background }}
    >
      <CameraLookAt target={scene.camera.lookAt} />
      {scene.lights.map((light, index) => (
        <SceneLightSource key={`light-${index}`} light={light} />
      ))}
      {scene.objects.map((object, index) => (
        <SceneObjectMesh key={`object-${index}`} object={object} />
      ))}
    </Canvas>
  );
};
