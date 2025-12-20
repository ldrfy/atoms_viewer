import { watch, onBeforeUnmount, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";

import { message } from "ant-design-vue";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";

import type { Atom, StructureModel } from "../../lib/structure/types";
import { loadStructureFromFile } from "../../lib/structure/parse";
import {
  getCovalentRadiusAng,
  getElementColorHex,
  normalizeElementSymbol,
} from "../../lib/structure/chem";
import { computeBonds } from "../../lib/structure/bonds";
import { cropCanvasToPngBlob, downloadBlob } from "../../lib/image/cropPng";
import { useI18n } from "vue-i18n";

type ViewerStageBindings = {
  canvasHostRef: ReturnType<typeof ref<HTMLDivElement | null>>;
  fileInputRef: ReturnType<typeof ref<HTMLInputElement | null>>;
  isDragging: ReturnType<typeof ref<boolean>>;
  hasModel: ReturnType<typeof ref<boolean>>;
  openFilePicker: () => void;
  onDragEnter: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => Promise<void>;
  onFilePicked: (e: Event) => Promise<void>;
  onExportPng: (scale: number) => Promise<void>;
};

export function useViewerStage(
  settingsRef: Readonly<Ref<ViewerSettings>>
): ViewerStageBindings {
  const canvasHostRef = ref<HTMLDivElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const isDragging = ref(false);
  const dragDepth = ref(0);
  const hasModel = ref(false);

  // ------- 与压缩包(OpenMX Viewer.html)一致的默认系数 -------
  const ATOM_SIZE_FACTOR = 0.5;
  const BOND_FACTOR = 1.05;
  const BOND_THICKNESS_FACTOR = 1.0;
  const BOND_RADIUS = 0.09 * BOND_THICKNESS_FACTOR;
  const { t } = useI18n();

  // three core
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  let controls: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rafId = 0;
  let orthoHalfHeight = 5; // 正交相机 frustum 的半高，会随 fit/resize 更新
  let lastAtoms: Atom[] = []; // 用于 resetView 重新 fit

  let pivotGroup: THREE.Group | null = null;
  let modelGroup: THREE.Group | null = null;
  let axesHelper: THREE.AxesHelper | null = null;
  let axesGroup: THREE.Group | null = null;
  let labelRenderer: CSS2DRenderer | null = null;

  // model meshes
  let atomMeshes: THREE.InstancedMesh[] = [];
  let bondMeshes: THREE.InstancedMesh[] = [];
  function getSettings(): ViewerSettings {
    return settingsRef.value;
  }

  function openFilePicker(): void {
    fileInputRef.value?.click();
  }

  function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
    mesh.geometry.dispose();

    const { material } = mesh;
    if (Array.isArray(material)) {
      material.forEach((m: THREE.Material) => m.dispose());
    } else {
      material.dispose();
    }
  }

  function clearModel(): void {
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

    hasModel.value = false;
  }

  function getSphereRadiusByElement(el: string): number {
    return ATOM_SIZE_FACTOR * getCovalentRadiusAng(el);
  }

  function buildAtomMeshesByElement(atoms: Atom[]): THREE.InstancedMesh[] {
    const elementToIndices = new Map<string, number[]>();
    for (let i = 0; i < atoms.length; i += 1) {
      const a = atoms[i];
      if (!a) throw new Error(`atoms[${i}] undefined`);
      const el = a.element;
      const arr = elementToIndices.get(el);
      if (arr) arr.push(i);
      else elementToIndices.set(el, [i]);
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

  type BondSegment = { colorKey: string; p1: THREE.Vector3; p2: THREE.Vector3 };

  function buildBondMeshesBicolor(atoms: Atom[]): THREE.InstancedMesh[] {
    const bonds = computeBonds(atoms, BOND_FACTOR);
    if (bonds.length === 0) return [];

    const segments: BondSegment[] = [];
    segments.length = bonds.length * 2;

    const pi = new THREE.Vector3();
    const pj = new THREE.Vector3();
    const mid = new THREE.Vector3();

    for (let k = 0; k < bonds.length; k += 1) {
      const b = bonds[k]!;
      const abi = atoms[b.i]!;
      const abj = atoms[b.j]!;

      pi.set(abi.position[0], abi.position[1], abi.position[2]);
      pj.set(abj.position[0], abj.position[1], abj.position[2]);

      const d = b.length;
      if (d < 1.0e-9) continue;

      const riSphere = getSphereRadiusByElement(abi.element);
      const rjSphere = getSphereRadiusByElement(abj.element);

      const rat = (0.5 * (rjSphere - riSphere)) / d;
      const alpha = 0.5 + rat;
      const beta = 0.5 - rat;

      mid.copy(pi).multiplyScalar(alpha).addScaledVector(pj, beta);

      segments[k * 2] = {
        colorKey: abi.element,
        p1: pi.clone(),
        p2: mid.clone(),
      };
      segments[k * 2 + 1] = {
        colorKey: abj.element,
        p1: mid.clone(),
        p2: pj.clone(),
      };
    }

    const groups = new Map<
      string,
      Array<{ p1: THREE.Vector3; p2: THREE.Vector3 }>
    >();
    for (const seg of segments) {
      const arr = groups.get(seg.colorKey);
      if (arr) arr.push({ p1: seg.p1, p2: seg.p2 });
      else groups.set(seg.colorKey, [{ p1: seg.p1, p2: seg.p2 }]);
    }

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

    for (const [el, segs] of groups.entries()) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(getElementColorHex(el)),
        metalness: 0.0,
        roughness: 0.85,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, segs.length);

      for (let i = 0; i < segs.length; i += 1) {
        const a = segs[i];
        if (!a) throw new Error(`segs[${i}] undefined`);

        center.addVectors(a.p1, a.p2).multiplyScalar(0.5);

        dir.subVectors(a.p2, a.p1);
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

    return meshes;
  }

  function fitCameraToAtoms(atoms: Atom[]): void {
    if (!camera || !controls) return;

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

    // 目标点
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
      return;
    }

    // Orthographic：用 box 尺度决定 frustum
    const host = canvasHostRef.value;
    const aspect = host
      ? host.getBoundingClientRect().width /
        Math.max(1, host.getBoundingClientRect().height)
      : 1;

    const margin = 1.15;
    const halfH = (maxSize / 2) * margin;
    orthoHalfHeight = Math.max(halfH, 0.1);

    camera.left = -orthoHalfHeight * aspect;
    camera.right = orthoHalfHeight * aspect;
    camera.top = orthoHalfHeight;
    camera.bottom = -orthoHalfHeight;

    const dist = maxSize * 2.2;
    camera.position.set(center.x, center.y, center.z + dist);
    camera.near = Math.max(0.01, dist / 50);
    camera.far = dist * 50;
    camera.updateProjectionMatrix();

    controls.update();
    controls.saveState();
  }

  function resetView(): void {
    if (lastAtoms.length > 0) {
      fitCameraToAtoms(lastAtoms);
      return;
    }

    // 没有模型时给个默认
    controls?.target.set(0, 0, 0);
    camera?.position.set(0, 0, 10);
    controls?.update();
    controls?.saveState();
  }

  function setProjectionMode(orthographic: boolean): void {
    if (!scene || !renderer) return;

    // 保留当前视角信息
    const target = controls?.target?.clone() ?? new THREE.Vector3();
    const pos = camera?.position?.clone() ?? new THREE.Vector3(0, 0, 10);

    // 使用当前画布尺寸
    const host = canvasHostRef.value;
    const rect = host?.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect?.width ?? 1));
    const h = Math.max(1, Math.floor(rect?.height ?? 1));
    const aspect = w / Math.max(1, h);

    if (!orthographic) {
      // Perspective
      const cam = new THREE.PerspectiveCamera(45, aspect, 0.01, 2000);
      cam.position.copy(pos);
      camera = cam;
      rebuildControls();
      controls!.target.copy(target);
      controls!.update();
      updateCameraForSize(w, h);
    } else {
      // Orthographic（先给一个 frustum，后面 fit 会更新）
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
      camera = cam;
      rebuildControls();
      controls!.target.copy(target);
      controls!.update();
      updateCameraForSize(w, h);
    }

    // 切换后对当前模型重新 fit 一次，保证画面正常
    if (lastAtoms.length > 0) {
      fitCameraToAtoms(lastAtoms);
    }
  }

  function degToRad(d: number): number {
    return (d * Math.PI) / 180;
  }

  function applyShowAxes(): void {
    if (!axesGroup) return;
    axesGroup.visible = getSettings().showAxes;
  }

  function applyShowBonds(): void {
    const flag = getSettings().showBonds;
    for (const m of bondMeshes) m.visible = flag;
  }

  /**
   * 原子大小缩放
   */
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

  function applyModelRotation(): void {
    if (!pivotGroup) return;
    const s = getSettings();
    pivotGroup.rotation.set(
      degToRad(s.rotationDeg.x),
      degToRad(s.rotationDeg.y),
      degToRad(s.rotationDeg.z)
    );
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
    const atoms: Atom[] = model.atoms.map((a) => ({
      element: normalizeElementSymbol(a.element),
      position: a.position,
    }));

    if (!scene || !pivotGroup || !modelGroup) return;

    clearModel();

    // 计算模型中心（用于设置旋转枢轴）
    const box = new THREE.Box3();
    for (const a of atoms) {
      box.expandByPoint(
        new THREE.Vector3(a.position[0], a.position[1], a.position[2])
      );
    }
    const center = box.getCenter(new THREE.Vector3());

    // 让 pivot 位于模型中心，modelGroup 反向平移，使世界坐标不变
    pivotGroup.position.copy(center);
    modelGroup.position.set(-center.x, -center.y, -center.z);

    atomMeshes = buildAtomMeshesByElement(atoms);
    atomMeshes.forEach((m) => modelGroup!.add(m));

    bondMeshes = buildBondMeshesBicolor(atoms);
    bondMeshes.forEach((m) => modelGroup!.add(m));

    hasModel.value = true;

    // 相机仍按原 atoms fit（因为世界坐标最终仍等于原坐标）
    fitCameraToAtoms(atoms);

    applyAtomScale();
    applyShowBonds();
    applyShowAxes();
    applyModelRotation();

    const size = box.getSize(new THREE.Vector3());

    const axisLen = Math.max(size.x, size.y, size.z) * 0.6; // 可调

    if (axesGroup) {
      if (axesHelper) axesGroup.remove(axesHelper);

      const lx = makeAxisLabel("X");
      lx.position.set(axisLen, 0, 0);

      const ly = makeAxisLabel("Y");
      ly.position.set(0, axisLen, 0);

      const lz = makeAxisLabel("Z");
      lz.position.set(0, 0, axisLen);

      axesGroup.add(lx, ly, lz);

      axesHelper = new THREE.AxesHelper(axisLen);
      (axesHelper.material as THREE.LineBasicMaterial).depthTest = false;
      axesHelper.renderOrder = 999;
      axesGroup.add(axesHelper);
    }
    lastAtoms = atoms;
  }
  function isPerspective(cam: THREE.Camera): cam is THREE.PerspectiveCamera {
    return (cam as THREE.PerspectiveCamera).isPerspectiveCamera === true;
  }

  function rebuildControls(): void {
    if (!camera || !renderer) return;

    const oldTarget = controls?.target?.clone() ?? new THREE.Vector3();

    controls?.dispose();
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(oldTarget);
    controls.update();
  }

  async function loadFile(file: File): Promise<void> {
    const model = await loadStructureFromFile(file);
    renderModel(model);

    const bondSegCount = bondMeshes.reduce((acc, m) => acc + m.count, 0);
    message.success(
      t("viewer.load.success", {
        fileName: file.name,
        atomCount: model.atoms.length,
        bondSegCount,
      })
    );
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

  function startRenderLoop(): void {
    if (!renderer || !scene || !camera || !controls) return;

    const tick = () => {
      controls!.update();
      renderer!.render(scene!, camera!);
      labelRenderer?.render(scene!, camera!);
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
  }

  function stopRenderLoop(): void {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function getHostSize(host: HTMLElement): { w: number; h: number } {
    const rect = host.getBoundingClientRect();
    return {
      w: Math.max(1, Math.floor(rect.width)),
      h: Math.max(1, Math.floor(rect.height)),
    };
  }

  function updateCameraForSize(w: number, h: number): void {
    if (!camera) return;

    const aspect = w / Math.max(1, h);

    if (isPerspective(camera)) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return;
    }

    // Orthographic
    camera.left = -orthoHalfHeight * aspect;
    camera.right = orthoHalfHeight * aspect;
    camera.top = orthoHalfHeight;
    camera.bottom = -orthoHalfHeight;
    camera.updateProjectionMatrix();
  }

  function resizeToHost(): void {
    const host = canvasHostRef.value;
    if (!host || !renderer) return;

    const { w, h } = getHostSize(host);
    renderer.setSize(w, h);

    // 关键：CSS2DRenderer 必须同步尺寸，否则标签层看不到
    labelRenderer?.setSize(w, h);

    updateCameraForSize(w, h);
  }

  function makeAxisLabel(text: string): CSS2DObject {
    const div = document.createElement("div");
    div.textContent = text;
    return new CSS2DObject(div);
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

    pivotGroup.add(axesGroup); // 关键：挂到 pivotGroup（模型中心）

    scene.add(pivotGroup);

    applyModelRotation();

    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    camera.position.set(0, 0, 10);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // 关键：允许透明背景导出
      // preserveDrawingBuffer: true, // 如果导出偶尔空白/黑图，再打开
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    host.appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.zIndex = "2"; // 确保压在 canvas 上面

    host.style.position = "relative"; // 关键：让 absolute 叠加层对齐 host
    host.appendChild(labelRenderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 8, 10);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    resizeObserver = new ResizeObserver(() => {
      resizeToHost();
    });
    resizeObserver.observe(host);

    resizeToHost();
    startRenderLoop();

    applyShowAxes();
    setProjectionMode(getSettings().orthographic);
  }

  function disposeThree(): void {
    stopRenderLoop();

    resizeObserver?.disconnect();
    resizeObserver = null;

    clearModel();

    controls?.dispose();
    controls = null;

    if (renderer) {
      renderer.dispose();
      const canvas = renderer.domElement;
      canvas.parentElement?.removeChild(canvas);
    }

    renderer = null;
    scene = null;
    camera = null;
  }

  async function exportPngTransparentCropped(
    filename = "snapshot.png",
    scale = 2
  ): Promise<void> {
    if (!renderer || !scene || !camera) throw new Error("渲染器未初始化");

    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevPixelRatio = renderer.getPixelRatio();

    const host = canvasHostRef.value!;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    renderer.setPixelRatio(1);
    renderer.setSize(w * scale, h * scale, false);
    updateCameraForSize(w, h);

    renderer.render(scene, camera);

    // 3) 裁剪 + 导出（核心：交给 lib）
    const { blob } = await cropCanvasToPngBlob(renderer.domElement, {
      alphaThreshold: 8,
      padding: 3,
    });
    downloadBlob(blob, filename);

    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);

    if (isPerspective(camera)) {
      camera.aspect = prevSize.x / Math.max(1, prevSize.y);
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
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

  return {
    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    openFilePicker,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
  };
}
