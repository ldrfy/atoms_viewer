// src/components/ViewerStage/useViewerStage.ts
import { onBeforeUnmount, onMounted, ref, reactive, computed } from "vue";
import type { Ref } from "vue";
import * as THREE from "three";

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  OpenSettingsPayload,
} from "../../lib/viewer/settings";
import { hasUnknownElementMappingForTypeIds } from "../../lib/viewer/settings";
import { normalizeViewPresets } from "../../lib/viewer/viewPresets";
import type { StructureModel } from "../../lib/structure/types";

import { message } from "ant-design-vue";
import { useI18n } from "vue-i18n";
import { parseStructure, toForcedFilename } from "../../lib/structure/parse";
import type { ParseMode, ParseInfo } from "../../lib/structure/parse";
import {
  buildLammpsTypeToElementMap,
  collectTypeIdsAndElementDefaultsFromAtoms,
  mergeTypeMap,
  normalizeTypeMapRows,
  typeMapEquals,
} from "./typeMap";
type RenderReason = "load" | "reparse";

import { cropCanvasToPngBlob, downloadBlob } from "../../lib/image/cropPng";
import {
  isPerspective,
  updateCameraForSize,
  type AnyCamera,
} from "../../lib/three/camera";
import { createThreeStage, type ThreeStage } from "../../lib/three/stage";

import { bindViewerStageSettings } from "./bindSettings";
import {
  createModelRuntime,
  type ModelRuntime,
  type ModelLayerInfo,
} from "./modelRuntime";
import { isLammpsDumpFormat } from "../../lib/structure/parsers/lammpsDump";
import { isLammpsDataFormat } from "../../lib/structure/parsers/lammpsData";
import { applyAnimationInfo } from "./animation";
import type { Atom } from "../../lib/structure/types";
import { ATOMIC_SYMBOLS } from "../../lib/structure/chem";

import {
  createInspectCtx,
  computeDistance,
  computeAngleDeg,
  atomicNumberFromSymbol,
  type SelectedAtom,
  type InspectCtx,
} from "./ctx/inspect";

import { createRecordingController, type RecordingBindings } from "./recording";
import { useFileDrop } from "./useFileDrop";

import {
  createRecordSelectCtx,
  createCropDashCtx,
  createParseCtx,
  createAnimCtx,
  type RecordSelectCtx,
  type CropDashCtx,
  type ParseCtx,
  type AnimCtx,
} from "./ctx";

/**
 * ViewerStage 对外 bindings。
 *
 * Public bindings exposed by ViewerStage composable.
 */
type ViewerStageBindings = {
  canvasHostRef: ReturnType<typeof ref<HTMLDivElement | null>>;
  fileInputRef: ReturnType<typeof ref<HTMLInputElement | null>>;
  isDragging: ReturnType<typeof ref<boolean>>;
  hasModel: ReturnType<typeof ref<boolean>>;
  isLoading: ReturnType<typeof ref<boolean>>;

  // layers
  layers: Ref<ModelLayerInfo[]>;
  activeLayerId: Ref<string | null>;
  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;

  // atom inspect
  inspectCtx: InspectCtx;

  openFilePicker: () => void;
  onDragEnter: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => Promise<void>;
  onFilePicked: (e: Event) => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  loadFiles: (iles: File[], source: "drop" | "picker" | "api") => Promise<void>;
  loadUrl: (url: string, fileName: string) => Promise<void>;
  onExportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => Promise<void>;

  // LAMMPS typeId -> element mapping
  refreshTypeMap: () => void;

  // animation
  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx: number) => void;
  togglePlay: () => void;

  // parse info / reparse
  parseInfo: ParseInfo;
  parseMode: Ref<ParseMode>;
  setParseMode: (mode: ParseMode) => void;

  // ctx groups for parts components
  recordSelectCtx: RecordSelectCtx;
  parseCtx: ParseCtx;
  animCtx: AnimCtx;
  cropDashCtx: CropDashCtx;
} & RecordingBindings;

/**
 * ViewerStage 主 composable：
 * - 初始化 three 舞台（renderer/scene/camera/controls）
 * - 初始化模型运行时（构建 instanced meshes、动画帧）
 * - 处理文件拖拽/选择、导出 PNG
 *
 * Main composable for ViewerStage:
 * - Initialize Three.js stage (renderer/scene/camera/controls)
 * - Initialize model runtime (instanced meshes & animation frames)
 * - Handle file drag/drop, picking, and PNG export
 */
