// src/components/ViewerStage/modelRuntime.ts
import * as THREE from "three";
import { ref, type Ref } from "vue";

import type { ViewerSettings } from "../../lib/viewer/settings";
import type { Atom, StructureModel } from "../../lib/structure/types";

import type { ThreeStage } from "../../lib/three/stage";
import { makeTextLabel } from "../../lib/three/labels2d";
import { removeAndDisposeInstancedMeshes } from "../../lib/three/dispose";
import {
  applyAtomScaleToMeshes,
  buildAtomMeshesByElement,
  getSphereBaseRadiusByElement,
} from "../../lib/three/instancedAtoms";
import { buildBondMeshesBicolor } from "../../lib/three/instancedBonds";
import { isPerspective, fitCameraToAtoms as fitCameraToAtomsImpl } from "../../lib/three/camera";

import { applyFrameAtomsToMeshes, computeMeanCenterInto } from "./animation";
import { collectTypeIdsAndElementDefaultsFromAtoms, remapAtomsByTypeId } from "./typeMap";

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

  // animation
  frameIndex: number;

  // LAMMPS
  hasAnyTypeId: boolean;

  // tmp
  baseCenter: THREE.Vector3; // keep at (0,0,0) so applyFrameAtomsToMeshes == shift by current mean
};

