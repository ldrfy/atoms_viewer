import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import { createRafLoop, type RafLoop } from "./loop";
import { observeElementResize, syncRenderersToHost } from "./resize";
import { attachCss2dRenderer } from "./labels2d";
import {
  isPerspective,
  switchProjectionMode,
  updateCameraForSize,
  type AnyCamera,
} from "./camera";
import { normalizeViewPresets, type ViewPreset } from "../viewer/viewPresets";
import { applyCameraPoseForPreset } from "./viewPresets";

/**
 * Three.js 舞台对象：负责 renderer/scene/camera/controls/resize/loop 等生命周期管理。
 *
 * Three.js stage: manages lifecycle for renderer/scene/camera/controls/resize/render loop.
 */
export type ThreeStage = {
  /** 画布容器 / Host container */
  host: HTMLDivElement;

  /** Three Scene / 场景 */
  scene: THREE.Scene;

  /** WebGL Renderer / 渲染器 */
  renderer: THREE.WebGLRenderer;

  /** CSS2D Renderer（用于文字标签） / CSS2D renderer for labels */
  labelRenderer: CSS2DRenderer | null;

  /** 旋转枢轴组 / Pivot group (rotation center) */
  pivotGroup: THREE.Group;

  /** 模型组（相对 pivot 偏移） / Model group (offset relative to pivot) */
  modelGroup: THREE.Group;

  /** 轴/标签组 / Axes and labels group */
  axesGroup: THREE.Group;

  /** 获取当前相机 / Get current camera */
  getCamera: () => AnyCamera;

  /** 获取当前控制器 / Get current controls */
  getControls: () => OrbitControls;

  /** 获取正交半高 / Get ortho half-height */
  getOrthoHalfHeight: () => number;

  /** 设置正交半高 / Set ortho half-height */
  setOrthoHalfHeight: (v: number) => void;

  /** 切换投影模式 / Switch projection mode */
  setProjectionMode: (orthographic: boolean) => void;

  /** 同步 renderer/labelRenderer 尺寸 / Sync renderer sizes */
  syncSize: () => { w: number; h: number };

  /** 启动渲染循环 / Start render loop */
  start: () => void;

  /** 停止渲染循环 / Stop render loop */
  stop: () => void;

  /** 释放资源 / Dispose resources */
  dispose: () => void;

  /** Multi-view presets (choose 1 => single view, choose 2 => dual view). */
  setViewPresets: (presets: ViewPreset[]) => void;
  /** Current normalized view presets. */
  getViewPresets: () => ViewPreset[];
  /** Secondary camera for the 2nd viewport (when dual view is active). */
  getAuxCamera: () => AnyCamera | null;

  /** Get current dual-view distance (effective; in ortho mapped from zoom). */
  getDualViewDistance: () => number;

  /** Dual view (front+side): enable/disable */
  setDualViewEnabled: (enabled: boolean) => void;
  /** Dual view camera distance (world units). For orthographic, mapped to zoom. */
  setDualViewDistance: (dist: number) => void;
  /** Dual view split ratio for left viewport (0..1). */
  setDualViewSplit: (ratio: number) => void;
};

/**
 * 创建 Three.js 舞台（初始化、resize、raf-loop）。
 *
 * Create a Three.js stage (init, resize handling, raf loop).
 *
 * @param params - 参数 / Params
 * @param params.host - 容器元素 / Host element
 * @param params.orthoHalfHeight - 初始正交半高 / Initial ortho half-height
 * @param params.onBeforeRender - 每帧渲染前回调（可用于动画推进） / Callback before each render
 * @returns ThreeStage
 */