export function useViewerStage(
  settingsRef: Readonly<Ref<ViewerSettings>>,
  patchSettings?: (patch: Partial<ViewerSettings>) => void,
  requestOpenSettings?: (payload?: OpenSettingsPayload) => void
): ViewerStageBindings {
  const canvasHostRef = ref<HTMLDivElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  // Extract file drag/drop logic into a standalone composable.
  // This keeps useViewerStage.ts smaller and easier to maintain.
  const fileDrop = useFileDrop({ loadFiles });

  // --- layers & runtime binding ---
  const runtimeTick = ref(0);

  const layers = computed<ModelLayerInfo[]>(() => {
    // dependency to refresh when runtime is (re)created
    runtimeTick.value;
    return runtime?.layers.value ?? [];
  });

  const activeLayerId = computed<string | null>(() => {
    runtimeTick.value;
    return runtime?.activeLayerId.value ?? null;
  });

  // --- atom inspect (picking + measurement) ---
  const inspectCtx = createInspectCtx();
  const hasModel = ref(false);
  const isLoading = ref(false);

  // animation
  const hasAnimation = ref(false);
  const frameIndex = ref(0);
  const frameCount = ref(1);
  const isPlaying = ref(false);
  const fps = ref(6);

  let animLastMs = 0;
  let animAccMs = 0;

  // ------- 与 OpenMX Viewer.html 一致的默认系数 -------
  // Default factors aligned with OpenMX Viewer.html
  const ATOM_SIZE_FACTOR = 0.5;
  const BOND_FACTOR = 1.05;
  const BOND_THICKNESS_FACTOR = 1.0;
  const BOND_RADIUS = 0.09 * BOND_THICKNESS_FACTOR;

  const { t } = useI18n();

  let stage: ThreeStage | null = null;
  let runtime: ModelRuntime | null = null;
  let stopBind: (() => void) | null = null;

  // When a LAMMPS-like model is loaded and the type->element mapping is missing/incomplete,
  // we want to force Settings to focus the LAMMPS panel even if a later "open settings"
  // call happens in the same tick (e.g., multi-file batch load).
  let lastLoadNeedsLammpsFocus = false;

  // picking helpers
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerDown: { x: number; y: number; tMs: number } | null = null;
  // model rotation via drag (left button)
  let rotateLast: { x: number; y: number } | null = null;
  // Active pointer tracking for drag-rotate (needed for pointer capture + touch).
  let rotatePointerId: number | null = null;
  let rotatePointerType: string | null = null;
  // During drag-rotation, keep a local rotation state for smooth interaction.
  let dragRotationDeg: { x: number; y: number; z: number } | null = null;
  // Throttle syncing rotation back to settings to avoid heavy UI updates during drag.
  let rotSyncTimer = 0;
  let lastRotSyncMs = 0;

  // sync dual-view distance back to settings when user zooms with mouse wheel
  let distSyncRaf = 0;
  let lastSyncedDist = NaN;
  let removeControlsSync: (() => void) | null = null;
  let removePickListeners: (() => void) | null = null;

  // selection visuals (created after stage init)
  let selectionGroup: THREE.Group | null = null;
  let markerMeshes: THREE.Mesh[] = [];
  let line12: THREE.Line | null = null;
  let line23: THREE.Line | null = null;

  // ✅ recording: moved out to recording.ts
  const recording = createRecordingController({
    getStage: () => stage,
    patchSettings,
    t,
    getRecordFps: () => settingsRef.value.frame_rate ?? 60,
  });

  const parseMode = ref<ParseMode>("auto");

  /**
   * 左上角显示用：解析结果摘要
   *
   * Parse summary for top-left overlay.
   */
  const parseInfo = reactive<ParseInfo>({
    fileName: "",
    format: "",
    atomCount: 0,
    frameCount: 1,
    success: true,
    errorMsg: "",
    errorSeq: 0,
  });

  /**
   * 缓存最近一次载入文件的源文本，供“手动选择格式后重新解析”
   *
   * Cache last loaded raw text for manual re-parse.
   */
  let lastRawText: string | null = null;
  let lastRawFileName: string | null = null;

  const getSettings = (): ViewerSettings => settingsRef.value;

  function wrapDeg180(deg: number): number {
    // Normalize to (-180, 180]
    let x = ((((deg + 180) % 360) + 360) % 360) - 180;
    if (x === -180) x = 180;
    return x;
  }

  function openFilePicker(): void {
    fileInputRef.value?.click();
  }

  function syncUiFromRuntime(): void {
    if (!runtime) {
      frameCount.value = 1;
      frameIndex.value = 0;
      hasAnimation.value = false;
      stopPlay();
      return;
    }

    frameCount.value = runtime.getFrameCount();
    hasAnimation.value = frameCount.value > 1;
    frameIndex.value = runtime.getFrameIndex();

    if (!hasAnimation.value) stopPlay();

    // Keep parseInfo aligned to the active layer for Settings.
    const activeId = runtime.activeLayerId.value;
    const layer = runtime.layers.value.find((x) => x.id === activeId) ?? null;
    if (layer) {
      parseInfo.fileName = layer.sourceFileName ?? layer.name;
      parseInfo.format = layer.sourceFormat ?? parseInfo.format;
      parseInfo.atomCount = layer.atomCount;
      parseInfo.frameCount = layer.frameCount;
    }
  }

  function setActiveLayer(id: string): void {
    if (!runtime) return;
    runtime.setActiveLayer(id);
    syncUiFromRuntime();
    inspectCtx.clear();
    updateSelectionVisuals();
  }

  function setLayerVisible(id: string, visible: boolean): void {
    if (!runtime) return;
    runtime.setLayerVisible(id, visible);
    syncUiFromRuntime();

    // If the active layer changes due to hiding, clear selection to avoid mismatch.
    inspectCtx.clear();
    updateSelectionVisuals();
  }

  /**
   * 下一帧：用于让 UI 先刷新（避免加载时卡顿感）。
   *
   * Next animation frame: lets UI flush before heavy work.
   */
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
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

  /**
   * 推进动画（按 fps 推进 frameIndex），仅在渲染循环中调用。
   *
   * Advance animation (by fps), called only from render loop.
   */
  function tickAnimation(): void {
    if (!isPlaying.value || !hasAnimation.value) return;
    if (!runtime) return;

    const now = performance.now();
    if (!animLastMs) animLastMs = now;

    const dt = now - animLastMs;
    animLastMs = now;

    const step = 1000 / Math.max(1, fps.value);
    animAccMs += dt;

    const n = runtime.getFrameCount();
    if (n <= 1) return;

    while (animAccMs >= step) {
      const next = frameIndex.value + 1;
      setFrame(next >= n ? 0 : next);
      animAccMs -= step;
    }
  }

  function setFrame(idx: number): void {
    if (!runtime) return;
    if (!hasAnimation.value) return;

    const n = runtime.getFrameCount();
    const clamped = Math.min(Math.max(0, idx), Math.max(0, n - 1));
    frameIndex.value = clamped;

    runtime.applyFrameByIndex(clamped);

    // Keep selection markers synced to instanced matrices when frames advance.
    if (inspectCtx.selected.value.length > 0) {
      updateSelectionVisuals();
    }
  }

  // ---- Atom picking & measurement ----
  let selectionVisuals: Array<{
    mesh: THREE.InstancedMesh;
    instanceId: number;
  }> = [];
  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();

  const originalClear = inspectCtx.clear;
  inspectCtx.clear = () => {
    originalClear();
    selectionVisuals = [];
    updateSelectionVisuals();
  };

  function updateSelectionMeasure(): void {
    const sel = inspectCtx.selected.value;
    const m: { distance12?: number; distance23?: number; angleDeg?: number } =
      {};

    if (sel.length >= 2 && sel[0]?.position && sel[1]?.position) {
      const a = { element: "E", position: sel[0]!.position } as Atom;
      const b = { element: "E", position: sel[1]!.position } as Atom;
      m.distance12 = computeDistance(a, b);
    }
    if (
      sel.length >= 3 &&
      sel[0]?.position &&
      sel[1]?.position &&
      sel[2]?.position
    ) {
      const b = { element: "E", position: sel[1]!.position } as Atom;
      const c = { element: "E", position: sel[2]!.position } as Atom;
      m.distance23 = computeDistance(b, c);
      const a = { element: "E", position: sel[0]!.position } as Atom;
      m.angleDeg = computeAngleDeg(a, b, c);
    }

    inspectCtx.measure.value = m;
  }

  function ensureSelectionVisuals(): void {
    if (!stage) return;
    if (selectionGroup) return;

    selectionGroup = new THREE.Group();
    selectionGroup.name = "atom-selection";
    stage.modelGroup.add(selectionGroup);

    // Use a unit sphere and scale it per selected atom so the highlight
    // always wraps the actual atom radius (elements have different radii).
    // Use a bright unlit material so it is clearly visible on mobile.
    const geo = new THREE.SphereGeometry(1, 18, 18);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd400),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    markerMeshes = Array.from({ length: 3 }).map(() => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 10;
      m.frustumCulled = false;
      return m;
    });
    for (const m of markerMeshes) selectionGroup.add(m);

    const makeLine = (): THREE.Line => {
      const g = new THREE.BufferGeometry();
      g.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const lm = new THREE.LineBasicMaterial({
        color: 0xffd400,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      const ln = new THREE.Line(g, lm);
      ln.visible = false;
      ln.renderOrder = 9;
      ln.frustumCulled = false;
      return ln;
    };
    line12 = makeLine();
    line23 = makeLine();
    selectionGroup.add(line12);
    selectionGroup.add(line23);
  }

  function updateSelectionVisuals(): void {
    if (!stage) return;
    ensureSelectionVisuals();
    if (!selectionGroup || markerMeshes.length === 0) return;

    // Keep transforms up-to-date so instance local positions can be mapped
    // into the modelGroup coordinate system.
    stage.modelGroup.updateMatrixWorld(true);

    const sel = inspectCtx.selected.value;
    for (const m of markerMeshes) m.visible = false;
    if (line12) line12.visible = false;
    if (line23) line23.visible = false;

    if (sel.length === 0 || selectionVisuals.length === 0) return;

    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < Math.min(3, sel.length); i += 1) {
      const v = selectionVisuals[i];
      if (!v) continue;

      // 1) instance local -> mesh local
      v.mesh.getMatrixAt(v.instanceId, tmpMat);
      tmpPos.setFromMatrixPosition(tmpMat);

      // 2) mesh local -> world
      v.mesh.updateMatrixWorld(true);
      v.mesh.localToWorld(tmpPos);

      // 3) world -> modelGroup local (selectionGroup lives under modelGroup)
      stage.modelGroup.worldToLocal(tmpPos);

      // Scale highlight halo by actual atom radius.
      const geoAny = v.mesh.geometry as any;
      const rParam = geoAny?.parameters?.radius as number | undefined;
      if (!v.mesh.geometry.boundingSphere)
        v.mesh.geometry.computeBoundingSphere();
      const rBound = v.mesh.geometry.boundingSphere?.radius;
      const r = Math.max(0.05, rParam ?? rBound ?? 0.3);
      const haloR = r * 1.25;
      markerMeshes[i]!.scale.setScalar(haloR);

      markerMeshes[i]!.position.copy(tmpPos);
      markerMeshes[i]!.visible = true;
      pts.push(tmpPos.clone());
    }

    if (pts.length >= 2 && line12) {
      (line12.geometry as THREE.BufferGeometry).setFromPoints([
        pts[0]!,
        pts[1]!,
      ]);
      line12.visible = true;
    }
    if (pts.length >= 3 && line23) {
      (line23.geometry as THREE.BufferGeometry).setFromPoints([
        pts[1]!,
        pts[2]!,
      ]);
      line23.visible = true;
    }
  }

  function addPickedAtom(params: {
    layerId: string;
    atomIndex: number;
    element: string;
    atom: Atom;
    mesh: THREE.InstancedMesh;
    instanceId: number;
    additive: boolean;
  }): void {
    const { layerId, atomIndex, element, atom, mesh, instanceId, additive } =
      params;

    const picked: SelectedAtom = {
      layerId,
      atomIndex,
      element,
      atomicNumber: atomicNumberFromSymbol(element, ATOMIC_SYMBOLS),
      id: atom.id,
      typeId: atom.typeId,
      position: [atom.position[0], atom.position[1], atom.position[2]],
    };

    // Different layer => switch active and reset selection (avoids cross-layer confusion)
    if (activeLayerId.value && activeLayerId.value !== layerId) {
      setActiveLayer(layerId);
    }

    const sel = [...inspectCtx.selected.value];
    const visuals = [...selectionVisuals];

    const existsIdx = sel.findIndex(
      (x) => x.layerId === layerId && x.atomIndex === atomIndex
    );
    if (existsIdx >= 0) {
      // toggle off in additive mode
      if (additive) {
        sel.splice(existsIdx, 1);
        visuals.splice(existsIdx, 1);
      } else {
        sel.splice(0, sel.length, picked);
        visuals.splice(0, visuals.length, { mesh, instanceId });
      }
    } else {
      if (!additive) {
        sel.splice(0, sel.length, picked);
        visuals.splice(0, visuals.length, { mesh, instanceId });
      } else {
        if (sel.length >= 3) {
          // keep the last two to preserve measurement order
          sel.splice(0, 1);
          visuals.splice(0, 1);
        }
        sel.push(picked);
        visuals.push({ mesh, instanceId });
      }
    }

    inspectCtx.selected.value = sel;
    selectionVisuals = visuals;
    updateSelectionMeasure();
    updateSelectionVisuals();
  }

  function handlePick(e: PointerEvent): void {
    if (!inspectCtx.enabled.value) return;
    if (!stage || !runtime) return;
    // Avoid conflict with record-area selection overlay
    const selecting =
      typeof recordSelectCtx.isSelectingRecordArea === "boolean"
        ? recordSelectCtx.isSelectingRecordArea
        : recordSelectCtx.isSelectingRecordArea.value;
    if (selecting) return;

    const canvas = stage.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const rawPresets = settingsRef.value.viewPresets;
    const presets =
      normalizeViewPresets(rawPresets).length > 0
        ? normalizeViewPresets(rawPresets)
        : settingsRef.value.dualViewEnabled
        ? (["front", "side"] as const)
        : ([] as const);

    const isDual = presets.length === 2;

    let pickCamera: AnyCamera = stage.getCamera();
    let viewportW = rect.width;
    let xPx = e.clientX - rect.left;
    if (isDual) {
      const rRaw = settingsRef.value.dualViewSplit;
      const r = typeof rRaw === "number" && Number.isFinite(rRaw) ? rRaw : 0.5;
      const leftW = Math.max(1, rect.width * Math.max(0.1, Math.min(0.9, r)));
      const rightW = Math.max(1, rect.width - leftW);
      if (xPx <= leftW) {
        viewportW = leftW;
      } else {
        const aux = stage.getAuxCamera();
        if (aux) pickCamera = aux;
        viewportW = rightW;
        xPx = xPx - leftW;
      }
    }

    const x = (xPx / Math.max(1, viewportW)) * 2 - 1;
    const y = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    ndc.set(x, y);

    raycaster.setFromCamera(ndc, pickCamera);

    const meshes = runtime.getVisibleAtomMeshes();
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) {
      inspectCtx.clear();
      return;
    }

    const mesh = hit.object as THREE.InstancedMesh;
    const instanceId = (hit as any).instanceId as number | undefined;
    if (instanceId == null) return;

    const indices = mesh.userData.atomIndices as number[] | undefined;
    if (!indices) return;

    const atomIndex = indices[instanceId];
    if (atomIndex == null) return;

    const layerId = (mesh.userData as any).layerId as string | undefined;
    if (!layerId) return;

    // Ensure active layer so getActiveAtoms() maps correctly.
    if (activeLayerId.value !== layerId) {
      setActiveLayer(layerId);
    }

    const atoms = runtime.getActiveAtoms();
    if (!atoms) return;
    const atom = atoms[atomIndex];
    if (!atom) return;

    const element =
      (mesh.userData.element as string | undefined) ?? atom.element ?? "E";

    const additive =
      inspectCtx.measureMode.value || e.shiftKey || e.ctrlKey || e.metaKey;
    addPickedAtom({
      layerId,
      atomIndex,
      element,
      atom,
      mesh,
      instanceId,
      additive,
    });
  }

  /**
   * 复位视角：保持 orbit target 不变，恢复从 +Z 方向观察。
   *
   * Reset view: keep orbit target, restore viewing direction from +Z.
   */
  function resetView(): void {
    if (!stage) return;
    const camera = stage.getCamera();
    const controls = stage.getControls();

    const target = controls.target.clone();
    const radius = Math.max(1e-6, camera.position.distanceTo(target));

    camera.up.set(0, 1, 0);
    camera.position.set(target.x, target.y, target.z + radius);

    camera.lookAt(target);
    controls.update();
    controls.saveState();
  }

  function preventWindowDropDefault(e: DragEvent): void {
    e.preventDefault();
  }

  /**
   * 针对 LAMMPS dump：自动补齐 typeId→element，并按需要打开/聚焦设置面板。
   *
   * For LAMMPS dump: auto-merge typeId→element mapping and focus Settings panels as needed.
   */
  function handleLammpsTypeMapAndSettings(model: StructureModel): void {
    const beforeRows = (
      (getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[]
    ).map((r) => ({ typeId: r.typeId, element: r.element }));

    const atoms0 =
      model.frames && model.frames[0] ? model.frames[0] : model.atoms;
    const { typeIds: detectedTypeIdsRaw, defaults } =
      collectTypeIdsAndElementDefaultsFromAtoms(atoms0);

    // UX: many users expect to see a contiguous mapping table (1..maxTypeId),
    // even if the current dump frame only contains a sparse subset.
    // To avoid pathological memory use, clamp the expansion.
    let detectedTypeIds = detectedTypeIdsRaw;
    if (detectedTypeIdsRaw.length > 0) {
      const maxId = detectedTypeIdsRaw[detectedTypeIdsRaw.length - 1] ?? 0;
      if (Number.isFinite(maxId) && maxId > 0 && maxId <= 2000) {
        detectedTypeIds = Array.from({ length: maxId }, (_, i) => i + 1);
      }
    }

    const mergedRows = mergeTypeMap(beforeRows, detectedTypeIds, defaults) as
      | LammpsTypeMapItem[]
      | undefined;

    const typeMapAdded = !typeMapEquals(
      normalizeTypeMapRows(beforeRows),
      normalizeTypeMapRows(mergedRows ?? [])
    );

    const hasUnknownForThisDump = hasUnknownElementMappingForTypeIds(
      mergedRows ?? [],
      detectedTypeIds
    );

    // Persist the last-load "needs focus" flag so later open-settings calls
    // (e.g., batch load) don't accidentally switch away from the LAMMPS panel.
    lastLoadNeedsLammpsFocus = typeMapAdded || hasUnknownForThisDump;

    if (patchSettings && typeMapAdded && mergedRows) {
      patchSettings({ lammpsTypeMap: mergedRows });
    }

    if (typeMapAdded || hasUnknownForThisDump) {
      requestOpenSettings?.({ focusKey: "lammps", open: true });
    } else {
      requestOpenSettings?.({ focusKey: "display", open: false });
    }

    if (hasUnknownForThisDump) {
      message.warning(t("viewer.lammps.mappingMissing"));
    }
  }

  /**
   * 非 LAMMPS 文件：不强制打开设置，但把默认展开面板切回 display。
   *
   * Non-LAMMPS file: do not force opening Settings, but reset focus to display.
   */
  function focusSettingsToDisplaySilently(): void {
    lastLoadNeedsLammpsFocus = false;
    requestOpenSettings?.({ focusKey: "display", open: false });
  }

  /**
   * 更新 parseInfo（左上角显示）
   *
   * Update parseInfo for the overlay.
   */
  function updateParseInfo(
    model: StructureModel,
    displayFileName: string
  ): void {
    parseInfo.fileName = displayFileName;
    parseInfo.format = model.source?.format ?? "unknown";
    parseInfo.atomCount = model.atoms.length;
    parseInfo.frameCount =
      model.frames && model.frames.length > 0 ? model.frames.length : 1;
  }

  /**
   * 从文本解析并渲染（公共逻辑），供 loadFile 与 setParseMode 复用。
   *
   * Parse + render pipeline shared by loadFile and setParseMode.
   */
  function renderFromText(
    text: string,
    fileName: string,
    reason: RenderReason,
    opts?: { hidePreviousLayers?: boolean }
  ): void {
    if (!stage || !runtime) return;

    // New model load should always reset atom selection to avoid stale UI state
    // (and to avoid cross-model type mismatches during HMR/dev workflows).
    if (reason === "load") {
      inspectCtx.clear();
    }

    // 1) parse
    const forcedName = toForcedFilename(fileName, parseMode.value);
    const model = parseStructure(text, forcedName, {
      lammpsTypeToElement: buildLammpsTypeToElementMap(
        (getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[]
      ),
      lammpsSortById: true,
    });

    // 2) render
    // - load: add a new layer and hide previous layers
    // - reparse: replace the currently active layer (avoid creating extra layers)
    const info =
      reason === "reparse"
        ? runtime.replaceActiveLayerModel(model)
        : runtime.renderModel(model, {
            hidePreviousLayers: opts?.hidePreviousLayers,
          });

    // 3) sync animation state
    applyAnimationInfo(info, frameIndex, frameCount, hasAnimation);

    // 4) update overlay parse info
    updateParseInfo(model, fileName);

    // 5) apply settings focus policy by format
    const fmt = model.source?.format ?? "";
    const atoms0 =
      model.frames && model.frames[0] ? model.frames[0] : model.atoms;
    const { typeIds: detectedTypeIds } =
      collectTypeIdsAndElementDefaultsFromAtoms(atoms0);
    const isLmp =
      isLammpsDumpFormat(fmt) ||
      isLammpsDataFormat(fmt) ||
      detectedTypeIds.length > 0;

    if (isLmp) {
      handleLammpsTypeMapAndSettings(model);
    } else {
      // Important: when switching back from LAMMPS to XYZ/PDB, focus display.
      focusSettingsToDisplaySilently();
    }

    // 6) optional toast for manual re-parse
    if (reason === "reparse") {
      message.success(
        t("viewer.parse.reparseSuccess", { format: parseInfo.format })
      );
    }
  }

  /**
   * 用户手动选择解析器后重新解析并渲染（不读文件，只用缓存文本）。
   *
   * Re-parse and re-render after user selects a parser (no file IO; use cached text).
   */
  function setParseMode(mode: ParseMode): void {
    if (parseMode.value === mode) return;

    parseMode.value = mode;

    if (!lastRawText || !lastRawFileName) return;
    if (!stage || !runtime) return;

    try {
      stopPlay();

      // New model load: clear any previous selections/markers to avoid stale overlays.
      inspectCtx.clear();
      renderFromText(lastRawText, lastRawFileName, "reparse");
    } catch (err) {
      message.error(
        t("viewer.parse.reparseFailed", { reason: (err as Error).message })
      );
    }
  }

  /**
   * Manually re-apply the current LAMMPS typeId -> element mapping.
   * Useful when the user edits the mapping and wants an explicit refresh.
   */
  function refreshTypeMap(): void {
    void (async () => {
      if (!stage || !runtime) return;
      if (!hasModel.value) return;
      if (!runtime.hasAnyTypeId()) return;

      // Mesh rebuild invalidates instance references; clear selection to be safe.
      inspectCtx.clear();

      // Show the loading spinner and yield frames so the UI has time to paint.
      // Also enforce a small minimum duration so the user can see the feedback.
      const tStart = performance.now();
      if (!isLoading.value) {
        isLoading.value = true;
        await nextFrame();
        await nextFrame();
      }

      try {
        runtime.onTypeMapChanged();
      } finally {
        const minMs = 250;
        const elapsed = performance.now() - tStart;
        if (elapsed < minMs) {
          await new Promise((r) =>
            window.setTimeout(r, Math.ceil(minMs - elapsed))
          );
        }
        isLoading.value = false;
      }
    })();
  }

  /**
   * 加载文件并渲染模型。
   *
   * Load a file and render the model.
   */
  async function loadFiles(
    files: File[],
    source: "drop" | "picker" | "api"
  ): Promise<void> {
    await loadFilesInternal(files, { openSettingsAfter: true, source });
  }

  async function loadFile(file: File): Promise<void> {
    await loadFilesInternal([file], {
      openSettingsAfter: false,
      source: "api",
    });
  }
  async function loadUrl(url: string, fileName: string): Promise<void> {
    if (isLoading.value) return;
    await loadInit();
    const t0 = performance.now();

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();

    await loadText(t0, text, fileName, {
      hidePreviousLayers: true,
      openSettingsAfter: false,
    });
  }

  async function loadInit() {
    if (!stage || !runtime) return;
    if (isLoading.value) return;

    isLoading.value = true;
    await nextFrame();
  }

  async function loadText(
    t0: number,
    text: string,
    fileName: string,
    opts?: { hidePreviousLayers?: boolean; openSettingsAfter?: boolean }
  ): Promise<void> {
    try {
      stopPlay();

      lastRawText = text;
      lastRawFileName = fileName;

      renderFromText(text, fileName, "load", {
        hidePreviousLayers: opts?.hidePreviousLayers,
      });

      // Default-load UX:
      // - Ensure there is always at least one preset selected.
      // - Keep the distance slider reflecting the fitted camera distance.
      syncViewPresetAndDistanceOnModelLoad();

      if (opts?.openSettingsAfter) {
        focusSettingsToLayersOrLammps();
      }

      message.success(`${((performance.now() - t0) / 1000).toFixed(2)} s`);
      parseInfo.success = true;
      parseInfo.errorMsg = "";
    } catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message;
      parseInfo.errorSeq += 1;
      console.log(err);
      message.error(`${t("viewer.parse.notice")}: ${parseInfo.errorMsg}`);
    }

    isLoading.value = false;
    hasModel.value = true;
    parseMode.value = "auto";
    parseInfo.fileName = fileName;
  }

  function focusSettingsToLayersOrLammps(): void {
    if (!requestOpenSettings) return;
    if (lastLoadNeedsLammpsFocus) {
      requestOpenSettings({ focusKey: "lammps", open: true });
      return;
    }
    // If there is any typeId mapping and it looks incomplete, focus LAMMPS.
    if (runtime?.hasAnyTypeId()) {
      const rows = normalizeTypeMapRows(
        ((getSettings().lammpsTypeMap ?? []) as any) ?? []
      );
      const activeAtoms = runtime?.getActiveAtoms?.() ?? null;
      if (activeAtoms) {
        const { typeIds } =
          collectTypeIdsAndElementDefaultsFromAtoms(activeAtoms);
        if (hasUnknownElementMappingForTypeIds(rows as any, typeIds)) {
          requestOpenSettings({ focusKey: "lammps", open: true });
          return;
        }
      }
      const hasPlaceholder = rows.some((r) => {
        const el = (r.element ?? "").toString().trim();
        return !el || el.toUpperCase() === "E";
      });
      if (hasPlaceholder) {
        requestOpenSettings({ focusKey: "lammps", open: true });
        return;
      }
    }
    requestOpenSettings({ focusKey: "layers", open: true });
  }

  async function loadFilesInternal(
    files: File[],
    opts: { openSettingsAfter: boolean; source: "drop" | "picker" | "api" }
  ): Promise<void> {
    if (!stage || !runtime) return;
    if (isLoading.value) return;

    await loadInit();
    const t0 = performance.now();

    try {
      stopPlay();

      // New load: clear selection/measurement overlays.
      inspectCtx.clear();

      let okCount = 0;
      let lastOkName = "";

      for (const f of files) {
        try {
          const text = await f.text();
          lastRawText = text;
          lastRawFileName = f.name;

          // First successful file hides previous layers; subsequent files keep all newly loaded layers visible.
          renderFromText(text, f.name, "load", {
            hidePreviousLayers: okCount === 0,
          });

          okCount += 1;
          lastOkName = f.name;
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          message.error(`${f.name}: ${msg}`);
        }
      }

      if (okCount > 0) {
        // Default-load UX:
        // - Ensure there is always at least one preset selected.
        // - Keep the distance slider reflecting the fitted camera distance.
        syncViewPresetAndDistanceOnModelLoad();

        message.success(
          `${okCount} file(s), ${((performance.now() - t0) / 1000).toFixed(
            2
          )} s`
        );

        parseInfo.success = true;
        parseInfo.errorMsg = "";
        hasModel.value = true;
        parseMode.value = "auto";
        parseInfo.fileName = lastOkName || lastRawFileName!;

        if (opts.openSettingsAfter) {
          focusSettingsToLayersOrLammps();
        }
      } else {
        parseInfo.success = false;
        parseInfo.errorMsg = t("viewer.parse.notice");
        parseInfo.errorSeq += 1;
        message.error(t("viewer.parse.notice"));
      }
    } catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message ?? String(err);
      parseInfo.errorSeq += 1;
      console.log(err);
      message.error(`${t("viewer.parse.notice")}: ${parseInfo.errorMsg}`);
    } finally {
      isLoading.value = false;
    }
  }

  function syncViewPresetAndDistanceOnModelLoad(): void {
    if (!stage) return;
    const canPatch = !!patchSettings;

    const cam = stage.getCamera();
    const controls = stage.getControls();
    const dist = cam.position.distanceTo(controls.target);

    // 1) ensure stage internal distance matches the fitted camera distance.
    // This prevents a "jump" when presets are (re)applied after fitting.
    stage.setDualViewDistance(dist);
    // Keep settings in sync so the slider shows the fitted distance.
    if (canPatch)
      patchSettings!({ dualViewDistance: dist, initialDualViewDistance: dist });

    // 2) determine the intended presets (persisted user choice or a sensible default).
    let presets = normalizeViewPresets(getSettings().viewPresets);
    if (presets.length === 0 && !!getSettings().dualViewEnabled) {
      presets = ["front", "side"];
    }

    if (presets.length === 0) {
      const w = stage.host.getBoundingClientRect().width;
      // On narrow screens (mobile), default to a single view.
      // On wider screens, default to dual view to show more context.
      presets = w >= 900 ? ["front", "side"] : ["front"];
      if (canPatch)
        patchSettings!({ viewPresets: presets, dualViewEnabled: false });
    }

    // 3) reapply presets after runtime fit so the view angle always matches the selected preset(s).
    stage.setViewPresets(presets);
  }

  // Drag/drop handlers are provided by useFileDrop().
  const {
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
  } = fileDrop;

  /**
   * 导出透明背景并裁剪的 PNG。
   *
   * Export a transparent, cropped PNG.
   */
  async function onExportPng(payload: {
    scale: number;
    transparent: boolean;
  }): Promise<void> {
    if (!stage) return;

    const { scale, transparent } = payload;

    // snapshot renderer state
    const prevColor = new THREE.Color();
    stage.renderer.getClearColor(prevColor);
    const prevAlpha = stage.renderer.getClearAlpha();
    const prevSize = new THREE.Vector2();
    stage.renderer.getSize(prevSize);
    const prevPixelRatio = stage.renderer.getPixelRatio();
    const prevAutoClear = stage.renderer.autoClear;

    try {
      // 1) export background
      stage.renderer.setClearColor(
        new THREE.Color(getSettings().backgroundColor),
        transparent ? 0 : 1
      );

      // 2) supersampled render size
      const rect = stage.host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const s = Math.max(1, scale);

      stage.renderer.setPixelRatio(1);
      stage.renderer.setSize(w * s, h * s, false);

      const settings = getSettings();
      const orthoHalfHeight = stage.getOrthoHalfHeight();

      const camera = stage.getCamera();
      const controls = stage.getControls();
      const target = controls.target;

      // 3) render
      const presets = (() => {
        const v = normalizeViewPresets(settings.viewPresets);
        if (v.length > 0) return v;
        // Backward-compat
        return settings.dualViewEnabled
          ? (["front", "side"] as const)
          : ([] as const);
      })();

      if (presets.length === 2) {
        const split = Math.max(
          0.1,
          Math.min(0.9, settings.dualViewSplit ?? 0.5)
        );
        const leftW = Math.floor(w * split);
        const rightW = Math.max(1, w - leftW);

        // Update projection for each logical viewport (not scaled)
        updateCameraForSize(camera, leftW, h, orthoHalfHeight);
        const sideCamera = camera.clone() as AnyCamera;
        updateCameraForSize(sideCamera, rightW, h, orthoHalfHeight);

        // Build 2nd camera pose from current main camera pose by applying a fixed preset offset.
        // This matches the on-screen dual-view behavior.
        const qFront = new THREE.Quaternion(); // identity
        const qSide = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI / 2
        );
        const qTop = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -Math.PI / 2
        );

        const presetQuat = (p: string): THREE.Quaternion => {
          if (p === "side") return qSide;
          if (p === "top") return qTop;
          return qFront;
        };

        const qL = presetQuat(presets[0]).clone();
        const qR = presetQuat(presets[1]).clone();
        const offset = qR.multiply(qL.invert());

        const viewVec = camera.position.clone().sub(target);
        viewVec.applyQuaternion(offset);
        sideCamera.position.copy(target.clone().add(viewVec));

        const up = camera.up.clone().applyQuaternion(offset);
        sideCamera.up.copy(up);
        sideCamera.lookAt(target);

        // Keep clipping planes consistent.
        sideCamera.near = camera.near;
        sideCamera.far = camera.far;
        if (!isPerspective(camera) && !isPerspective(sideCamera)) {
          (sideCamera as THREE.OrthographicCamera).zoom = (
            camera as THREE.OrthographicCamera
          ).zoom;
        }
        (sideCamera as any).updateProjectionMatrix?.();

        const fullW = Math.floor(w * s);
        const fullH = Math.floor(h * s);
        const leftPx = Math.floor(leftW * s);
        const rightPx = Math.max(1, fullW - leftPx);

        stage.renderer.autoClear = false;
        stage.renderer.setScissorTest(true);
        stage.renderer.setViewport(0, 0, fullW, fullH);
        stage.renderer.setScissor(0, 0, fullW, fullH);
        stage.renderer.clear(true, true, true);

        // Left view
        stage.renderer.setViewport(0, 0, leftPx, fullH);
        stage.renderer.setScissor(0, 0, leftPx, fullH);
        stage.renderer.render(stage.scene, camera);

        // Right view
        stage.renderer.setViewport(leftPx, 0, rightPx, fullH);
        stage.renderer.setScissor(leftPx, 0, rightPx, fullH);
        stage.renderer.render(stage.scene, sideCamera);

        stage.renderer.setScissorTest(false);
      } else {
        updateCameraForSize(camera, w, h, orthoHalfHeight);
        stage.renderer.render(stage.scene, camera);
      }

      // 4) crop & download
      const { blob } = await cropCanvasToPngBlob(stage.renderer.domElement, {
        alphaThreshold: 8,
        padding: 3,
      });
      downloadBlob(blob, "snapshot.png");

      message.success(t("viewer.export.pngSuccess"));
    } catch (e) {
      console.error("export png failed:", e);
      message.error(t("viewer.export.fail", { reason: (e as Error).message }));
    } finally {
      // restore renderer state
      stage.renderer.setClearColor(prevColor, prevAlpha);
      stage.renderer.setPixelRatio(prevPixelRatio);
      stage.renderer.setSize(prevSize.x, prevSize.y, false);
      stage.renderer.autoClear = prevAutoClear;
      stage.renderer.setScissorTest(false);
      // re-sync size/cameras for the current view mode
      stage.syncSize();
    }
  }

  onMounted(() => {
    const host = canvasHostRef.value;
    if (!host) return;

    // 1) Create Three stage (raf loop, resize, projection switch)
    stage = createThreeStage({
      host,
      orthoHalfHeight: 5,
      onBeforeRender: () => {
        tickAnimation();
        runtime?.tickCameraClipping();
      },
    });

    // 2) Create model runtime (meshes/frames/fit)
    runtime = createModelRuntime({
      stage,
      settingsRef,
      hasModel,
      atomSizeFactor: ATOM_SIZE_FACTOR,
      bondFactor: BOND_FACTOR,
      bondRadius: BOND_RADIUS,
    });

    // Ensure computed refs that depend on runtime can update at least once.
    runtimeTick.value += 1;

    // 3) Bind settings watchers
    stopBind = bindViewerStageSettings({
      settingsRef,
      setProjectionMode: (v) => stage?.setProjectionMode(v),
      resetView,

      setViewPresets: (v) => stage?.setViewPresets(v),
      setDualViewDistance: (d) => stage?.setDualViewDistance(d),
      setDualViewSplit: (r) => stage?.setDualViewSplit(r),

      applyAtomScale: () => runtime?.applyAtomScale(),
      applyShowBonds: () => runtime?.applyShowBonds(),
      applyShowAxes: () => runtime?.applyShowAxes(),
      applyModelRotation: () => runtime?.applyModelRotation(),

      hasModel,
      hasAnyTypeId: () => runtime?.hasAnyTypeId() ?? false,
      onTypeMapChanged: () => {
        runtime?.onTypeMapChanged();
        // Mesh rebuild invalidates instance references; clear selection to be safe.
        inspectCtx.clear();
      },
      applyBackgroundColor: () => runtime?.applyBackgroundColor(),
    });

    runtime?.applyBackgroundColor();
    stage.start();

    // Sync camera distance back to settings when the user zooms (mouse wheel / touchpad).
    if (patchSettings) {
      const controls = stage.getControls();
      const scheduleSync = () => {
        if (distSyncRaf) return;
        distSyncRaf = requestAnimationFrame(() => {
          distSyncRaf = 0;
          if (!stage) return;
          const cam = stage.getCamera();
          const c = stage.getControls();
          const dist = cam.position.distanceTo(c.target);
          if (!Number.isFinite(dist)) return;
          if (
            Number.isFinite(lastSyncedDist) &&
            Math.abs(dist - lastSyncedDist) < 1e-6
          )
            return;
          lastSyncedDist = dist;
          if (
            Math.abs(dist - (settingsRef.value.dualViewDistance ?? dist)) > 1e-4
          ) {
            patchSettings({ dualViewDistance: dist });
          }
        });
      };
      controls.addEventListener("change", scheduleSync);
      removeControlsSync = () =>
        controls.removeEventListener("change", scheduleSync);
    }

    // Atom picking: treat a short, low-movement pointer interaction as a click.
    const canvas = stage.renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      // Only primary pointer to avoid multi-touch conflicts.
      if (e.isPrimary === false) return;
      pointerDown = { x: e.clientX, y: e.clientY, tMs: performance.now() };

      // Drag-rotate the *model* so XYZ rotation stays in sync with Settings.
      // - Mouse/Pen: left button
      // - Touch: single primary pointer
      const pt = (e as any).pointerType as string | undefined;
      const isTouch = pt === "touch";
      const isMouseLike = pt === "mouse" || pt === "pen" || !pt;

      const canRotate =
        (isMouseLike && (e.buttons & 1) === 1) || (isTouch && e.isPrimary);

      if (!canRotate) return;
      if (recording.isSelectingRecordArea.value) return;

      rotateLast = { x: e.clientX, y: e.clientY };
      rotatePointerId = e.pointerId;
      rotatePointerType = pt ?? null;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const ROT_SPEED_DEG_PER_PX = 0.3;
    const ROT_SYNC_INTERVAL_MS = 120;

    const clearRotate = (): void => {
      if (rotatePointerId != null) {
        try {
          canvas.releasePointerCapture(rotatePointerId);
        } catch {
          // ignore
        }
      }
      rotateLast = null;
      rotatePointerId = null;
      rotatePointerType = null;
      dragRotationDeg = null;
      if (rotSyncTimer) {
        window.clearTimeout(rotSyncTimer);
        rotSyncTimer = 0;
      }
    };

    const flushRotationToSettings = (force: boolean): void => {
      if (!patchSettings) return;
      if (!dragRotationDeg) return;

      const now = performance.now();
      if (!force && now - lastRotSyncMs < ROT_SYNC_INTERVAL_MS) return;

      lastRotSyncMs = now;
      patchSettings({ rotationDeg: { ...dragRotationDeg } });
    };

    const scheduleRotationSync = (force = false): void => {
      if (!patchSettings) return;
      if (!dragRotationDeg) return;

      if (force) {
        if (rotSyncTimer) {
          window.clearTimeout(rotSyncTimer);
          rotSyncTimer = 0;
        }
        flushRotationToSettings(true);
        return;
      }

      flushRotationToSettings(false);

      if (rotSyncTimer) return;

      const due = Math.max(
        0,
        ROT_SYNC_INTERVAL_MS - (performance.now() - lastRotSyncMs)
      );

      rotSyncTimer = window.setTimeout(() => {
        rotSyncTimer = 0;
        flushRotationToSettings(true);
      }, due);
    };

    const applyDragRotationToStage = (): void => {
      if (!stage) return;
      if (!dragRotationDeg) return;
      stage.pivotGroup.rotation.set(
        THREE.MathUtils.degToRad(dragRotationDeg.x),
        THREE.MathUtils.degToRad(dragRotationDeg.y),
        THREE.MathUtils.degToRad(dragRotationDeg.z)
      );
    };

    const onPointerMove = (e: PointerEvent) => {
      if (rotatePointerId == null) return;
      if (e.pointerId !== rotatePointerId) return;
      if (!rotateLast) return;
      if (!stage) return;

      // Do not rotate the model while selecting recording area.
      if (recording.isSelectingRecordArea.value) return;

      const ptNow =
        rotatePointerType ??
        ((e as any).pointerType as string | undefined) ??
        null;
      const isTouchNow = ptNow === "touch";
      const isMouseLikeNow = ptNow === "mouse" || ptNow === "pen" || !ptNow;

      if (isMouseLikeNow && (e.buttons & 1) !== 1) {
        clearRotate();
        return;
      }
      if (isTouchNow && (e.pressure ?? 0) === 0) {
        clearRotate();
        return;
      }

      const dx = e.clientX - rotateLast.x;
      const dy = e.clientY - rotateLast.y;
      rotateLast = { x: e.clientX, y: e.clientY };
      if (dx === 0 && dy === 0) return;

      if (!dragRotationDeg) {
        const cur = getSettings().rotationDeg;
        dragRotationDeg = { x: cur.x, y: cur.y, z: cur.z };
      }

      dragRotationDeg.x = wrapDeg180(
        dragRotationDeg.x + dy * ROT_SPEED_DEG_PER_PX
      );
      dragRotationDeg.y = wrapDeg180(
        dragRotationDeg.y + dx * ROT_SPEED_DEG_PER_PX
      );

      // Apply immediately for smooth interaction (avoid patchSettings thrash).
      applyDragRotationToStage();

      // Throttle UI/settings updates to keep drag smooth.
      scheduleRotationSync(false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      if (e.isPrimary === false) {
        pointerDown = null;
        return;
      }

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const dt = performance.now() - pointerDown.tMs;
      pointerDown = null;

      // Ensure final rotation is persisted.
      scheduleRotationSync(true);
      clearRotate();

      // Threshold tuned for mobile/desktop.
      if (Math.hypot(dx, dy) <= 6 && dt <= 400) {
        handlePick(e);
      }
    };

    const onPointerCancel = () => {
      pointerDown = null;

      scheduleRotationSync(true);
      clearRotate();
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
    canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    canvas.addEventListener("pointerup", onPointerUp, { passive: true });
    canvas.addEventListener("pointercancel", onPointerCancel, {
      passive: true,
    });
    removePickListeners = () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
    };

    // Prevent default browser drop behavior (avoid replacing current page)
    window.addEventListener("dragover", preventWindowDropDefault);
    window.addEventListener("drop", preventWindowDropDefault);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("dragover", preventWindowDropDefault);
    window.removeEventListener("drop", preventWindowDropDefault);

    removePickListeners?.();
    removePickListeners = null;

    removeControlsSync?.();
    removeControlsSync = null;

    stopBind?.();
    stopBind = null;

    stopPlay();

    runtime?.clearModel();
    runtime = null;

    stage?.dispose();
    stage = null;

    // best-effort recording cleanup (if you added dispose() in recording.ts)
    (recording as any)?.dispose?.();
  });

  // -----------------------------
  // ctx groups (parts props)
  // Build once and reuse; avoid reconstructing in index.vue.
  // -----------------------------
  const recordSelectCtx = createRecordSelectCtx(recording);
  const cropDashCtx = createCropDashCtx(recording);

  const parseCtx = createParseCtx({
    hasModel,
    parseInfo,
    parseMode,
    setParseMode,
  });

  const animCtx = createAnimCtx({
    hasModel,
    hasAnimation,
    frameIndex,
    frameCount,
    isPlaying,
    fps,
    setFrame,
    togglePlay,
    recording,
    settingsRef,
    patchSettings,
  });

  return {
    // ✅ recording bindings
    ...recording,

    // layers
    layers,
    activeLayerId,
    setActiveLayer,
    setLayerVisible,

    // inspect
    inspectCtx,

    // ctx groups
    recordSelectCtx,
    parseCtx,
    animCtx,
    cropDashCtx,

    // parse
    parseInfo,
    parseMode,
    setParseMode,

    // animation
    hasAnimation,
    frameIndex,
    frameCount,
    isPlaying,
    fps,
    setFrame,
    togglePlay,

    // stage basics
    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    isLoading,
    openFilePicker,

    refreshTypeMap,

    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    loadFile,
    loadFiles,
    loadUrl,
    onExportPng,
  };
}