function makeLayerId(): string {
  // short, stable enough for UI
  return `layer_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

function safeLayerName(fileName?: string): string {
  const n = (fileName ?? "").trim();
  if (!n) return "model";
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
      if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
      else mat?.dispose?.();
    }
  }
}

function computeCenteredBox(atoms: Atom[], tmpCenter: THREE.Vector3): {
  center: THREE.Vector3;
  box: THREE.Box3;
  maxSphereRadius: number;
} {
  const c = computeMeanCenterInto(atoms, tmpCenter);

  const box = new THREE.Box3();
  let maxSphere = 0;
  for (const a of atoms) {
    const x = a.position[0] - c.x;
    const y = a.position[1] - c.y;
    const z = a.position[2] - c.z;
    box.expandByPoint(new THREE.Vector3(x, y, z));
    maxSphere = Math.max(maxSphere, getSphereBaseRadiusByElement(a.element, 0.5));
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

  renderModel: (model: StructureModel) => { frameCount: number; hasAnimation: boolean };
  replaceActiveLayerModel: (model: StructureModel) => { frameCount: number; hasAnimation: boolean };

  clearModel: () => void;

  getFrameCount: () => number;
  getFrameIndex: () => number;
  applyFrameByIndex: (idx: number) => void;
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
  const { stage, settingsRef, hasModel, atomSizeFactor, bondFactor, bondRadius } = args;

  const layers = ref<ModelLayerInfo[]>([]);
  const activeLayerId = ref<string | null>(null);

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
    const rows = (settings.lammpsTypeMap ?? []) as any;
    const hasRows = Array.isArray(rows) && rows.length > 0;

    for (const l of layerMap.values()) {
      if (!l.info.visible) continue;

      const atoms0 = (l.model.frames?.[l.frameIndex] ?? l.model.atoms) as Atom[];
      const atoms = l.hasAnyTypeId && hasRows ? remapAtomsByTypeId(atoms0, rows) : atoms0;

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

        const r = getSphereBaseRadiusByElement(a.element, atomSizeFactor) * atomScale;
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
    if (!force && Math.abs(dist - lastClipDist) < 1e-6 && Math.abs(visibleClipRadius - lastClipRadius) < 1e-6) {
      return;
    }

    const clipPaddingMul = 4;
    const nearBySphere = dist - visibleClipRadius * clipPaddingMul;
    const farBySphere = dist + visibleClipRadius * clipPaddingMul;
    const nearAdaptive = dist * 0.02;

    const newNear = Math.max(0.01, nearBySphere, nearAdaptive);
    const newFar = Math.max(newNear + 1e-3, farBySphere);

    // Avoid needless projection updates.
    if (!force && Math.abs(newNear - camera.near) < 1e-6 && Math.abs(newFar - camera.far) < 1e-3) {
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
  const axesHelper = new THREE.AxesHelper(1);
  axesHelper.visible = false;
  stage.axesGroup.add(axesHelper);

  const xLabel = makeTextLabel("X", "#ff4444", 14);
  const yLabel = makeTextLabel("Y", "#44ff44", 14);
  const zLabel = makeTextLabel("Z", "#4488ff", 14);
  stage.axesGroup.add(xLabel, yLabel, zLabel);

  function getSettings(): ViewerSettings {
    return settingsRef.value;
  }

  function syncHasModelFlag(): void {
    hasModel.value = layers.value.length > 0;
  }

  function getActiveLayer(): LayerInternal | null {
    const id = activeLayerId.value;
    if (!id) return null;
    return layerMap.get(id) ?? null;
  }

  function disposeLayer(layer: LayerInternal): void {
    removeAndDisposeInstancedMeshes(layer.group, layer.atomMeshes);
    removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
    layer.atomMeshes = [];
    layer.bondMeshes = [];
    layer.lastBondSegCount = 0;

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
    axesHelper.scale.set(axisLen, axisLen, axisLen);

    xLabel.visible = true;
    yLabel.visible = true;
    zLabel.visible = true;

    xLabel.position.set(axisLen, 0, 0);
    yLabel.position.set(0, axisLen, 0);
    zLabel.position.set(0, 0, axisLen);

    // keep labels facing camera
    xLabel.layers.set(2);
    yLabel.layers.set(2);
    zLabel.layers.set(2);
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
      getSphereRadiusByElement: (el) => getSphereBaseRadiusByElement(el, atomSizeFactor) * getSettings().atomScale,
      orthoHalfHeight: stage.getOrthoHalfHeight(),
      margin: 1.25,
    });

    if (!isPerspective(camera)) {
      stage.setOrthoHalfHeight(orthoHalf);
    }
  }

  function rebuildVisualsForLayer(layer: LayerInternal, atomsForVisuals: Atom[]): void {
    // clear old
    removeAndDisposeInstancedMeshes(layer.group, layer.atomMeshes);
    removeAndDisposeInstancedMeshes(layer.group, layer.bondMeshes);
    layer.atomMeshes = [];
    layer.bondMeshes = [];
    layer.lastBondSegCount = 0;

    // atoms
    layer.atomMeshes = buildAtomMeshesByElement({
      atoms: atomsForVisuals,
      atomSizeFactor,
      atomScale: getSettings().atomScale,
      sphereSegments: 16,
    });
    for (const m of layer.atomMeshes) {
      (m.userData as any).layerId = layer.info.id;
    }
    for (const m of layer.atomMeshes) layer.group.add(m);

    // bonds (optional)
    if (getSettings().showBonds) {
      const c = computeMeanCenterInto(atomsForVisuals, centerTmp);
      const centeredAtoms = makeCenteredAtomsView(atomsForVisuals, c);

      const res = buildBondMeshesBicolor({
        atoms: centeredAtoms,
        bondFactor,
        atomSizeFactor,
        bondRadius,
      });
      layer.bondMeshes = res.meshes;
      layer.lastBondSegCount = res.segCount;
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
      const next = layers.value.find((x) => x.visible && x.id !== id) ?? null;
      activeLayerId.value = next?.id ?? null;
      applyShowAxes();
    }

    // Update camera clip planes based on all visible layers
    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    layers.value = [...layers.value];
    syncHasModelFlag();
  }

  function upsertLayerInternal(layer: LayerInternal): void {
    layerMap.set(layer.info.id, layer);

    const exists = layers.value.some((x) => x.id === layer.info.id);
    if (!exists) layers.value = [...layers.value, layer.info];
    else layers.value = layers.value.map((x) => (x.id === layer.info.id ? layer.info : x));

    syncHasModelFlag();
  }

  function renderModel(model: StructureModel): { frameCount: number; hasAnimation: boolean } {
    // New model load: hide previous layers by default (layer-like behavior)
    hideAllLayers();

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
      frameIndex: 0,
      hasAnyTypeId: false,
      baseCenter: new THREE.Vector3(0, 0, 0),
    };

    // detect LAMMPS typeId
    const typeInfo = collectTypeIdsAndElementDefaultsFromAtoms(firstAtoms);
    layer.hasAnyTypeId = typeInfo.typeIds.length > 0;

    // Apply current type mapping (if any)
    const mappedFirstAtoms = remapAtomsByTypeId(firstAtoms, (getSettings().lammpsTypeMap ?? []) as any);

    // Store a model whose frame[0] uses mapped atoms for rendering (keep raw for reparse logic elsewhere)
    // We do not mutate the original model; we only render with mapped atoms.
    rebuildVisualsForLayer(layer, mappedFirstAtoms);

    // Show it
    layer.info.visible = true;
    group.visible = true;

    upsertLayerInternal(layer);
    activeLayerId.value = id;

    fitCameraToAtomsCentered(mappedFirstAtoms);
    applyModelRotation();
    applyBackgroundColor();
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    return { frameCount, hasAnimation };
  }

  function replaceActiveLayerModel(model: StructureModel): { frameCount: number; hasAnimation: boolean } {
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

    const mappedFirstAtoms = remapAtomsByTypeId(firstAtoms, (getSettings().lammpsTypeMap ?? []) as any);

    rebuildVisualsForLayer(active, mappedFirstAtoms);

    // keep visible
    active.info.visible = true;
    active.group.visible = true;

    upsertLayerInternal(active);

    fitCameraToAtomsCentered(mappedFirstAtoms);
    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);

    return { frameCount: active.info.frameCount, hasAnimation: active.info.frameCount > 1 };
  }

  function clearModel(): void {
    for (const l of layerMap.values()) {
      disposeLayer(l);
    }
    layerMap.clear();

    layers.value = [];
    activeLayerId.value = null;

    // axes cleanup
    axesHelper.visible = false;
    xLabel.visible = false;
    yLabel.visible = false;
    zLabel.visible = false;

    visibleClipRadius = 0;
    lastClipDist = -1;
    lastClipRadius = -1;

    syncHasModelFlag();
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
    if (frames && frames.length > 0) {
      const idx = Math.min(Math.max(0, active.frameIndex), frames.length - 1);
      return frames[idx] ?? null;
    }
    return active.model.atoms;
  }

  function applyFrameByIndex(idx: number): void {
    const active = getActiveLayer();
    if (!active) return;

    const frames = active.model.frames;
    if (!frames || frames.length <= 1) {
      active.frameIndex = 0;
      return;
    }

    const clamped = Math.min(Math.max(0, idx), frames.length - 1);
    active.frameIndex = clamped;

    // apply type mapping to the frame atoms before updating meshes
    const frameAtoms = frames[clamped] ?? active.model.atoms;
    const mapped = remapAtomsByTypeId(frameAtoms, (getSettings().lammpsTypeMap ?? []) as any);

    applyFrameAtomsToMeshes({
      frameAtoms: mapped,
      atomMeshes: active.atomMeshes,
      baseCenter: active.baseCenter,
      centerTmp: centerTmp,
      matTmp,
    });

    if (getSettings().showAxes) updateAxesForAtoms(mapped);
  }

  function applyAtomScale(): void {
    for (const l of layerMap.values()) {
      applyAtomScaleToMeshes(l.atomMeshes, getSettings().atomScale, 16);
    }

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
  }

  function applyShowBonds(): void {
    for (const l of layerMap.values()) {
      if (getSettings().showBonds) {
        if (l.bondMeshes.length > 0) continue;

        const atoms = (l.model.frames?.[l.frameIndex] ?? l.model.atoms) as Atom[];
        const mapped = remapAtomsByTypeId(atoms, (getSettings().lammpsTypeMap ?? []) as any);
        const c = computeMeanCenterInto(mapped, centerTmp);
        const centeredAtoms = makeCenteredAtomsView(mapped, c);

        const res = buildBondMeshesBicolor({
          atoms: centeredAtoms,
          bondFactor,
          atomSizeFactor,
          bondRadius,
        });
        l.bondMeshes = res.meshes;
        l.lastBondSegCount = res.segCount;
        for (const b of l.bondMeshes) l.group.add(b);
      } else {
        if (l.bondMeshes.length === 0) continue;
        removeAndDisposeInstancedMeshes(l.group, l.bondMeshes);
        l.bondMeshes = [];
        l.lastBondSegCount = 0;
      }
    }
  }

  function applyShowAxes(): void {
    stage.axesGroup.visible = getSettings().showAxes;
    if (!getSettings().showAxes) {
      axesHelper.visible = false;
      xLabel.visible = false;
      yLabel.visible = false;
      zLabel.visible = false;
      return;
    }

    const active = getActiveLayer();
    if (!active) return;

    const atoms = (active.model.frames?.[active.frameIndex] ?? active.model.atoms) as Atom[];
    const mapped = remapAtomsByTypeId(atoms, (getSettings().lammpsTypeMap ?? []) as any);
    updateAxesForAtoms(mapped);
  }

  function applyModelRotation(): void {
    const r = getSettings().rotationDeg;
    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z)
    );
  }

  function applyBackgroundColor(): void {
    const col = new THREE.Color(getSettings().backgroundColor);
    const alpha = getSettings().backgroundTransparent ? 0 : 1;
    stage.renderer.setClearColor(col, alpha);
  }

  function hasAnyTypeId(): boolean {
    // Any layer having typeId means type-map changes should trigger a rebuild.
    for (const l of layerMap.values()) {
      if (l.hasAnyTypeId) return true;
    }
    return false;
  }

  function onTypeMapChanged(): void {
    // Strategy: rebuild visuals for all layers that have typeId (to update colors/labels)
    for (const l of layerMap.values()) {
      if (!l.hasAnyTypeId) continue;

      const atoms = (l.model.frames?.[l.frameIndex] ?? l.model.atoms) as Atom[];
      const mapped = remapAtomsByTypeId(atoms, (getSettings().lammpsTypeMap ?? []) as any);

      // atoms mesh colors depend on element => must rebuild
      rebuildVisualsForLayer(l, mapped);
    }

    applyShowAxes();

    recomputeVisibleClipRadius();
    tickCameraClipping(true);
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

    setActiveLayer,
    setLayerVisible,

    getActiveAtomMeshes,
    getVisibleAtomMeshes,
  };
}
