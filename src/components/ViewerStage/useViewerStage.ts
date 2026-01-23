// src/components/ViewerStage/useViewerStage.ts
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue';
import type { Ref, ComponentPublicInstance } from 'vue';
import * as THREE from 'three';
import { message } from 'ant-design-vue';

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
  SESSION_SAVE_DELAY_LAYERS_MS,
  SESSION_SAVE_DELAY_SETTINGS_MS,
} from '../../lib/viewer/constants';
import { normalizeViewPresets } from '../../lib/viewer/viewPresets';
import { bindViewerStageSettings } from './bindSettings';
import {
  createModelRuntime,
  type ModelRuntime,
  type ModelLayerInfo,
} from './modelRuntime';
import { createLayerSourceStore } from './logic/sourceStore';

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
import { buildSettingsSnapshot, parseProjectZip } from '../../lib/viewer/projectPackage';
import { flattenCategorizedSettings } from '../../lib/viewer/sessionTemplates';
import { readApplyAllLayersFlags, writeApplyAllLayersFlags } from '../SettingsSider/applyAllStorage';
import { normalizeSettings } from '../../lib/viewer/settingsStorage';
import { computeMd5ForArrayBuffer } from '../../lib/file/md5';
import { buildExportFilename } from '../../lib/file/filename';
import { saveSessionToStorage, clearSessionStorage } from '../../lib/viewer/sessionStorage';
import { setThemeMode } from '../../theme/mode';
import { exportStructureText, type StructureExportFormat } from '../../lib/structure/export';

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
  /** 导出当前图层为结构文件 */
  exportStructureFile: (format: StructureExportFormat) => Promise<{
    blob: Blob;
    filename: string;
  }>;

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
  /** 设置所有图层可见性 */
  setAllLayersVisible: (visible: boolean) => void;
  /** 排序图层显示顺序 */
  sortLayers: (opts: { by: 'time' | 'name'; direction: 'asc' | 'desc' }) => void;
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

  /** 获取图层快照（含源信息与设置），用于导出/会话恢复 */
  getLayerSnapshots: () => Promise<import('../../lib/viewer/sessionTypes').LayerSnapshot[]>;
  /** 应用图层快照（按 MD5 匹配，失败按顺序 fallback） */
  applyLayerSnapshots: (
    snaps: import('../../lib/viewer/sessionTypes').LayerSnapshot[],
  ) => Promise<void>;
  /** 获取图层源数据（用于打包/会话恢复） */
  getLayerSources: () => Promise<import('../../lib/viewer/sessionTypes').LayerSourceData[]>;
  /** 应用完整会话快照（含设置 + 图层），可附带模型文件列表 */
  applySessionSnapshot: (
    snapshot: import('../../lib/viewer/sessionTypes').SessionSnapshot,
    files?: File[],
  ) => Promise<void>;
  /** 远程模型是否缓存用于导出/恢复 */
  cacheRemoteOnExport: Ref<boolean>;
  /** 切换远程模型缓存开关 */
  setCacheRemoteOnExport: (v: boolean) => void;
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
  exportStructureFile: (format: StructureExportFormat) => Promise<{
    blob: Blob;
    filename: string;
  }>;
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

  const layerSourceStore = createLayerSourceStore();
  const cacheRemoteOnExport = ref(true);
  const CACHE_REMOTE_KEY = 'atomsViewer.cacheRemoteModels';
  try {
    const raw = localStorage.getItem(CACHE_REMOTE_KEY);
    if (raw != null) cacheRemoteOnExport.value = raw === '1';
  }
  catch {
    // ignore
  }
  function setCacheRemoteOnExportFlag(v: boolean): void {
    cacheRemoteOnExport.value = !!v;
    try {
      localStorage.setItem(CACHE_REMOTE_KEY, cacheRemoteOnExport.value ? '1' : '0');
    }
    catch {
      // ignore
    }
    if (!cacheRemoteOnExport.value) {
      for (const [layerId, data] of layerSourceStore.entries()) {
        if (data?.type !== 'url' || !data.buffer) continue;
        layerSourceStore.set(layerId, { ...data, buffer: undefined, cached: false });
      }
    }
  }
  watch(
    () => settingsRef.value.cacheRemoteOnExport,
    (v) => {
      if (typeof v === 'boolean') {
        setCacheRemoteOnExportFlag(v);
      }
    },
    { immediate: true },
  );
  let sessionSaveTimer: number | null = null;
  let lastSessionSignature = '';

  function collectLayerSources(): import('../../lib/viewer/sessionTypes').LayerSourceData[] {
    const res: import('../../lib/viewer/sessionTypes').LayerSourceData[] = [];
    for (const [layerId, data] of layerSourceStore.entries()) {
      res.push({ ...data, layerId });
    }
    return res;
  }

  async function cacheRemoteSourcesForExport(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const [layerId, data] of layerSourceStore.entries()) {
      if (!data || data.buffer || !data.url) continue;
      tasks.push((async () => {
        try {
          const res = await fetch(data.url!);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const buf = await res.arrayBuffer();
          const md5 = data.md5 ?? computeMd5ForArrayBuffer(buf);
          layerSourceStore.set(layerId, {
            ...data,
            md5,
            size: buf.byteLength,
            buffer: buf,
            cached: true,
          });
        }
        catch (err) {
          console.warn('Failed to cache remote source for export:', data.url, err);
        }
      })());
    }
    if (tasks.length > 0) await Promise.all(tasks);
  }

  async function persistSessionSnapshot(): Promise<void> {
    if (!runtime) return;

    if (!runtime.layers.value || runtime.layers.value.length === 0) {
      lastSessionSignature = '';
      await clearSessionStorage();
      return;
    }

    const layerSnapshots = runtime.getLayerSnapshots();
    if (!layerSnapshots || layerSnapshots.length === 0) {
      lastSessionSignature = '';
      await clearSessionStorage();
      return;
    }

    const snapshot = buildSettingsSnapshot(
      settingsRef.value,
      layerSnapshots,
      undefined,
      readApplyAllLayersFlags(),
    );
    const sources = collectLayerSources();
    const curSettings = settingsRef.value;
    const sig = JSON.stringify({
      settings: {
        atomScale: curSettings.atomScale,
        bondFactor: curSettings.bondFactor,
        bondRadius: curSettings.bondRadius,
        rotationDeg: curSettings.rotationDeg,
        dualViewDistance: curSettings.dualViewDistance,
      },
      layers: layerSnapshots.map(s => `${s.source?.md5 ?? s.id}:${s.visible ? 1 : 0}:${s.details.atomScale}:${s.lammps.length}:${s.colors.length}`),
      sources: sources.map(s => `${s.md5 ?? s.layerId}:${s.size ?? 0}:${s.cached ? 1 : 0}`),
    });
    if (sig === lastSessionSignature) return;
    lastSessionSignature = sig;
    await saveSessionToStorage(snapshot, sources);
  }

  function scheduleSessionSave(reason: 'settings' | 'layers' = 'layers'): void {
    const delay = reason === 'settings'
      ? SESSION_SAVE_DELAY_SETTINGS_MS
      : SESSION_SAVE_DELAY_LAYERS_MS;
    if (sessionSaveTimer) {
      window.clearTimeout(sessionSaveTimer);
    }
    sessionSaveTimer = window.setTimeout(() => {
      sessionSaveTimer = null;
      void persistSessionSnapshot();
    }, delay);
  }

  watch(
    () => settingsRef.value,
    () => {
      if (!hasModel.value) return;
      scheduleSessionSave('settings');
    },
    { deep: true },
  );

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
    onRotationCommitted: () => scheduleSessionSave('settings'),
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
    sourceStore: layerSourceStore,
    shouldCacheRemote: () => cacheRemoteOnExport.value,
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

  async function exportStructureFile(
    format: StructureExportFormat,
  ): Promise<{ blob: Blob; filename: string }> {
    if (!runtime) throw new Error('No runtime');
    const atoms = runtime.getActiveAtoms();
    if (!atoms || atoms.length === 0) {
      throw new Error('No atoms to export');
    }
    const fileStem = loader.parseInfo?.fileName ?? 'atoms-viewer';
    const text = exportStructureText({
      atoms,
      format,
      comment: fileStem,
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const filename = buildExportFilename({ modelFileName: fileStem, ext: format });
    return { blob, filename };
  }

  // file drop depends on loadFiles
  const fileDrop = useFileDrop({ loadFiles: loadFilesWithSession });
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

  async function loadFileWithSession(
    file: File,
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      await loadFilesWithSession([file], 'api', opts);
      return;
    }
    await loader.loadFile(file, opts);
    scheduleSessionSave('layers');
  }

  async function loadFilesWithSession(
    files: File[],
    _source?: 'drop' | 'picker' | 'api',
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const otherFiles = files.filter(f => !zipFiles.includes(f));

    for (const zip of zipFiles) {
      await importProjectPackage(zip);
    }

    if (otherFiles.length === 0) return;
    const mergedOpts = zipFiles.length > 0
      ? { ...(opts ?? {}), hidePreviousLayers: false }
      : opts;
    await loader.loadFiles(otherFiles, mergedOpts);
    scheduleSessionSave('layers');
  }

  async function loadUrlWithSession(
    url: string,
    fileName: string,
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    await loader.loadUrl(url, fileName, opts);
    scheduleSessionSave('layers');
  }

  async function loadUrlsWithSession(
    items: { url: string; fileName: string }[],
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    await loader.loadUrls(items, opts);
    scheduleSessionSave('layers');
  }

  function guessMd5FromName(name: string): string | null {
    const base = (name ?? '').split('/').pop() ?? '';
    const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
    const m = stem.match(/[a-fA-F0-9]{32}/);
    return m ? m[0]!.toLowerCase() : null;
  }

  async function waitForRuntimeReady(maxAttempts = 30, stepMs = 100): Promise<boolean> {
    if (runtime) return true;
    for (let i = 0; i < maxAttempts; i += 1) {
      await new Promise(resolve => window.setTimeout(resolve, stepMs));
      if (runtime) return true;
    }
    return !!runtime;
  }

  async function applySessionSnapshot(
    snapshot: import('../../lib/viewer/sessionTypes').SessionSnapshot,
    files?: File[],
  ): Promise<void> {
    if (!snapshot) return;
    if (!runtime && !(await waitForRuntimeReady())) return;
    if (!runtime) return;

    // 过滤掉配置文件，只保留模型文件
    const importFiles = (files ?? []).filter(f => f.name.toLowerCase() !== 'config.json');
    const hasFiles = importFiles.length > 0;
    const layerSnaps = snapshot.layers ?? [];
    if (!hasFiles && layerSnaps.length === 0) {
      message.error(t('settings.importFailed'));
      return;
    }

    // 先还原设置
    const rawSettings = snapshot.settings as any;
    if (rawSettings && typeof rawSettings === 'object') {
      const colorsPayload = rawSettings?.colors;
      writeApplyAllLayersFlags({
        details: rawSettings?.details?.applyAllLayers,
        colors: Array.isArray(colorsPayload)
          ? undefined
          : colorsPayload?.applyAllLayers,
      });
    }
    const isCategorized = rawSettings && typeof rawSettings === 'object'
      && (
        'files' in rawSettings
        || 'rotation' in rawSettings
        || 'view' in rawSettings
        || 'details' in rawSettings
        || 'colors' in rawSettings
        || 'lammps' in rawSettings
      );
    const settingsPatched = isCategorized
      ? flattenCategorizedSettings(rawSettings) as ViewerSettings
      : normalizeSettings(rawSettings as ViewerSettings);
    if (patchSettings) {
      settingsSync.suspend(300);
      patchSettings(settingsPatched);
      // 同步主题到全局
      if (settingsPatched.themeMode) {
        setThemeMode(settingsPatched.themeMode as any);
      }
    }

    inspectCtx.clear();
    runtime.clearModel();
    layerSourceStore.clear();

    // 按 md5 匹配模型文件，匹配不到时按顺序 fallback
    const renameFile = (file: File, name?: string): File => {
      if (!name || name === file.name) return file;
      try {
        return new File([file], name, { type: file.type });
      }
      catch {
        return file;
      }
    };

    const filesByMd5 = new Map<string, File>();
    const usedFiles = new Set<File>();
    for (const f of importFiles) {
      const md5 = guessMd5FromName(f.name);
      if (md5) filesByMd5.set(md5, f);
    }

    let loadedLayers = 0;
    for (const layer of layerSnaps) {
      let file: File | undefined;
      const md5 = layer.source?.md5?.toLowerCase();
      if (md5 && filesByMd5.has(md5)) {
        file = filesByMd5.get(md5);
      }
      else {
        file = importFiles.find(f => !usedFiles.has(f));
      }

      if (file) {
        usedFiles.add(file);
        const fileWithName = renameFile(file, layer.source?.fileName ?? layer.name);
        await loadFilesWithSession([fileWithName], 'api', { hidePreviousLayers: false });
        loadedLayers += 1;
        continue;
      }

      const url = layer.source?.url;
      if (url) {
        await loadUrlsWithSession(
          [{ url, fileName: layer.source?.fileName ?? layer.name ?? 'remote' }],
          { hidePreviousLayers: false },
        );
        loadedLayers += 1;
      }
    }

    // 把余下的文件全部加载一遍（用户增加/顺序变化时仍然恢复）
    const leftovers = importFiles.filter(f => !usedFiles.has(f));
    if (leftovers.length > 0) {
      await loadFilesWithSession(leftovers, 'api', { hidePreviousLayers: false });
      loadedLayers += leftovers.length;
    }
    if (loadedLayers === 0 && importFiles.length > 0) {
      await loadFilesWithSession(importFiles, 'api', { hidePreviousLayers: false });
      loadedLayers = importFiles.length;
    }

    // 应用每层的外观/颜色/LAMMPS 设置，并恢复视角
    runtime.applyLayerSnapshots(layerSnaps);
    runtimeTick.value += 1;
    applyViewFromSettings(settingsPatched);
    scheduleSessionSave('layers');

    const afterCount = runtime.layers.value.length;
    if (loadedLayers > 0 || afterCount > 0) {
      message.success(t('settings.importSuccess'));
    }
    else {
      message.error(t('settings.importFailed'));
    }
  }

  async function importProjectPackage(file: File): Promise<void> {
    try {
      const parsed = await parseProjectZip(file);
      const parsedFiles = parsed.files?.map(f => f.file) ?? [];
      if (parsed.snapshot) {
        await applySessionSnapshot(parsed.snapshot, parsedFiles);
      }
      else if (parsedFiles.length > 0) {
        await loadFilesWithSession(parsedFiles, 'api', { hidePreviousLayers: false });
      }
    }
    catch (err) {
      console.error(err);
      message.error(t('common.error'));
    }
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
    scheduleSessionSave('layers');
  }

  function setAllLayersVisible(visible: boolean): void {
    if (!runtime) return;
    runtime.setAllLayersVisible(visible);
    syncUiFromRuntime();
    inspectCtx.clear();
    scheduleSessionSave('layers');
  }

  function sortLayers(opts: { by: 'time' | 'name'; direction: 'asc' | 'desc' }): void {
    if (!runtime) return;
    const dir = opts.direction === 'desc' ? -1 : 1;
    const by = opts.by;
    const getName = (l: ModelLayerInfo): string => {
      const name = String(l?.name ?? '').trim();
      const file = String(l?.sourceFileName ?? '').trim();
      return (name || file || String(l?.id ?? '')).toLowerCase();
    };
    runtime.sortLayers((a, b) => {
      if (by === 'time') {
        const ta = Number.isFinite(a.createdAtMs) ? Number(a.createdAtMs) : 0;
        const tb = Number.isFinite(b.createdAtMs) ? Number(b.createdAtMs) : 0;
        if (ta === tb) return 0;
        return ta < tb ? -dir : dir;
      }
      const na = getName(a);
      const nb = getName(b);
      if (na === nb) return 0;
      return na < nb ? -dir : dir;
    });
  }

  function setActiveLayerTypeMap(rows: LammpsTypeMapItem[]): void {
    if (!runtime) return;
    runtime.setActiveLayerTypeMapRows(rows);
    scheduleSessionSave('layers');
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
    scheduleSessionSave('layers');
  }

  function setActiveLayerColorMap(rows: AtomTypeColorMapItem[]): void {
    if (!runtime) return;
    runtime.setActiveLayerColorMapRows(rows);
    scheduleSessionSave('layers');
  }

  function setAllLayersColorMap(rows: AtomTypeColorMapItem[]): void {
    if (!runtime) return;
    runtime.setAllLayersColorMapRows(rows);
    scheduleSessionSave('layers');
  }

  function resetAllLayersColorMapToDefaults(): void {
    if (!runtime) return;
    runtime.resetAllLayersColorMapToDefaults();
    syncUiFromRuntime();
    scheduleSessionSave('layers');
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
    if (patch.atomRoughness != null) next.atomRoughness = patch.atomRoughness;
    if (Object.keys(next).length > 0) settingsSync.patch(next);
    scheduleSessionSave('layers');
  }

  function removeLayer(id: string): void {
    if (!runtime) return;
    inspectCtx.clear();
    runtime.removeLayer(id);
    layerSourceStore.delete(id);
    syncUiFromRuntime();
    scheduleSessionSave('layers');
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
    stage.setViewPresets(presets);

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
      setModelLightIntensity: v => stage?.setModelLightIntensity(v),

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
    if (sessionSaveTimer) {
      window.clearTimeout(sessionSaveTimer);
      sessionSaveTimer = null;
    }
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
    exportStructureFile,

    refreshTypeMap: () => void loader.refreshTypeMap(),
    refreshColorMap: opts => void loader.refreshColorMap(opts),

    parseInfo: loader.parseInfo,
    parseMode: loader.parseMode,
    setParseMode: loader.setParseMode,

    layers,
    activeLayerId,
    setActiveLayer,
    setLayerVisible,
    setAllLayersVisible,
    sortLayers,
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
    getLayerSnapshots: async () => runtime?.getLayerSnapshots() ?? [],
    applyLayerSnapshots: async (snaps) => {
      runtime?.applyLayerSnapshots(snaps);
      runtimeTick.value += 1;
      scheduleSessionSave('layers');
    },
    getLayerSources: async () => {
      if (cacheRemoteOnExport.value) {
        await cacheRemoteSourcesForExport();
      }
      const res: import('../../lib/viewer/sessionTypes').LayerSourceData[] = [];
      for (const [layerId, data] of layerSourceStore.entries()) {
        res.push({ ...data, layerId });
      }
      return res;
    },
    applySessionSnapshot: async (snapshot, files) => {
      await applySessionSnapshot(snapshot, files);
    },
    cacheRemoteOnExport,
    setCacheRemoteOnExport: setCacheRemoteOnExportFlag,
  };

  const exposedApi: ViewerStageExposedApi = {
    exportPng: exporter.onExportPng,
    exportPngWithSelection,
    exportStructureFile,
    openFilePicker,
    loadFile: loadFileWithSession,
    loadFiles: (files: File[]) => loadFilesWithSession(files),
    loadUrl: loadUrlWithSession,
    loadUrls: loadUrlsWithSession,
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

    loadFile: loadFileWithSession,
    loadFiles: loadFilesWithSession,
    loadUrl: loadUrlWithSession,
    loadUrls: loadUrlsWithSession,

    onExportPng: exporter.onExportPng,
  };
}
