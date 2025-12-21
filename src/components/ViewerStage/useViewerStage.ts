import { watch, onBeforeUnmount, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";

import { message } from "ant-design-vue";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import type { Atom, StructureModel } from "../../lib/structure/types";
import {
  parseStructure,
  loadStructureFromFile,
} from "../../lib/structure/parse";
import {
  getCovalentRadiusAng,
  getElementColorHex,
  normalizeElementSymbol,
} from "../../lib/structure/chem";
import { useI18n } from "vue-i18n";
import xyzText from "../../assets/samples/mos2_cnt.xyz?raw";

// 你已有 bondSegments.ts：这里假定导出 buildBicolorBondGroups
import { buildBicolorBondGroups } from "../../lib/structure/bondSegments";

import { createRafLoop, type RafLoop } from "../../lib/three/loop";
import {
  observeElementResize,
  syncRenderersToHost,
} from "../../lib/three/resize";
import { attachCss2dRenderer, makeTextLabel } from "../../lib/three/labels2d";
import {
  fitCameraToAtoms,
  switchProjectionMode,
  updateCameraForSize,
  isPerspective,
  type AnyCamera,
} from "../../lib/three/camera";
import { exportTransparentCroppedPng } from "../../lib/three/exportPng";

type ViewerStageBindings = {
  canvasHostRef: ReturnType<typeof ref<HTMLDivElement | null>>;
  fileInputRef: ReturnType<typeof ref<HTMLInputElement | null>>;
  isDragging: ReturnType<typeof ref<boolean>>;
  hasModel: ReturnType<typeof ref<boolean>>;
  isLoading: ReturnType<typeof ref<boolean>>;

  openFilePicker: () => void;
  onDragEnter: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => Promise<void>;
  onFilePicked: (e: Event) => Promise<void>;
  onExportPng: (scale: number) => Promise<void>;
  preloadDefault: () => void;

  // animation
  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;
};

type BondBuildResult = { meshes: THREE.InstancedMesh[]; segCount: number };

export function useViewerStage(
  settingsRef: Readonly<Ref<ViewerSettings>>
): ViewerStageBindings {
  const canvasHostRef = ref<HTMLDivElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const isDragging = ref(false);
  const dragDepth = ref(0);
  const hasModel = ref(false);
  const isLoading = ref(false);

  // ------- 与压缩包(OpenMX Viewer.html)一致的默认系数 -------
  const ATOM_SIZE_FACTOR = 0.5;
  const BOND_FACTOR = 1.05;
  const BOND_THICKNESS_FACTOR = 1.0;
  const BOND_RADIUS = 0.09 * BOND_THICKNESS_FACTOR;

  const { t } = useI18n();

  // three core
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: AnyCamera | null = null;
  let controls: OrbitControls | null = null;

  let disposeResize: (() => void) | null = null;
  let rafLoop: RafLoop | null = null;

  let orthoHalfHeight = 5; // 正交相机 frustum 的半高，会随 fit/resize 更新

  let pivotGroup: THREE.Group | null = null;
  let modelGroup: THREE.Group | null = null;
  let axesHelper: THREE.AxesHelper | null = null;
  let axesGroup: THREE.Group | null = null;
  let labelRenderer: CSS2DRenderer | null = null;

  // model meshes
  let atomMeshes: THREE.InstancedMesh[] = [];
  let bondMeshes: THREE.InstancedMesh[] = [];
  let lastBondSegCount = 0;

  // animation state（xyz 多帧）
  const hasAnimation = ref(false);
  const frameIndex = ref(0);
  const frameCount = ref(1);
  const isPlaying = ref(false);
  const fps = ref(6);

  let animFrames: Atom[][] = [];
  let baseCenter = new THREE.Vector3(); // 第一帧中心，用于“锁定模型不漂移”
  let animLastMs = 0;
  let animAccMs = 0;

  function getSettings(): ViewerSettings {
    return settingsRef.value;
  }

  function openFilePicker(): void {
    fileInputRef.value?.click();
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
    mesh.geometry.dispose();
    const { material } = mesh;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  }

  function clearModel(): void {
    stopPlay();
    if (!scene) return;

    for (const m of atomMeshes) {
      modelGroup?.remove(m);
      disposeInstancedMesh(m);
    }
    atomMeshes = [];

    for (const m of bondMeshes) {
      modelGroup?.remove(m);
      disposeInstancedMesh(m);
    }
    bondMeshes = [];
    lastBondSegCount = 0;

    hasModel.value = false;
  }

  function getSphereRadiusByElement(el: string): number {
    return ATOM_SIZE_FACTOR * getCovalentRadiusAng(el);
  }

  function buildAtomMeshesByElement(atoms: Atom[]): THREE.InstancedMesh[] {
    const elementToIndices = new Map<string, number[]>();
    for (let i = 0; i < atoms.length; i += 1) {
      const a = atoms[i];
      if (!a) continue;
      const arr = elementToIndices.get(a.element);
      if (arr) arr.push(i);
      else elementToIndices.set(a.element, [i]);
    }

    const meshes: THREE.InstancedMesh[] = [];
    const mat = new THREE.Matrix4();

    for (const [el, indices] of elementToIndices.entries()) {
      const baseRadius = getSphereRadiusByElement(el); // 不含 atomScale
      const rSphere = baseRadius * getSettings().atomScale;

      const geometry = new THREE.SphereGeometry(rSphere, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(getElementColorHex(el)),
        metalness: 0.05,
        roughness: 0.9,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
      mesh.userData.baseRadius = baseRadius;
      mesh.userData.element = el;

      // 关键：保存 instanceIndex -> atomIndex 的映射
      mesh.userData.atomIndices = indices;

      for (let k = 0; k < indices.length; k += 1) {
        const a = atoms[indices[k]!]!;
        const [x, y, z] = a.position;
        mat.makeTranslation(x, y, z);
        mesh.setMatrixAt(k, mat);
      }

      mesh.instanceMatrix.needsUpdate = true;
      meshes.push(mesh);
    }

    return meshes;
  }

  function buildBondMeshesBicolor(atoms: Atom[]): BondBuildResult {
    // 纯数据：由 lib/structure/bondSegments.ts 提供
    const { groups, segCount } = buildBicolorBondGroups(atoms, {
      bondFactor: BOND_FACTOR,
      atomSizeFactor: ATOM_SIZE_FACTOR,
    });

    if (segCount === 0) return { meshes: [], segCount: 0 };

    const meshes: THREE.InstancedMesh[] = [];

    const geometry = new THREE.CylinderGeometry(
      BOND_RADIUS,
      BOND_RADIUS,
      1.0,
      12,
      1,
      false
    );
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const center = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();

    for (const [el, segs] of groups.entries()) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(getElementColorHex(el)),
        metalness: 0.0,
        roughness: 0.85,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, segs.length);

      for (let i = 0; i < segs.length; i += 1) {
        const seg = segs[i]!;
        p1.set(seg.p1[0], seg.p1[1], seg.p1[2]);
        p2.set(seg.p2[0], seg.p2[1], seg.p2[2]);

        center.addVectors(p1, p2).multiplyScalar(0.5);

        dir.subVectors(p2, p1);
        const len = dir.length();
        if (len < 1.0e-7) {
          m.identity();
          mesh.setMatrixAt(i, m);
          continue;
        }

        dir.multiplyScalar(1 / len);
        q.setFromUnitVectors(up, dir);
        s.set(1, len, 1);
        m.compose(center, q, s);

        mesh.setMatrixAt(i, m);
      }

      mesh.instanceMatrix.needsUpdate = true;
      meshes.push(mesh);
    }

    return { meshes, segCount };
  }

  function applyShowAxes(): void {
    if (!axesGroup) return;
    axesGroup.visible = getSettings().showAxes;
  }

  function applyShowBonds(): void {
    const flag = getSettings().showBonds;
    for (const m of bondMeshes) m.visible = flag;
  }

  function applyAtomScale(): void {
    const scale = getSettings().atomScale;

    for (const m of atomMeshes) {
      const baseRadius = m.userData.baseRadius as number | undefined;
      if (!baseRadius || baseRadius <= 0) continue;

      const r = baseRadius * scale;
      m.geometry.dispose();
      m.geometry = new THREE.SphereGeometry(r, 16, 16);
    }
  }

  function degToRad(d: number): number {
    return (d * Math.PI) / 180;
  }

  function applyModelRotation(): void {
    if (!pivotGroup) return;
    const s = getSettings();
    pivotGroup.rotation.set(
      degToRad(s.rotationDeg.x),
      degToRad(s.rotationDeg.y),
      degToRad(s.rotationDeg.z)
    );
  }

  function resetView(): void {
    if (!camera || !controls) return;

    // 目标点保持不变（即当前 orbit 的中心）
    const target = controls.target.clone();

    // 保持当前“距离”，避免透视相机缩放变化
    const radius = Math.max(1e-6, camera.position.distanceTo(target));

    // 只恢复方向：从 +Z 方向看向 target（你也可换成 +Y/+X）
    camera.up.set(0, 1, 0);
    camera.position.set(target.x, target.y, target.z + radius);

    camera.lookAt(target);
    controls.update();
    controls.saveState();
  }

  function setProjectionMode(orthographic: boolean): void {
    if (!renderer || !camera || !controls) return;

    const host = canvasHostRef.value;
    if (!host) return;

    const prevCamera = camera; // 记录切换前相机
    const prevPos = prevCamera.position.clone();
    const prevTarget = controls.target.clone();

    const res = switchProjectionMode({
      orthographic,
      camera: prevCamera,
      controls,
      domElement: renderer.domElement,
      host,
      orthoHalfHeight,
      fovDeg: 45,
      dampingFactor: 0.08,
    });

    camera = res.camera;
    controls = res.controls;
    orthoHalfHeight = res.orthoHalfHeight;

    // 不再 fit！

    // 可选：透视 -> 正交时，保持“视觉缩放”接近一致
    if (!isPerspective(camera) && isPerspective(prevCamera)) {
      const dist = prevPos.distanceTo(prevTarget);
      const fovRad = (prevCamera.fov * Math.PI) / 180;
      orthoHalfHeight = dist * Math.tan(fovRad / 2);

      // 更新一次投影矩阵
      const rect = host.getBoundingClientRect();
      updateCameraForSize(
        camera,
        Math.floor(rect.width),
        Math.floor(rect.height),
        orthoHalfHeight
      );
    }
  }

  watch(
    () => getSettings().orthographic,
    (v) => setProjectionMode(v),
    { immediate: true }
  );

  watch(
    () => getSettings().resetViewSeq,
    () => resetView()
  );

  watch(
    () => getSettings().atomScale,
    () => applyAtomScale()
  );

  watch(
    () => getSettings().showBonds,
    () => applyShowBonds(),
    { immediate: true }
  );

  watch(
    () => getSettings().showAxes,
    () => applyShowAxes(),
    { immediate: true }
  );

  watch(
    () => {
      const s = getSettings();
      return [s.rotationDeg.x, s.rotationDeg.y, s.rotationDeg.z];
    },
    () => applyModelRotation(),
    { immediate: true }
  );

  function renderModel(model: StructureModel): void {
    // 取第一帧作为建模基准
    const frames =
      model.frames && model.frames.length > 0 ? model.frames : [model.atoms];

    // 统一 normalize element（第一帧必须做；其余帧建议也做，避免元素大小写不一致）
    animFrames = frames.map((fr) =>
      fr.map((a) => ({
        element: normalizeElementSymbol(a.element),
        position: a.position,
      }))
    );

    // 基本校验：多帧必须原子数一致，否则无法用 instanceIndex 复用
    const n0 = animFrames[0]!.length;
    for (let fi = 1; fi < animFrames.length; fi += 1) {
      if (animFrames[fi]!.length !== n0) {
        throw new Error("XYZ 多帧动画要求每一帧原子数相同。");
      }
    }

    // 动画状态
    frameIndex.value = 0;
    frameCount.value = animFrames.length;
    hasAnimation.value = frameCount.value > 1;
    stopPlay(); // 加载新模型时默认停止

    // 用第一帧建 mesh / bonds / camera
    const atoms: Atom[] = animFrames[0]!;

    if (!scene || !pivotGroup || !modelGroup || !camera || !controls) return;

    clearModel();

    // 计算模型中心（用于设置旋转枢轴）
    const box = new THREE.Box3();
    for (const a of atoms) {
      box.expandByPoint(
        new THREE.Vector3(a.position[0], a.position[1], a.position[2])
      );
    }
    const center = box.getCenter(new THREE.Vector3());
    baseCenter.copy(center);

    // 让 pivot 位于模型中心，modelGroup 反向平移，使世界坐标不变
    pivotGroup.position.copy(center);
    modelGroup.position.set(-center.x, -center.y, -center.z);

    atomMeshes = buildAtomMeshesByElement(atoms);
    atomMeshes.forEach((m) => modelGroup!.add(m));

    const bondRes = buildBondMeshesBicolor(atoms);
    bondMeshes = bondRes.meshes;
    lastBondSegCount = bondRes.segCount;
    bondMeshes.forEach((m) => modelGroup!.add(m));

    hasModel.value = true;

    // fit 相机
    const host = canvasHostRef.value;
    const newHalf = fitCameraToAtoms({
      atoms,
      camera,
      controls,
      host,
      getSphereRadiusByElement,
      orthoHalfHeight,
    });
    if (!isPerspective(camera)) orthoHalfHeight = newHalf;

    applyAtomScale();
    applyShowBonds();
    applyShowAxes();
    applyModelRotation();

    applyFrameAtoms(animFrames[0]!);

    // 轴标签 & axes helper
    const size = box.getSize(new THREE.Vector3());
    const axisLen = Math.max(size.x, size.y, size.z) * 0.6;

    if (axesGroup) {
      if (axesHelper) axesGroup.remove(axesHelper);

      const lx = makeTextLabel("X");
      lx.position.set(axisLen, 0, 0);

      const ly = makeTextLabel("Y");
      ly.position.set(0, axisLen, 0);

      const lz = makeTextLabel("Z");
      lz.position.set(0, 0, axisLen);

      axesGroup.add(lx, ly, lz);

      axesHelper = new THREE.AxesHelper(axisLen);
      (axesHelper.material as THREE.LineBasicMaterial).depthTest = false;
      axesHelper.renderOrder = 999;
      axesGroup.add(axesHelper);
    }
  }

  function setFrame(idx: number): void {
    if (!hasAnimation.value) return;

    const n = animFrames.length;
    const clamped = Math.min(Math.max(0, idx), n - 1);
    frameIndex.value = clamped;

    applyFrameAtoms(animFrames[clamped]!);
  }

  function stopPlay(): void {
    isPlaying.value = false;
    animLastMs = 0;
    animAccMs = 0;
  }

  function togglePlay(): void {
    if (!hasAnimation.value) return;
    isPlaying.value = !isPlaying.value;
    animLastMs = 0;
    animAccMs = 0;
  }

  function tickAnimation(): void {
    if (!isPlaying.value || !hasAnimation.value) return;

    const now = performance.now();
    if (!animLastMs) animLastMs = now;

    const dt = now - animLastMs;
    animLastMs = now;

    const step = 1000 / Math.max(1, fps.value);
    animAccMs += dt;

    while (animAccMs >= step) {
      const next = frameIndex.value + 1;
      setFrame(next >= animFrames.length ? 0 : next);
      animAccMs -= step;
    }
  }

  function computeMeanCenter(atoms: Atom[]): THREE.Vector3 {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const a of atoms) {
      cx += a.position[0];
      cy += a.position[1];
      cz += a.position[2];
    }
    const n = Math.max(1, atoms.length);
    return new THREE.Vector3(cx / n, cy / n, cz / n);
  }

  const _mat = new THREE.Matrix4();

  function applyFrameAtoms(frameAtoms: Atom[]): void {
    // 锁定中心：用当前帧中心对齐第一帧中心，避免整体漂移导致相机“跟着跑”
    const c = computeMeanCenter(frameAtoms);
    const dx = c.x - baseCenter.x;
    const dy = c.y - baseCenter.y;
    const dz = c.z - baseCenter.z;

    for (const mesh of atomMeshes) {
      const indices = mesh.userData.atomIndices as number[] | undefined;
      if (!indices) continue;

      for (let k = 0; k < indices.length; k += 1) {
        const ai = indices[k]!;
        const a = frameAtoms[ai];
        if (!a) continue;

        const x = a.position[0] - dx;
        const y = a.position[1] - dy;
        const z = a.position[2] - dz;

        _mat.makeTranslation(x, y, z);
        mesh.setMatrixAt(k, _mat);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // bonds：先不随帧更新（最小改动、性能最好）
  }

  async function loadFile(file: File): Promise<void> {
    if (isLoading.value) return;

    isLoading.value = true;
    await nextFrame();

    const t0 = performance.now();
    try {
      const model = await loadStructureFromFile(file);
      renderModel(model);

      message.success(
        t("viewer.load.success", {
          fileName: file.name,
          atomCount: model.atoms.length,
          bondSegCount: lastBondSegCount,
        }) + `（${((performance.now() - t0) / 1000).toFixed(2)} s）`
      );
    } finally {
      isLoading.value = false;
    }
  }

  function onDragEnter(): void {
    dragDepth.value += 1;
    isDragging.value = true;
  }

  function onDragOver(e: DragEvent): void {
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(): void {
    dragDepth.value -= 1;
    if (dragDepth.value <= 0) {
      dragDepth.value = 0;
      isDragging.value = false;
    }
  }

  async function onDrop(e: DragEvent): Promise<void> {
    dragDepth.value = 0;
    isDragging.value = false;

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    try {
      await loadFile(file);
    } catch (err) {
      message.error((err as Error).message);
    }
  }

  async function onFilePicked(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      await loadFile(file);
    } catch (err) {
      message.error((err as Error).message);
    }
  }

  async function exportPngTransparentCropped(
    filename = "snapshot.png",
    scale = 2
  ): Promise<void> {
    if (!renderer || !scene || !camera) throw new Error("渲染器未初始化");
    const host = canvasHostRef.value;
    if (!host) throw new Error("画布容器未初始化");

    // 如果你不想引入 lib/three/exportPng.ts，也可继续用你原来的实现；
    // 这里使用已抽离的封装（更短）
    await exportTransparentCroppedPng({
      renderer,
      scene,
      camera,
      host,
      filename,
      scale,
      orthoHalfHeight,
      alphaThreshold: 8,
      padding: 3,
    });
  }

  async function onExportPng(exportScale: number): Promise<void> {
    try {
      await exportPngTransparentCropped("snapshot.png", exportScale);
      message.success(t("viewer.export.pngSuccess"));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("export png failed:", e);
      message.error(t("viewer.export.fail", { reason: (e as Error).message }));
    }
  }

  function preventWindowDropDefault(e: DragEvent): void {
    e.preventDefault();
  }

  function initThree(): void {
    const host = canvasHostRef.value;
    if (!host) return;

    scene = new THREE.Scene();
    scene.background = null;

    pivotGroup = new THREE.Group();
    modelGroup = new THREE.Group();
    pivotGroup.add(modelGroup);

    axesGroup = new THREE.Group();
    pivotGroup.add(axesGroup);
    scene.add(pivotGroup);

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    camera.position.set(0, 0, 10);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    host.appendChild(renderer.domElement);

    labelRenderer = attachCss2dRenderer(host, "2");

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 8, 10);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // resize
    disposeResize = observeElementResize(host, () => {
      if (!renderer || !camera) return;
      const size = syncRenderersToHost(host, renderer, labelRenderer);
      updateCameraForSize(camera, size.w, size.h, orthoHalfHeight);
    });

    // render loop
    rafLoop = createRafLoop(() => {
      if (!renderer || !scene || !camera || !controls) return;
      tickAnimation(); // <- 新增：推进动画帧
      controls.update();
      renderer.render(scene, camera);
      labelRenderer?.render(scene, camera);
    });
    rafLoop.start();

    applyShowAxes();
    setProjectionMode(getSettings().orthographic);
  }

  function disposeThree(): void {
    rafLoop?.stop();
    rafLoop = null;

    disposeResize?.();
    disposeResize = null;

    clearModel();

    controls?.dispose();
    controls = null;

    if (labelRenderer) {
      labelRenderer.domElement.parentElement?.removeChild(
        labelRenderer.domElement
      );
      labelRenderer = null;
    }

    if (renderer) {
      renderer.dispose();
      const canvas = renderer.domElement;
      canvas.parentElement?.removeChild(canvas);
      renderer = null;
    }

    scene = null;
    camera = null;
    pivotGroup = null;
    modelGroup = null;
    axesGroup = null;
    axesHelper = null;
  }

  onMounted(() => {
    initThree();
    window.addEventListener("dragover", preventWindowDropDefault);
    window.addEventListener("drop", preventWindowDropDefault);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("dragover", preventWindowDropDefault);
    window.removeEventListener("drop", preventWindowDropDefault);
    disposeThree();
  });

  function preloadDefault(): void {
    const model = parseStructure(xyzText, "sample.xyz");
    renderModel(model);
  }

  return {
    hasAnimation,
    frameIndex,
    frameCount,
    isPlaying,
    fps,
    setFrame,
    togglePlay,
    stopPlay,

    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    isLoading,
    openFilePicker,

    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
    preloadDefault,
  };
}
