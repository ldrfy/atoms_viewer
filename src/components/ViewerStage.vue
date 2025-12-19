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
          加载后可旋转/缩放查看结构（按元素着色 + 自动成键）
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
  normalizeElementSymbol,
} from "../lib/structure/chem";
import { computeBonds } from "../lib/structure/bonds";

const canvasHostRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isDragging = ref(false);
const dragDepth = ref(0);
const hasModel = ref(false);

// three core
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;

// model meshes
let atomMeshes: THREE.InstancedMesh[] = [];
let bondsMesh: THREE.InstancedMesh | null = null;

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }
}

function clearModel(): void {
  if (!scene) return;

  for (const m of atomMeshes) {
    scene.remove(m);
    disposeInstancedMesh(m);
  }
  atomMeshes = [];

  if (bondsMesh) {
    scene.remove(bondsMesh);
    disposeInstancedMesh(bondsMesh);
    bondsMesh = null;
  }

  hasModel.value = false;
}

function buildAtomMeshesByElement(atoms: Atom[]): THREE.InstancedMesh[] {
  const radius = 0.25; // 可后续接侧栏配置
  const geometry = new THREE.SphereGeometry(radius, 16, 16);

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
    const colorHex = getElementColorHex(el);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
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

function buildBondsMesh(atoms: Atom[]): THREE.InstancedMesh | null {
  const bondFactor = 1.05; // 与你压缩包逻辑一致
  const bonds = computeBonds(atoms, bondFactor);
  if (bonds.length === 0) return null;

  const bondRadius = 0.08;
  const geometry = new THREE.CylinderGeometry(
    bondRadius,
    bondRadius,
    1.0,
    12,
    1,
    false
  );
  const material = new THREE.MeshStandardMaterial({
    color: "#B0B0B0",
    metalness: 0.0,
    roughness: 0.85,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, bonds.length);

  const up = new THREE.Vector3(0, 1, 0);
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const m = new THREE.Matrix4();

  for (let k = 0; k < bonds.length; k += 1) {
    const b = bonds[k];

    p1.set(
      atoms[b.i].position[0],
      atoms[b.i].position[1],
      atoms[b.i].position[2]
    );
    p2.set(
      atoms[b.j].position[0],
      atoms[b.j].position[1],
      atoms[b.j].position[2]
    );

    mid.addVectors(p1, p2).multiplyScalar(0.5);
    dir.subVectors(p2, p1).normalize();

    q.setFromUnitVectors(up, dir);
    s.set(1, b.length, 1); // cylinder 原始高度=1，沿 Y 拉伸到键长

    m.compose(mid, q, s);
    mesh.setMatrixAt(k, m);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function fitCameraToAtoms(atoms: Atom[]): void {
  if (!camera || !controls) return;

  const box = new THREE.Box3();
  for (const a of atoms) {
    box.expandByPoint(
      new THREE.Vector3(a.position[0], a.position[1], a.position[2])
    );
  }

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

async function loadFile(file: File): Promise<void> {
  const model = await loadStructureFromFile(file);

  // 标准化元素符号：支持 c / C1 / Si2 等
  const atoms: Atom[] = model.atoms.map((a) => ({
    element: normalizeElementSymbol(a.element),
    position: a.position,
  }));

  if (!scene) return;

  clearModel();

  atomMeshes = buildAtomMeshesByElement(atoms);
  for (const m of atomMeshes) scene.add(m);

  bondsMesh = buildBondsMesh(atoms);
  if (bondsMesh) scene.add(bondsMesh);

  hasModel.value = true;
  fitCameraToAtoms(atoms);

  message.success(
    `已加载：${file.name}（${atoms.length} atoms，bonds=${
      bondsMesh ? bondsMesh.count : 0
    }）`
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

function initThree(): void {
  const host = canvasHostRef.value;
  if (!host) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  // 建议：颜色管理（避免颜色偏暗）
  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  host.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(5, 8, 10);
  scene.add(dir);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !camera || !host) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(host);

  renderer.setSize(host.clientWidth, host.clientHeight, false);
  camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
  camera.updateProjectionMatrix();

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
