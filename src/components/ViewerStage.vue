<template>
  <div
    class="stage"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div ref="canvasHostRef" class="canvas-host"></div>

    <div v-if="isDragging" class="drop-overlay">
      <div class="drop-card">把 .xyz 文件拖到这里</div>
    </div>

    <div v-if="!hasModel" class="empty-overlay">
      <div class="empty-card">
        <div class="empty-title">拖拽 .xyz 文件到这里</div>
        <div class="empty-sub">
          加载后可旋转/缩放查看结构（原子按元素着色、大小按元素半径、键双色分段）
        </div>
        <div class="empty-actions">
          <a-button type="primary" @click="openFilePicker">选择文件</a-button>
        </div>
      </div>
    </div>

    <input
      ref="fileInputRef"
      class="file-input"
      type="file"
      accept=".xyz"
      @change="onFilePicked"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Atom } from "../lib/structure/types";
import { loadStructureFromFile } from "../lib/structure/parse";
import {
  getElementColorHex,
  getCovalentRadiusAng,
  normalizeElementSymbol,
} from "../lib/structure/chem";
import { computeBonds } from "../lib/structure/bonds";
import xyzText from "../assets/samples/mos2_cnt.xyz?raw";
import { parseStructure } from "../lib/structure/parse";
const canvasHostRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isDragging = ref(false);
const dragDepth = ref(0);
const hasModel = ref(false);

// ------- 与压缩包(OpenMX Viewer.html)一致的默认系数 -------
const ATOM_SIZE_FACTOR = 0.5; // OpenMX Viewer: var Atom_Size_factor = 0.5;
const BOND_FACTOR = 1.05; // OpenMX Viewer: var bond_factor = 1.05;
const BOND_THICKNESS_FACTOR = 1.0; // OpenMX Viewer: var Bond_Thickness_factor = 1.0;

// 键的半径：OpenMX Viewer 中圆柱基准 r0 = 0.09*sfactor*Bond_Thickness_factor
// 你这里没有 sfactor（我们用相机 fit 替代），取 0.09*Bond_Thickness_factor
const BOND_RADIUS = 0.09 * BOND_THICKNESS_FACTOR;

// three core
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;

// model meshes
let atomMeshes: THREE.InstancedMesh[] = [];
let bondMeshes: THREE.InstancedMesh[] = [];

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
  else mesh.material.dispose();
}

function clearModel(): void {
  if (!scene) return;

  for (const m of atomMeshes) {
    scene.remove(m);
    disposeInstancedMesh(m);
  }
  atomMeshes = [];

  for (const m of bondMeshes) {
    scene.remove(m);
    disposeInstancedMesh(m);
  }
  bondMeshes = [];

  hasModel.value = false;
}

function getSphereRadiusByElement(el: string): number {
  // 对应 OpenMX Viewer: ri_sphere = Atom_Size_factor * species_radius[id]
  return ATOM_SIZE_FACTOR * getCovalentRadiusAng(el);
}

