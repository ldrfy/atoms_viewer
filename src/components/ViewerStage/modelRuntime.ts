// src/components/ViewerStage/modelRuntime.ts
import * as THREE from 'three';
import { ref, type Ref } from 'vue';

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  AtomTypeColorMapItem,
} from '../../lib/viewer/settings';
import type { Atom, StructureModel } from '../../lib/structure/types';
import { getElementColorHex } from '../../lib/structure/chem';

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
  buildColorMapRecord,
  getAtomTypeColorKey,
  syncColorMapRowsFromAtoms,
} from './colorMap';

const DEFAULT_SPHERE_SEGMENTS = 24;

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : DEFAULT_SPHERE_SEGMENTS);
  return Math.max(min, Math.min(max, v));
}

export type ModelLayerInfo = {
  id: string;
  name: string;
  visible: boolean;
  atomCount: number;
  frameCount: number;
  sourceFormat?: string;
  sourceFileName?: string;
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

  /** Per-layer LAMMPS typeId->element mapping rows (NOT global). */
  typeMapRows: LammpsTypeMapItem[];

  /** Per-layer atom type color mapping rows (active layer editable in Settings). */
  colorMapRows: AtomTypeColorMapItem[];

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
  activeTypeMapRows: Ref<LammpsTypeMapItem[]>;
  activeColorMapRows: Ref<AtomTypeColorMapItem[]>;

  renderModel: (
    model: StructureModel,
    opts?: { hidePreviousLayers?: boolean },
  ) => { frameCount: number; hasAnimation: boolean };
  replaceActiveLayerModel: (model: StructureModel) => {
    frameCount: number;
    hasAnimation: boolean;
  };

  clearModel: () => void;

  getFrameCount: () => number;
  getFrameIndex: () => number;
  applyFrameByIndex: (idx: number, opts?: { refreshBonds?: boolean }) => void;
  getActiveAtoms: () => Atom[] | null;

  applyAtomScale: () => void;
  applyShowBonds: () => void;
  applyShowAxes: () => void;
  applyModelRotation: () => void;
  applyBackgroundColor: () => void;

  /** Update camera near/far each frame based on visible layers to prevent clipping. */
  tickCameraClipping: () => void;

  hasAnyTypeId: () => boolean;
  onTypeMapChanged: () => void;
  onColorMapChanged: () => void;

  setActiveLayerTypeMapRows: (rows: LammpsTypeMapItem[]) => void;

  setActiveLayerColorMapRows: (rows: AtomTypeColorMapItem[]) => void;

  removeLayer: (id: string) => void;

  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;

  getActiveAtomMeshes: () => THREE.InstancedMesh[];
  getVisibleAtomMeshes: () => THREE.InstancedMesh[];
};

