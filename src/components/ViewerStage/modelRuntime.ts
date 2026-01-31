// src/components/ViewerStage/modelRuntime.ts
import * as THREE from 'three';
import { ref, type Ref } from 'vue';

import {
  DEFAULT_DETAILS,
  DEFAULT_COLORS,
  DEFAULT_LAMMPS,
  DEFAULT_LAYER_ANIM,
  type ViewerSettings,
  type LammpsTypeMapRecord,
  type DetailsSettingsGroup,
} from '../../lib/viewer/settings';
import type { Atom, FrameMeta, StructureModel } from '../../lib/structure/types';
import { getElementColorHex, normalizeElementSymbol } from '../../lib/structure/chem';
import { unwrapAtomsPeriodic } from '../../lib/structure/bonds';
import { getVisualStylePreset } from '../../lib/viewer/visualStyles';

import type { ThreeStage } from '../../lib/three/stage';
import { makeTextLabel } from '../../lib/three/labels2d';
import { removeAndDisposeInstancedMeshes } from '../../lib/three/dispose';
import {
  applyAtomScaleToMeshes,
  buildAtomMeshesByElement,
  getSphereBaseRadiusByElement,
} from '../../lib/three/instancedAtoms';
import { buildBondMeshesBicolor } from '../../lib/three/instancedBonds';
import {
  isPerspective,
  fitCameraToAtoms as fitCameraToAtomsImpl,
} from '../../lib/three/camera';

import { applyFrameAtomsToMeshes, computeMeanCenterInto } from './animation';
import {
  collectTypeIdsAndElementDefaultsFromAtoms,
  mergeTypeMap,
  remapAtomsByTypeId,
} from './typeMap';

import {
  buildColorMapFromAtoms,
  buildColorMapKeysFromAtoms,
  buildColorMapRecord,
  getAtomTypeColorKey,
  buildCustomColorMapRecord,
  parseColorMapKey,
  parseColorMapRecord,
  parseColorValue,
  type ColorMapRecord,
} from './colorMap';
import type {
  LayerSnapshot,
  LayerSourceInfo,
} from '../../lib/viewer/sessionTypes';

function normalizeLayerDisplay(
  patch: Partial<DetailsSettingsGroup>,
  base: DetailsSettingsGroup,
): DetailsSettingsGroup {
  const representation = patch.representation ?? base.representation;
  const atomScale = patch.atomScale ?? base.atomScale;

  const sphereSegments = patch.sphereSegments ?? base.sphereSegments;

  const bondFactor = patch.bondFactor ?? base.bondFactor;

  const bondRadius = patch.bondRadius ?? base.bondRadius;

  const showBonds
    = typeof patch.showBonds === 'boolean' ? patch.showBonds : base.showBonds;

  const atomRoughness = Number.isFinite(patch.atomRoughness)
    ? patch.atomRoughness as number
    : base.atomRoughness;

  return {
    representation,
    atomScale,
    showBonds,
    sphereSegments,
    bondFactor,
    bondRadius,
    atomRoughness: Math.min(1, Math.max(0, atomRoughness)),
  };
}

const DEFAULT_DETAILS_LOCAL: DetailsSettingsGroup = { ...DEFAULT_DETAILS };

export type ModelLayerInfo = {
  id: string;
  name: string;
  visible: boolean;
  atomCount: number;
  frameCount: number;
  hasTypeId: boolean;
  sourceFormat?: string;
  source?: LayerSourceInfo;
  createdAtMs: number;
};

type LayerInternal = {
  info: ModelLayerInfo;
  model: StructureModel;
  group: THREE.Group;

  atomMeshes: THREE.InstancedMesh[];
  bondMeshes: THREE.InstancedMesh[];
  lastBondSegCount: number;
  /** The bondFactor used to build current bondMeshes. */
  bondFactorUsed: number;
  /** The bondRadius used to build current bondMeshes. */
  bondRadiusUsed: number;

  // animation
  frameIndex: number;
  /** Current raw frame atoms (no typeId->element mapping applied). */
  currentFrameAtoms: Atom[];
  /** Cached mapped atoms for the current frame (computed lazily). */
  currentMappedAtoms: Atom[] | null;
  /** Frame index for which currentMappedAtoms is valid. */
  mappedFrameIndex: number;

  // LAMMPS
  hasAnyTypeId: boolean;

  /** Per-layer LAMMPS typeId->element mapping (NOT global). */
  typeMap: LammpsTypeMapRecord;
  /** Detected typeId list for this layer (sorted). */
  typeIds: number[];
  /** Whether type map has been explicitly applied via "Refresh display". */
  typeMapApplied: boolean;

  /** Per-layer atom type color mapping. */
  colorMap: ColorMapRecord;
  /** Stable order of color keys for UI. */
  colorKeys: string[];

  /** Per-layer display settings (atom size, bonds, quality). */
  display: DetailsSettingsGroup;

  /** Per-layer inspect selection for export/restore */
  inspectSelection?: import('../../lib/viewer/settings').InspectSelectionItem[];

  /** Per-layer playback fps */
  playFps: number;

  /** Cached clip bounds for fast visibility toggles */
  clipBounds?: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    maxSphereBase: number;
  };

  // tmp
  baseCenter: THREE.Vector3; // keep at (0,0,0) so applyFrameAtomsToMeshes == shift by current mean
};

function makeLayerId(): string {
  // short, stable enough for UI
  return `layer_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(
    36,
  )}`;
}

function safeLayerName(fileName?: string): string {
  const n = (fileName ?? '').trim();
  if (!n) return 'model';
  return n;
}

function disposeGroupChildren(group: THREE.Group): void {
  const toRemove = [...group.children];
  for (const c of toRemove) {
    group.remove(c);

    // Mesh
    const anyObj = c as any;
    if (anyObj?.geometry?.dispose) anyObj.geometry.dispose();
    if (anyObj?.material) {
      const mat = anyObj.material;
      if (Array.isArray(mat)) mat.forEach(m => m?.dispose?.());
      else mat?.dispose?.();
    }
  }
}

function computeCenteredBox(
  atoms: Atom[],
  tmpCenter: THREE.Vector3,
): {
  center: THREE.Vector3;
  box: THREE.Box3;
  maxSphereRadius: number;
} {
  const c = computeMeanCenterInto(atoms, tmpCenter);

  const box = new THREE.Box3();
  const tmpP = new THREE.Vector3();
  let maxSphere = 0;
  for (const a of atoms) {
    const x = a.position[0] - c.x;
    const y = a.position[1] - c.y;
    const z = a.position[2] - c.z;
    tmpP.set(x, y, z);
    box.expandByPoint(tmpP);
    maxSphere = Math.max(
      maxSphere,
      getSphereBaseRadiusByElement(a.element, 0.5),
    );
  }

  return { center: c, box, maxSphereRadius: maxSphere };
}

function computeClipBounds(
  atoms: Atom[],
  tmpCenter: THREE.Vector3,
  atomSizeFactor: number,
): LayerInternal['clipBounds'] | null {
  // 仅计算一次，用于可见性切换时的快速裁剪估算。
  // Compute once for fast clip estimation when toggling visibility.
  if (!atoms || atoms.length === 0) return null;
  const c = computeMeanCenterInto(atoms, tmpCenter);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxSphere = 0;
  for (const a of atoms) {
    const x = a.position[0] - c.x;
    const y = a.position[1] - c.y;
    const z = a.position[2] - c.z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    if (a.element) {
      const r = getSphereBaseRadiusByElement(a.element, atomSizeFactor);
      if (r > maxSphere) maxSphere = r;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    maxSphereBase: maxSphere,
  };
}

function makeCenteredAtomsView(atoms: Atom[], center: THREE.Vector3): Atom[] {
  // Minimal allocation: Atom has extra fields; fitCameraToAtoms uses only element + position.
  // We still use Atom type to satisfy typing.
  return atoms.map((a) => {
    return {
      ...(a as any),
      element: a.element,
      position: [
        a.position[0] - center.x,
        a.position[1] - center.y,
        a.position[2] - center.z,
      ],
    } as Atom;
  });
}

export type ModelRuntime = {
  layers: Ref<ModelLayerInfo[]>;
  activeLayerId: Ref<string | null>;
  activeTypeMap: Ref<LammpsTypeMapRecord>;
  activeTypeIds: Ref<number[]>;
  activeTypeMapApplied: Ref<boolean>;
  activeColorMap: Ref<ColorMapRecord>;
  activeColorKeys: Ref<string[]>;
  activeDisplaySettings: Ref<DetailsSettingsGroup | null>;

  renderModel: (
    model: StructureModel,
    opts?: {
      hidePreviousLayers?: boolean;
      sourceMeta?: LayerSourceInfo;
      skipAutoFit?: boolean;
      forcedLayerId?: string;
    },
  ) => { frameCount: number; hasAnimation: boolean; layerId: string };
  replaceActiveLayerModel: (model: StructureModel) => {
    frameCount: number;
    hasAnimation: boolean;
    layerId: string;
  };

  clearModel: () => void;

  getFrameCount: () => number;
  getFrameIndex: () => number;
  applyFrameByIndex: (idx: number, opts?: { refreshBonds?: boolean }) => void;
  getActiveLayerPlayFps: () => number;
  setActiveLayerPlayFps: (fps: number) => void;
  getActiveAtoms: () => Atom[] | null;
  getAtomsForLayer: (id: string) => Atom[] | null;
  getFrameMetaForLayer: (id: string | null, frameIndex?: number) => FrameMeta | null;

  applyAtomScale: () => void;
  applyAtomRoughness: () => void;
  applyShowBonds: () => void;
  applyShowAxes: () => void;
  applyModelRotation: () => void;
  applyBackgroundColor: () => void;

  /** Update camera near/far each frame based on visible layers to prevent clipping. */
  tickCameraClipping: () => void;

  /** Set visibility for all layers at once. */
  setAllLayersVisible: (visible: boolean) => void;
  /** Sort layers for display/order (does not change layer data). */
  sortLayers: (compare: (a: ModelLayerInfo, b: ModelLayerInfo) => number) => void;

  hasAnyTypeId: () => boolean;
  onTypeMapChanged: () => void;
  onColorMapChanged: (opts?: { applyToAll?: boolean; layerIds?: string[] }) => void;
  getLayerSnapshots: () => LayerSnapshot[];
  applyLayerSnapshots: (
    snaps: LayerSnapshot[],
  ) => void;

  setLayerInspectSelection: (layerId: string, items: import('../../lib/viewer/settings').InspectSelectionItem[]) => void;
  getLayerInspectSelection: (layerId: string) => import('../../lib/viewer/settings').InspectSelectionItem[];

  setActiveLayerTypeMap: (map: LammpsTypeMapRecord) => void;
  applyTypeMapToAllLayers: (templateMap: LammpsTypeMapRecord) => void;
  applyTypeMapToLayerIds: (templateMap: LammpsTypeMapRecord, layerIds: string[]) => void;
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateMap?: LammpsTypeMapRecord;
    useAtomDefaults?: boolean;
  }) => void;

  setActiveLayerColorMap: (map: ColorMapRecord) => void;
  setAllLayersColorMap: (map: ColorMapRecord) => void;
  setLayerColorMapForIds: (map: ColorMapRecord, layerIds: string[]) => void;
  resetAllLayersColorMapToDefaults: () => void;
  resetLayerColorMapToDefaults: (layerIds: string[]) => void;

  removeLayer: (id: string) => void;

  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;

  setActiveLayerDisplaySettings: (
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean; layerIds?: string[] },
  ) => void;

  visibleCustomColors: Ref<boolean>;

  getActiveAtomMeshes: () => THREE.InstancedMesh[];
  getVisibleAtomMeshes: () => THREE.InstancedMesh[];
};

