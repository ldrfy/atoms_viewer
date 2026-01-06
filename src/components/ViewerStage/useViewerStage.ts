// src/components/ViewerStage/useViewerStage.ts
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import type { Ref, ComponentPublicInstance } from 'vue';

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  AtomTypeColorMapItem,
  OpenSettingsPayload,
} from '../../lib/viewer/settings';

import { useI18n } from 'vue-i18n';

import { createThreeStage, type ThreeStage } from '../../lib/three/stage';
import { getAutoRotatePreset } from '../../lib/viewer/autoRotate';
import { bindViewerStageSettings } from './bindSettings';
import {
  createModelRuntime,
  type ModelRuntime,
  type ModelLayerInfo,
} from './modelRuntime';

import { createInspectCtx, type InspectCtx } from './ctx/inspect';
import { createRecordingController, type RecordingBindings } from './recording';
import { useFileDrop } from './useFileDrop';

import {
  createRecordSelectCtx,
  createCropDashCtx,
  createParseCtx,
  createAnimCtx,
  type RecordSelectCtx,
  type CropDashCtx,
  type ParseCtx,
  type AnimCtx,
} from './ctx';

import { createViewerPickingController } from './logic/viewerPicking';
import { createPngExporter } from './logic/viewerExportPng';
import { createViewerLoader } from './logic/viewerLoader';
import { createViewerAnimationController } from './logic/viewerAnimation';

/**
 * Template ref callback param type (works for DOM + component instance).
 */
type TemplateRefEl = Element | ComponentPublicInstance | null;

type ViewerStageBridgeApi = {
  openFilePicker: () => void;
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => Promise<void>;

  refreshTypeMap: () => void;
  refreshColorMap: () => void;

  parseInfo: any;
  parseMode: Ref<any>;
  setParseMode: (mode: any) => void;

  layers: Ref<ModelLayerInfo[]>;
  activeLayerId: Ref<string | null>;
  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
  removeLayer: (id: string) => void;

  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;

  activeLayerColorMap: Ref<AtomTypeColorMapItem[]>;
  setActiveLayerColorMap: (rows: AtomTypeColorMapItem[]) => void;
};

type ViewerStageExposedApi = {
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => Promise<void>;
  openFilePicker: () => void;
  loadFile: (file: File) => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  loadUrl: (url: string, fileName: string) => Promise<void>;
};

type ViewerStageBindings = {
  canvasHostRef: ReturnType<typeof ref<HTMLDivElement | null>>;
  fileInputRef: ReturnType<typeof ref<HTMLInputElement | null>>;

  bindCanvasHost: (el: TemplateRefEl) => void;
  bindFileInput: (el: TemplateRefEl) => void;

  bridgeApi: ViewerStageBridgeApi;
  exposedApi: ViewerStageExposedApi;

  isDragging: ReturnType<typeof ref<boolean>>;
  hasModel: ReturnType<typeof ref<boolean>>;
  isLoading: ReturnType<typeof ref<boolean>>;

  layers: Ref<ModelLayerInfo[]>;
  activeLayerId: Ref<string | null>;
  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;

  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;

  activeLayerColorMap: Ref<AtomTypeColorMapItem[]>;
  setActiveLayerColorMap: (rows: AtomTypeColorMapItem[]) => void;

  removeLayer: (id: string) => void;

  inspectCtx: InspectCtx;

  openFilePicker: () => void;

  onDragEnter: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => Promise<void>;
  onFilePicked: (e: Event) => Promise<void>;

  loadFile: (file: File) => Promise<void>;
  loadFiles: (
    files: File[],
    source: 'drop' | 'picker' | 'api',
  ) => Promise<void>;
  loadUrl: (url: string, fileName: string) => Promise<void>;

  onExportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => Promise<void>;

  refreshTypeMap: () => void;
  refreshColorMap: () => void;

  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx: number) => void;
  togglePlay: () => void;

  parseInfo: any;
  parseMode: Ref<any>;
  setParseMode: (mode: any) => void;

  recordSelectCtx: RecordSelectCtx;
  parseCtx: ParseCtx;
  animCtx: AnimCtx;
  cropDashCtx: CropDashCtx;
} & RecordingBindings;

