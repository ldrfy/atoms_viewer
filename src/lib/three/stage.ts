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
    updateCameraForSize(camera, size.w, size.h, orthoHalfHeight);
    return size;
  };

  const disposeResize = observeElementResize(host, () => {
    syncSize();
  });

  const rafLoop: RafLoop = createRafLoop(() => {
    onBeforeRender();
    controls.update();
    renderer.render(scene, camera);
    labelRenderer?.render(scene, camera);
  });

  /**
   * 切换透视/正交相机。
   *
   * Switch between perspective and orthographic camera.
   */
  const setProjectionMode = (orthographic: boolean): void => {
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
    orthoHalfHeight = res.orthoHalfHeight;

    // 如果 controls 实例变化，需要释放旧 controls
    // Dispose old controls if a new instance was created
    if (prevControls !== controls) prevControls.dispose();

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
  };
}