function buildAtomMeshesByElement(atoms: Atom[]): THREE.InstancedMesh[] {
  // 元素 -> 原子索引
  const elementToIndices = new Map<string, number[]>();
  for (let i = 0; i < atoms.length; i += 1) {
    const el = atoms[i].element;
    const arr = elementToIndices.get(el);
    if (arr) arr.push(i);
    else elementToIndices.set(el, [i]);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const mat = new THREE.Matrix4();

  for (const [el, indices] of elementToIndices.entries()) {
    const rSphere = getSphereRadiusByElement(el);
    const geometry = new THREE.SphereGeometry(rSphere, 16, 16);

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(getElementColorHex(el)),
      metalness: 0.05,
      roughness: 0.9,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);

    for (let k = 0; k < indices.length; k += 1) {
      const a = atoms[indices[k]];
      const [x, y, z] = a.position;
      mat.makeTranslation(x, y, z);
      mesh.setMatrixAt(k, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
  }

  return meshes;
}

type BondSegment = {
  colorKey: string;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
};

function buildBondMeshesBicolor(atoms: Atom[]): THREE.InstancedMesh[] {
  const bonds = computeBonds(atoms, BOND_FACTOR);
  if (bonds.length === 0) return [];

  // 每条 bond 拆两段；分段点参考 OpenMX Viewer Bonds_flag==11：
  // rat = 0.5*(rj-ri)/d
  // mid = rat*(pi-pj) + 0.5*(pi+pj)
  const segments: BondSegment[] = [];
  segments.length = bonds.length * 2;

  const pi = new THREE.Vector3();
  const pj = new THREE.Vector3();
  const mid = new THREE.Vector3();

  for (let k = 0; k < bonds.length; k += 1) {
    const b = bonds[k];

    pi.set(
      atoms[b.i].position[0],
      atoms[b.i].position[1],
      atoms[b.i].position[2]
    );
    pj.set(
      atoms[b.j].position[0],
      atoms[b.j].position[1],
      atoms[b.j].position[2]
    );

    const d = b.length;
    if (d < 1.0e-9) continue;

    const riSphere = getSphereRadiusByElement(atoms[b.i].element);
    const rjSphere = getSphereRadiusByElement(atoms[b.j].element);

    const rat = (0.5 * (rjSphere - riSphere)) / d;
    const alpha = 0.5 + rat; // 对 pi 的权重
    const beta = 0.5 - rat; // 对 pj 的权重

    // mid = alpha*pi + beta*pj
    mid.copy(pi).multiplyScalar(alpha).addScaledVector(pj, beta);

    segments[k * 2] = {
      colorKey: atoms[b.i].element,
      p1: pi.clone(),
      p2: mid.clone(),
    };
    segments[k * 2 + 1] = {
      colorKey: atoms[b.j].element,
      p1: mid.clone(),
      p2: pj.clone(),
    };
  }

  // 按颜色 key 分组（每个 mesh 单材质色，避免 instanceColor 的坑）
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

      // cylinder 原始高度=1，沿 Y 拉伸到段长
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

  // 把球半径也算进 box，避免贴边
  box.expandByScalar(Math.max(0.5, maxSphere * 2.0));

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180.0;
  const dist = maxSize / 2 / Math.tan(fov / 2);

  camera.position.set(center.x, center.y, center.z + dist * 1.8);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}
import type { StructureModel } from "../lib/structure/types"; // 确保 types.ts 里导出了 StructureModel

function renderModel(model: StructureModel): void {
  const atoms: Atom[] = model.atoms.map((a) => ({
    element: normalizeElementSymbol(a.element),
    position: a.position,
  }));

  if (!scene) return;

  clearModel();

  atomMeshes = buildAtomMeshesByElement(atoms);
  for (const m of atomMeshes) scene.add(m);

  bondMeshes = buildBondMeshesBicolor(atoms);
  for (const m of bondMeshes) scene.add(m);

  hasModel.value = true;
  fitCameraToAtoms(atoms);
}

async function loadFile(file: File): Promise<void> {
  const model = await loadStructureFromFile(file);
  renderModel(model);

  const bondSegCount = bondMeshes.reduce((acc, m) => acc + m.count, 0);
  message.success(
    `已加载：${file.name}（${model.atoms.length} atoms，bondSegments=${bondSegCount}）`
  );
}

// drag handlers
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

// render loop
function startRenderLoop(): void {
  if (!renderer || !scene || !camera || !controls) return;

  const tick = () => {
    controls!.update();
    renderer!.render(scene!, camera!);
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
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  return { w, h };
}
function resizeToHost(): void {
  const host = canvasHostRef.value;
  if (!host || !renderer || !camera) return;

  const { w, h } = getHostSize(host);
  renderer.setSize(w, h); // 不要传 false
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function initThree(): void {
  const host = canvasHostRef.value;
  if (!host) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  // renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 颜色管理（避免发暗）
  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  host.appendChild(renderer.domElement);

  // lights
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

function preventWindowDropDefault(e: DragEvent): void {
  e.preventDefault();
}

function preloadDefault(): void {
  const model = parseStructure(xyzText, "graphene.xyz");
  renderModel(model);
}

onMounted(() => {
  initThree();
  window.addEventListener("dragover", preventWindowDropDefault);
  window.addEventListener("drop", preventWindowDropDefault);

  try {
    preloadDefault();
  } catch (e) {
    console.error("preload failed:", e);
    message.error(`预加载失败：${(e as Error).message}`);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("dragover", preventWindowDropDefault);
  window.removeEventListener("drop", preventWindowDropDefault);
  disposeThree();
});
</script>

<style scoped>
.stage {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.canvas-host {
  height: 100%;
  width: 100%;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(2px);
}

.drop-card {
  border: 1px dashed rgba(255, 255, 255, 0.35);
  padding: 16px 18px;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.45);
}

.empty-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.empty-card {
  pointer-events: auto;
  border: 1px dashed rgba(255, 255, 255, 0.25);
  padding: 16px 18px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.85);
  max-width: 520px;
}

.empty-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.empty-sub {
  opacity: 0.85;
}

.empty-actions {
  margin-top: 12px;
}

.file-input {
  display: none;
}
</style>