export function useViewerStage(
  settingsRef: Readonly<Ref<ViewerSettings>>,
  patchSettings?: (patch: Partial<ViewerSettings>) => void,
  requestOpenSettings?: (payload?: OpenSettingsPayload) => void,
): ViewerStageBindings {
  const { t } = useI18n();

  const canvasHostRef = ref<HTMLDivElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  function bindCanvasHost(el: TemplateRefEl): void {
    canvasHostRef.value = (el as HTMLDivElement | null) ?? null;
  }
  function bindFileInput(el: TemplateRefEl): void {
    fileInputRef.value = (el as HTMLInputElement | null) ?? null;
  }

  // stage/runtime
  let stage: ThreeStage | null = null;
  let runtime: ModelRuntime | null = null;
  let stopBind: (() => void) | null = null;

  // Keep Display panel rotation degrees in sync while auto-rotation is running.
  let pendingRotationSyncRaf = 0;
  let lastRotationSyncMs = 0;

  function radToDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  }

  function wrapDeg(deg: number): number {
    // Normalize into (-180, 180]
    let d = deg % 360;
    if (d <= -180) d += 360;
    if (d > 180) d -= 360;
    return d;
  }

  function round2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  function scheduleAutoRotateRotationSync(): void {
    if (!patchSettings) return;
    if (!stage) return;
    if (pendingRotationSyncRaf) return;

    pendingRotationSyncRaf = window.requestAnimationFrame(() => {
      pendingRotationSyncRaf = 0;
      if (!patchSettings) return;
      if (!stage) return;

      const now = performance.now();
      // Avoid spamming Vue updates while still keeping the UI responsive.
      if (now - lastRotationSyncMs < 80) return;
      lastRotationSyncMs = now;

      const a = settingsRef.value.autoRotate;
      const preset = getAutoRotatePreset(a.presetId);
      const sp = a.speedDegPerSec;
      const speedDegPerSec = Number.isFinite(sp) ? sp : preset.speedDegPerSec;

      const enabled = !!a.enabled && preset.id !== 'off' && Math.abs(speedDegPerSec) > 1e-8;
      if (!enabled) return;

      const e = stage.pivotGroup.rotation;
      const next = {
        x: round2(wrapDeg(radToDeg(e.x))),
        y: round2(wrapDeg(radToDeg(e.y))),
        z: round2(wrapDeg(radToDeg(e.z))),
      };

      const cur = settingsRef.value.rotationDeg;
      if (
        Math.abs(cur.x - next.x) < 1e-2
        && Math.abs(cur.y - next.y) < 1e-2
        && Math.abs(cur.z - next.z) < 1e-2
      ) {
        return;
      }

      patchSettings({ rotationDeg: next });
    });
  }

  const runtimeTick = ref(0);

  const layers = computed<ModelLayerInfo[]>(() => {
    // 将 runtimeTick 纳入依赖：通过序列表达式避免触发 no-unused-expressions。
    return (runtimeTick.value, runtime?.layers.value ?? []);
  });

  const activeLayerId = computed<string | null>(() => {
    return (runtimeTick.value, runtime?.activeLayerId.value ?? null);
  });

  const activeLayerTypeMap = computed<LammpsTypeMapItem[]>(() => {
    return (runtimeTick.value, runtime?.activeTypeMapRows.value ?? []);
  });

  const activeLayerColorMap = computed<AtomTypeColorMapItem[]>(() => {
    return (runtimeTick.value, runtime?.activeColorMapRows.value ?? []);
  });

  // state
  const hasModel = ref(false);
  const isLoading = ref(false);

  // inspect
  const inspectCtx = createInspectCtx();

  // model file name provider (set after loader is created)
  let modelFileNameProvider: () => string | undefined = () => undefined;

  // recording
  const recording = createRecordingController({
    getStage: () => stage,
    patchSettings,
    t,
    getRecordFps: () => settingsRef.value.frame_rate ?? 60,
    getModelFileName: () => modelFileNameProvider(),
  });

  // picking (attach after stage created)
  const picking = createViewerPickingController({
    settingsRef,
    getStage: () => stage,
    getRuntime: () => runtime,
    patchSettings,
    inspectCtx,
    isSelectingRecordArea: recording.isSelectingRecordArea,
    getActiveLayerId: () => activeLayerId.value,
    setActiveLayer: (id: string) => setActiveLayer(id),
  });

  // animation
  const anim = createViewerAnimationController({
    getRuntime: () => runtime,
    settingsRef,
    inspectCtx,
    onSelectionVisualsNeedUpdate: () => picking.updateSelectionVisuals(),
  });

  // loader (parse/load/refreshTypeMap)
  const loader = createViewerLoader({
    settingsRef,
    getStage: () => stage,
    getRuntime: () => runtime,
    patchSettings,
    requestOpenSettings,
    t,
    inspectCtx,
    isLoading,
    hasModel,
    frameIndex: anim.frameIndex,
    frameCount: anim.frameCount,
    hasAnimation: anim.hasAnimation,
    stopPlay: anim.stopPlay,
  });

  // now that loader exists, wire model file name provider
  modelFileNameProvider = () => loader.parseInfo.fileName;

  // exporter
  const exporter = createPngExporter({
    getStage: () => stage,
    getSettings: () => settingsRef.value,
    getModelFileName: () => loader.parseInfo.fileName,
    t,
  });

  // file drop depends on loadFiles
  const fileDrop = useFileDrop({ loadFiles: loader.loadFiles });
  const {
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
  } = fileDrop;

  function openFilePicker(): void {
    fileInputRef.value?.click();
  }

  function syncUiFromRuntime(): void {
    anim.syncFromRuntime();

    if (!runtime) return;

    const activeId = runtime.activeLayerId.value;
    const layer = runtime.layers.value.find(x => x.id === activeId) ?? null;
    if (layer) {
      loader.parseInfo.fileName = layer.sourceFileName ?? layer.name;
      loader.parseInfo.format = layer.sourceFormat ?? loader.parseInfo.format;
      loader.parseInfo.atomCount = layer.atomCount;
      loader.parseInfo.frameCount = layer.frameCount;
    }
  }

  function setActiveLayer(id: string): void {
    if (!runtime) return;
    runtime.setActiveLayer(id);
    syncUiFromRuntime();
    inspectCtx.clear();
  }

  function setLayerVisible(id: string, visible: boolean): void {
    if (!runtime) return;
    runtime.setLayerVisible(id, visible);
    syncUiFromRuntime();
    inspectCtx.clear();
  }

  function setActiveLayerTypeMap(rows: LammpsTypeMapItem[]): void {
    if (!runtime) return;
    runtime.setActiveLayerTypeMapRows(rows);
  }

  function setActiveLayerColorMap(rows: AtomTypeColorMapItem[]): void {
    if (!runtime) return;
    runtime.setActiveLayerColorMapRows(rows);
  }

  function removeLayer(id: string): void {
    if (!runtime) return;
    inspectCtx.clear();
    runtime.removeLayer(id);
    syncUiFromRuntime();
  }

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

  // Sync dual-view distance back to settings on zoom.
  // Event-driven (OrbitControls "change") instead of a polling RAF loop.
  let lastSyncedDist = NaN;
  let removeControlsSync: (() => void) | null = null;

  function preventWindowDropDefault(e: DragEvent): void {
    e.preventDefault();
  }

  onMounted(() => {
    const host = canvasHostRef.value;
    if (!host) return;

    stage = createThreeStage({
      host,
      orthoHalfHeight: 5,
      onBeforeRender: () => {
        anim.tickAnimation();
        runtime?.tickCameraClipping();
        scheduleAutoRotateRotationSync();
        // Keep the RAF loop alive during animation playback.
        return anim.isPlaying.value;
      },
    });

    runtime = createModelRuntime({
      stage,
      settingsRef,
      hasModel,
      atomSizeFactor: 0.5,
      bondFactor: 1.05,
      bondRadius: 0.09,
    });

    runtimeTick.value += 1;

    stopBind = bindViewerStageSettings({
      settingsRef,
      setProjectionMode: v => stage?.setProjectionMode(v),
      resetView,

      setViewPresets: v => stage?.setViewPresets(v),
      setDualViewDistance: d => stage?.setDualViewDistance(d),
      setDualViewSplit: r => stage?.setDualViewSplit(r),

      applyAtomScale: () => runtime?.applyAtomScale(),
      applyShowBonds: () => runtime?.applyShowBonds(),
      applyShowAxes: () => runtime?.applyShowAxes(),
      applyModelRotation: () => runtime?.applyModelRotation(),

      setAutoRotateConfig: cfg => stage?.setAutoRotateConfig(cfg),

      hasModel,
      hasAnyTypeId: () => runtime?.hasAnyTypeId() ?? false,
      onTypeMapChanged: () => {
        runtime?.onTypeMapChanged();
        inspectCtx.clear();
      },
      applyBackgroundColor: () => runtime?.applyBackgroundColor(),
    });

    runtime?.applyBackgroundColor();
    stage.start();

    picking.attach();

    if (patchSettings) {
      const controls = stage.getControls();
      let pendingRaf = 0;
      let lastT = 0;

      const sync = (t: number) => {
        pendingRaf = 0;
        if (!stage) return;

        // Throttle sync to reduce UI churn while keeping wheel/gesture zoom responsive.
        if (t - lastT < 50) return;
        lastT = t;

        const dist = stage.getDualViewDistance();
        if (!Number.isFinite(dist)) return;

        if (
          Number.isFinite(lastSyncedDist)
          && Math.abs(dist - lastSyncedDist) < 1e-4
        )
          return;
        lastSyncedDist = dist;

        if (Math.abs(dist - (settingsRef.value.dualViewDistance ?? dist)) > 1e-3) {
          patchSettings({ dualViewDistance: dist });
        }
      };

      const onControlsChange = (): void => {
        // Coalesce multiple change events into one write per frame.
        if (pendingRaf) return;
        pendingRaf = requestAnimationFrame(sync);
      };

      controls.addEventListener('change', onControlsChange);
      removeControlsSync = () => {
        controls.removeEventListener('change', onControlsChange);
        if (pendingRaf) cancelAnimationFrame(pendingRaf);
        pendingRaf = 0;
      };
    }

    window.addEventListener('dragover', preventWindowDropDefault);
    window.addEventListener('drop', preventWindowDropDefault);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventWindowDropDefault);
    window.removeEventListener('drop', preventWindowDropDefault);

    picking.detach();

    removeControlsSync?.();
    removeControlsSync = null;

    stopBind?.();
    stopBind = null;

    anim.stopPlay();

    if (pendingRotationSyncRaf) {
      window.cancelAnimationFrame(pendingRotationSyncRaf);
      pendingRotationSyncRaf = 0;
    }

    runtime?.clearModel();
    runtime = null;

    stage?.dispose();
    stage = null;

    (recording as any)?.dispose?.();
  });

  // ctx groups
  const recordSelectCtx = createRecordSelectCtx(recording);
  const cropDashCtx = createCropDashCtx(recording);

  const parseCtx = createParseCtx({
    hasModel,
    parseInfo: loader.parseInfo,
    parseMode: loader.parseMode,
    setParseMode: loader.setParseMode,
  });

  const animCtx = createAnimCtx({
    hasModel,
    hasAnimation: anim.hasAnimation,
    frameIndex: anim.frameIndex,
    frameCount: anim.frameCount,
    isPlaying: anim.isPlaying,
    fps: anim.fps,
    setFrame: anim.setFrame,
    togglePlay: anim.togglePlay,
    recording,
    settingsRef,
    patchSettings,
  });

  const bridgeApi: ViewerStageBridgeApi = {
    openFilePicker,
    exportPng: exporter.onExportPng,

    refreshTypeMap: () => void loader.refreshTypeMap(),
    refreshColorMap: () => void loader.refreshColorMap(),

    parseInfo: loader.parseInfo,
    parseMode: loader.parseMode,
    setParseMode: loader.setParseMode,

    layers,
    activeLayerId,
    setActiveLayer,
    setLayerVisible,
    removeLayer,

    activeLayerTypeMap,
    setActiveLayerTypeMap,

    activeLayerColorMap,
    setActiveLayerColorMap,
  };

  const exposedApi: ViewerStageExposedApi = {
    exportPng: exporter.onExportPng,
    openFilePicker,
    loadFile: loader.loadFile,
    loadFiles: (files: File[]) => loader.loadFiles(files, 'api'),
    loadUrl: loader.loadUrl,
  };

  return {
    ...recording,

    bindCanvasHost,
    bindFileInput,
    bridgeApi,
    exposedApi,

    layers,
    activeLayerId,
    setActiveLayer,
    setLayerVisible,

    activeLayerTypeMap,
    setActiveLayerTypeMap,

    activeLayerColorMap,
    setActiveLayerColorMap,
    removeLayer,

    inspectCtx,

    recordSelectCtx,
    parseCtx,
    animCtx,
    cropDashCtx,

    parseInfo: loader.parseInfo,
    parseMode: loader.parseMode,
    setParseMode: loader.setParseMode,

    hasAnimation: anim.hasAnimation,
    frameIndex: anim.frameIndex,
    frameCount: anim.frameCount,
    isPlaying: anim.isPlaying,
    fps: anim.fps,
    setFrame: anim.setFrame,
    togglePlay: anim.togglePlay,

    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    isLoading,

    openFilePicker,

    refreshTypeMap: () => void loader.refreshTypeMap(),
    refreshColorMap: () => void loader.refreshColorMap(),

    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,

    loadFile: loader.loadFile,
    loadFiles: loader.loadFiles,
    loadUrl: loader.loadUrl,

    onExportPng: exporter.onExportPng,
  };
}
