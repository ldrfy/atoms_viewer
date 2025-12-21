import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Atom } from "../structure/types";
import { getElementSize } from "./resize";

export type AnyCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export function isPerspective(
  cam: THREE.Camera
): cam is THREE.PerspectiveCamera {
  return (cam as THREE.PerspectiveCamera).isPerspectiveCamera === true;
}

export function updateCameraForSize(
  camera: AnyCamera,
  w: number,
  h: number,
  orthoHalfHeight: number
): void {
  const aspect = w / Math.max(1, h);

  if (isPerspective(camera)) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return;
  }

  camera.left = -orthoHalfHeight * aspect;
  camera.right = orthoHalfHeight * aspect;
  camera.top = orthoHalfHeight;
  camera.bottom = -orthoHalfHeight;
  camera.updateProjectionMatrix();
}

function createOrbitControls(params: {
  camera: AnyCamera;
  domElement: HTMLElement;
  target: THREE.Vector3;
  dampingFactor?: number;
}): OrbitControls {
  const { camera, domElement, target, dampingFactor = 0.08 } = params;
  const c = new OrbitControls(camera, domElement);
  c.enableDamping = true;
  c.dampingFactor = dampingFactor;
  c.target.copy(target);
  c.update();
  return c;
}

/**
 * 切换投影模式：保留 position 与 controls.target。
 * 返回新 camera / controls，并基于 host 尺寸更新投影矩阵。
 */
export function switchProjectionMode(params: {
  orthographic: boolean;
  camera: AnyCamera;
  controls: OrbitControls;
  domElement: HTMLElement;
  host: HTMLElement;
  orthoHalfHeight: number;
  fovDeg?: number;
  dampingFactor?: number;
}): { camera: AnyCamera; controls: OrbitControls; orthoHalfHeight: number } {
  const {
    orthographic,
    camera,
    controls,
    domElement,
    host,
    orthoHalfHeight,
    fovDeg = 45,
    dampingFactor = 0.08,
  } = params;

  const target = controls.target.clone();
  const pos = camera.position.clone();

  const { w, h } = getElementSize(host);
  const aspect = w / Math.max(1, h);

  controls.dispose();

  if (!orthographic) {
    const cam = new THREE.PerspectiveCamera(fovDeg, aspect, 0.01, 2000);
    cam.position.copy(pos);
    const c = createOrbitControls({
      camera: cam,
      domElement,
      target,
      dampingFactor,
    });
    updateCameraForSize(cam, w, h, orthoHalfHeight);
    return { camera: cam, controls: c, orthoHalfHeight };
  }

  const halfH = orthoHalfHeight || 5;
  const cam = new THREE.OrthographicCamera(
    -halfH * aspect,
    halfH * aspect,
    halfH,
    -halfH,
    0.01,
    2000
  );
  cam.position.copy(pos);

  const c = createOrbitControls({
    camera: cam,
    domElement,
    target,
    dampingFactor,
  });
  updateCameraForSize(cam, w, h, halfH);
  return { camera: cam, controls: c, orthoHalfHeight: halfH };
}

/**
 * 将相机视野适配到 atoms 包围盒（透视/正交均支持）。
 * 返回更新后的 orthoHalfHeight（透视相机则返回传入的 orthoHalfHeight，不改变）。
 */
export function fitCameraToAtoms(params: {
  atoms: Atom[];
  camera: AnyCamera;
  controls: OrbitControls;
  host: HTMLElement | null;
  getSphereRadiusByElement: (el: string) => number;
  orthoHalfHeight: number;
  margin?: number;
}): number {
  const {
    atoms,
    camera,
    controls,
    host,
    getSphereRadiusByElement,
    orthoHalfHeight,
    margin = 1.15,
  } = params;

  const box = new THREE.Box3();
  let maxSphere = 0;

  for (const a of atoms) {
    box.expandByPoint(
      new THREE.Vector3(a.position[0], a.position[1], a.position[2])
    );
    maxSphere = Math.max(maxSphere, getSphereRadiusByElement(a.element));
  }

  box.expandByScalar(Math.max(0.5, maxSphere * 2.0));

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  controls.target.copy(center);

  if (isPerspective(camera)) {
    const fov = (camera.fov * Math.PI) / 180.0;
    const dist = maxSize / 2 / Math.tan(fov / 2);

    camera.position.set(center.x, center.y, center.z + dist * 1.8);
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    controls.update();
    controls.saveState();
    return orthoHalfHeight;
  }

  const rect = host?.getBoundingClientRect();
  const aspect = rect ? rect.width / Math.max(1, rect.height) : 1;

  const halfH = (maxSize / 2) * margin;
  const newHalf = Math.max(halfH, 0.1);

  camera.left = -newHalf * aspect;
  camera.right = newHalf * aspect;
  camera.top = newHalf;
  camera.bottom = -newHalf;

  const dist = maxSize * 2.2;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = Math.max(0.01, dist / 50);
  camera.far = dist * 50;
  camera.updateProjectionMatrix();

  controls.update();
  controls.saveState();
  return newHalf;
}