export function createThreeStage(params: {
  host: HTMLDivElement;
  orthoHalfHeight: number;
  onBeforeRender: () => void;
}): ThreeStage {
  const { host, onBeforeRender } = params;

  // --- scene graph / 场景图 ---
  const scene = new THREE.Scene();
  scene.background = null;

  const pivotGroup = new THREE.Group();
  const modelGroup = new THREE.Group();
  pivotGroup.add(modelGroup);

  const axesGroup = new THREE.Group();
  pivotGroup.add(axesGroup);

  scene.add(pivotGroup);

  // --- camera / 相机 ---
  let camera: AnyCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(0, 0, 10);

  // --- multi-view presets (front / side / top) ---
  // [] => normal single view (free orbit)
  // [x] => single view locked to preset x
  // [a,b] => dual view (left=a, right=b)
  let viewPresets: ViewPreset[] = [];

  // Reuse legacy field names for persistence/UI.
  let dualViewDistance = 10; // world units
  let dualViewOrthoBaseDist = 10; // used to map dist -> zoom
  let dualViewSplit = 0.5; // left viewport ratio

  let auxCamera: AnyCamera | null = null;

  // --- renderer / 渲染器 ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  host.appendChild(renderer.domElement);

  // --- css2d labels / 2D 标签 ---
  const labelRenderer = attachCss2dRenderer(host, "2");

  // --- lights / 灯光 ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(5, 8, 10);
  scene.add(dir);

  // --- controls / 轨道控制 ---
  let controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Interaction model: we rotate the *model* (pivot group) instead of orbiting the camera.
  // Keep zoom/pan enabled, but disable camera rotation so settings' XYZ rotation can stay in sync.
  controls.enableRotate = false;

  /**
   * OrbitControls 只作用于主相机。
   * 当启用“预设视角”时，需要把“当前距离/缩放”同步回 dualViewDistance，
   * 以便其它视角相机能实时跟随。
   */
  const onControlsChange = (): void => {
    if (viewPresets.length === 0) return;

    if (isPerspective(camera)) {
      dualViewDistance = camera.position.distanceTo(controls.target);
      return;
    }

    const ortho = camera as THREE.OrthographicCamera;
    // Orthographic: dist <-> zoom, dist == base -> zoom 1
    dualViewDistance = dualViewOrthoBaseDist / Math.max(1e-6, ortho.zoom ?? 1);
  };

  controls.addEventListener("change", onControlsChange);

  // 正交相机 frustum 半高：会随 fit/resize 更新
  // Ortho frustum half-height: updated by fit/resize
  let orthoHalfHeight = params.orthoHalfHeight;

  /**
   * 同步 renderer/labelRenderer 尺寸，并更新相机投影矩阵。
   *
   * Sync renderer sizes and update camera projection matrix.
   */
  const syncSize = (): { w: number; h: number } => {
    const size = syncRenderersToHost(host, renderer, labelRenderer);

    const isDual = viewPresets.length === 2;
    const leftW = isDual ? Math.floor(size.w * dualViewSplit) : size.w;
    const rightW = isDual ? Math.max(1, size.w - leftW) : size.w;
    updateCameraForSize(camera, leftW, size.h, orthoHalfHeight);

    if (isDual) {
      if (!auxCamera) auxCamera = camera.clone() as AnyCamera;
      updateCameraForSize(auxCamera, rightW, size.h, orthoHalfHeight);

      // Make the label renderer cover only the left half to avoid layout mismatch.
      if (labelRenderer) {
        labelRenderer.setSize(leftW, size.h);
        const el = labelRenderer.domElement as HTMLElement;
        el.style.width = `${leftW}px`;
        el.style.height = `${size.h}px`;
        el.style.left = `0px`;
        el.style.right = "auto";
      }
    } else {
      // Restore label renderer to full width.
      if (labelRenderer) {
        labelRenderer.setSize(size.w, size.h);
        const el = labelRenderer.domElement as HTMLElement;
        el.style.width = `${size.w}px`;
        el.style.height = `${size.h}px`;
        el.style.left = `0px`;
        el.style.right = "0px";
      }
    }
    return size;
  };

  const disposeResize = observeElementResize(host, () => {
    syncSize();
  });

  const tmpV3 = new THREE.Vector3();
  const tmpV3b = new THREE.Vector3();

  /** Preset quaternions relative to the canonical "front" view. */
  const qFront = new THREE.Quaternion(); // identity
  const qSide = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2
  );
  const qTop = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2
  );

  function presetQuat(p: ViewPreset): THREE.Quaternion {
    switch (p) {
      case "side":
        return qSide;
      case "top":
        return qTop;
      case "front":
      default:
        return qFront;
    }
  }

  // Offset between the two chosen presets (from left to right).
  const presetOffset = new THREE.Quaternion();
  function updatePresetOffset(): void {
    if (viewPresets.length !== 2) {
      presetOffset.identity();
      return;
    }
    // noUncheckedIndexedAccess: even after length checks, indexed access is ViewPreset | undefined.
    const pL = viewPresets[0];
    const pR = viewPresets[1];
    if (!pL || !pR) {
      presetOffset.identity();
      return;
    }

    const qL = presetQuat(pL).clone();
    const qR = presetQuat(pR).clone();
    presetOffset.copy(qR.multiply(qL.invert()));
  }

  function applyViewDistance(dist: number): void {
    dualViewDistance = Math.max(0.001, dist);

    const target = controls.target;
    const dir = camera.position.clone().sub(target).normalize();

    // Perspective: move along current view direction.
    if (isPerspective(camera)) {
      camera.position.copy(
        target.clone().add(dir.multiplyScalar(dualViewDistance))
      );
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }

    // Orthographic: map distance to zoom (dist == base -> zoom 1)
    const ortho = camera as THREE.OrthographicCamera;
    const z = dualViewOrthoBaseDist / Math.max(1e-6, dualViewDistance);
    ortho.zoom = Math.max(1e-3, z);
    ortho.updateProjectionMatrix();

    // Keep aux camera zoom in sync for orthographic dual-view.
    if (viewPresets.length === 2 && auxCamera && !isPerspective(auxCamera)) {
      const auxOrtho = auxCamera as THREE.OrthographicCamera;
      auxOrtho.zoom = ortho.zoom;
      auxOrtho.updateProjectionMatrix();
    }

    // IMPORTANT: In orthographic mode, OrbitControls' dolly changes zoom.
    // Do NOT move camera.position here; otherwise wheel/slider zoom will fight and cause jitter.
  }

  function syncAuxCameraPose(sizeW: number, sizeH: number): void {
    if (viewPresets.length !== 2) return;
    if (!auxCamera) return;

    const leftW = Math.floor(sizeW * dualViewSplit);
    const rightW = Math.max(1, sizeW - leftW);

    // Keep camera type consistent.
    if (isPerspective(camera) !== isPerspective(auxCamera)) {
      auxCamera = camera.clone() as AnyCamera;
      updateCameraForSize(auxCamera, rightW, sizeH, orthoHalfHeight);
    }

    // If both are orthographic, keep zoom consistent (distance maps to zoom).
    if (!isPerspective(camera) && !isPerspective(auxCamera)) {
      (auxCamera as THREE.OrthographicCamera).zoom = (
        camera as THREE.OrthographicCamera
      ).zoom;
      (auxCamera as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    const target = controls.target;

    // Derive the second camera pose from the main camera pose by applying a fixed preset offset.
    // This keeps both viewports rotating together "like before".
    tmpV3.copy(camera.position).sub(target);
    tmpV3.applyQuaternion(presetOffset);
    tmpV3.add(target);
    auxCamera.position.copy(tmpV3);

    tmpV3b.copy(camera.up).applyQuaternion(presetOffset);
    auxCamera.up.copy(tmpV3b);
    auxCamera.lookAt(target);

    // Keep clipping planes consistent with the main camera to avoid layer clipping in the side view.
    auxCamera.near = camera.near;
    auxCamera.far = camera.far;
    (auxCamera as any).updateProjectionMatrix?.();
  }

  const rafLoop: RafLoop = createRafLoop(() => {
    onBeforeRender();
    controls.update();
    // Keep dual-view distance in sync (used by the distance slider and ortho mapping).
    onControlsChange();

    if (viewPresets.length !== 2) {
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      labelRenderer?.render(scene, camera);
      return;
    }

    const rect = host.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    const leftW = Math.floor(w * dualViewSplit);
    const rightW = Math.max(1, w - leftW);

    // Update aux camera pose each frame.
    syncAuxCameraPose(w, h);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.clear(true, true, true);

    // Left: main camera
    renderer.setViewport(0, 0, leftW, h);
    renderer.setScissor(0, 0, leftW, h);
    renderer.render(scene, camera);

    // Right: aux camera
    if (auxCamera) {
      renderer.setViewport(leftW, 0, rightW, h);
      renderer.setScissor(leftW, 0, rightW, h);
      renderer.render(scene, auxCamera);
    }

    renderer.setScissorTest(false);
    renderer.autoClear = prevAutoClear;

    // Labels: render only for the left view.
    labelRenderer?.render(scene, camera);
  });

  /**
   * 切换透视/正交相机。
   *
   * Switch between perspective and orthographic camera.
   */
  const setProjectionMode = (orthographic: boolean): void => {
    const currentlyOrtho = !isPerspective(camera);
    if (orthographic === currentlyOrtho) return;

    const prevCamera = camera;
    const prevControls = controls;

    const prevPos = prevCamera.position.clone();
    const prevTarget = prevControls.target.clone();

    const res = switchProjectionMode({
      orthographic,
      camera: prevCamera,
      controls: prevControls,
      domElement: renderer.domElement,
      host,
      orthoHalfHeight,
      fovDeg: 45,
      dampingFactor: 0.08,
    });

    camera = res.camera;
    controls = res.controls;
    // Keep interaction model consistent: we rotate the model (pivot), not the camera.
    controls.enableRotate = false;
    // Re-bind controls change listener (controls instance may change)
    controls.addEventListener("change", onControlsChange);
    orthoHalfHeight = res.orthoHalfHeight;

    // Update cached base distance used by dist <-> zoom mapping.
    dualViewOrthoBaseDist = camera.position.distanceTo(controls.target);
    // Recreate aux camera (used when dual-view is active) to match camera type.
    if (viewPresets.length === 2) {
      auxCamera = camera.clone() as AnyCamera;
    }
    // If presets are enabled, re-apply the locked distance/zoom.
    if (viewPresets.length > 0) {
      applyViewDistance(dualViewDistance);
    }

    // 如果 controls 实例变化，需要释放旧 controls
    // Dispose old controls if a new instance was created
    if (prevControls !== controls) {
      prevControls.removeEventListener("change", onControlsChange);
      prevControls.dispose();
    }

    // 透视 -> 正交：保持视觉缩放接近一致
    // Perspective -> Ortho: keep similar perceived zoom
    if (!isPerspective(camera) && isPerspective(prevCamera)) {
      const dist = prevPos.distanceTo(prevTarget);
      const fovRad = (prevCamera.fov * Math.PI) / 180;
      orthoHalfHeight = dist * Math.tan(fovRad / 2);

      const rect = host.getBoundingClientRect();
      updateCameraForSize(
        camera,
        Math.floor(rect.width),
        Math.floor(rect.height),
        orthoHalfHeight
      );
    }

    // Re-sync size for the current render mode (single vs dual)
    syncSize();
  };

  const start = (): void => {
    syncSize();
    rafLoop.start();
  };

  const stop = (): void => {
    rafLoop.stop();
  };

  const dispose = (): void => {
    stop();
    disposeResize();

    controls.dispose();

    if (labelRenderer) {
      labelRenderer.domElement.parentElement?.removeChild(
        labelRenderer.domElement
      );
    }

    renderer.dispose();
    const canvas = renderer.domElement;
    canvas.parentElement?.removeChild(canvas);
  };

  const setViewPresets = (presets: ViewPreset[]): void => {
    viewPresets = normalizeViewPresets(presets);

    // Presets define camera directions, but we keep camera rotation disabled.
    // User interaction rotates the model via ViewerStage (pivot rotation).
    controls.enableRotate = false;

    if (viewPresets.length === 2 && !auxCamera) {
      auxCamera = camera.clone() as AnyCamera;
    }

    updatePresetOffset();

    if (viewPresets.length > 0) {
      const preset0 = viewPresets[0];
      if (!preset0) {
        syncSize();
        return;
      }
      // Re-orient the main camera to the selected preset, but do NOT lock it.
      // Use current distance to keep perceived scale consistent.
      const target = controls.target;
      const dist = Math.max(1e-6, camera.position.distanceTo(target));
      applyCameraPoseForPreset({
        camera,
        preset: preset0,
        target,
        distance: dist,
      });
      // Cache base dist for ortho mapping after pose change.
      dualViewOrthoBaseDist = camera.position.distanceTo(controls.target);
      // Ensure distance/zoom is consistent with the slider setting.
      applyViewDistance(dualViewDistance);
    }

    syncSize();
  };

  const setDualViewEnabled = (enabled: boolean): void => {
    // Backward-compat: old dual-view toggle means [front, side]
    setViewPresets(enabled ? ["front", "side"] : []);
  };

  const setDualViewDistance = (dist: number): void => {
    // Keep settings in sync even when disabled, but only apply to the camera when presets are enabled.
    const d = Math.max(0.001, dist);
    // If this update comes from controls-sync (wheel/pinch), it may already match the stage state.
    // Avoid re-applying to prevent feedback jitter.
    if (Math.abs(d - dualViewDistance) < 1e-6) {
      dualViewDistance = d;
      return;
    }
    dualViewDistance = d;
    if (viewPresets.length === 0) return;
    applyViewDistance(dualViewDistance);
  };

  const setDualViewSplit = (ratio: number): void => {
    // clamp to avoid unusable viewport sizes
    const r = Math.max(0.1, Math.min(0.9, ratio));
    dualViewSplit = r;
    if (viewPresets.length !== 2) return;
    syncSize();
  };

  return {
    host,
    scene,
    renderer,
    labelRenderer,
    pivotGroup,
    modelGroup,
    axesGroup,

    getCamera: () => camera,
    getControls: () => controls,

    getOrthoHalfHeight: () => orthoHalfHeight,
    setOrthoHalfHeight: (v: number) => {
      orthoHalfHeight = v;
    },

    setProjectionMode,
    syncSize,
    start,
    stop,
    dispose,

    setViewPresets,
    getViewPresets: () => viewPresets.slice(),
    getAuxCamera: () => auxCamera,

    getDualViewDistance: () => dualViewDistance,

    setDualViewEnabled,
    setDualViewDistance,
    setDualViewSplit,
  };
}
