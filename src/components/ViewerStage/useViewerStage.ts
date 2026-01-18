// src/components/ViewerStage/useViewerStage.ts
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue';
import type { Ref, ComponentPublicInstance } from 'vue';
import * as THREE from 'three';

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  AtomTypeColorMapItem,
  OpenSettingsPayload,
  LayerDisplaySettings,
} from '../../lib/viewer/settings';
import type { FrameMeta } from '../../lib/structure/types';

import { useI18n } from 'vue-i18n';

import { createThreeStage, type ThreeStage } from '../../lib/three/stage';
import { getAutoRotatePreset } from '../../lib/viewer/autoRotate';
import {
  AUTO_ROTATE_ROTATION_SYNC_INTERVAL_MS,
  DUAL_VIEW_DISTANCE_SYNC_INTERVAL_MS,
} from '../../lib/viewer/constants';
import { normalizeViewPresets } from '../../lib/viewer/viewPresets';
import { bindViewerStageSettings } from './bindSettings';
import {
  createModelRuntime,
  type ModelRuntime,
  type ModelLayerInfo,
} from './modelRuntime';

import { createInspectCtx, type InspectCtx } from './ctx/inspect';
import { createRecordingController, type RecordingBindings, type CropBox } from './recording';
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
import { createSettingsSync } from './settingsSync';

/**
 * Template ref callback param type (works for DOM + component instance).
 */
type TemplateRefEl = Element | ComponentPublicInstance | null;

type ViewerStageBridgeApi = {
  /** 打开系统文件选择器 */
  openFilePicker: () => void;
  /** 导出当前视口 PNG */
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
    cropBox?: CropBox;
  }) => Promise<void>;
  /** 选择区域后导出 PNG */
  exportPngWithSelection: (payload: {
    scale: number;
    transparent: boolean;
  }) => void;

  /** 重新应用 LAMMPS 类型映射 */
  refreshTypeMap: () => void;
  /** 重新应用颜色映射 */
  refreshColorMap: (opts?: { applyToAll?: boolean }) => void;

  /** 当前解析信息 */
  parseInfo: any;
  /** 当前解析模式 */
  parseMode: Ref<any>;
  /** 设置解析模式 */
  setParseMode: (mode: any) => void;

  /** 所有图层信息 */
  layers: Ref<ModelLayerInfo[]>;
  /** 当前激活图层 ID */
  activeLayerId: Ref<string | null>;
  /** 切换激活图层 */
  setActiveLayer: (id: string) => void;
  /** 设置图层可见性 */
  setLayerVisible: (id: string, visible: boolean) => void;
  /** 移除图层 */
  removeLayer: (id: string) => void;

  /** 当前激活图层的类型映射 */
  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  /** 当前激活图层类型映射是否已应用 */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** 设置激活图层类型映射 */
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;
  /** 重置所有图层类型映射为默认 */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateRows?: LammpsTypeMapItem[];
    useAtomDefaults?: boolean;
  }) => void;

  /** 当前激活图层的颜色映射 */
  activeLayerColorMap: Ref<AtomTypeColorMapItem[]>;
  /** 设置激活图层颜色映射 */
  setActiveLayerColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** 设置所有图层颜色映射 */
  setAllLayersColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** 重置所有图层颜色映射为默认 */
  resetAllLayersColorMapToDefaults: () => void;

  /** 当前激活图层的显示设置 */
  activeLayerDisplay: Ref<LayerDisplaySettings | null>;
  /** 设置激活图层显示参数 */
  setActiveLayerDisplay: (
    patch: Partial<LayerDisplaySettings>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** 立即应用视角/视距相关设置 */
  applyViewFromSettings: (overrides?: Partial<ViewerSettings>) => void;
  /** 暂停设置同步（避免短时间内相互覆盖） */
  suspendSettingsSync: (ms?: number) => void;

  /** 可见图层是否存在自定义颜色 */
  visibleCustomColors: Ref<boolean>;
};

type ViewerStageExposedApi = {
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
    cropBox?: CropBox;
  }) => Promise<void>;
  exportPngWithSelection: (payload: {
    scale: number;
    transparent: boolean;
  }) => void;
  openFilePicker: () => void;
  loadFile: (file: File) => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  loadUrl: (url: string, fileName: string) => Promise<void>;
  loadUrls: (items: { url: string; fileName: string }[]) => Promise<void>;
};