export function createModelRuntime(args: {
  stage: ThreeStage;
  settingsRef: Readonly<Ref<ViewerSettings>>;
  hasModel: Ref<boolean>;
  atomSizeFactor: number;
}): ModelRuntime {
  const {
    stage,
    settingsRef,
    hasModel,
    atomSizeFactor,
  } = args;

  const invalidate = (): void => {
    // On-demand rendering: any scene/camera/material change should request a redraw.
    stage.invalidate();
  };

  const layers = ref<ModelLayerInfo[]>([]);
  const activeLayerId = ref<string | null>(null);
  const activeTypeMap = ref<LammpsTypeMapRecord>({});
  const activeTypeIds = ref<number[]>([]);
  const activeTypeMapApplied = ref(false);
  const activeColorMap = ref<ColorMapRecord>({});
  const activeColorKeys = ref<string[]>([]);
  const activeDisplaySettings = ref<DetailsSettingsGroup | null>(null);
  const visibleCustomColors = ref(false);

  // Internal layer registry keyed by id (source of truth).
  // 内部图层注册表（以 id 为键的唯一真源数据）。
  const layerMap = new Map<string, LayerInternal>();

  const centerTmp = new THREE.Vector3();
  const centerTmp2 = new THREE.Vector3();
  const matTmp = new THREE.Matrix4();

  // ---- Camera clipping (near/far) guard for multi-layer display ----
  // When fitting to a small model, far plane can become too small and clip large visible layers,
  // and far may not update while the user zooms out. We compute a conservative bounding radius
  // across *visible* layers and update near/far by current orbit distance.
  let visibleClipRadius = 0;
  let lastClipDist = -1;
  let lastClipRadius = -1;

  function recomputeVisibleClipRadius(): void {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    let maxSphere = 0;
    let any = false;

    for (const l of layerMap.values()) {
      if (!l.info.visible) continue;
      const display = getLayerDisplay(l);
      if (!l.clipBounds) {
        const atoms0 = (l.model.frames?.[l.frameIndex]
          ?? l.model.atoms) as Atom[];
        const atoms = mapAtomsByTypeMap(l, atoms0);
        l.clipBounds = computeClipBounds(atoms, centerTmp, atomSizeFactor) ?? undefined;
      }
      const bounds = l.clipBounds;
      if (!bounds) continue;
      any = true;
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.minZ < minZ) minZ = bounds.minZ;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
      if (bounds.maxZ > maxZ) maxZ = bounds.maxZ;
      const r = bounds.maxSphereBase * display.atomScale;
      if (r > maxSphere) maxSphere = r;
    }

    if (!any || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
      visibleClipRadius = 0;
      lastClipDist = -1;
      lastClipRadius = -1;
      return;
    }

    // Expand by diameter padding (same idea as fitCameraToAtoms)
    const pad = Math.max(0.5, maxSphere * 2.0);
    minX -= pad;
    minY -= pad;
    minZ -= pad;
    maxX += pad;
    maxY += pad;
    maxZ += pad;

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    visibleClipRadius = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Force a re-apply on next tick.
    lastClipDist = -1;
    lastClipRadius = -1;
  }

  function recomputeVisibleCustomColors(): void {
    const base = buildStyleBaseColorMap();
    for (const l of layerMap.values()) {
      if (!l.info.visible) continue;
      if (hasCustomColors(l.colorMap ?? {}, base)) {
        visibleCustomColors.value = true;
        return;
      }
    }
    visibleCustomColors.value = false;
  }

  function buildStyleBaseColorMap(): Record<string, string> {
    const styleId = getSettings().other.visualStyle ?? 'default';
    if (styleId === 'default') return {};
    return { ...(getVisualStylePreset(styleId).colorMapTemplate ?? {}) };
  }

  function hasCustomColors(
    map: ColorMapRecord,
    baseByElement: Record<string, string>,
  ): boolean {
    for (const [key, value] of Object.entries(map ?? {})) {
      const { element } = parseColorMapKey(key);
      const base = baseByElement[element] ?? getElementColorHex(element);
      const cur = String(value ?? '').trim().toUpperCase();
      if (cur && cur !== String(base).trim().toUpperCase()) return true;
    }
    return false;
  }

  function tickCameraClipping(force = false): void {
    if (visibleClipRadius <= 0) return;

    const camera = stage.getCamera();
    const controls = stage.getControls();

    const dist = camera.position.distanceTo(controls.target);
    if (
      !force
      && Math.abs(dist - lastClipDist) < 1e-6
      && Math.abs(visibleClipRadius - lastClipRadius) < 1e-6
    ) {
      return;
    }

    const clipPaddingMul = 4;
    const nearBySphere = dist - visibleClipRadius * clipPaddingMul;
    const farBySphere = dist + visibleClipRadius * clipPaddingMul;
    const nearAdaptive = dist * 0.02;

    const newNear = Math.max(0.01, nearBySphere, nearAdaptive);
    const newFar = Math.max(newNear + 1e-3, farBySphere);

    // Avoid needless projection updates.
    if (
      !force
      && Math.abs(newNear - camera.near) < 1e-6
      && Math.abs(newFar - camera.far) < 1e-3
    ) {
      lastClipDist = dist;
      lastClipRadius = visibleClipRadius;
      return;
    }

    camera.near = newNear;
    camera.far = newFar;
    camera.updateProjectionMatrix();

    lastClipDist = dist;
    lastClipRadius = visibleClipRadius;
  }

  // axes helpers are shared at stage level

  // --- axes (thick mesh) / 加粗坐标轴 ---
  // NOTE: THREE.AxesHelper uses WebGL lines whose width is effectively fixed to 1px on most platforms.
  // To make axes visibly thicker, we render them as meshes (cylinders + cones).
  const AXIS_RADIUS_FACTOR = 0.012; // radius ~= axisLen * factor
  const AXIS_RADIUS_MIN = 0.02;
  const AXIS_RADIUS_MAX = 0.25;

  const ARROW_LEN_FACTOR = 0.14; // arrow length relative to axisLen
  const ARROW_RADIUS_FACTOR = 2.4;

  // Unit geometries (scaled per update)
  const axisBodyGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
  const axisArrowGeo = new THREE.ConeGeometry(1, 1, 16, 1, false);

  const matX = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const matY = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
  const matZ = new THREE.MeshBasicMaterial({ color: 0x4488ff });

  const axesHelper = new THREE.Group();
  axesHelper.visible = false;
  stage.axesGroup.add(axesHelper);

  function makeAxisMeshes(
    mat: THREE.Material,
    rot: THREE.Euler,
  ): { body: THREE.Mesh; arrow: THREE.Mesh } {
    const body = new THREE.Mesh(axisBodyGeo, mat);
    const arrow = new THREE.Mesh(axisArrowGeo, mat);
    body.rotation.copy(rot);
    arrow.rotation.copy(rot);
    axesHelper.add(body, arrow);
    return { body, arrow };
  }

  const xAxis = makeAxisMeshes(matX, new THREE.Euler(0, 0, -Math.PI / 2));
  const yAxis = makeAxisMeshes(matY, new THREE.Euler(0, 0, 0));
  const zAxis = makeAxisMeshes(matZ, new THREE.Euler(Math.PI / 2, 0, 0));

  function updateThickAxes(axisLen: number): {
    axisLen: number;
    arrowLen: number;
  } {
    const radius = Math.min(
      AXIS_RADIUS_MAX,
      Math.max(AXIS_RADIUS_MIN, axisLen * AXIS_RADIUS_FACTOR),
    );
    const arrowLen = Math.max(radius * 6, axisLen * ARROW_LEN_FACTOR);
    const bodyLen = Math.max(1e-3, axisLen - arrowLen);
    const arrowRadius = radius * ARROW_RADIUS_FACTOR;

    // X
    xAxis.body.scale.set(radius, bodyLen, radius);
    xAxis.body.position.set(bodyLen / 2, 0, 0);
    xAxis.arrow.scale.set(arrowRadius, arrowLen, arrowRadius);
    xAxis.arrow.position.set(bodyLen + arrowLen / 2, 0, 0);

    // Y
    yAxis.body.scale.set(radius, bodyLen, radius);
    yAxis.body.position.set(0, bodyLen / 2, 0);
    yAxis.arrow.scale.set(arrowRadius, arrowLen, arrowRadius);
    yAxis.arrow.position.set(0, bodyLen + arrowLen / 2, 0);

    // Z
    zAxis.body.scale.set(radius, bodyLen, radius);
    zAxis.body.position.set(0, 0, bodyLen / 2);
    zAxis.arrow.scale.set(arrowRadius, arrowLen, arrowRadius);
    zAxis.arrow.position.set(0, 0, bodyLen + arrowLen / 2);

    return { axisLen, arrowLen };
  }

  const xLabel = makeTextLabel('X', '#ff4444', 16);
  const yLabel = makeTextLabel('Y', '#44ff44', 16);
  const zLabel = makeTextLabel('Z', '#4488ff', 16);
  stage.axesGroup.add(xLabel, yLabel, zLabel);

  function getSettings(): ViewerSettings {
    return settingsRef.value;
  }

  function normalizeAtomRoughnessValue(raw: number | undefined): number {
    const base = Number.isFinite(raw) ? raw as number : DEFAULT_DETAILS.atomRoughness;
    return Math.min(1, Math.max(0, base));
  }

  function getDisplayDefaults(): DetailsSettingsGroup {
    return normalizeLayerDisplay(
      DEFAULT_DETAILS_LOCAL,
      DEFAULT_DETAILS_LOCAL,
    );
  }

  function getLayerDisplay(layer: LayerInternal): DetailsSettingsGroup {
    if (!layer.display) {
      layer.display = getDisplayDefaults();
    }
    return layer.display;
  }

  function getActiveDisplay(): DetailsSettingsGroup | null {
    const a = getActiveLayer();
    return a ? getLayerDisplay(a) : null;
  }

  function syncHasModelFlag(): void {
    hasModel.value = layers.value.length > 0;
  }

  function getActiveLayer(): LayerInternal | null {
    const id = activeLayerId.value;
    if (!id) return null;
    return layerMap.get(id) ?? null;
  }

  // Resolve target layers from ids.
  // 根据 id 解析目标图层。
  function resolveLayerTargets(layerIds?: string[]): LayerInternal[] {
    if (!layerIds || layerIds.length === 0) return [];
    const out: LayerInternal[] = [];
    for (const id of layerIds) {
      const layer = layerMap.get(id);
      if (layer) out.push(layer);
    }
    return out;
  }

  function syncActiveTypeMap(): void {
    const a = getActiveLayer();
    activeTypeMap.value = { ...(a?.typeMap ?? {}) };
    activeTypeIds.value = [...(a?.typeIds ?? [])];
    activeTypeMapApplied.value = !!a?.typeMapApplied;
  }

  function syncActiveColorMap(): void {
    const a = getActiveLayer();
    activeColorMap.value = { ...(a?.colorMap ?? {}) };
    activeColorKeys.value = [...(a?.colorKeys ?? [])];
  }

  function syncActiveDisplay(): void {
    const d = getActiveDisplay();
    activeDisplaySettings.value = d ? { ...d } : null;
  }

  function expandTypeIdsContiguous(typeIdsRaw: number[]): number[] {
    return typeIdsRaw ?? [];
  }

  function mapAtomsByTypeMap(layer: LayerInternal, atoms0: Atom[]): Atom[] {
    const map = layer.typeMap ?? {};
    if (layer.hasAnyTypeId && Object.keys(map).length > 0) {
      return remapAtomsByTypeId(atoms0, map);
    }
    return atoms0;
  }

  function getMappedAtomsForCurrentFrame(layer: LayerInternal): Atom[] {
    // Cache mapped atoms per-frame to avoid repeated remapping (e.g. picking
    // / inspector reads). Mapping is invalidated when frameIndex changes or the
    // layer's typeMap changes.
    if (layer.currentMappedAtoms && layer.mappedFrameIndex === layer.frameIndex) {
      return layer.currentMappedAtoms;
    }

    const mapped = mapAtomsByTypeMap(layer, layer.currentFrameAtoms);
    layer.currentMappedAtoms = mapped;
    layer.mappedFrameIndex = layer.frameIndex;
    return mapped;
  }

  function getDisplayAtoms(
    layer: LayerInternal,
    atoms: Atom[],
  ): { atoms: Atom[]; usePeriodicBonds: boolean } {
    const cell = layer.model.cell;
    if (!cell || atoms.length === 0) return { atoms, usePeriodicBonds: false };
    if (!atoms.every(a => a.fracPosition)) return { atoms, usePeriodicBonds: false };
    const display = getLayerDisplay(layer);
    if (!display.showBonds) return { atoms, usePeriodicBonds: false };
    return {
      atoms: unwrapAtomsPeriodic(atoms, cell, display.bondFactor),
      usePeriodicBonds: false,
    };
  }

  function disposeLayer(layer: LayerInternal): void {
    removeAndDisposeInstancedMeshes(layer.group, layer.atomMeshes);
    removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
    layer.atomMeshes = [];
    layer.bondMeshes = [];
    layer.lastBondSegCount = 0;
    layer.bondFactorUsed = NaN;

    // best-effort dispose remaining children (if any)
    disposeGroupChildren(layer.group);

    stage.modelGroup.remove(layer.group);
  }

  function updateAxesForAtoms(atoms: Atom[]): void {
    const { box } = computeCenteredBox(atoms, centerTmp);

    if (box.isEmpty()) {
      axesHelper.visible = false;
      xLabel.visible = false;
      yLabel.visible = false;
      zLabel.visible = false;
      return;
    }

    const size = box.getSize(centerTmp2);
    const axisLen = Math.max(1, size.length() * 0.6);

    axesHelper.visible = true;
    const { arrowLen } = updateThickAxes(axisLen);

    xLabel.visible = true;
    yLabel.visible = true;
    zLabel.visible = true;

    const labelOffset = Math.max(0.2, arrowLen * 0.25);

    xLabel.position.set(axisLen + labelOffset, 0, 0);
    yLabel.position.set(0, axisLen + labelOffset, 0);
    zLabel.position.set(0, 0, axisLen + labelOffset);
  }

  function fitCameraToAtomsCentered(
    layer: LayerInternal,
    atoms: Atom[],
  ): void {
    const camera = stage.getCamera();
    const controls = stage.getControls();
    const display = getLayerDisplay(layer);

    // center by current mean to match applyFrameAtomsToMeshes(baseCenter=0)
    const c = computeMeanCenterInto(atoms, centerTmp);
    const centeredAtoms = makeCenteredAtomsView(atoms, c);

    const orthoHalf = fitCameraToAtomsImpl({
      atoms: centeredAtoms,
      camera,
      controls,
      host: stage.host,
      getSphereRadiusByElement: el =>
        getSphereBaseRadiusByElement(el, atomSizeFactor)
        * display.atomScale,
      orthoHalfHeight: stage.getOrthoHalfHeight(),
      margin: 1.25,
    });

    if (!isPerspective(camera)) {
      stage.setOrthoHalfHeight(orthoHalf);
    }
  }

  function rebuildVisualsForLayer(
    layer: LayerInternal,
    atomsForVisuals: Atom[],
  ): void {
    const display = getLayerDisplay(layer);
    const displayInfo = getDisplayAtoms(layer, atomsForVisuals);
    const displayAtoms = displayInfo.atoms;

    // clear old
    removeAndDisposeInstancedMeshes(layer.group, layer.atomMeshes);
    removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
    layer.atomMeshes = [];
    layer.bondMeshes = [];
    layer.lastBondSegCount = 0;
    layer.bondFactorUsed = NaN;

    const preferTypeId = !!layer.hasAnyTypeId;
    const getColorKey = (a: Atom) =>
      preferTypeId
        ? getAtomTypeColorKey(a.element, a.typeId)
        : getAtomTypeColorKey(a.element);
    // NOTE: For LAMMPS layers, atoms can share the same element but differ by typeId.
    // In practice, relying on InstancedMesh instanceColor has proven fragile across
    // builds/drivers when users refresh the color map or type map. To guarantee that
    // atom colors always follow the Settings (and match bond updates), group atoms by
    // the type-aware color key (e.g. "C.1", "O.2") and use a uniform material color per mesh.
    const getGroupKey = preferTypeId ? getColorKey : undefined;
    const colorMap = buildColorMapRecord(layer.colorMap);

    // atoms
    layer.atomMeshes = buildAtomMeshesByElement({
      atoms: displayAtoms,
      atomSizeFactor,
      atomScale: display.atomScale,
      sphereSegments: display.sphereSegments,
      getGroupKey,
      getColorKey,
      colorMap,
      useInstanceColor: false,
      roughness: normalizeAtomRoughnessValue(display.atomRoughness),
    });
    for (const m of layer.atomMeshes) {
      (m.userData as any).layerId = layer.info.id;
    }
    for (const m of layer.atomMeshes) layer.group.add(m);

    // bonds (optional)
    if (display.showBonds) {
      const c = computeMeanCenterInto(displayAtoms, centerTmp);
      const centeredAtoms = makeCenteredAtomsView(displayAtoms, c);

      const bf = display.bondFactor;
      const res = buildBondMeshesBicolor({
        atoms: centeredAtoms,
        bondFactor: bf,
        atomSizeFactor,
        bondRadius: display.bondRadius,
        cell: displayInfo.usePeriodicBonds ? layer.model.cell : undefined,
        getColorKey,
        colorMap,
      });
      layer.bondMeshes = res.meshes;
      layer.lastBondSegCount = res.segCount;
      layer.bondFactorUsed = bf;
      layer.bondRadiusUsed = display.bondRadius;
      for (const b of layer.bondMeshes) layer.group.add(b);
    }

    // Apply surface settings (colors + opacity + roughness).
    // 应用材质设置（颜色 + 透明度 + 粗糙度）。
    applyLayerSurfaceSettings([layer]);

    // center atoms in-place to match visual coordinate space
    applyFrameAtomsToMeshes({
      frameAtoms: displayAtoms,
      atomMeshes: layer.atomMeshes,
      baseCenter: layer.baseCenter,
      centerTmp: centerTmp2,
      matTmp,
    });

    applyLayerSurfaceSettings([layer]);
  }

  function hideAllLayers(): void {
    for (const l of layerMap.values()) {
      l.info.visible = false;
      l.group.visible = false;
    }
    layers.value = [...layers.value];
  }

  function setActiveLayer(id: string): void {
    if (!layerMap.has(id)) return;
    activeLayerId.value = id;
    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();

    // keep axes in sync
    applyShowAxes();
  }

  function setLayerVisible(id: string, visible: boolean): void {
    const layer = layerMap.get(id);
    if (!layer) return;

    layer.info.visible = visible;
    layer.group.visible = visible;

    const keepActiveOnHide = getSettings().other.keepActiveLayerOnHide ?? false;

    if (!visible) {
      // If active layer is hidden, either keep it or switch to a visible one.
      // 若隐藏的是当前选中图层：按设置保留或切到可见图层。
      if (activeLayerId.value === id && !keepActiveOnHide) {
        const next = layers.value.find(x => x.visible && x.id !== id) ?? null;
        activeLayerId.value = next?.id ?? null;
        syncActiveTypeMap();
        syncActiveColorMap();
        syncActiveDisplay();
        applyShowAxes();
      }
    }
    else {
      // If nothing is active (or active is hidden and we don't keep it), promote this layer.
      // 若没有选中图层（或选中图层不可见且不保留），则选中新显示的图层。
      const active = activeLayerId.value ? layerMap.get(activeLayerId.value) : null;
      const activeVisible = !!active?.info.visible;
      const shouldPromote = !activeLayerId.value || (!activeVisible && !keepActiveOnHide);
      if (shouldPromote) {
        activeLayerId.value = id;
        syncActiveTypeMap();
        syncActiveColorMap();
        syncActiveDisplay();
        applyShowAxes();
      }
    }

    // Update camera clip planes based on all visible layers
    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    layers.value = [...layers.value];
    syncHasModelFlag();
    recomputeVisibleCustomColors();

    invalidate();
  }

  function setAllLayersVisible(visible: boolean): void {
    if (layers.value.length === 0) return;
    for (const l of layerMap.values()) {
      l.info.visible = visible;
      l.group.visible = visible;
    }

    if (!visible) {
      activeLayerId.value = null;
    }
    else {
      const active = activeLayerId.value ? layerMap.get(activeLayerId.value) : null;
      if (!active || !active.info.visible) {
        activeLayerId.value = layers.value.find(x => x.visible)?.id ?? null;
      }
    }

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    layers.value = [...layers.value];
    syncHasModelFlag();
    recomputeVisibleCustomColors();

    invalidate();
  }

  function sortLayers(compare: (a: ModelLayerInfo, b: ModelLayerInfo) => number): void {
    if (layers.value.length < 2) return;
    layers.value = [...layers.value].sort(compare);
  }

  function upsertLayerInternal(layer: LayerInternal): void {
    layerMap.set(layer.info.id, layer);

    const exists = layers.value.some(x => x.id === layer.info.id);
    if (!exists) layers.value = [...layers.value, layer.info];
    else
      layers.value = layers.value.map(x =>
        x.id === layer.info.id ? layer.info : x,
      );

    syncHasModelFlag();
  }

  function renderModel(
    model: StructureModel,
    opts?: {
      hidePreviousLayers?: boolean;
      sourceMeta?: LayerSourceInfo;
      skipAutoFit?: boolean;
      forcedLayerId?: string;
    },
  ): { frameCount: number; hasAnimation: boolean; layerId: string } {
    // New model load: hide previous layers by default (layer-like behavior).
    // When loading multiple files at once, the caller can disable this per-file
    // so all newly-added layers remain visible.
    const hidePrev = opts?.hidePreviousLayers !== false;
    if (hidePrev) hideAllLayers();

    const preferredId = opts?.forcedLayerId;
    const id = preferredId && !layerMap.has(preferredId) ? preferredId : makeLayerId();
    const name = safeLayerName(model.source?.filename);

    const group = new THREE.Group();
    group.name = `layer:${id}`;
    stage.modelGroup.add(group);

    const frameCount = model.frames?.length ? model.frames.length : 1;
    const hasAnimation = frameCount > 1;

    const firstAtoms = model.frames?.[0] ?? model.atoms;

    const srcMeta = opts?.sourceMeta;
    const computedFileName = srcMeta?.fileName ?? model.source?.filename;
    let infoSource: LayerSourceInfo | undefined;
    if (srcMeta) {
      infoSource = { ...srcMeta };
      if (!infoSource.fileName && computedFileName) {
        infoSource.fileName = computedFileName;
      }
    }
    else if (computedFileName) {
      infoSource = { fileName: computedFileName };
    }

    const layer: LayerInternal = {
      info: {
        id,
        name,
        visible: true,
        atomCount: model.atoms.length,
        frameCount,
        hasTypeId: false,
        sourceFormat: model.source?.format,
        source: infoSource,
        createdAtMs: Date.now(),
      },
      model,
      group,
      atomMeshes: [],
      bondMeshes: [],
      lastBondSegCount: 0,
      bondFactorUsed: NaN,
      bondRadiusUsed: NaN,
      frameIndex: 0,
      currentFrameAtoms: firstAtoms,
      currentMappedAtoms: null,
      mappedFrameIndex: -1,
      hasAnyTypeId: false,
      typeMap: {},
      typeIds: [],
      typeMapApplied: false,
      colorMap: {},
      colorKeys: [],
      display: getDisplayDefaults(),
      playFps: DEFAULT_LAYER_ANIM.playFps,
      baseCenter: new THREE.Vector3(0, 0, 0),
    };

    // detect LAMMPS typeId
    const typeInfo = collectTypeIdsAndElementDefaultsFromAtoms(firstAtoms);
    layer.hasAnyTypeId = typeInfo.typeIds.length > 0;
    layer.info.hasTypeId = layer.hasAnyTypeId;

    if (layer.hasAnyTypeId) {
      const detected = expandTypeIdsContiguous(typeInfo.typeIds);
      const mergedMap = mergeTypeMap(DEFAULT_LAMMPS.data, detected, typeInfo.defaults);
      layer.typeMap = mergedMap;
      layer.typeIds = [...detected];
    }
    else {
      layer.typeMap = {};
      layer.typeIds = [];
    }
    layer.typeMapApplied = false;

    // Apply current per-layer type mapping (if any)
    const mappedFirstAtoms = mapAtomsByTypeMap(layer, firstAtoms);
    layer.currentMappedAtoms = mappedFirstAtoms;
    layer.mappedFrameIndex = 0;
    layer.clipBounds = computeClipBounds(mappedFirstAtoms, centerTmp, atomSizeFactor) ?? undefined;

    // Initialize per-layer color mapping from (mapped) atoms.
    layer.colorMap = buildColorMapFromAtoms(
      DEFAULT_COLORS.data,
      mappedFirstAtoms,
      layer.hasAnyTypeId,
    );
    layer.colorKeys = buildColorMapKeysFromAtoms(mappedFirstAtoms, layer.hasAnyTypeId);

    // Store a model whose frame[0] uses mapped atoms for rendering (keep raw for reparse logic elsewhere)
    // We do not mutate the original model; we only render with mapped atoms.
    rebuildVisualsForLayer(layer, mappedFirstAtoms);

    // Show it
    layer.info.visible = true;
    group.visible = true;

    upsertLayerInternal(layer);
    activeLayerId.value = id;
    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();

    if (!opts?.skipAutoFit) {
      fitCameraToAtomsCentered(layer, getDisplayAtoms(layer, mappedFirstAtoms).atoms);
    }
    applyModelRotation();
    applyBackgroundColor();
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    invalidate();

    return { frameCount, hasAnimation, layerId: id };
  }

  function replaceActiveLayerModel(model: StructureModel): {
    frameCount: number;
    hasAnimation: boolean;
    layerId: string;
  } {
    const active = getActiveLayer();
    if (!active) {
      return renderModel(model);
    }

    active.model = model;

    const nextFileName = model.source?.filename;
    active.info.name = safeLayerName(nextFileName ?? active.info.name);
    active.info.atomCount = model.atoms.length;
    active.info.frameCount = model.frames?.length ? model.frames.length : 1;
    active.info.sourceFormat = model.source?.format;
    const prevSource = active.info.source;
    const nextSourceName = nextFileName ?? prevSource?.fileName;
    const nextSource = prevSource ? { ...prevSource } : {};
    if (nextSourceName) nextSource.fileName = nextSourceName;
    active.info.source = Object.keys(nextSource).length > 0 ? nextSource : undefined;

    active.frameIndex = 0;

    const firstAtoms = model.frames?.[0] ?? model.atoms;
    const typeInfo = collectTypeIdsAndElementDefaultsFromAtoms(firstAtoms);
    active.hasAnyTypeId = typeInfo.typeIds.length > 0;

    if (active.hasAnyTypeId) {
      const baseMap = (
        active.typeMap && Object.keys(active.typeMap).length > 0
          ? active.typeMap
          : DEFAULT_LAMMPS.data
      );
      const detected = expandTypeIdsContiguous(typeInfo.typeIds);
      const mergedMap = mergeTypeMap(baseMap, detected, typeInfo.defaults);
      active.typeMap = mergedMap;
      active.typeIds = [...detected];
    }
    else {
      active.typeMap = {};
      active.typeIds = [];
    }
    active.typeMapApplied = false;

    active.currentFrameAtoms = firstAtoms;
    active.currentMappedAtoms = null;
    active.mappedFrameIndex = -1;

    const mappedFirstAtoms = mapAtomsByTypeMap(active, firstAtoms);
    active.currentMappedAtoms = mappedFirstAtoms;
    active.mappedFrameIndex = 0;

    // Keep (and sync) per-layer color mapping; preserve previous colors when possible.
    active.colorMap = buildColorMapFromAtoms(
      active.colorMap,
      mappedFirstAtoms,
      active.hasAnyTypeId,
    );
    active.colorKeys = buildColorMapKeysFromAtoms(mappedFirstAtoms, active.hasAnyTypeId);

    rebuildVisualsForLayer(active, mappedFirstAtoms);

    // keep visible
    active.info.visible = true;
    active.group.visible = true;

    upsertLayerInternal(active);
    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();

    fitCameraToAtomsCentered(active, getDisplayAtoms(active, mappedFirstAtoms).atoms);
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    invalidate();

    return {
      frameCount: active.info.frameCount,
      hasAnimation: active.info.frameCount > 1,
      layerId: active.info.id,
    };
  }

  function clearModel(): void {
    for (const l of layerMap.values()) {
      disposeLayer(l);
    }
    layerMap.clear();

    layers.value = [];
    activeLayerId.value = null;
    activeTypeMap.value = {};
    activeTypeIds.value = [];
    activeTypeMapApplied.value = false;
    activeColorMap.value = {};
    activeColorKeys.value = [];
    activeDisplaySettings.value = null;
    visibleCustomColors.value = false;

    // axes cleanup
    axesHelper.visible = false;
    xLabel.visible = false;
    yLabel.visible = false;
    zLabel.visible = false;

    visibleClipRadius = 0;
    lastClipDist = -1;
    lastClipRadius = -1;

    syncHasModelFlag();
    invalidate();
  }

  function getFrameCount(): number {
    const active = getActiveLayer();
    return active ? Math.max(1, active.info.frameCount) : 1;
  }

  function getFrameIndex(): number {
    const active = getActiveLayer();
    return active ? active.frameIndex : 0;
  }

  // 获取/设置当前图层播放帧率（与导出保持一致）。
  // Get/set active-layer playback fps (persisted with snapshots).
  function getActiveLayerPlayFps(): number {
    const active = getActiveLayer();
    return active ? active.playFps : DEFAULT_LAYER_ANIM.playFps;
  }

  function setActiveLayerPlayFps(fps: number): void {
    const active = getActiveLayer();
    if (!active) return;
    if (!Number.isFinite(fps)) return;
    active.playFps = Math.max(1, Math.floor(fps));
  }

  function getFrameMetaForLayer(
    id: string | null,
    frameIndex?: number,
  ): FrameMeta | null {
    if (!id) return null;
    const layer = layerMap.get(id);
    if (!layer) return null;

    const frames = layer.model.frames;
    const max0 = frames?.length ? Math.max(1, frames.length) : 1;
    const idx
      = typeof frameIndex === 'number' && Number.isFinite(frameIndex)
        ? Math.min(Math.max(0, frameIndex), max0 - 1)
        : Math.min(Math.max(0, layer.frameIndex), max0 - 1);

    const meta = layer.model.frameMeta?.[idx] ?? null;
    if (meta && (meta.comment || Number.isFinite(meta.timestep))) return meta;

    if (layer.model.comment) return { comment: layer.model.comment };
    return null;
  }

  function getActiveAtoms(): Atom[] | null {
    const active = getActiveLayer();
    if (!active) return null;
    return getAtomsForLayerInternal(active);
  }

  function getAtomsForLayerInternal(layer: LayerInternal): Atom[] | null {
    const frames = layer.model.frames;
    const frameAtoms = (frames && frames.length > 0)
      ? (frames[Math.min(Math.max(0, layer.frameIndex), frames.length - 1)] ?? null)
      : layer.model.atoms;
    if (!frameAtoms) return null;

    // Keep the runtime's "current frame" pointers consistent even if callers
    // query atoms without going through applyFrameByIndex.
    if (layer.currentFrameAtoms !== frameAtoms || layer.mappedFrameIndex !== layer.frameIndex) {
      layer.currentFrameAtoms = frameAtoms;
      layer.currentMappedAtoms = null;
      layer.mappedFrameIndex = -1;
    }

    return getMappedAtomsForCurrentFrame(layer);
  }

  function getAtomsForLayer(id: string): Atom[] | null {
    const layer = layerMap.get(id);
    if (!layer) return null;
    return getAtomsForLayerInternal(layer);
  }

  function applyFrameByIndex(idx: number, opts?: { refreshBonds?: boolean }): void {
    const active = getActiveLayer();
    if (!active) return;

    const frames = active.model.frames;
    if (!frames || frames.length <= 1) {
      active.frameIndex = 0;
      return;
    }

    const clamped = Math.min(Math.max(0, idx), frames.length - 1);
    active.frameIndex = clamped;

    // Update instance transforms using raw frame atoms (positions only).
    // TypeId->element remapping is computed lazily (only when needed).
    const frameAtoms = frames[clamped] ?? active.model.atoms;
    active.currentFrameAtoms = frameAtoms;
    active.currentMappedAtoms = null;
    active.mappedFrameIndex = -1;

    const displayAtoms = getDisplayAtoms(active, frameAtoms).atoms;
    applyFrameAtomsToMeshes({
      frameAtoms: displayAtoms,
      atomMeshes: active.atomMeshes,
      baseCenter: active.baseCenter,
      centerTmp: centerTmp,
      matTmp,
    });

    if (opts?.refreshBonds) {
      // Safety: rebuilding bonds every frame can be O(N^2) if the cutoff is large,
      // and is expensive even with spatial hashing. Guard against accidental freezes.
      const MAX_ATOMS_FOR_BONDS_REFRESH = 5000;
      if (frameAtoms.length <= MAX_ATOMS_FOR_BONDS_REFRESH) {
        const mappedForBonds = getMappedAtomsForCurrentFrame(active);
        rebuildBondsForLayer(active, mappedForBonds);
      }
    }

    if (getSettings().other.showAxes) updateAxesForAtoms(displayAtoms);

    invalidate();
  }

  function applyAtomScale(): void {
    for (const l of layerMap.values()) {
      const display = getLayerDisplay(l);
      applyAtomScaleToMeshes(
        l.atomMeshes,
        display.atomScale,
        display.sphereSegments,
      );
    }

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function applyAtomRoughness(): void {
    applyLayerSurfaceSettings(Array.from(layerMap.values()));
  }

  function rebuildBondsForLayer(layer: LayerInternal, atoms: Atom[]): void {
    // Rebuild (and re-center) bond meshes to match the current frame.
    // This is intentionally separated from applyShowBonds so playback can
    // refresh bonds conditionally without toggling visibility.

    const display = getLayerDisplay(layer);
    if (!display.showBonds) return;

    if (layer.bondMeshes.length > 0) {
      removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
      layer.bondMeshes = [];
      layer.lastBondSegCount = 0;
    }

    const displayInfo = getDisplayAtoms(layer, atoms);
    const displayAtoms = displayInfo.atoms;
    const c = computeMeanCenterInto(displayAtoms, centerTmp2);
    const centeredAtoms = makeCenteredAtomsView(displayAtoms, c);

    const preferTypeId = !!layer.hasAnyTypeId;
    const getColorKey = (a: Atom) =>
      preferTypeId
        ? getAtomTypeColorKey(a.element, a.typeId)
        : getAtomTypeColorKey(a.element);
    const colorMap = buildColorMapRecord(layer.colorMap);

    const bf = display.bondFactor;
    const res = buildBondMeshesBicolor({
      atoms: centeredAtoms,
      bondFactor: bf,
      atomSizeFactor,
      bondRadius: display.bondRadius,
      cell: displayInfo.usePeriodicBonds ? layer.model.cell : undefined,
      getColorKey,
      colorMap,
    });

    layer.bondMeshes = res.meshes;
    layer.lastBondSegCount = res.segCount;
    layer.bondFactorUsed = bf;
    layer.bondRadiusUsed = display.bondRadius;
    for (const b of layer.bondMeshes) layer.group.add(b);

    applyLayerSurfaceSettings([layer]);
  }

  function applyShowBonds(): void {
    const touchedLayers: LayerInternal[] = [];
    for (const l of layerMap.values()) {
      const display = getLayerDisplay(l);
      const bf = display.bondFactor;
      if (display.showBonds) {
        const needRebuild
          = l.bondMeshes.length === 0
            || !Number.isFinite(l.bondFactorUsed)
            || Math.abs(l.bondFactorUsed - bf) > 1e-6
            || !Number.isFinite(l.bondRadiusUsed)
            || Math.abs(l.bondRadiusUsed - display.bondRadius) > 1e-6;
        if (!needRebuild) continue;

        if (l.bondMeshes.length > 0) {
          removeAndDisposeInstancedMeshes(l.group, l.bondMeshes);
          l.bondMeshes = [];
          l.lastBondSegCount = 0;
        }

        const atoms = (l.model.frames?.[l.frameIndex]
          ?? l.model.atoms) as Atom[];
        const mapped = mapAtomsByTypeMap(l, atoms);
        const displayInfo = getDisplayAtoms(l, mapped);
        const displayAtoms = displayInfo.atoms;
        const c = computeMeanCenterInto(displayAtoms, centerTmp);
        const centeredAtoms = makeCenteredAtomsView(displayAtoms, c);

        const preferTypeId = !!l.hasAnyTypeId;
        const getColorKey = (a: Atom) =>
          preferTypeId
            ? getAtomTypeColorKey(a.element, a.typeId)
            : getAtomTypeColorKey(a.element);
        const colorMap = buildColorMapRecord(l.colorMap);

        const res = buildBondMeshesBicolor({
          atoms: centeredAtoms,
          bondFactor: bf,
          atomSizeFactor,
          bondRadius: display.bondRadius,
          cell: displayInfo.usePeriodicBonds ? l.model.cell : undefined,
          getColorKey,
          colorMap,
        });
        l.bondMeshes = res.meshes;
        l.lastBondSegCount = res.segCount;
        l.bondFactorUsed = bf;
        l.bondRadiusUsed = display.bondRadius;
        for (const b of l.bondMeshes) l.group.add(b);
        touchedLayers.push(l);
      }
      else {
        if (l.bondMeshes.length === 0) continue;
        removeAndDisposeInstancedMeshes(l.group, l.bondMeshes);
        l.bondMeshes = [];
        l.lastBondSegCount = 0;
        l.bondFactorUsed = NaN;
        l.bondRadiusUsed = NaN;
      }
    }

    if (touchedLayers.length > 0) {
      applyLayerSurfaceSettings(touchedLayers);
    }

    invalidate();
  }

  function applyShowAxes(): void {
    stage.axesGroup.visible = getSettings().other.showAxes;
    if (!getSettings().other.showAxes) {
      axesHelper.visible = false;
      xLabel.visible = false;
      yLabel.visible = false;
      zLabel.visible = false;
      invalidate();
      return;
    }

    const active = getActiveLayer();
    if (!active) return;

    // Axes length only depends on positions; avoid remapping.
    const atoms = (active.model.frames?.[active.frameIndex]
      ?? active.model.atoms) as Atom[];
    active.currentFrameAtoms = atoms;
    active.currentMappedAtoms = null;
    active.mappedFrameIndex = -1;
    updateAxesForAtoms(getDisplayAtoms(active, atoms).atoms);
    invalidate();
  }

  function getLayerSnapshots(): LayerSnapshot[] {
    const res: LayerSnapshot[] = [];
    const base = buildStyleBaseColorMap();
    for (const l of layerMap.values()) {
      const layerDisplay = { ...getLayerDisplay(l) };
      const typeMap = { ...(l.typeMap ?? {}) };
      const colorMap = buildCustomColorMapRecord(l.colorMap, base);
      res.push({
        id: l.info.id,
        name: l.info.name,
        visible: l.info.visible,
        createdAtMs: l.info.createdAtMs,
        source: l.info.source ? { ...l.info.source } : undefined,
        details: layerDisplay,
        lammps: { data: typeMap },
        colors: {
          data: colorMap,
        },
        inspectSelection: l.inspectSelection ?? [],
        anim: {
          frameIndex: l.frameIndex,
          playFps: l.playFps ?? DEFAULT_LAYER_ANIM.playFps,
        },
      });
    }
    return res;
  }

  function applyLayerSnapshotToLayer(
    layer: LayerInternal,
    snap: LayerSnapshot,
  ): void {
    // 还原图层帧序号（与导出一致）。
    // Restore per-layer frame index from snapshot.
    const snapFrame = snap.anim?.frameIndex;
    if (Number.isFinite(snapFrame)) {
      const max0 = Math.max(0, (layer.model.frames?.length ?? 1) - 1);
      layer.frameIndex = Math.min(Math.max(0, Math.floor(Number(snapFrame))), max0);
    }
    const baseDisplay = DEFAULT_DETAILS_LOCAL;
    const snapDisplay = snap.details;
    const nextDisplay = normalizeLayerDisplay(snapDisplay ?? baseDisplay, baseDisplay);
    const prevDisplay = getLayerDisplay(layer);
    layer.display = nextDisplay;

    layer.info.visible = snap.visible ?? true;
    if (Number.isFinite(snap.createdAtMs)) {
      layer.info.createdAtMs = Number(snap.createdAtMs);
    }
    layer.group.visible = layer.info.visible;

    layer.typeMap = { ...(snap.lammps?.data ?? {}) };
    const detected = collectTypeIdsAndElementDefaultsFromAtoms(
      (layer.model.frames?.[layer.frameIndex] ?? layer.model.atoms) as Atom[],
    ).typeIds;
    layer.typeIds = [...detected];
    layer.typeMapApplied = Object.keys(layer.typeMap ?? {}).length > 0;

    // restore inspect selection per layer
    if (snap.source) {
      layer.info.source = { ...snap.source };
    }
    layer.inspectSelection = (snap.inspectSelection ?? []).map(item => ({
      ...item,
    }));

    const snapAnim = snap.anim ?? {};
    if (Number.isFinite(snapAnim.playFps)) {
      layer.playFps = Math.max(1, Math.floor(Number(snapAnim.playFps)));
    }

    // keep last selection for export (runtime only; visuals handled elsewhere)

    const atoms = (layer.model.frames?.[layer.frameIndex]
      ?? layer.model.atoms) as Atom[];
    layer.currentFrameAtoms = atoms;
    layer.currentMappedAtoms = null;
    layer.mappedFrameIndex = -1;
    const mapped = mapAtomsByTypeMap(layer, atoms);
    layer.currentMappedAtoms = mapped;
    layer.mappedFrameIndex = layer.frameIndex;
    layer.clipBounds = computeClipBounds(mapped, centerTmp, atomSizeFactor) ?? layer.clipBounds;

    const colorSource = parseColorMapRecord((snap as any).colors?.data);
    layer.colorMap = buildColorMapFromAtoms(colorSource, mapped, layer.hasAnyTypeId);
    layer.colorKeys = buildColorMapKeysFromAtoms(mapped, layer.hasAnyTypeId);

    // keep last selection per layer for export/restore (visuals handled elsewhere)

    rebuildVisualsForLayer(layer, mapped);

    const atomChanged
      = Math.abs(prevDisplay.atomScale - nextDisplay.atomScale) > 1e-6
        || prevDisplay.sphereSegments !== nextDisplay.sphereSegments;
    const bondChanged
      = prevDisplay.showBonds !== nextDisplay.showBonds
        || Math.abs(prevDisplay.bondFactor - nextDisplay.bondFactor) > 1e-6
        || Math.abs(prevDisplay.bondRadius - nextDisplay.bondRadius) > 1e-6;
    if (atomChanged) applyAtomScale();
    if (bondChanged) applyShowBonds();
  }

  function setLayerInspectSelection(
    layerId: string,
    items: import('../../lib/viewer/settings').InspectSelectionItem[],
  ): void {
    const l = layerMap.get(layerId);
    if (!l) return;
    l.inspectSelection = [...items];
  }

  function getLayerInspectSelection(layerId: string) {
    const l = layerMap.get(layerId);
    return l?.inspectSelection ?? [];
  }

  function applyLayerSnapshots(
    snaps: LayerSnapshot[],
  ): void {
    if (!snaps || snaps.length === 0) return;

    const remaining = [...snaps];
    const matches: Array<{ layer: LayerInternal; snap: LayerSnapshot }> = [];

    for (const layer of layerMap.values()) {
      const md5 = layer.info.source?.md5;
      if (!md5) continue;
      const idx = remaining.findIndex(s => s.source?.md5 && s.source.md5 === md5);
      if (idx >= 0) {
        matches.push({ layer, snap: remaining[idx]! });
        remaining.splice(idx, 1);
      }
    }

    for (const layer of layerMap.values()) {
      const already = matches.some(m => m.layer === layer);
      if (already) continue;
      const snap = remaining.shift();
      if (!snap) break;
      matches.push({ layer, snap });
    }

    if (matches.length === 0) return;

    for (const { layer, snap } of matches) {
      applyLayerSnapshotToLayer(layer, snap);
    }

    // 更新 layers 列表以触发可见性等变更的响应式更新
    layers.value = [...layers.value];

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();
    applyShowAxes();
    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function applyModelRotation(): void {
    const r = getSettings().view.rotationDeg;
    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z),
    );
    invalidate();
  }

  function applyBackgroundColor(): void {
    const col = new THREE.Color(getSettings().other.backgroundColor);
    const alpha = getSettings().other.backgroundTransparent ? 0 : 1;
    stage.renderer.setClearColor(col, alpha);
    invalidate();
  }

  function hasAnyTypeId(): boolean {
    // Any layer having typeId means type-map changes should trigger a rebuild.
    for (const l of layerMap.values()) {
      if (l.hasAnyTypeId) return true;
    }
    return false;
  }

  function onTypeMapChanged(): void {
    // Per-layer mapping: refresh only the active layer.
    const active = getActiveLayer();
    if (!active) return;
    if (!active.hasAnyTypeId) return;

    const atoms = (active.model.frames?.[active.frameIndex]
      ?? active.model.atoms) as Atom[];
    active.currentFrameAtoms = atoms;
    active.currentMappedAtoms = null;
    active.mappedFrameIndex = -1;
    const mapped = mapAtomsByTypeMap(active, atoms);
    active.currentMappedAtoms = mapped;
    active.mappedFrameIndex = active.frameIndex;
    active.clipBounds = computeClipBounds(mapped, centerTmp, atomSizeFactor) ?? active.clipBounds;

    // Type mapping can change element labels. Keep color map in sync while preserving colors.
    active.colorMap = buildColorMapFromAtoms(
      active.colorMap,
      mapped,
      active.hasAnyTypeId,
    );
    active.colorKeys = buildColorMapKeysFromAtoms(mapped, active.hasAnyTypeId);
    active.typeMapApplied = true;
    activeColorMap.value = { ...(active.colorMap ?? {}) };
    activeColorKeys.value = [...(active.colorKeys ?? [])];
    activeTypeMapApplied.value = true;
    recomputeVisibleCustomColors();

    // atom mesh colors depend on element => must rebuild
    rebuildVisualsForLayer(active, mapped);

    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function setActiveLayerTypeMap(map: LammpsTypeMapRecord): void {
    const active = getActiveLayer();
    if (!active) return;
    active.typeMap = { ...(map ?? {}) };
    activeTypeMap.value = { ...(active.typeMap ?? {}) };
    active.typeMapApplied = false;
    activeTypeMapApplied.value = false;
    activeLayerId.value = active.info.id;
  }

  function resetAllLayersTypeMapToDefaults(
    opts?: {
      templateMap?: LammpsTypeMapRecord;
      useAtomDefaults?: boolean;
    },
  ): void {
    let anyChanged = false;
    const baseMap = opts?.templateMap ?? DEFAULT_LAMMPS.data;
    const useAtomDefaults = opts?.useAtomDefaults !== false;

    for (const layer of layerMap.values()) {
      if (!layer.hasAnyTypeId) continue;

      const atoms = (layer.model.frames?.[layer.frameIndex]
        ?? layer.model.atoms) as Atom[];
      layer.currentFrameAtoms = atoms;
      layer.currentMappedAtoms = null;
      layer.mappedFrameIndex = -1;

      const { typeIds: detectedTypeIdsRaw, defaults }
        = collectTypeIdsAndElementDefaultsFromAtoms(atoms);
      const defaultsSafe = useAtomDefaults ? defaults : {};
      const detectedTypeIds = expandTypeIdsContiguous(detectedTypeIdsRaw);
      const mergedMap = mergeTypeMap(baseMap, detectedTypeIds, defaultsSafe);
      layer.typeMap = mergedMap;
      layer.typeIds = [...detectedTypeIds];

      const mapped = mapAtomsByTypeMap(layer, atoms);
      layer.currentMappedAtoms = mapped;
      layer.mappedFrameIndex = layer.frameIndex;

      layer.colorMap = buildColorMapFromAtoms(
        layer.colorMap,
        mapped,
        layer.hasAnyTypeId,
      );
      layer.colorKeys = buildColorMapKeysFromAtoms(mapped, layer.hasAnyTypeId);

      rebuildVisualsForLayer(layer, mapped);
      anyChanged = true;
    }

    if (!anyChanged) return;

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();
    applyShowAxes();
    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function applyTypeMapToAllLayers(
    templateMap: LammpsTypeMapRecord,
  ): void {
    const baseMap = templateMap ?? {};

    let anyChanged = false;
    for (const layer of layerMap.values()) {
      if (applyTypeMapToLayer(layer, baseMap)) {
        anyChanged = true;
      }
    }

    if (!anyChanged) return;

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();
    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  // Apply template mapping to a single layer.
  // 将模板映射应用到单个图层。
  function applyTypeMapToLayer(
    layer: LayerInternal,
    baseMap: LammpsTypeMapRecord,
  ): boolean {
    if (!layer.hasAnyTypeId) return false;

    const atoms = (layer.model.frames?.[layer.frameIndex]
      ?? layer.model.atoms) as Atom[];
    layer.currentFrameAtoms = atoms;
    layer.currentMappedAtoms = null;
    layer.mappedFrameIndex = -1;

    const { typeIds: detectedTypeIds, defaults }
      = collectTypeIdsAndElementDefaultsFromAtoms(atoms);

    const nextMap: LammpsTypeMapRecord = {};
    for (const tid0 of detectedTypeIds) {
      const tid = Math.max(1, Math.floor(tid0));
      if (!Number.isFinite(tid) || tid <= 0) continue;

      const tplEl = normalizeElementSymbol(String(baseMap[String(tid)] ?? '')) || '';
      if (tplEl && tplEl !== 'E') {
        nextMap[String(tid)] = tplEl;
        continue;
      }

      const existing = normalizeElementSymbol(String(layer.typeMap[String(tid)] ?? '')) || '';
      if (existing && existing !== 'E') {
        nextMap[String(tid)] = existing;
        continue;
      }

      const def = normalizeElementSymbol(defaults[tid] ?? '') || '';
      nextMap[String(tid)] = def && def !== 'E' ? def : 'E';
    }

    layer.typeMap = nextMap;
    layer.typeIds = [...detectedTypeIds];
    layer.typeMapApplied = Object.keys(nextMap).length > 0;

    const mapped = mapAtomsByTypeMap(layer, atoms);
    layer.currentMappedAtoms = mapped;
    layer.mappedFrameIndex = layer.frameIndex;

    layer.colorMap = buildColorMapFromAtoms(
      layer.colorMap,
      mapped,
      layer.hasAnyTypeId,
    );
    layer.colorKeys = buildColorMapKeysFromAtoms(mapped, layer.hasAnyTypeId);

    rebuildVisualsForLayer(layer, mapped);
    return true;
  }

  function applyTypeMapToLayerIds(
    templateMap: LammpsTypeMapRecord,
    layerIds: string[],
  ): void {
    const baseMap = templateMap ?? {};
    const targets = resolveLayerTargets(layerIds);
    if (targets.length === 0) return;

    let anyChanged = false;
    for (const layer of targets) {
      if (applyTypeMapToLayer(layer, baseMap)) {
        anyChanged = true;
      }
    }
    if (!anyChanged) return;

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    recomputeVisibleCustomColors();
    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function cloneColorMap(map: ColorMapRecord | undefined): ColorMapRecord {
    return { ...(map ?? {}) };
  }

  function setActiveLayerColorMap(map: ColorMapRecord): void {
    const active = getActiveLayer();
    if (!active) return;
    active.colorMap = cloneColorMap(map);
    active.colorKeys = buildColorMapKeysFromAtoms(
      getMappedAtomsForCurrentFrame(active),
      active.hasAnyTypeId,
    );
    activeColorMap.value = cloneColorMap(active.colorMap);
    activeColorKeys.value = [...active.colorKeys];
    recomputeVisibleCustomColors();
  }

  function setAllLayersColorMap(map: ColorMapRecord): void {
    const mapSafe = cloneColorMap(map);
    for (const l of layerMap.values()) {
      const mapped = getMappedAtomsForCurrentFrame(l);
      l.colorMap = buildColorMapFromAtoms(
        mapSafe,
        mapped,
        l.hasAnyTypeId,
      );
      l.colorKeys = buildColorMapKeysFromAtoms(mapped, l.hasAnyTypeId);
    }
    const active = getActiveLayer();
    if (active) {
      activeColorMap.value = cloneColorMap(active.colorMap);
      activeColorKeys.value = [...active.colorKeys];
    }
    recomputeVisibleCustomColors();
  }

  function setLayerColorMapForIds(map: ColorMapRecord, layerIds: string[]): void {
    const mapSafe = cloneColorMap(map);
    const targets = resolveLayerTargets(layerIds);
    if (targets.length === 0) return;
    for (const l of targets) {
      const mapped = getMappedAtomsForCurrentFrame(l);
      l.colorMap = buildColorMapFromAtoms(
        mapSafe,
        mapped,
        l.hasAnyTypeId,
      );
      l.colorKeys = buildColorMapKeysFromAtoms(mapped, l.hasAnyTypeId);
    }
    syncActiveColorMap();
    recomputeVisibleCustomColors();
  }

  function resetAllLayersColorMapToDefaults(): void {
    for (const l of layerMap.values()) {
      const mapped = getMappedAtomsForCurrentFrame(l);
      l.colorMap = buildColorMapFromAtoms({}, mapped, l.hasAnyTypeId);
      l.colorKeys = buildColorMapKeysFromAtoms(mapped, l.hasAnyTypeId);
    }
    syncActiveColorMap();
    recomputeVisibleCustomColors();
    onColorMapChanged({ applyToAll: true });
  }

  function resetLayerColorMapToDefaults(layerIds: string[]): void {
    const targets = resolveLayerTargets(layerIds);
    if (targets.length === 0) return;
    for (const l of targets) {
      const mapped = getMappedAtomsForCurrentFrame(l);
      l.colorMap = buildColorMapFromAtoms({}, mapped, l.hasAnyTypeId);
      l.colorKeys = buildColorMapKeysFromAtoms(mapped, l.hasAnyTypeId);
    }
    syncActiveColorMap();
    recomputeVisibleCustomColors();
  }

  function setActiveLayerDisplaySettings(
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean; layerIds?: string[] },
  ): void {
    const active = getActiveLayer();
    if (!active) return;

    const targets = opts?.layerIds && opts.layerIds.length > 0
      ? resolveLayerTargets(opts.layerIds)
      : opts?.applyToAll
        ? Array.from(layerMap.values())
        : [active];

    let atomScaleChanged = false;
    let bondsChanged = false;
    let surfaceChanged = false;

    for (const l of targets) {
      const prev = getLayerDisplay(l);
      const next = normalizeLayerDisplay(patch, prev);
      const atomChanged
        = Math.abs(prev.atomScale - next.atomScale) > 1e-6
          || prev.sphereSegments !== next.sphereSegments;
      const bondChanged
        = prev.showBonds !== next.showBonds
          || Math.abs(prev.bondFactor - next.bondFactor) > 1e-6
          || Math.abs(prev.bondRadius - next.bondRadius) > 1e-6;
      const surfaceChangedForLayer
        = Math.abs(prev.atomRoughness - next.atomRoughness) > 1e-6;
      l.display = next;
      atomScaleChanged = atomScaleChanged || atomChanged;
      bondsChanged = bondsChanged || bondChanged;
      surfaceChanged = surfaceChanged || surfaceChangedForLayer;
    }

    if (atomScaleChanged) applyAtomScale();
    if (bondsChanged) applyShowBonds();
    if (surfaceChanged) applyLayerSurfaceSettings(targets);

    syncActiveDisplay();
  }

  function setMeshColor(
    mesh: THREE.InstancedMesh,
    color: string | THREE.Color,
  ): void {
    const matAny = mesh.material as any;
    const apply = (m: any) => {
      if (!m) return;
      if (m.color) {
        const parsed = typeof color === 'string' ? parseColorValue(color) : null;
        const hex = parsed?.hex ?? (color as any);
        m.color.set(hex as any);
        // Apply opacity from color value (if present).
        // 若颜色值包含透明度，则应用到材质。
        const alpha = parsed?.alpha ?? 1;
        m.opacity = alpha;
        m.transparent = alpha < 0.999;
      }
      if (m) m.needsUpdate = true;
    };
    if (Array.isArray(matAny)) {
      for (const m of matAny) apply(m);
      return;
    }
    apply(matAny);
  }

  function setMeshRoughness(mesh: THREE.InstancedMesh, roughness: number): void {
    const matAny = mesh.material as any;
    const apply = (m: any) => {
      if (!m) return;
      if ('roughness' in m) m.roughness = roughness;
      m.needsUpdate = true;
    };
    if (Array.isArray(matAny)) {
      for (const m of matAny) apply(m);
      return;
    }
    apply(matAny);
  }

  function setMeshInstanceColors(
    mesh: THREE.InstancedMesh,
    instanceColorKeys: string[],
    map: Record<string, string>,
  ): void {
    // Update per-instance instanceColor and keep the base material color neutral
    // to avoid tinting (MeshStandardMaterial multiplies vertex/instance color
    // by material.color).

    const matAny = mesh.material as any;
    const setNeutral = (m: any) => {
      if (!m) return;
      if (m.color) m.color.set('#ffffff');
      if ('vertexColors' in m) m.vertexColors = true;
      // Best-effort uniform alpha for instance colors.
      // instanceColor 只能使用统一透明度（尽量保持一致）。
      const uniformAlpha = getUniformAlpha(instanceColorKeys, map);
      m.opacity = uniformAlpha ?? 1;
      m.transparent = (uniformAlpha ?? 1) < 0.999;
      m.needsUpdate = true;
    };
    if (Array.isArray(matAny)) {
      for (const m of matAny) setNeutral(m);
    }
    else {
      setNeutral(matAny);
    }

    const tmp = new THREE.Color();
    for (let i = 0; i < instanceColorKeys.length; i += 1) {
      const key = instanceColorKeys[i] ?? 'E';
      const raw = map[key] ?? getElementColorHex(key);
      const parsed = parseColorValue(raw);
      const hex = parsed?.hex ?? raw;
      tmp.set(hex);
      mesh.setColorAt(i, tmp);
    }

    const ic = mesh.instanceColor;
    if (ic) ic.needsUpdate = true;
  }

  // Resolve a uniform alpha for instance-color meshes.
  // 计算 instanceColor 网格的统一透明度。
  function getUniformAlpha(
    keys: string[],
    map: Record<string, string>,
  ): number | null {
    let alpha: number | null = null;
    for (const key of keys) {
      const raw = map[key] ?? getElementColorHex(key);
      const parsed = parseColorValue(raw);
      const next = parsed?.alpha ?? 1;
      if (alpha == null) alpha = next;
      else if (Math.abs(alpha - next) > 1e-6) return null;
    }
    return alpha;
  }

  function applyLayerSurfaceSettings(layers: LayerInternal[]): void {
    if (!layers || layers.length === 0) return;

    for (const layer of layers) {
      const map = buildColorMapRecord(layer.colorMap);
      const display = getLayerDisplay(layer);
      const roughness = normalizeAtomRoughnessValue(display.atomRoughness);

      // Atoms
      for (const m of layer.atomMeshes) {
        setMeshRoughness(m, roughness);

        const perInstKeys = (m.userData as any).instanceColorKeys as
          | string[]
          | undefined;
        if (Array.isArray(perInstKeys) && perInstKeys.length > 0) {
          setMeshInstanceColors(m, perInstKeys, map);
          continue;
        }

        const key = (m.userData as any).colorKey as string | undefined;
        const el = (m.userData as any).element as string | undefined;
        const col = (key && map[key]) ? map[key]! : getElementColorHex(el ?? 'E');
        setMeshColor(m, col);
      }

      // Bonds
      for (const b of layer.bondMeshes) {
        const perInstKeys = (b.userData as any).instanceColorKeys as
          | string[]
          | undefined;
        if (Array.isArray(perInstKeys) && perInstKeys.length > 0) {
          setMeshInstanceColors(b, perInstKeys, map);
          continue;
        }

        const key = (b.userData as any).colorKey as string | undefined;
        const el = (b.userData as any).element as string | undefined;
        const fallbackEl = el ?? 'E';
        const col = (key && map[key]) ? map[key]! : getElementColorHex(fallbackEl);
        setMeshColor(b, col);
      }
    }

    invalidate();
  }

  function onColorMapChanged(opts?: { applyToAll?: boolean; layerIds?: string[] }): void {
    const targets = opts?.layerIds && opts.layerIds.length > 0
      ? resolveLayerTargets(opts.layerIds)
      : opts?.applyToAll
        ? Array.from(layerMap.values())
        : (() => {
            const a = getActiveLayer();
            return a ? [a] : [];
          })();
    if (targets.length === 0) return;

    applyLayerSurfaceSettings(targets);
    syncActiveColorMap();
  }

  function removeLayer(id: string): void {
    const layer = layerMap.get(id);
    if (!layer) return;

    // If deleting the active layer, selection/axes should follow the next active layer.
    const wasActive = activeLayerId.value === id;

    disposeLayer(layer);
    layerMap.delete(id);

    layers.value = layers.value.filter(x => x.id !== id);

    if (wasActive) {
      const next
        = layers.value.find(x => x.visible) ?? layers.value[0] ?? null;
      activeLayerId.value = next?.id ?? null;
    }

    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveDisplay();
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    layers.value = [...layers.value];
    syncHasModelFlag();

    invalidate();
  }

  function getActiveAtomMeshes(): THREE.InstancedMesh[] {
    return getActiveLayer()?.atomMeshes ?? [];
  }

  function getVisibleAtomMeshes(): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const l of layerMap.values()) {
      if (!l.info.visible) continue;
      for (const m of l.atomMeshes) out.push(m);
    }
    return out;
  }

  return {
    layers,
    activeLayerId,
    activeTypeMap,
    activeTypeIds,
    activeTypeMapApplied,
    activeColorMap,
    activeColorKeys,
    activeDisplaySettings,

    renderModel,
    replaceActiveLayerModel,

    clearModel,

    getFrameCount,
    getFrameIndex,
    applyFrameByIndex,
    getActiveLayerPlayFps,
    setActiveLayerPlayFps,
    getActiveAtoms,
    getAtomsForLayer,
    getFrameMetaForLayer,

    applyAtomScale,
    applyAtomRoughness,
    applyShowBonds,
    applyShowAxes,
    applyModelRotation,
    applyBackgroundColor,
    tickCameraClipping,
    setAllLayersVisible,
    sortLayers,

    hasAnyTypeId,
    onTypeMapChanged,
    onColorMapChanged,
    applyLayerSnapshots,
    setActiveLayerTypeMap,
    applyTypeMapToAllLayers,
    applyTypeMapToLayerIds,
    resetAllLayersTypeMapToDefaults,
    setActiveLayerColorMap,
    setAllLayersColorMap,
    setLayerColorMapForIds,
    resetAllLayersColorMapToDefaults,
    resetLayerColorMapToDefaults,
    setActiveLayerDisplaySettings,
    removeLayer,

    setActiveLayer,
    setLayerVisible,

    visibleCustomColors,

    getLayerSnapshots,
    setLayerInspectSelection,
    getLayerInspectSelection,

    getActiveAtomMeshes,
    getVisibleAtomMeshes,
  };
}
