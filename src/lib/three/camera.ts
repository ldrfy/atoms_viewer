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
 *
 * 设计目标：
 * - 透视/正交“同一 margin 语义”：margin < 1 => 物体更大（更紧），margin > 1 => 物体更小（更松）
 * - 正交返回新的 orthoHalfHeight（作为状态保存），透视则原样返回传入的 orthoHalfHeight
 */
export function fitCameraToAtoms(params: {
  atoms: Atom[];
  camera: AnyCamera;
  controls: OrbitControls;
  host: HTMLElement | null;
  getSphereRadiusByElement: (el: string) => number;
  orthoHalfHeight: number;

  /**
   * 紧凑系数（统一控制透视与正交）：
   * - < 1：更紧（物体更大）
   * - > 1：更松（物体更小）
   */
  margin?: number;

  /** 最小 near，避免过小导致深度精度问题 */
  minNear?: number;

  /** near/far 余量倍数（越大越不容易裁剪） */
  clipPaddingMul?: number;
}): number {
  const {
    atoms,
    camera,
    controls,
    host,
    getSphereRadiusByElement,
    orthoHalfHeight,
    margin = 1.2,
    minNear = 0.01,
    clipPaddingMul = 3.5, // 3~6 都常见；越大越不容易“旋转裁剪”
  } = params;

  if (!atoms || atoms.length === 0) return orthoHalfHeight;

  // 1) 3D 包围盒（用于中心、包围球）
  const box = new THREE.Box3();
  let maxSphere = 0;

  for (const a of atoms) {
    box.expandByPoint(
      new THREE.Vector3(a.position[0], a.position[1], a.position[2])
    );
    maxSphere = Math.max(maxSphere, getSphereRadiusByElement(a.element));
  }

  // 扩边，避免球体贴边
  const pad = Math.max(0.5, maxSphere * 2.0);
  box.expandByScalar(pad);

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  controls.target.copy(center);

  // 2) aspect
  const rect = host?.getBoundingClientRect();
  const aspect = rect ? rect.width / Math.max(1, rect.height) : 1;

  // 3) 关键：屏幕“大小”只用 XY（你的坐标约定：Z 代表 CNT 轴向/石墨烯法向）
  const halfW = size.x / 2;
  const halfH = size.y / 2;

  // 4) 用包围球控制裁剪面（旋转不敏感）
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r = sphere.radius;

  if (isPerspective(camera)) {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const tanV = Math.tan(vFov / 2);
    const tanH = tanV * aspect;

    // 同时满足宽/高都装得下（避免窄屏时石墨烯过大）
    const distV = halfH / Math.max(1e-6, tanV);
    const distH = halfW / Math.max(1e-6, tanH);
    const baseDist = Math.max(distV, distH);

    // margin < 1 => 更近 => 物体更大
    const dist = Math.max(0.05, baseDist * margin);

    // 仍沿 +Z 放置（与你现有体系一致）
    camera.position.set(center.x, center.y, center.z + dist);

    // 关键修复：near/far 用包围球半径给足余量，防止旋转后裁剪
    camera.near = Math.max(minNear, dist - r * clipPaddingMul);
    camera.far = dist + r * clipPaddingMul;

    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();
    return orthoHalfHeight;
  }

  // 正交：halfHeight 既要容纳高度，也要容纳宽度（按 aspect 折算）
  const baseHalf = Math.max(halfH, halfW / Math.max(1e-6, aspect));
  const newHalf = Math.max(0.1, baseHalf * margin);

  camera.left = -newHalf * aspect;
  camera.right = newHalf * aspect;
  camera.top = newHalf;
  camera.bottom = -newHalf;

  // 正交相机距离不影响屏幕大小，但仍放远一点更稳
  const dist = Math.max(0.05, r * 2.2);
  camera.position.set(center.x, center.y, center.z + dist);

  // 同样用包围球设置裁剪面，旋转不敏感
  camera.near = Math.max(minNear, dist - r * clipPaddingMul);
  camera.far = dist + r * clipPaddingMul;

  camera.updateProjectionMatrix();
  controls.update();
  controls.saveState();
  return newHalf;
}
