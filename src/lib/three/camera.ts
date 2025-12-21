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

  // 注意：不重置 zoom，只更新视锥边界
  camera.left = -orthoHalfHeight * aspect;
  camera.right = orthoHalfHeight * aspect;
  camera.top = orthoHalfHeight;
  camera.bottom = -orthoHalfHeight;
  camera.updateProjectionMatrix();
}

/**
 * 切换投影模式：保持 controls.target 与“屏幕尺度”连续（不跳变）。
 */
export function switchProjectionMode(params: {
  orthographic: boolean;
  camera: AnyCamera;
  controls: OrbitControls;
  domElement: HTMLElement;
  host: HTMLElement;
  orthoHalfHeight: number;
  fovDeg?: number; // 目标透视 FOV
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

  // 方向与距离（沿当前视线保持）
  const pos = camera.position.clone();
  const up = camera.up.clone();
  const viewDir = pos.clone().sub(target).normalize(); // 从 target 指向 camera
  const dist = pos.distanceTo(target);

  const { w, h } = getElementSize(host);
  const aspect = w / Math.max(1, h);

  controls.dispose();

  const fovRad = THREE.MathUtils.degToRad(
    isPerspective(camera) ? camera.fov : fovDeg
  );

  // ---------- 切到透视 ----------
  if (!orthographic) {
    // 若当前是正交，需要算一个匹配当前正交尺度的透视距离
    let newPos = pos.clone();

    if (!isPerspective(camera)) {
      // 正交有效 halfHeight = orthoHalfHeight / zoom
      // 如果你传入的 orthoHalfHeight 是“未缩放基准”，这里要除以 camera.zoom
      const effectiveHalfH =
        (orthoHalfHeight || 5) / Math.max(1e-6, camera.zoom);
      const newDist = effectiveHalfH / Math.tan(fovRad / 2);
      newPos = target.clone().add(viewDir.multiplyScalar(newDist));
    }

    const cam = new THREE.PerspectiveCamera(fovDeg, aspect, 0.01, 2000);
    cam.position.copy(newPos);
    cam.up.copy(up);
    cam.lookAt(target);

    // near/far 建议按距离自适应，避免裁剪
    const useDist = cam.position.distanceTo(target);
    cam.near = Math.max(0.01, useDist / 100);
    cam.far = useDist * 100;
    cam.updateProjectionMatrix();

    const c = createOrbitControls({
      camera: cam,
      domElement,
      target,
      dampingFactor,
    });
    updateCameraForSize(cam, w, h, orthoHalfHeight);

    return { camera: cam, controls: c, orthoHalfHeight };
  }

  // ---------- 切到正交 ----------
  // 若当前是透视，需要算一个匹配当前透视尺度的 orthoHalfHeight
  let newHalfH = orthoHalfHeight || 5;

  if (isPerspective(camera)) {
    // 在 target 平面处，透视视野 halfHeight = dist * tan(fov/2)
    newHalfH = dist * Math.tan(fovRad / 2);
    // 可选：给一点下限，避免数值过小
    newHalfH = Math.max(newHalfH, 0.1);
  }

  const cam = new THREE.OrthographicCamera(
    -newHalfH * aspect,
    newHalfH * aspect,
    newHalfH,
    -newHalfH,
    0.01,
    2000
  );
  cam.position.copy(pos);
  cam.up.copy(up);
  cam.lookAt(target);

  // 如果原本就是正交，建议保留 zoom（否则用户缩放会丢失）
  if (!isPerspective(camera)) {
    cam.zoom = camera.zoom;
  }
  cam.updateProjectionMatrix();

  const c = createOrbitControls({
    camera: cam,
    domElement,
    target,
    dampingFactor,
  });
  updateCameraForSize(cam, w, h, newHalfH);

  return { camera: cam, controls: c, orthoHalfHeight: newHalfH };
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