type ViewerStageBindings = {
  /** Canvas 宿主 DOM 引用 */
  canvasHostRef: ReturnType<typeof ref<HTMLDivElement | null>>;
  /** 文件输入 DOM 引用 */
  fileInputRef: ReturnType<typeof ref<HTMLInputElement | null>>;

  /** 绑定 Canvas 宿主 */
  bindCanvasHost: (el: TemplateRefEl) => void;
  /** 绑定文件输入 */
  bindFileInput: (el: TemplateRefEl) => void;

  /** 对外桥接 API */
  bridgeApi: ViewerStageBridgeApi;
  /** 组件对外暴露的 API */
  exposedApi: ViewerStageExposedApi;

  /** 是否正在拖拽文件 */
  isDragging: ReturnType<typeof ref<boolean>>;
  /** 是否已有模型 */
  hasModel: ReturnType<typeof ref<boolean>>;
  /** 是否处于加载中 */
  isLoading: ReturnType<typeof ref<boolean>>;

  /** 所有图层信息 */
  layers: Ref<ModelLayerInfo[]>;
  /** 当前激活图层 ID */
  activeLayerId: Ref<string | null>;
  /** 切换激活图层 */
  setActiveLayer: (id: string) => void;
  /** 设置图层可见性 */
  setLayerVisible: (id: string, visible: boolean) => void;

  /** 当前激活图层的类型映射 */
  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  /** 当前激活图层类型映射是否已应用 */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** 设置激活图层类型映射 */
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;
  /** 重置所有图层类型映射为默认 */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateRows?: LammpsTypeMapItem[];
    useAtomDefaults?: boolean;
  }) => void;

  /** 当前激活图层的颜色映射 */
  activeLayerColorMap: Ref<AtomTypeColorMapItem[]>;
  /** 设置激活图层颜色映射 */
  setActiveLayerColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** 设置所有图层颜色映射 */
  setAllLayersColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** 重置所有图层颜色映射为默认 */
  resetAllLayersColorMapToDefaults: () => void;

  /** 当前激活图层显示设置 */
  activeLayerDisplay: Ref<LayerDisplaySettings | null>;
  /** 设置激活图层显示参数 */
  setActiveLayerDisplay: (
    patch: Partial<LayerDisplaySettings>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** 立即应用视角/视距相关设置 */
  applyViewFromSettings: (overrides?: Partial<ViewerSettings>) => void;

  /** 移除图层 */
  removeLayer: (id: string) => void;

  /** 原子信息/测量面板上下文 */
  inspectCtx: InspectCtx;

  /** 打开系统文件选择器 */
  openFilePicker: () => void;

  /** 拖拽进入回调 */
  onDragEnter: () => void;
  /** 拖拽移动回调 */
  onDragOver: (e: DragEvent) => void;
  /** 拖拽离开回调 */
  onDragLeave: () => void;
  /** 拖拽放下回调 */
  onDrop: (e: DragEvent) => Promise<void>;
  /** 文件选择器变更回调 */
  onFilePicked: (e: Event) => Promise<void>;

  /** 加载单个本地文件 */
  loadFile: (file: File) => Promise<void>;
  /** 加载多个本地文件 */
  loadFiles: (
    files: File[],
    source: 'drop' | 'picker' | 'api',
  ) => Promise<void>;
  /** 加载远程文件 */
  loadUrl: (url: string, fileName: string) => Promise<void>;
  /** 加载多个远程文件 */
  loadUrls: (items: { url: string; fileName: string }[]) => Promise<void>;

  /** 导出 PNG */
  onExportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => Promise<void>;

  /** 重新应用 LAMMPS 类型映射 */
  refreshTypeMap: () => void;
  /** 重新应用颜色映射 */
  refreshColorMap: (opts?: { applyToAll?: boolean }) => void;

  /** 是否存在动画 */
  hasAnimation: Ref<boolean>;
  /** 当前帧索引 */
  frameIndex: Ref<number>;
  /** 总帧数 */
  frameCount: Ref<number>;
  /** 是否播放中 */
  isPlaying: Ref<boolean>;
  /** 当前播放 FPS */
  fps: Ref<number>;
  /** 设置当前帧 */
  setFrame: (idx: number) => void;
  /** 播放/暂停切换 */
  togglePlay: () => void;

  /** 解析信息 */
  parseInfo: any;
  /** 解析模式 */
  parseMode: Ref<any>;
  /** 设置解析模式 */
  setParseMode: (mode: any) => void;

  /** 录制框选上下文 */
  recordSelectCtx: RecordSelectCtx;
  /** 解析信息上下文 */
  parseCtx: ParseCtx;
  /** 动画控制上下文 */
  animCtx: AnimCtx;
  /** 录制裁剪虚线框上下文 */
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

  const settingsSync = createSettingsSync(patchSettings);

  // Keep Display panel rotation degrees in sync while auto-rotation is running.
  let pendingRotationSyncRaf = 0;
  let lastRotationSyncMs = 0;
  let lastAutoRotateMode: 'active' | 'paused' | 'off' = 'off';
  let autoRotateInteracting = false;
  let autoRotateResumeAtMs = 0;
  let removeControlsAutoRotateHooks: (() => void) | null = null;

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

  function syncRotationToSettings(force: boolean): void {
    if (!patchSettings) return;
    if (!stage) return;

    const now = performance.now();
    // Avoid spamming Vue updates while still keeping the UI responsive.
    if (!force && now - lastRotationSyncMs < AUTO_ROTATE_ROTATION_SYNC_INTERVAL_MS) return;
    lastRotationSyncMs = now;

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

    settingsSync.patch({ rotationDeg: next });
  }

  function scheduleAutoRotateRotationSync(): void {
    if (!patchSettings) return;
    if (settingsSync.isSuppressed()) return;
    if (!stage) return;
    if (pendingRotationSyncRaf) return;

    pendingRotationSyncRaf = window.requestAnimationFrame(() => {
      pendingRotationSyncRaf = 0;
      if (!patchSettings) return;
      if (!stage) return;

      const a = settingsRef.value.autoRotate;
      const preset = getAutoRotatePreset(a.presetId);
      const sp = a.speedDegPerSec;
      const speedDegPerSec = Number.isFinite(sp) ? sp : preset.speedDegPerSec;
      const enabled = !!a.enabled && preset.id !== 'off' && Math.abs(speedDegPerSec) > 1e-8;
      const now = performance.now();
      const canRotate = enabled
        && (!a.pauseOnInteract || (!autoRotateInteracting && now >= autoRotateResumeAtMs));
      const mode: 'active' | 'paused' | 'off' = enabled ? (canRotate ? 'active' : 'paused') : 'off';

      if (mode !== lastAutoRotateMode) {
        lastAutoRotateMode = mode;
        syncRotationToSettings(true);
        return;
      }

      if (mode !== 'active') return;
      syncRotationToSettings(false);
    });
  }

  const runtimeTick = ref(0);

  const layers = computed<ModelLayerInfo[]>(() => {
    // Include runtimeTick as a reactive dependency without extra allocations.
    // 将 runtimeTick 纳入依赖，避免额外分配并保持响应更新。
    return (runtimeTick.value, runtime?.layers.value ?? []);
  });

  const activeLayerId = computed<string | null>(() => {
    return (runtimeTick.value, runtime?.activeLayerId.value ?? null);
  });

  const activeLayerTypeMap = computed<LammpsTypeMapItem[]>(() => {
    return (runtimeTick.value, runtime?.activeTypeMapRows.value ?? []);
  });

  const activeLayerTypeMapApplied = computed<boolean>(() => {
    return (runtimeTick.value, runtime?.activeTypeMapApplied.value ?? false);
  });

  const activeLayerColorMap = computed<AtomTypeColorMapItem[]>(() => {
    return (runtimeTick.value, runtime?.activeColorMapRows.value ?? []);
  });

  const activeLayerDisplay = computed<LayerDisplaySettings | null>(() => {
    return (runtimeTick.value, runtime?.activeDisplaySettings.value ?? null);
  });

  const visibleCustomColors = computed<boolean>(() => {
    return (runtimeTick.value, runtime?.visibleCustomColors.value ?? false);
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
    patchSettings: settingsSync.patch,
    getSettings: () => settingsRef.value,
    t,
    getRecordFps: () => settingsRef.value.frame_rate ?? 60,
    getModelFileName: () => modelFileNameProvider(),
  });

  // picking (attach after stage created)
  const picking = createViewerPickingController({
    settingsRef,
    getStage: () => stage,
    getRuntime: () => runtime,
    patchSettings: settingsSync.patch,
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
    wakeRender: () => stage?.invalidate(),
  });

  // loader (parse/load/refreshTypeMap)
  const loader = createViewerLoader({
    settingsRef,
    getStage: () => stage,
    getRuntime: () => runtime,
    patchSettings: settingsSync.patch,
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

  const frameMeta = computed<FrameMeta | null>(() => {
    const layerId = activeLayerId.value;
    const idx = anim.frameIndex.value;
    return runtime?.getFrameMetaForLayer(layerId, idx) ?? null;
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

  function exportPngWithSelection(payload: {
    scale: number;
    transparent: boolean;
  }): void {
    recording.selectExportArea({
      hint: t('viewer.export.selectHint'),
      confirmLabel: t('viewer.export.selectConfirm'),
      cancelLabel: t('viewer.export.selectCancel'),
      onConfirm: (box) => {
        void exporter.onExportPng({
          scale: payload.scale,
          transparent: payload.transparent,
          cropBox: box,
        });
      },
    });
  }

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

  function resetAllLayersTypeMapToDefaults(
    opts?: {
      templateRows?: LammpsTypeMapItem[];
      useAtomDefaults?: boolean;
    },
  ): void {
    if (!runtime) return;
    runtime.resetAllLayersTypeMapToDefaults(opts);
    syncUiFromRuntime();
    inspectCtx.clear();
  }

  function setActiveLayerColorMap(rows: AtomTypeColorMapItem[]): void {
    if (!runtime) return;
    runtime.setActiveLayerColorMapRows(rows);
  }

  function setAllLayersColorMap(rows: AtomTypeColorMapItem[]): void {
    if (!runtime) return;
    runtime.setAllLayersColorMapRows(rows);
  }

  function resetAllLayersColorMapToDefaults(): void {
    if (!runtime) return;
    runtime.resetAllLayersColorMapToDefaults();
    syncUiFromRuntime();
  }

  function setActiveLayerDisplay(
    patch: Partial<LayerDisplaySettings>,
    opts?: { applyToAll?: boolean },
  ): void {
    if (!runtime) return;
    runtime.setActiveLayerDisplaySettings(patch, opts);
    syncUiFromRuntime();
    picking.updateSelectionVisuals();

    const next: Partial<ViewerSettings> = {};
    if (patch.atomScale != null) next.atomScale = patch.atomScale;
    if (patch.showBonds != null) next.showBonds = patch.showBonds;
    if (patch.sphereSegments != null) next.sphereSegments = patch.sphereSegments;
    if (patch.bondFactor != null) next.bondFactor = patch.bondFactor;
    if (patch.bondRadius != null) next.bondRadius = patch.bondRadius;
    if (Object.keys(next).length > 0) settingsSync.patch(next);
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

  function applyViewFromSettings(overrides?: Partial<ViewerSettings>): void {
    if (!stage) return;
    // Avoid immediately re-writing old settings during a reset/update.
    settingsSync.suspend(200);
    const base = settingsRef.value;
    const next: ViewerSettings = {
      ...base,
      ...(overrides ?? {}),
      rotationDeg: {
        ...base.rotationDeg,
        ...(overrides?.rotationDeg ?? {}),
      },
      autoRotate: {
        ...base.autoRotate,
        ...(overrides?.autoRotate ?? {}),
      },
    };

    const presets = normalizeViewPresets(next.viewPresets);
    if (presets.length > 0) {
      stage.setViewPresets(presets);
    }
    else if (next.dualViewEnabled) {
      stage.setViewPresets(['front', 'side']);
    }

    const split = next.dualViewSplit;
    if (typeof split === 'number' && Number.isFinite(split)) {
      stage.setDualViewSplit(split);
    }

    stage.setProjectionMode(!!next.orthographic);

    const r = next.rotationDeg;
    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z),
    );

    const dist = next.dualViewDistance;
    if (typeof dist === 'number' && Number.isFinite(dist)) {
      stage.setDualViewDistance(dist);
      lastSyncedDist = dist;
    }

    stage.getControls().update();
    stage.invalidate();
  }

  // Sync dual-view distance back to settings on zoom.
  // Event-driven (OrbitControls "change") instead of a polling RAF loop.
  let lastSyncedDist = NaN;
  let removeControlsSync: (() => void) | null = null;
  let stopRotationWatch: (() => void) | null = null;

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

    const controls = stage.getControls();
    const onControlsStart = () => {
      if (!settingsRef.value.autoRotate.pauseOnInteract) return;
      autoRotateInteracting = true;
      scheduleAutoRotateRotationSync();
    };
    const onControlsEnd = () => {
      if (!settingsRef.value.autoRotate.pauseOnInteract) return;
      autoRotateInteracting = false;
      const delay = settingsRef.value.autoRotate.resumeDelayMs;
      autoRotateResumeAtMs = performance.now() + Math.max(0, Number(delay) || 0);
      scheduleAutoRotateRotationSync();
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);
    removeControlsAutoRotateHooks = () => {
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
    };

    runtime = createModelRuntime({
      stage,
      settingsRef,
      hasModel,
      atomSizeFactor: 0.5,
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

    stopRotationWatch = watch(
      () => [
        settingsRef.value.rotationDeg.x,
        settingsRef.value.rotationDeg.y,
        settingsRef.value.rotationDeg.z,
      ],
      () => {
        if (!stage) return;
        const r = settingsRef.value.rotationDeg;
        stage.pivotGroup.rotation.set(
          THREE.MathUtils.degToRad(r.x),
          THREE.MathUtils.degToRad(r.y),
          THREE.MathUtils.degToRad(r.z),
        );
        stage.invalidate();
      },
      { immediate: true },
    );

    if (patchSettings) {
      const controls = stage.getControls();
      let pendingRaf = 0;
      let lastT = 0;

      const sync = (t: number) => {
        pendingRaf = 0;
        if (!stage) return;
        if (settingsSync.isSuppressed()) return;

        // Throttle sync to reduce UI churn while keeping wheel/gesture zoom responsive.
        if (t - lastT < DUAL_VIEW_DISTANCE_SYNC_INTERVAL_MS) return;
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
          settingsSync.patch({ dualViewDistance: dist });
        }
      };

      const onControlsChange = (): void => {
        if (settingsSync.isSuppressed()) return;
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

    stopRotationWatch?.();
    stopRotationWatch = null;

    removeControlsSync?.();
    removeControlsSync = null;

    removeControlsAutoRotateHooks?.();
    removeControlsAutoRotateHooks = null;

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
    frameMeta,
    isPlaying: anim.isPlaying,
    fps: anim.fps,
    setFrame: anim.setFrame,
    togglePlay: anim.togglePlay,
    recording,
    settingsRef,
    patchSettings: settingsSync.patch,
  });

  const bridgeApi: ViewerStageBridgeApi = {
    openFilePicker,
    exportPng: exporter.onExportPng,
    exportPngWithSelection,

    refreshTypeMap: () => void loader.refreshTypeMap(),
    refreshColorMap: opts => void loader.refreshColorMap(opts),

    parseInfo: loader.parseInfo,
    parseMode: loader.parseMode,
    setParseMode: loader.setParseMode,

    layers,
    activeLayerId,
    setActiveLayer,
    setLayerVisible,
    removeLayer,

    activeLayerTypeMap,
    activeLayerTypeMapApplied,
    setActiveLayerTypeMap,
    resetAllLayersTypeMapToDefaults,

    activeLayerColorMap,
    setActiveLayerColorMap,
    setAllLayersColorMap,
    resetAllLayersColorMapToDefaults,

    activeLayerDisplay,
    setActiveLayerDisplay,
    applyViewFromSettings,
    suspendSettingsSync: (ms = 200) => settingsSync.suspend(ms),
    visibleCustomColors,
  };

  const exposedApi: ViewerStageExposedApi = {
    exportPng: exporter.onExportPng,
    exportPngWithSelection,
    openFilePicker,
    loadFile: loader.loadFile,
    loadFiles: (files: File[]) => loader.loadFiles(files),
    loadUrl: loader.loadUrl,
    loadUrls: loader.loadUrls,
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
    activeLayerTypeMapApplied,
    setActiveLayerTypeMap,
    resetAllLayersTypeMapToDefaults,

    activeLayerColorMap,
    setActiveLayerColorMap,
    setAllLayersColorMap,
    resetAllLayersColorMapToDefaults,

    activeLayerDisplay,
    setActiveLayerDisplay,
    applyViewFromSettings,
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
    refreshColorMap: opts => void loader.refreshColorMap(opts),

    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,

    loadFile: loader.loadFile,
    loadFiles: loader.loadFiles,
    loadUrl: loader.loadUrl,
    loadUrls: loader.loadUrls,

    onExportPng: exporter.onExportPng,
  };
}