export function createModelRuntime(args: {
  stage: ThreeStage;
  settingsRef: Readonly<Ref<ViewerSettings>>;
  hasModel: Ref<boolean>;
  atomSizeFactor: number;
  bondFactor: number;
  bondRadius: number;
}): ModelRuntime {
  const {
    stage,
    settingsRef,
    hasModel,
    atomSizeFactor,
    bondFactor,
    bondRadius,
  } = args;

  const invalidate = (): void => {
    // On-demand rendering: any scene/camera/material change should request a redraw.
    stage.invalidate();
  };

  const layers = ref<ModelLayerInfo[]>([]);
  const activeLayerId = ref<string | null>(null);
  const activeTypeMapRows = ref<LammpsTypeMapItem[]>([]);
  const activeColorMapRows = ref<AtomTypeColorMapItem[]>([]);

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

    const settings = getSettings();
    const atomScale = settings.atomScale;

    for (const l of layerMap.values()) {
      if (!l.info.visible) continue;

      const atoms0 = (l.model.frames?.[l.frameIndex]
        ?? l.model.atoms) as Atom[];
      const atoms = mapAtomsByTypeMap(l, atoms0);

      if (!atoms || atoms.length === 0) continue;
      any = true;

      const c = computeMeanCenterInto(atoms, centerTmp);

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

        const r
          = getSphereBaseRadiusByElement(a.element, atomSizeFactor) * atomScale;
        if (r > maxSphere) maxSphere = r;
      }
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

  function getSphereSegments(): number {
    const s = getSettings().sphereSegments;
    return clampInt(
      typeof s === 'number' && Number.isFinite(s) ? s : DEFAULT_SPHERE_SEGMENTS,
      8,
      64,
    );
  }

  function getBondFactor(): number {
    const v = getSettings().bondFactor;
    const n = typeof v === 'number' && Number.isFinite(v) ? v : bondFactor;
    // Keep this in sync with the Settings UI range.
    return Math.max(0.8, Math.min(1.3, n));
  }

  function syncHasModelFlag(): void {
    hasModel.value = layers.value.length > 0;
  }

  function getActiveLayer(): LayerInternal | null {
    const id = activeLayerId.value;
    if (!id) return null;
    return layerMap.get(id) ?? null;
  }

  function syncActiveTypeMap(): void {
    const a = getActiveLayer();
    activeTypeMapRows.value = (a?.typeMapRows ?? []) as LammpsTypeMapItem[];
  }

  function syncActiveColorMap(): void {
    const a = getActiveLayer();
    activeColorMapRows.value = (a?.colorMapRows ?? []) as AtomTypeColorMapItem[];
  }

  function expandTypeIdsContiguous(typeIdsRaw: number[]): number[] {
    if (!typeIdsRaw || typeIdsRaw.length === 0) return [];
    const maxId = typeIdsRaw[typeIdsRaw.length - 1] ?? 0;
    if (Number.isFinite(maxId) && maxId > 0 && maxId <= 2000) {
      return Array.from({ length: maxId }, (_, i) => i + 1);
    }
    return typeIdsRaw;
  }

  function mapAtomsByTypeMap(layer: LayerInternal, atoms0: Atom[]): Atom[] {
    const rows = (layer.typeMapRows ?? []) as any;
    const hasRows = Array.isArray(rows) && rows.length > 0;
    if (layer.hasAnyTypeId && hasRows) return remapAtomsByTypeId(atoms0, rows);
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

  function fitCameraToAtomsCentered(atoms: Atom[]): void {
    const camera = stage.getCamera();
    const controls = stage.getControls();

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
        * getSettings().atomScale,
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
    const getGroupKey = preferTypeId ? (a: Atom) => a.element : undefined;
    const colorMap = buildColorMapRecord(layer.colorMapRows);

    // atoms
    layer.atomMeshes = buildAtomMeshesByElement({
      atoms: atomsForVisuals,
      atomSizeFactor,
      atomScale: getSettings().atomScale,
      sphereSegments: getSphereSegments(),
      getGroupKey,
      getColorKey,
      colorMap,
      useInstanceColor: preferTypeId,
    });
    for (const m of layer.atomMeshes) {
      (m.userData as any).layerId = layer.info.id;
    }
    for (const m of layer.atomMeshes) layer.group.add(m);

    // bonds (optional)
    if (getSettings().showBonds) {
      const c = computeMeanCenterInto(atomsForVisuals, centerTmp);
      const centeredAtoms = makeCenteredAtomsView(atomsForVisuals, c);

      const bf = getBondFactor();
      const res = buildBondMeshesBicolor({
        atoms: centeredAtoms,
        bondFactor: bf,
        atomSizeFactor,
        bondRadius,
        getColorKey,
        colorMap,
      });
      layer.bondMeshes = res.meshes;
      layer.lastBondSegCount = res.segCount;
      layer.bondFactorUsed = bf;
      for (const b of layer.bondMeshes) layer.group.add(b);
    }

    // center atoms in-place to match visual coordinate space
    applyFrameAtomsToMeshes({
      frameAtoms: atomsForVisuals,
      atomMeshes: layer.atomMeshes,
      baseCenter: layer.baseCenter,
      centerTmp: centerTmp2,
      matTmp,
    });
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

    // keep axes in sync
    applyShowAxes();
  }

  function setLayerVisible(id: string, visible: boolean): void {
    const layer = layerMap.get(id);
    if (!layer) return;

    layer.info.visible = visible;
    layer.group.visible = visible;

    // if active layer is hidden, pick a visible one as active
    if (activeLayerId.value === id && !visible) {
      const next = layers.value.find(x => x.visible && x.id !== id) ?? null;
      activeLayerId.value = next?.id ?? null;
      syncActiveTypeMap();
      syncActiveColorMap();
      applyShowAxes();
    }

    // Update camera clip planes based on all visible layers
    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    layers.value = [...layers.value];
    syncHasModelFlag();

    invalidate();
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
    opts?: { hidePreviousLayers?: boolean },
  ): { frameCount: number; hasAnimation: boolean } {
    // New model load: hide previous layers by default (layer-like behavior).
    // When loading multiple files at once, the caller can disable this per-file
    // so all newly-added layers remain visible.
    const hidePrev = opts?.hidePreviousLayers !== false;
    if (hidePrev) hideAllLayers();

    const id = makeLayerId();
    const name = safeLayerName(model.source?.filename);

    const group = new THREE.Group();
    group.name = `layer:${id}`;
    stage.modelGroup.add(group);

    const frameCount = model.frames?.length ? model.frames.length : 1;
    const hasAnimation = frameCount > 1;

    const firstAtoms = model.frames?.[0] ?? model.atoms;

    const layer: LayerInternal = {
      info: {
        id,
        name,
        visible: true,
        atomCount: model.atoms.length,
        frameCount,
        sourceFormat: model.source?.format,
        sourceFileName: model.source?.filename,
        createdAtMs: Date.now(),
      },
      model,
      group,
      atomMeshes: [],
      bondMeshes: [],
      lastBondSegCount: 0,
      bondFactorUsed: NaN,
      frameIndex: 0,
      currentFrameAtoms: firstAtoms,
      currentMappedAtoms: null,
      mappedFrameIndex: -1,
      hasAnyTypeId: false,
      typeMapRows: [],
      colorMapRows: [],
      baseCenter: new THREE.Vector3(0, 0, 0),
    };

    // detect LAMMPS typeId
    const typeInfo = collectTypeIdsAndElementDefaultsFromAtoms(firstAtoms);
    layer.hasAnyTypeId = typeInfo.typeIds.length > 0;

    if (layer.hasAnyTypeId) {
      const templateRows = (getSettings().lammpsTypeMap ?? []) as any;
      const detected = expandTypeIdsContiguous(typeInfo.typeIds);
      layer.typeMapRows
        = (mergeTypeMap(templateRows, detected, typeInfo.defaults) as any) ?? [];
    }
    else {
      layer.typeMapRows = [];
    }

    // Apply current per-layer type mapping (if any)
    const mappedFirstAtoms = mapAtomsByTypeMap(layer, firstAtoms);
    layer.currentMappedAtoms = mappedFirstAtoms;
    layer.mappedFrameIndex = 0;

    // Initialize per-layer color mapping from (mapped) atoms
    layer.colorMapRows = syncColorMapRowsFromAtoms(
      layer.colorMapRows,
      mappedFirstAtoms,
      layer.hasAnyTypeId,
    );

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

    fitCameraToAtomsCentered(mappedFirstAtoms);
    applyModelRotation();
    applyBackgroundColor();
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    invalidate();

    return { frameCount, hasAnimation };
  }

  function replaceActiveLayerModel(model: StructureModel): {
    frameCount: number;
    hasAnimation: boolean;
  } {
    const active = getActiveLayer();
    if (!active) {
      return renderModel(model);
    }

    active.model = model;

    active.info.name = safeLayerName(model.source?.filename);
    active.info.atomCount = model.atoms.length;
    active.info.frameCount = model.frames?.length ? model.frames.length : 1;
    active.info.sourceFormat = model.source?.format;
    active.info.sourceFileName = model.source?.filename;

    active.frameIndex = 0;

    const firstAtoms = model.frames?.[0] ?? model.atoms;
    const typeInfo = collectTypeIdsAndElementDefaultsFromAtoms(firstAtoms);
    active.hasAnyTypeId = typeInfo.typeIds.length > 0;

    if (active.hasAnyTypeId) {
      const baseRows = (
        active.typeMapRows && active.typeMapRows.length > 0
          ? active.typeMapRows
          : getSettings().lammpsTypeMap ?? []
      ) as any;
      const detected = expandTypeIdsContiguous(typeInfo.typeIds);
      active.typeMapRows
        = (mergeTypeMap(baseRows, detected, typeInfo.defaults) as any) ?? [];
    }
    else {
      active.typeMapRows = [];
    }

    active.currentFrameAtoms = firstAtoms;
    active.currentMappedAtoms = null;
    active.mappedFrameIndex = -1;

    const mappedFirstAtoms = mapAtomsByTypeMap(active, firstAtoms);
    active.currentMappedAtoms = mappedFirstAtoms;
    active.mappedFrameIndex = 0;

    // Keep (and sync) per-layer color mapping; preserve previous colors when possible.
    active.colorMapRows = syncColorMapRowsFromAtoms(
      active.colorMapRows,
      mappedFirstAtoms,
      active.hasAnyTypeId,
    );

    rebuildVisualsForLayer(active, mappedFirstAtoms);

    // keep visible
    active.info.visible = true;
    active.group.visible = true;

    upsertLayerInternal(active);
    syncActiveTypeMap();
    syncActiveColorMap();
    syncActiveColorMap();

    fitCameraToAtomsCentered(mappedFirstAtoms);
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    invalidate();

    return {
      frameCount: active.info.frameCount,
      hasAnimation: active.info.frameCount > 1,
    };
  }

  function clearModel(): void {
    for (const l of layerMap.values()) {
      disposeLayer(l);
    }
    layerMap.clear();

    layers.value = [];
    activeLayerId.value = null;
    activeTypeMapRows.value = [];
    activeColorMapRows.value = [];

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

  function getActiveAtoms(): Atom[] | null {
    const active = getActiveLayer();
    if (!active) return null;

    const frames = active.model.frames;
    const frameAtoms = (frames && frames.length > 0)
      ? (frames[Math.min(Math.max(0, active.frameIndex), frames.length - 1)] ?? null)
      : active.model.atoms;
    if (!frameAtoms) return null;

    // Keep the runtime's "current frame" pointers consistent even if callers
    // query atoms without going through applyFrameByIndex.
    if (active.currentFrameAtoms !== frameAtoms || active.mappedFrameIndex !== active.frameIndex) {
      active.currentFrameAtoms = frameAtoms;
      active.currentMappedAtoms = null;
      active.mappedFrameIndex = -1;
    }

    return getMappedAtomsForCurrentFrame(active);
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

    applyFrameAtomsToMeshes({
      frameAtoms,
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

    if (getSettings().showAxes) updateAxesForAtoms(frameAtoms);

    invalidate();
  }

  function applyAtomScale(): void {
    for (const l of layerMap.values()) {
      applyAtomScaleToMeshes(
        l.atomMeshes,
        getSettings().atomScale,
        getSphereSegments(),
      );
    }

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }
  function rebuildBondsForLayer(layer: LayerInternal, atoms: Atom[]): void {
    // Rebuild (and re-center) bond meshes to match the current frame.
    // This is intentionally separated from applyShowBonds so playback can
    // refresh bonds conditionally without toggling visibility.

    if (!getSettings().showBonds) return;

    if (layer.bondMeshes.length > 0) {
      removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
      layer.bondMeshes = [];
      layer.lastBondSegCount = 0;
    }

    const c = computeMeanCenterInto(atoms, centerTmp2);
    const centeredAtoms = makeCenteredAtomsView(atoms, c);

    const preferTypeId = !!layer.hasAnyTypeId;
    const getColorKey = (a: Atom) =>
      preferTypeId
        ? getAtomTypeColorKey(a.element, a.typeId)
        : getAtomTypeColorKey(a.element);
    const colorMap = buildColorMapRecord(layer.colorMapRows);

    const bf = getBondFactor();
    const res = buildBondMeshesBicolor({
      atoms: centeredAtoms,
      bondFactor: bf,
      atomSizeFactor,
      bondRadius,
      getColorKey,
      colorMap,
    });

    layer.bondMeshes = res.meshes;
    layer.lastBondSegCount = res.segCount;
    layer.bondFactorUsed = bf;
    for (const b of layer.bondMeshes) layer.group.add(b);
  }

  function applyShowBonds(): void {
    const enabled = getSettings().showBonds;
    const bf = getBondFactor();

    for (const l of layerMap.values()) {
      if (enabled) {
        const needRebuild
          = l.bondMeshes.length === 0
            || !Number.isFinite(l.bondFactorUsed)
            || Math.abs(l.bondFactorUsed - bf) > 1e-6;
        if (!needRebuild) continue;

        if (l.bondMeshes.length > 0) {
          removeAndDisposeInstancedMeshes(l.group, l.bondMeshes);
          l.bondMeshes = [];
          l.lastBondSegCount = 0;
        }

        const atoms = (l.model.frames?.[l.frameIndex]
          ?? l.model.atoms) as Atom[];
        const mapped = mapAtomsByTypeMap(l, atoms);
        const c = computeMeanCenterInto(mapped, centerTmp);
        const centeredAtoms = makeCenteredAtomsView(mapped, c);

        const preferTypeId = !!l.hasAnyTypeId;
        const getColorKey = (a: Atom) =>
          preferTypeId
            ? getAtomTypeColorKey(a.element, a.typeId)
            : getAtomTypeColorKey(a.element);
        const colorMap = buildColorMapRecord(l.colorMapRows);

        const res = buildBondMeshesBicolor({
          atoms: centeredAtoms,
          bondFactor: bf,
          atomSizeFactor,
          bondRadius,
          getColorKey,
          colorMap,
        });
        l.bondMeshes = res.meshes;
        l.lastBondSegCount = res.segCount;
        l.bondFactorUsed = bf;
        for (const b of l.bondMeshes) l.group.add(b);
      }
      else {
        if (l.bondMeshes.length === 0) continue;
        removeAndDisposeInstancedMeshes(l.group, l.bondMeshes);
        l.bondMeshes = [];
        l.lastBondSegCount = 0;
        l.bondFactorUsed = NaN;
      }
    }

    invalidate();
  }

  function applyShowAxes(): void {
    stage.axesGroup.visible = getSettings().showAxes;
    if (!getSettings().showAxes) {
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
    updateAxesForAtoms(atoms);
    invalidate();
  }

  function applyModelRotation(): void {
    const r = getSettings().rotationDeg;
    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z),
    );
    invalidate();
  }

  function applyBackgroundColor(): void {
    const col = new THREE.Color(getSettings().backgroundColor);
    const alpha = getSettings().backgroundTransparent ? 0 : 1;
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

    // Type mapping can change element labels. Keep color rows in sync while preserving colors.
    active.colorMapRows = syncColorMapRowsFromAtoms(
      active.colorMapRows,
      mapped,
      active.hasAnyTypeId,
    );
    activeColorMapRows.value = (active.colorMapRows ?? []) as any;

    // atom mesh colors depend on element => must rebuild
    rebuildVisualsForLayer(active, mapped);

    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
    invalidate();
  }

  function setActiveLayerTypeMapRows(rows: LammpsTypeMapItem[]): void {
    const active = getActiveLayer();
    if (!active) return;
    active.typeMapRows = (rows ?? []) as any;
    activeTypeMapRows.value = (active.typeMapRows ?? []) as any;
  }

  function setActiveLayerColorMapRows(rows: AtomTypeColorMapItem[]): void {
    const active = getActiveLayer();
    if (!active) return;
    active.colorMapRows = (rows ?? []) as any;
    activeColorMapRows.value = (active.colorMapRows ?? []) as any;
  }

  function setMeshColor(mesh: THREE.InstancedMesh, color: string): void {
    const matAny = mesh.material as any;
    if (Array.isArray(matAny)) {
      for (const m of matAny) {
        if (m?.color) m.color.set(color);
        if (m) m.needsUpdate = true;
      }
      return;
    }
    if (matAny?.color) matAny.color.set(color);
    if (matAny) matAny.needsUpdate = true;
  }

  function onColorMapChanged(): void {
    const active = getActiveLayer();
    if (!active) return;

    const map = buildColorMapRecord(active.colorMapRows);

    // Atoms
    for (const m of active.atomMeshes) {
      const key = (m.userData as any).colorKey as string | undefined;
      const el = (m.userData as any).element as string | undefined;
      const col = (key && map[key]) ? map[key]! : getElementColorHex(el ?? 'E');
      setMeshColor(m, col);
    }

    // Bonds
    for (const b of active.bondMeshes) {
      const key = (b.userData as any).colorKey as string | undefined;
      // bond segment groups are still "by element" for default, but may be keyed by typeId
      // If key is not found, we fall back to parsing element from the key prefix is non-trivial,
      // so we instead use the stored element when available, else 'E'.
      const el = (b.userData as any).element as string | undefined;
      const fallbackEl = el ?? 'E';
      const col = (key && map[key]) ? map[key]! : getElementColorHex(fallbackEl);
      setMeshColor(b, col);
    }

    invalidate();
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
    activeTypeMapRows,
    activeColorMapRows,

    renderModel,
    replaceActiveLayerModel,

    clearModel,

    getFrameCount,
    getFrameIndex,
    applyFrameByIndex,
    getActiveAtoms,

    applyAtomScale,
    applyShowBonds,
    applyShowAxes,
    applyModelRotation,
    applyBackgroundColor,
    tickCameraClipping,

    hasAnyTypeId,
    onTypeMapChanged,
    onColorMapChanged,
    setActiveLayerTypeMapRows,
    setActiveLayerColorMapRows,
    removeLayer,

    setActiveLayer,
    setLayerVisible,

    getActiveAtomMeshes,
    getVisibleAtomMeshes,
  };
}
