// src/components/ViewerStage/useViewerStage.ts
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue';
import type { Ref, ComponentPublicInstance, ComputedRef } from 'vue';
import * as THREE from 'three';
import { message } from 'antdv-next';

import type {
  ViewerSettings,
  LammpsTypeMapRecord,
  OpenSettingsPayload,
  DetailsSettingsGroup,
} from '../../lib/viewer/settings';
import { hasUnknownElementMappingForTypeIds } from '../../lib/viewer/settings';
import type { LayerSortBy, LayersSnapshot, LayerSnapshot } from '../../lib/viewer/sessionTypes';
import type { FrameMeta } from '../../lib/structure/types';
import type { SettingsPatch } from '../../lib/viewer/mergeSettings';
import { normalizeElementSymbol } from '../../lib/structure/chem';

import { useI18n } from 'vue-i18n';

import { createThreeStage, type ThreeStage } from '../../lib/three/stage';
import { getAutoRotatePreset } from '../../lib/viewer/autoRotate';
import {
  AUTO_ROTATE_ROTATION_SYNC_INTERVAL_MS,
  DEFAULT_LAYER_USE_REAL_POSITIONS,
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
import type { ColorMapRecord } from './colorMap';
import { parseColorMapRecord } from './colorMap';
import { createLayerSourceStore } from './logic/sourceStore';
import { createInspectSelectionHelper } from './logic/inspectSelectionHelper';
import {
  getLayerSnapshotFromCache,
  getLatestLayerSnapshotFromCache,
  getLatestLayerSnapshotWithResolvedLammps,
  saveLayerSnapshotCache,
} from './logic/layerSnapshotCache';

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
import { mergeCategorizedSettings } from '../../lib/viewer/sessionTemplates';
import { computeMd5ForArrayBuffer } from '../../lib/file/md5';
import { buildExportFilename } from '../../lib/file/filename';
import { saveSessionToStorage, clearSessionStorage, readSessionCacheSizeMap } from '../../lib/viewer/sessionStorage';
import { setThemeMode } from '../../theme/mode';
import { exportStructureText, type StructureExportFormat } from '../../lib/structure/export';
import { writeUrlListParam } from '../../lib/urlParams';
import { PANEL_KEYS } from '../../lib/viewer/panelKeys';

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
    format?: 'png' | 'webp' | 'jpg';
    cropBox?: CropBox;
  }) => Promise<void>;
  /** 选择区域后导出 PNG */
  exportPngWithSelection: (payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
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
  /** 当前图层排序模式 */
  layerSortBy: Ref<LayerSortBy>;
  /** 按实际坐标保持图层相对位置 */
  layerUseRealPositions: Ref<boolean>;
  /** 设置图层相对位置模式 */
  setLayerUseRealPositions: (v: boolean) => void;
  /** 移除图层 */
  removeLayer: (id: string) => void;

  /** 当前激活图层的类型映射 */
  activeLayerTypeMap: Ref<LammpsTypeMapRecord>;
  /** 当前激活图层的 typeId 列表 */
  activeLayerTypeIds: Ref<number[]>;
  /** 当前激活图层类型映射是否已应用 */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** 设置激活图层类型映射 */
  setActiveLayerTypeMap: (map: LammpsTypeMapRecord) => void;
  /** 将当前映射应用到所有图层（仅匹配已有 typeId） */
  applyTypeMapToAllLayers: (map: LammpsTypeMapRecord) => void;
  /** 将当前映射应用到所有可见图层 */
  applyTypeMapToVisibleLayers: (map: LammpsTypeMapRecord) => void;
  /** 重置所有图层类型映射为默认 */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateMap?: LammpsTypeMapRecord;
    useAtomDefaults?: boolean;
  }) => void;

  /** 当前激活图层的颜色映射 */
  activeLayerColorMap: Ref<ColorMapRecord>;
  /** 当前激活图层的颜色 key 顺序 */
  activeLayerColorKeys: Ref<string[]>;
  /** 设置激活图层颜色映射 */
  setActiveLayerColorMap: (map: ColorMapRecord) => void;
  /** 设置所有图层颜色映射 */
  setAllLayersColorMap: (map: ColorMapRecord) => void;
  /** 将当前颜色应用到所有可见图层 */
  setVisibleLayersColorMap: (map: ColorMapRecord) => void;
  /** 重置所有图层颜色映射为默认 */
  resetAllLayersColorMapToDefaults: () => void;
  /** 重置所有图层动画状态为默认（帧序 + 播放帧率） */
  resetAllLayersAnimToDefaults: () => void;

  /** 当前激活图层的显示设置 */
  activeLayerDisplay: Ref<DetailsSettingsGroup | null>;
  /** 设置激活图层显示参数 */
  setActiveLayerDisplay: (
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** 将当前显示参数应用到所有可见图层 */
  setVisibleLayersDisplay: (patch: Partial<DetailsSettingsGroup>) => void;
  /** 清空当前选中 */
  clearSelections: () => void;
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
    format?: 'png' | 'webp' | 'jpg';
    cropBox?: CropBox;
  }) => Promise<void>;
  exportPngWithSelection: (payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
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
  activeLayerTypeMap: Ref<LammpsTypeMapRecord>;
  /** 当前激活图层的 typeId 列表 */
  activeLayerTypeIds: Ref<number[]>;
  /** 当前激活图层类型映射是否已应用 */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** 设置激活图层类型映射 */
  setActiveLayerTypeMap: (map: LammpsTypeMapRecord) => void;
  /** 将当前映射应用到所有图层（仅匹配已有 typeId） */
  applyTypeMapToAllLayers: (map: LammpsTypeMapRecord) => void;
  /** 将当前映射应用到所有可见图层 */
  applyTypeMapToVisibleLayers: (map: LammpsTypeMapRecord) => void;
  /** 重置所有图层类型映射为默认 */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateMap?: LammpsTypeMapRecord;
    useAtomDefaults?: boolean;
  }) => void;

  /** 当前激活图层的颜色映射 */
  activeLayerColorMap: Ref<ColorMapRecord>;
  /** 当前激活图层的颜色 key 顺序 */
  activeLayerColorKeys: Ref<string[]>;
  /** 设置激活图层颜色映射 */
  setActiveLayerColorMap: (map: ColorMapRecord) => void;
  /** 设置所有图层颜色映射 */
  setAllLayersColorMap: (map: ColorMapRecord) => void;
  /** 将当前颜色应用到所有可见图层 */
  setVisibleLayersColorMap: (map: ColorMapRecord) => void;
  /** 重置所有图层颜色映射为默认 */
  resetAllLayersColorMapToDefaults: () => void;

  /** 当前激活图层显示设置 */
  activeLayerDisplay: Ref<DetailsSettingsGroup | null>;
  /** 设置激活图层显示参数 */
  setActiveLayerDisplay: (
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** 将当前显示参数应用到所有可见图层 */
  setVisibleLayersDisplay: (patch: Partial<DetailsSettingsGroup>) => void;
  /** 清空当前选中（可选清理缓存选中） */
  clearSelections: (opts?: { clearCached?: boolean }) => void;
  /** 立即应用视角/视距相关设置 */
  applyViewFromSettings: (overrides?: Partial<ViewerSettings>) => void;
  /** 平移模型（屏幕方向） */
  panModel: (dir: 'left' | 'right' | 'up' | 'down') => void;
  /** 当前平移目标视图 */
  panTargetSide: Ref<'left' | 'right' | 'single'>;
  /** 当前是否已平移（针对目标视图） */
  panDirty: ComputedRef<boolean>;
  /** 复位模型平移 */
  resetPan: () => void;
  /** 平移步长倍率 */
  panStepScale: ComputedRef<number>;
  /** 设置平移步长倍率 */
  setPanStepScale: (v: number) => void;

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
  patchSettings?: (patch: SettingsPatch) => void,
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

    const cur = settingsRef.value.view.rotationDeg;
    if (
      Math.abs(cur.x - next.x) < 1e-2
      && Math.abs(cur.y - next.y) < 1e-2
      && Math.abs(cur.z - next.z) < 1e-2
    ) {
      return;
    }

    settingsSync.patch({ view: { rotationDeg: next } });
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

      const a = settingsRef.value.rotation;
      const preset = getAutoRotatePreset(a.presetId);
      const sp = a.speedDegPerSec;
      const speedDegPerSec = Number.isFinite(sp) ? sp : preset.speedDegPerSec;
      const enabled = !!a.enabled && Math.abs(speedDegPerSec) > 1e-8;
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

  const activeLayerTypeMap = computed<LammpsTypeMapRecord>(() => {
    return (runtimeTick.value, runtime?.activeTypeMap.value ?? {});
  });

  const activeLayerTypeIds = computed<number[]>(() => {
    return (runtimeTick.value, runtime?.activeTypeIds.value ?? []);
  });

  const activeLayerTypeMapApplied = computed<boolean>(() => {
    return (runtimeTick.value, runtime?.activeTypeMapApplied.value ?? false);
  });

  function openLammpsPanelIfNeeded(): void {
    if (!runtime) return;
    const id = runtime.activeLayerId.value;
    const active = runtime.layers.value.find(l => l.id === id) ?? null;
    if (!active?.hasTypeId) return;
    const map = runtime.activeTypeMap.value ?? {};
    const typeIds = runtime.activeTypeIds.value ?? [];
    const hasUnknown = hasUnknownElementMappingForTypeIds(map, typeIds);
    if (!hasUnknown && Object.keys(map).length > 0) return;
    requestOpenSettings?.({
      focusKeys: [PANEL_KEYS.lammps],
      open: true,
    });
  }

  watch(
    () => activeLayerId.value,
    () => openLammpsPanelIfNeeded(),
  );

  watch(
    () => activeLayerId.value,
    () => inspectHelper.rehydrateFromSettings(),
  );

  watch(
    () => activeLayerId.value,
    () => {
      // 同步解析信息，包含文件大小
      // Sync parse info including file sizes
      syncUiFromRuntime();
    },
  );

  const activeLayerColorMap = computed<ColorMapRecord>(() => {
    return (runtimeTick.value, runtime?.activeColorMap.value ?? {});
  });

  const activeLayerColorKeys = computed<string[]>(() => {
    return (runtimeTick.value, runtime?.activeColorKeys.value ?? []);
  });

  const activeLayerDisplay = computed<DetailsSettingsGroup | null>(() => {
    return (runtimeTick.value, runtime?.activeDisplaySettings.value ?? null);
  });

  const visibleCustomColors = computed<boolean>(() => {
    return (runtimeTick.value, runtime?.visibleCustomColors.value ?? false);
  });

  // state
  const hasModel = ref(false);
  const isLoading = ref(false);
  const externalLoadingCount = ref(0);
  const uiLoading = computed(() => isLoading.value || externalLoadingCount.value > 0);
  const layerSortBy = ref<LayerSortBy>('name,ASC');
  const layerUseRealPositions = ref(DEFAULT_LAYER_USE_REAL_POSITIONS);
  // 记录“本次加载是否复用了缓存 LAMMPS 映射”。
  // Tracks whether current load reused cached LAMMPS mapping.
  let lammpsCacheReuseSeq = 0;
  // “全部隐藏已自动显示”提示去重时间戳（毫秒）。
  // Dedup timestamp (ms) for "all hidden -> force show all" notice.
  let allLayersForcedVisibleNoticeAt = 0;
  // 恢复流程提示去重作用域（同 key 仅提示一次）。
  // Restore notice dedupe scope (same key shown once).
  let restoreNoticeDepth = 0;
  const restoreNoticeSeen = new Set<string>();

  function beginRestoreNoticeScope(): void {
    restoreNoticeDepth += 1;
    if (restoreNoticeDepth === 1) restoreNoticeSeen.clear();
  }

  function endRestoreNoticeScope(): void {
    restoreNoticeDepth = Math.max(0, restoreNoticeDepth - 1);
    if (restoreNoticeDepth === 0) restoreNoticeSeen.clear();
  }

  function notifyOnceInRestore(
    level: 'info' | 'warning' | 'success' | 'error',
    key: string,
    content: string,
  ): void {
    if (restoreNoticeDepth > 0) {
      if (restoreNoticeSeen.has(key)) return;
      restoreNoticeSeen.add(key);
    }
    message[level](content);
  }
  // 仅在一次加载流程中收集新写入 sourceStore 的 layerId。
  // Collect layerIds written into sourceStore only within one load flow.
  let collectingLoadLayerIds = false;
  const currentLoadLayerIds = new Set<string>();

  // inspect
  const inspectCtx = createInspectCtx();
  const rawLayerSourceStore = createLayerSourceStore();

  const inspectHelper = createInspectSelectionHelper({
    inspectCtx,
    runtime: () => runtime,
    activeLayerId,
  });

  // 基于旧快照构建 LAMMPS 回退映射与颜色。
  // Build LAMMPS fallback mapping and colors from previous snapshot.
  function buildLammpsFallbackFromSnapshot(params: {
    currentTypeIds: number[];
    cachedMap: LammpsTypeMapRecord;
    cachedColors: ColorMapRecord;
  }): { typeMap: LammpsTypeMapRecord; colorMap: ColorMapRecord } | null {
    const nextTypeIds = Array.from(new Set(
      (params.currentTypeIds ?? [])
        .map(v => Math.max(1, Math.floor(Number(v))))
        .filter(v => Number.isFinite(v) && v > 0),
    )).sort((a, b) => a - b);
    if (nextTypeIds.length === 0) return null;

    const cachedMap = params.cachedMap ?? {};
    const cachedColors = parseColorMapRecord(params.cachedColors ?? {});
    const oldEntries = Object.entries(cachedMap)
      .map(([idRaw, elRaw]) => {
        const id = Number(idRaw);
        if (!Number.isFinite(id) || id <= 0) return null;
        const element = normalizeElementSymbol(String(elRaw ?? '')) || 'E';
        return { typeId: Math.floor(id), element };
      })
      .filter(Boolean) as Array<{ typeId: number; element: string }>;
    if (oldEntries.length === 0) return null;
    oldEntries.sort((a, b) => a.typeId - b.typeId);
    const oldByTypeId = new Map(oldEntries.map(item => [item.typeId, item]));

    const assigned = new Map<number, { element: string; oldTypeId?: number; oldElement?: string }>();
    const usedOldTypeIds = new Set<number>();

    // 优先按相同 typeId 命中，再按旧顺序补齐。
    // Prefer exact typeId matches, then fill by previous order.
    for (const tid of nextTypeIds) {
      const match = oldByTypeId.get(tid);
      if (!match) continue;
      assigned.set(tid, {
        element: match.element || 'E',
        oldTypeId: match.typeId,
        oldElement: match.element,
      });
      usedOldTypeIds.add(match.typeId);
    }

    let cursor = 0;
    for (const tid of nextTypeIds) {
      if (assigned.has(tid)) continue;
      while (cursor < oldEntries.length && usedOldTypeIds.has(oldEntries[cursor]!.typeId)) {
        cursor += 1;
      }
      if (cursor < oldEntries.length) {
        const pick = oldEntries[cursor]!;
        assigned.set(tid, {
          element: pick.element || 'E',
          oldTypeId: pick.typeId,
          oldElement: pick.element,
        });
        usedOldTypeIds.add(pick.typeId);
        cursor += 1;
      }
      else {
        assigned.set(tid, { element: 'E' });
      }
    }

    const nextTypeMap: LammpsTypeMapRecord = {};
    const nextColorMap: ColorMapRecord = {};
    for (const tid of nextTypeIds) {
      const item = assigned.get(tid);
      const element = normalizeElementSymbol(item?.element ?? '') || 'E';
      nextTypeMap[String(tid)] = element;

      const oldTypeId = item?.oldTypeId;
      const oldElement = normalizeElementSymbol(item?.oldElement ?? '') || '';
      if (!oldTypeId || !oldElement || oldElement === 'E') continue;

      const oldKey = `${oldElement}.${oldTypeId}`;
      const color = cachedColors[oldKey] ?? cachedColors[oldElement];
      if (!color) continue;

      const newKey = `${element}.${tid}`;
      nextColorMap[newKey] = color;
    }

    return { typeMap: nextTypeMap, colorMap: nextColorMap };
  }

  // 判断映射是否包含有效元素（非全 E）。
  // Checks whether a mapping contains resolved elements (not all placeholder E).
  function hasResolvedLammpsMapping(map: LammpsTypeMapRecord | undefined): boolean {
    return Object.values(map ?? {}).some(v => String(v ?? '').trim().toUpperCase() !== 'E');
  }

  // 从当前图层快照提取 typeId 列表，用于映射回填。
  // Extract typeIds from current layer snapshot for mapping fallback.
  function getCurrentTypeIdsForLayer(id: string): number[] {
    if (!runtime) return [];
    const curSnap = runtime.getLayerSnapshots().find(s => s.id === id);
    return Object.keys(curSnap?.lammps?.data ?? {})
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0);
  }

  const layerSourceStore = {
    set(id: string, data: import('../../lib/viewer/sessionTypes').LayerSourceData): void {
      rawLayerSourceStore.set(id, data);
      if (collectingLoadLayerIds) currentLoadLayerIds.add(id);
      inspectHelper.rehydrateFromSettings();
      if (!suppressLayerCacheRestore && data?.md5 && runtime) {
        const cached = getLayerSnapshotFromCache(data.md5);
        if (cached) {
          const currentTypeIds = getCurrentTypeIdsForLayer(id);
          let resolvedFromLatest: LayerSnapshot | null = null;
          const cachedMap = cached.lammps?.data ?? {};
          // 命中同 md5 缓存但映射全为 E 时，尝试用最近有效映射进行回填。
          // If same-md5 cache map is all E, try filling from latest resolved mapping.
          if (!hasResolvedLammpsMapping(cachedMap) && currentTypeIds.length > 0) {
            const latestResolved = getLatestLayerSnapshotWithResolvedLammps(data.md5);
            const latestMap = latestResolved?.lammps?.data ?? {};
            if (latestResolved && hasResolvedLammpsMapping(latestMap)) {
              const fallback = buildLammpsFallbackFromSnapshot({
                currentTypeIds,
                cachedMap: latestMap,
                cachedColors: latestResolved.colors?.data ?? {},
              });
              if (fallback) {
                resolvedFromLatest = {
                  ...cached,
                  lammps: { data: fallback.typeMap },
                  colors: { data: fallback.colorMap },
                };
              }
            }
          }
          // 新载入模型不沿用缓存的可见性，默认显示。
          // Do not reuse cached visibility for newly loaded models; default to visible.
          const sanitized: LayerSnapshot = {
            ...(resolvedFromLatest ?? cached),
            visible: true,
          };
          runtime.applyLayerSnapshots([sanitized]);
          if (Object.keys(sanitized.lammps?.data ?? {}).length > 0) lammpsCacheReuseSeq += 1;
          runtimeTick.value += 1;
          syncUiFromRuntime();
          scheduleSessionSave('layers');
          return;
        }

        // LAMMPS 新模型无缓存时，回退到最近一次快照。
        // Fallback to the latest snapshot for LAMMPS when no md5 cache exists.
        const layerInfo = runtime.layers.value.find(l => l.id === id);
        if (!layerInfo?.hasTypeId) return;

        const latest = getLatestLayerSnapshotWithResolvedLammps(data.md5)
          ?? getLatestLayerSnapshotFromCache(data.md5);
        if (!latest) return;
        const latestMap = latest.lammps?.data ?? {};
        if (Object.keys(latestMap).length === 0) return;

        const currentTypeIds = getCurrentTypeIdsForLayer(id);
        const fallback = buildLammpsFallbackFromSnapshot({
          currentTypeIds,
          cachedMap: latestMap,
          cachedColors: latest.colors?.data ?? {},
        });
        if (!fallback) return;

        const sanitized: LayerSnapshot = {
          source: layerInfo.source ? { ...layerInfo.source } : { md5: data.md5 },
          visible: true,
          lammps: { data: fallback.typeMap },
          colors: { data: fallback.colorMap },
          details: latest.details ? { ...latest.details } : undefined,
        };
        runtime.applyLayerSnapshots([sanitized]);
        if (Object.keys(sanitized.lammps?.data ?? {}).length > 0) lammpsCacheReuseSeq += 1;
        runtimeTick.value += 1;
        syncUiFromRuntime();
        scheduleSessionSave('layers');
      }
    },
    get(id: string) {
      return rawLayerSourceStore.get(id);
    },
    delete(id: string): void {
      rawLayerSourceStore.delete(id);
    },
    clear(): void {
      rawLayerSourceStore.clear();
    },
    entries(): IterableIterator<[string, import('../../lib/viewer/sessionTypes').LayerSourceData]> {
      return rawLayerSourceStore.entries();
    },
  };
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
    () => settingsRef.value.files.cacheRemoteOnExport,
    (v) => {
      if (typeof v === 'boolean') {
        setCacheRemoteOnExportFlag(v);
      }
    },
    { immediate: true },
  );
  let sessionSaveTimer: number | null = null;
  // 恢复会话期间不保存，避免卡顿与重复写入。
  // Skip session saves during restore to avoid stutter and redundant writes.
  let suppressSessionSave = false;
  let lastSessionSignature = '';
  // 避免在批量还原会话时触发本地缓存回填。
  // Suppress cache-based layer restores during session replay.
  let suppressLayerCacheRestore = false;

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
    if (suppressSessionSave) return;
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

    // 缓存最近图层快照（保留未加载的最近 5 条）。
    // Cache latest layer snapshots (keep last 5 unloaded).
    const loadedMd5s = new Set<string>();
    for (const snap of layerSnapshots) {
      if (snap.source?.md5) loadedMd5s.add(snap.source.md5);
    }
    saveLayerSnapshotCache({ layerSnapshots, loadedMd5s });

    const snapshot = buildSettingsSnapshot(
      settingsRef.value,
      layerSnapshots,
      layerUseRealPositions.value,
      undefined,
      layerSortBy.value,
      runtime?.activeLayerId.value ?? null,
    );
    const sources = collectLayerSources();
    const curSettings = settingsRef.value;
    const sig = JSON.stringify({
      settings: {
        rotationDeg: curSettings.view.rotationDeg,
        dualViewDistance: curSettings.view.dualViewDistance,
        panOffset: curSettings.pan.panOffset,
        panOffsetLeft: curSettings.pan.panOffsetLeft,
        panOffsetRight: curSettings.pan.panOffsetRight,
        panStepScale: curSettings.other.panStepScale,
        backgroundColor: curSettings.other.backgroundColor,
        backgroundTransparent: curSettings.other.backgroundTransparent,
        backgroundColorMode: curSettings.other.backgroundColorMode,
        recordFps: curSettings.record.frame_rate,
        recordDelaySec: curSettings.record.recordDelaySec,
        recordCropBox: curSettings.record.recordCropBox,
      },
      layerUseRealPositions: layerUseRealPositions.value,
      layers: layerSnapshots.map((s) => {
        const atomScale = s.details?.atomScale ?? 0;
        const lammpsCount = s.lammps?.data ? Object.keys(s.lammps.data).length : 0;
        // 把 LAMMPS 映射内容纳入签名，避免“数量不变但元素已变化”时漏保存。
        // Include LAMMPS mapping content in signature so value-only changes are persisted.
        const lammpsSig = Object.entries(s.lammps?.data ?? {})
          .map(([k, v]) => `${String(k).trim()}:${String(v ?? '').trim().toUpperCase()}`)
          .sort()
          .join('|');
        const colorCount = Object.keys(s.colors?.data ?? {}).length;
        const playFps = s.anim?.playFps ?? 0;
        const frameIndex = s.anim?.frameIndex ?? 0;
        return `${s.source?.md5 ?? s.id}:${s.visible ? 1 : 0}:${atomScale}:${lammpsCount}:${lammpsSig}:${colorCount}:${playFps}:${frameIndex}`;
      }),
      sources: sources.map(s => `${s.md5 ?? s.layerId}:${s.size ?? 0}:${s.cached ? 1 : 0}`),
    });
    if (sig === lastSessionSignature) return;
    lastSessionSignature = sig;
    await saveSessionToStorage(snapshot, sources);
    // 同步缓存后的压缩大小到图层来源
    // Sync cached compressed sizes into layer sources
    syncStoredSizesFromCache();
  }

  function syncStoredSizesFromCache(): void {
    if (!runtime) return;
    const sizeMap = readSessionCacheSizeMap();
    if (!sizeMap || Object.keys(sizeMap).length === 0) return;
    let changed = false;
    for (const layer of runtime.layers.value ?? []) {
      const md5 = layer.source?.md5;
      if (!md5) continue;
      const cachedSize = sizeMap[md5];
      if (!Number.isFinite(cachedSize)) continue;
      if (layer.source?.storedSize === cachedSize) continue;
      layer.source = {
        ...(layer.source ?? {}),
        storedSize: cachedSize,
      };
      changed = true;
    }
    if (changed) {
      runtimeTick.value += 1;
      syncUiFromRuntime();
    }
  }

  function scheduleSessionSave(reason: 'settings' | 'layers' = 'layers'): void {
    if (suppressSessionSave) {
      if (sessionSaveTimer) {
        window.clearTimeout(sessionSaveTimer);
        sessionSaveTimer = null;
      }
      return;
    }
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
    getRecordFps: () => settingsRef.value.record.frame_rate ?? 60,
    getRecordBox: () => settingsRef.value.record.recordCropBox,
    onRecordBoxChange: (box) => {
      settingsSync.patch({ record: { recordCropBox: box } });
    },
    getModelFileName: () => modelFileNameProvider(),
  });

  // 同步录制设置（延时与裁剪框）到运行时。
  // Sync record settings (delay and crop box) into runtime.
  watch(
    () => settingsRef.value.record.recordDelaySec,
    (v) => {
      if (!Number.isFinite(v)) return;
      const next = Math.max(0, Number(v));
      if (recording.recordDelaySec.value === next) return;
      recording.recordDelaySec.value = next;
    },
    { immediate: true },
  );

  watch(
    () => recording.recordDelaySec.value,
    (v) => {
      if (!Number.isFinite(v)) return;
      const next = Math.max(0, Number(v));
      if (settingsRef.value.record.recordDelaySec === next) return;
      settingsSync.patch({ record: { recordDelaySec: next } });
    },
  );

  watch(
    () => settingsRef.value.record.recordCropBox,
    (box) => {
      recording.setLastRecordBox(box ?? null);
    },
    { immediate: true, deep: true },
  );

  // picking (attach after stage created)
  const picking = createViewerPickingController({
    settingsRef,
    getStage: () => stage,
    getRuntime: () => runtime,
    patchSettings: settingsSync.patch,
    onRotationCommitted: () => scheduleSessionSave('settings'),
    inspectCtx,
    isSelectingRecordArea: recording.isSelectingRecordArea,
  });
  inspectHelper.setPicking(picking);
  inspectHelper.rehydrateFromSettings();

  watch(
    () => inspectCtx.selected.value,
    (sel) => {
      inspectHelper.onSelectionChanged(sel);
      picking.rebuildSelectionVisualsFromSelected();
    },
    { deep: true },
  );

  watch(
    () => runtimeTick.value,
    () => {
      inspectHelper.rehydrateFromSettings();
    },
  );

  watch(
    () => settingsRef.value.other.selectionHighlightColor,
    () => {
      picking.updateSelectionVisuals();
    },
  );

  watch(
    () => settingsRef.value.other.showSelectionLines,
    () => {
      picking.updateSelectionVisuals();
    },
  );
  // animation
  const anim = createViewerAnimationController({
    getRuntime: () => runtime,
    settingsRef,
    inspectCtx,
    onSelectionVisualsNeedUpdate: () => picking.updateSelectionVisuals(),
    wakeRender: () => stage?.invalidate(),
  });

  // 记录当前图层播放帧率（每层持久化）。
  // Persist per-layer playback fps.
  watch(
    () => anim.fps.value,
    (v) => {
      if (!runtime || !Number.isFinite(v)) return;
      runtime.setActiveLayerPlayFps?.(Math.max(1, Math.floor(Number(v))));
      scheduleSessionSave('layers');
    },
  );

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
    rehydrateSelectionFromSettings: () => inspectHelper.rehydrateFromSettings(),
    // 初次解析时优先使用同 md5 缓存映射，避免先空映射再二次刷新。
    // Prefer same-md5 cached map at initial parse to avoid two-phase remap flicker.
    resolveCachedLammpsTypeMap: ({ sourceMeta }) => {
      const md5 = String(sourceMeta?.md5 ?? '').trim().toLowerCase();
      if (!md5) return undefined;
      const cached = getLayerSnapshotFromCache(md5);
      const map = cached?.lammps?.data ?? {};
      const out: LammpsTypeMapRecord = {};
      for (const [k, v] of Object.entries(map)) {
        const key = String(k ?? '').trim();
        const val = String(v ?? '').trim().toUpperCase();
        if (!key || !val || val === 'E') continue;
        out[key] = val;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    },
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
    setExportScale: (scale: number) => {
      settingsSync.patch({ files: { exportPngScale: scale } });
    },
    t,
  });

  function exportPngWithSelection(payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
  }): void {
    recording.selectExportArea({
      hint: t('viewer.export.selectHint'),
      confirmLabel: t('viewer.export.selectConfirm'),
      cancelLabel: t('viewer.export.selectCancel'),
      onConfirm: (box) => {
        return exporter.onExportPng({
          scale: payload.scale,
          transparent: payload.transparent,
          format: payload.format,
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

  function clearSamplesParam(): void {
    writeUrlListParam('samples', []);
  }

  function beginExternalLoading(): void {
    externalLoadingCount.value += 1;
  }

  function endExternalLoading(): void {
    externalLoadingCount.value = Math.max(0, externalLoadingCount.value - 1);
  }

  type LoadWithSessionOpts = {
    hidePreviousLayers?: boolean;
    forcedLayerId?: string;
    suppressLammpsWarning?: boolean;
    suppressSessionSave?: boolean;
    suppressNotices?: boolean;
  };

  // 检查指定图层是否仍含未解析映射（E 占位）。
  // Checks whether specified layers still contain unresolved mapping (placeholder E).
  function hasUnknownLammpsForLayers(layerIds: string[]): boolean {
    if (!runtime || layerIds.length === 0) return false;
    const snapById = new Map(runtime.getLayerSnapshots().map(s => [s.id, s]));
    return layerIds.some((id) => {
      const snap = snapById.get(id);
      return Object.values(snap?.lammps?.data ?? {})
        .some(v => String(v ?? '').trim().toUpperCase() === 'E');
    });
  }

  // 在加载结束后统一提示 LAMMPS 映射状态，避免和自动缓存回填冲突。
  // Finalize LAMMPS mapping notice after load to avoid conflict with cache auto-remap.
  function finalizeLammpsMappingNotice(params: {
    suppress?: boolean;
    reuseSeqBefore: number;
    loadedLayerIds: string[];
  }): void {
    if (params.suppress) return;
    const reusedFromCache = lammpsCacheReuseSeq > params.reuseSeqBefore;
    if (reusedFromCache) {
      requestOpenSettings?.({
        focusKeys: [PANEL_KEYS.lammps],
        open: true,
      });
      notifyOnceInRestore('warning', 'viewer.lammps.mappingReused', t('viewer.lammps.mappingReused'));
      return;
    }
    if (!hasUnknownLammpsForLayers(params.loadedLayerIds)) return;
    requestOpenSettings?.({
      focusKeys: [PANEL_KEYS.lammps],
      open: true,
    });
    notifyOnceInRestore('warning', 'viewer.lammps.mappingMissing', t('viewer.lammps.mappingMissing'));
  }

  async function loadFileWithSession(
    file: File,
    opts?: LoadWithSessionOpts,
  ): Promise<void> {
    clearSamplesParam();
    beginExternalLoading();
    const reuseSeqBefore = lammpsCacheReuseSeq;
    collectingLoadLayerIds = true;
    currentLoadLayerIds.clear();
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        await loadFilesWithSession([file], 'api', opts);
        return;
      }
      await loader.loadFile(file, opts);
      finalizeLammpsMappingNotice({
        suppress: opts?.suppressLammpsWarning,
        reuseSeqBefore,
        loadedLayerIds: Array.from(currentLoadLayerIds),
      });
      if (!opts?.suppressSessionSave) {
        scheduleSessionSave('layers');
        await persistSessionSnapshot();
      }
    }
    finally {
      collectingLoadLayerIds = false;
      currentLoadLayerIds.clear();
      endExternalLoading();
    }
  }

  async function loadFilesWithSession(
    files: File[],
    _source?: 'drop' | 'picker' | 'api',
    opts?: LoadWithSessionOpts,
  ): Promise<void> {
    clearSamplesParam();
    beginExternalLoading();
    const reuseSeqBefore = lammpsCacheReuseSeq;
    collectingLoadLayerIds = true;
    currentLoadLayerIds.clear();
    try {
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
      finalizeLammpsMappingNotice({
        suppress: opts?.suppressLammpsWarning,
        reuseSeqBefore,
        loadedLayerIds: Array.from(currentLoadLayerIds),
      });
      if (!opts?.suppressSessionSave) {
        scheduleSessionSave('layers');
        await persistSessionSnapshot();
      }
    }
    finally {
      collectingLoadLayerIds = false;
      currentLoadLayerIds.clear();
      endExternalLoading();
    }
  }

  async function loadUrlWithSession(
    url: string,
    fileName: string,
    opts?: LoadWithSessionOpts,
  ): Promise<void> {
    clearSamplesParam();
    beginExternalLoading();
    const reuseSeqBefore = lammpsCacheReuseSeq;
    collectingLoadLayerIds = true;
    currentLoadLayerIds.clear();
    try {
      if (isZipUrl(url, fileName)) {
        const zipFile = await fetchUrlAsFile(url, fileName);
        await importProjectPackage(zipFile);
        scheduleSessionSave('layers');
        return;
      }
      await loader.loadUrl(url, fileName, opts);
      finalizeLammpsMappingNotice({
        suppress: opts?.suppressLammpsWarning,
        reuseSeqBefore,
        loadedLayerIds: Array.from(currentLoadLayerIds),
      });
      if (!opts?.suppressSessionSave) {
        scheduleSessionSave('layers');
        await persistSessionSnapshot();
      }
    }
    finally {
      collectingLoadLayerIds = false;
      currentLoadLayerIds.clear();
      endExternalLoading();
    }
  }

  async function loadUrlsWithSession(
    items: { url: string; fileName: string; forcedLayerId?: string }[],
    opts?: {
      hidePreviousLayers?: boolean;
      suppressLammpsWarning?: boolean;
      suppressSessionSave?: boolean;
      suppressNotices?: boolean;
    },
  ): Promise<void> {
    clearSamplesParam();
    if (!items || items.length === 0) return;
    beginExternalLoading();
    const reuseSeqBefore = lammpsCacheReuseSeq;
    collectingLoadLayerIds = true;
    currentLoadLayerIds.clear();
    try {
      const zipItems = items.filter(item => isZipUrl(item.url, item.fileName));
      const otherItems = items.filter(item => !zipItems.includes(item));

      if (zipItems.length > 0) {
        for (const item of zipItems) {
          const zipFile = await fetchUrlAsFile(item.url, item.fileName);
          await importProjectPackage(zipFile);
        }
      }

      if (otherItems.length > 0) {
        const mergedOpts = zipItems.length > 0
          ? { ...(opts ?? {}), hidePreviousLayers: false }
          : opts;
        await loader.loadUrls(otherItems, mergedOpts);
        finalizeLammpsMappingNotice({
          suppress: opts?.suppressLammpsWarning,
          reuseSeqBefore,
          loadedLayerIds: Array.from(currentLoadLayerIds),
        });
      }
    }
    finally {
      collectingLoadLayerIds = false;
      currentLoadLayerIds.clear();
      endExternalLoading();
    }

    if (items.length > 0 && !opts?.suppressSessionSave) {
      scheduleSessionSave('layers');
      await persistSessionSnapshot();
    }
  }

  function isZipUrl(url: string, fileName?: string): boolean {
    const name = (fileName ?? '').toLowerCase();
    if (name.endsWith('.zip')) return true;
    const cleanUrl = (url.split('?')[0] ?? '').toLowerCase();
    return cleanUrl.endsWith('.zip');
  }

  async function fetchUrlAsFile(url: string, fileName?: string): Promise<File> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const blob = await res.blob();
    const urlBase = url.split('?')[0] ?? '';
    const urlName = urlBase.split('/').pop() || 'remote.zip';
    let name = (fileName && fileName.trim()) || urlName;
    if (!name.toLowerCase().endsWith('.zip')) name = `${name}.zip`;
    return new File([blob], name, { type: blob.type || 'application/zip' });
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

  function normalizeLayersSnapshot(
    layers: unknown,
  ): LayersSnapshot | undefined {
    if (!layers) return undefined;
    if (Array.isArray(layers)) {
      const data: Record<string, LayerSnapshot> = {};
      layers.forEach((snap, idx) => {
        if (!snap || typeof snap !== 'object') return;
        const raw = snap as LayerSnapshot;
        const id = raw.id ?? `layer_${idx + 1}`;
        data[id] = { ...raw, id };
      });
      return { sortBy: 'name,ASC', data };
    }
    if (typeof layers === 'object') {
      const anyLayers = layers as LayersSnapshot;
      if (anyLayers.data && typeof anyLayers.data === 'object') return anyLayers;
    }
    return undefined;
  }

  async function applySessionSnapshot(
    snapshot: import('../../lib/viewer/sessionTypes').SessionSnapshot,
    files?: File[],
    opts?: { suppressSessionSave?: boolean },
  ): Promise<void> {
    if (!snapshot) return;
    if (!runtime && !(await waitForRuntimeReady())) return;
    if (!runtime) return;
    beginRestoreNoticeScope();
    suppressLayerCacheRestore = true;
    if (opts?.suppressSessionSave) {
      suppressSessionSave = true;
    }
    try {
    // 过滤掉配置文件，只保留模型文件
      const importFiles = (files ?? []).filter(f => f.name.toLowerCase() !== 'config.json');
      const hasFiles = importFiles.length > 0;
      const normalizedLayers = normalizeLayersSnapshot(snapshot.layers);
      const activeLayerIdFromSnapshot = normalizedLayers?.activeId ?? null;
      const { sortBy, snaps: layerSnaps } = sortLayerSnapshots(normalizedLayers);
      layerUseRealPositions.value = normalizedLayers?.useRealLayerPositions ?? DEFAULT_LAYER_USE_REAL_POSITIONS;
      // 先还原设置
      const rawSettings = (snapshot.settings && typeof snapshot.settings === 'object')
        ? snapshot.settings as any
        : {};
      const settingsPatched = mergeCategorizedSettings(rawSettings as any) as ViewerSettings;
      if (patchSettings) {
        settingsSync.suspend(300);
        patchSettings(settingsPatched);
        // 同步主题到全局
        if (settingsPatched.other.themeMode) {
          setThemeMode(settingsPatched.other.themeMode as any);
        }
      }

      if (!hasFiles && layerSnaps.length === 0) {
        notifyOnceInRestore('success', 'settings.importSuccess', t('settings.importSuccess'));
        return;
      }

      runtime.clearModel();
      layerSourceStore.clear();

      const renameFile = (file: File, name?: string): File => {
        if (!name || name === file.name) return file;
        return new File([file], name, { type: file.type });
      };

      const filesByMd5 = new Map<string, File>();
      for (const f of importFiles) {
        const md5 = guessMd5FromName(f.name);
        if (md5) filesByMd5.set(md5, f);
      }

      for (const layer of layerSnaps) {
        const md5 = layer.source?.md5?.toLowerCase();
        const file = md5 ? filesByMd5.get(md5) : undefined;
        if (file) {
          const fileWithName = renameFile(file, layer.source?.fileName ?? layer.name);
          await loadFilesWithSession([fileWithName], 'api', {
            hidePreviousLayers: false,
            forcedLayerId: layer.id,
            suppressLammpsWarning: true,
            suppressSessionSave: opts?.suppressSessionSave,
            suppressNotices: true,
          });
          continue;
        }

        const url = layer.source?.url;
        if (url) {
          await loadUrlsWithSession(
            [{
              url,
              fileName: layer.source?.fileName ?? layer.name ?? 'remote',
              forcedLayerId: layer.id,
            }],
            {
              hidePreviousLayers: false,
              suppressLammpsWarning: true,
              suppressSessionSave: opts?.suppressSessionSave,
              suppressNotices: true,
            },
          );
        }
      }

      // 应用每层的外观/颜色/LAMMPS 设置，并恢复视角
      runtime.applyLayerSnapshots(layerSnaps);
      forceAllLayersVisibleIfAllHidden({ notify: true });
      syncUiFromRuntime();
      const hasUnknownLammps = layerSnaps.some(s =>
        Object.values(s.lammps?.data ?? {}).some(v => String(v ?? '').trim().toUpperCase() === 'E'),
      );
      if (hasUnknownLammps) {
        requestOpenSettings?.({
          focusKeys: [PANEL_KEYS.lammps],
          open: true,
        });
        notifyOnceInRestore('warning', 'viewer.lammps.mappingMissing', t('viewer.lammps.mappingMissing'));
      }
      if (activeLayerIdFromSnapshot) {
        const target = runtime.layers.value.find(l => l.id === activeLayerIdFromSnapshot) ?? null;
        if (target) runtime.setActiveLayer(target.id);
      }
      if (runtime.layers.value.length > 1) {
        layerSortBy.value = sortBy;
        runtime.sortLayers((a, b) => compareModelLayers(a, b, sortBy));
      }
      runtimeTick.value += 1;
      applyViewFromSettings(settingsPatched);
      if (runtime.layers.value.length > 0) {
        notifyOnceInRestore('info', 'viewer.settings.modifiedHint', t('viewer.settings.modifiedHint'));
      }
      if (!opts?.suppressSessionSave) scheduleSessionSave('layers');

      if (runtime.layers.value.length > 0) {
        notifyOnceInRestore('success', 'settings.importSuccess', t('settings.importSuccess'));
      }
      else {
        notifyOnceInRestore('success', 'settings.importSuccess', t('settings.importSuccess'));
      }
    }
    finally {
      suppressLayerCacheRestore = false;
      suppressSessionSave = false;
      endRestoreNoticeScope();
    }
  }

  // 清空当前已加载图层的选中。
  // Clear selections for loaded layers only.
  function clearSelections(): void {
    if (!runtime) return;
    inspectCtx.selected.value = [];
    for (const layer of runtime.layers.value) {
      runtime.setLayerInspectSelection?.(layer.id, []);
    }
    picking.rebuildSelectionVisualsFromSelected();
    scheduleSessionSave('layers');
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
    // 同步当前图层播放帧率到动画控制器。
    // Sync active-layer play fps into the animation controller.
    const nextFps = runtime.getActiveLayerPlayFps?.();
    if (Number.isFinite(nextFps)) {
      anim.fps.value = Math.max(1, Math.floor(Number(nextFps)));
    }

    const activeId = runtime.activeLayerId.value;
    const layer = runtime.layers.value.find(x => x.id === activeId) ?? null;
    if (layer) {
      loader.parseInfo.fileName = layer.source?.fileName ?? layer.name;
      loader.parseInfo.format = layer.sourceFormat ?? loader.parseInfo.format;
      loader.parseInfo.atomCount = layer.atomCount;
      loader.parseInfo.frameCount = layer.frameCount;
      // 同步文件大小信息到解析面板
      // Sync file size info into parse panel
      loader.parseInfo.fileSize = Number.isFinite(layer.source?.size)
        ? Number(layer.source?.size)
        : null;
      loader.parseInfo.storedSize = Number.isFinite(layer.source?.storedSize)
        ? Number(layer.source?.storedSize)
        : null;
    }
  }

  function setActiveLayer(id: string): void {
    if (!runtime) return;
    runtime.setActiveLayer(id);
    syncUiFromRuntime();
  }

  // 图层可见性兜底：若恢复后全部图层都被隐藏，则强制显示全部并提示用户。
  // Layer visibility fallback: if all layers are hidden after restore, force-show all and notify.
  function forceAllLayersVisibleIfAllHidden(opts?: { notify?: boolean }): boolean {
    if (!runtime) return false;
    const layers = runtime.layers.value;
    if (layers.length === 0) return false;
    const allHidden = layers.every(l => !l.visible);
    if (!allHidden) return false;
    runtime.setAllLayersVisible(true);
    const first = layers[0] ?? null;
    if (first) runtime.setActiveLayer(first.id);
    if (opts?.notify !== false) {
      const now = Date.now();
      // 同一恢复流程里可能被多次触发，这里做短时间去重，避免重复提示。
      // May be triggered multiple times in one restore flow; dedupe within a short window.
      if (now - allLayersForcedVisibleNoticeAt > 1200) {
        allLayersForcedVisibleNoticeAt = now;
        notifyOnceInRestore('info', 'viewer.layers.allLayersForcedVisible', t('viewer.layers.allLayersForcedVisible'));
      }
    }
    return true;
  }

  function setLayerVisible(id: string, visible: boolean): void {
    if (!runtime) return;
    // Keep active selection when hiding a layer, if enabled.
    // 若启用，则隐藏图层时保留选中状态。
    const keepActiveOnHide = settingsRef.value.other.keepActiveLayerOnHide ?? false;
    runtime.setLayerVisible(id, visible);
    if (!visible && keepActiveOnHide) {
      runtime.setActiveLayer(id);
    }
    runtimeTick.value += 1;
    syncUiFromRuntime();
    if (!visible && runtime.activeLayerId.value === id) {
      anim.stopPlay();
    }
    scheduleSessionSave('layers');
  }

  function setAllLayersVisible(visible: boolean): void {
    if (!runtime) return;
    runtime.setAllLayersVisible(visible);
    syncUiFromRuntime();
    if (!visible) {
      anim.stopPlay();
    }
    scheduleSessionSave('layers');
  }

  function parseLayerSort(
    sortBy: LayerSortBy,
  ): { by: 'time' | 'name'; direction: 'asc' | 'desc' } {
    if (sortBy === 'time,DESC') return { by: 'time', direction: 'desc' };
    if (sortBy === 'name,DESC') return { by: 'name', direction: 'desc' };
    if (sortBy === 'time,ASC') return { by: 'time', direction: 'asc' };
    return { by: 'name', direction: 'asc' };
  }

  function getLayerDisplayName(l: ModelLayerInfo): string {
    const name = String(l?.name ?? '').trim();
    const file = String(l?.source?.fileName ?? '').trim();
    return (name || file || String(l?.id ?? '')).toLowerCase();
  }

  function compareModelLayers(
    a: ModelLayerInfo,
    b: ModelLayerInfo,
    sortBy: LayerSortBy,
  ): number {
    const { by, direction } = parseLayerSort(sortBy);
    const dir = direction === 'desc' ? -1 : 1;
    if (by === 'time') {
      const ta = Number.isFinite(a.createdAtMs) ? Number(a.createdAtMs) : 0;
      const tb = Number.isFinite(b.createdAtMs) ? Number(b.createdAtMs) : 0;
      if (ta === tb) return 0;
      return ta < tb ? -dir : dir;
    }
    const na = getLayerDisplayName(a);
    const nb = getLayerDisplayName(b);
    if (na !== nb) return na < nb ? -dir : dir;
    const ta = Number.isFinite(a.createdAtMs) ? Number(a.createdAtMs) : 0;
    const tb = Number.isFinite(b.createdAtMs) ? Number(b.createdAtMs) : 0;
    if (ta === tb) return 0;
    return ta < tb ? -dir : dir;
  }

  function compareSnapshots(
    a: LayerSnapshot,
    b: LayerSnapshot,
    sortBy: LayerSortBy,
  ): number {
    const { by, direction } = parseLayerSort(sortBy);
    const dir = direction === 'desc' ? -1 : 1;
    if (by === 'time') {
      const ta = Number.isFinite(a.createdAtMs) ? Number(a.createdAtMs) : 0;
      const tb = Number.isFinite(b.createdAtMs) ? Number(b.createdAtMs) : 0;
      if (ta === tb) return 0;
      return ta < tb ? -dir : dir;
    }
    const na = String(a?.name ?? a?.source?.fileName ?? a?.id ?? '').trim().toLowerCase();
    const nb = String(b?.name ?? b?.source?.fileName ?? b?.id ?? '').trim().toLowerCase();
    if (na !== nb) return na < nb ? -dir : dir;
    const ta = Number.isFinite(a.createdAtMs) ? Number(a.createdAtMs) : 0;
    const tb = Number.isFinite(b.createdAtMs) ? Number(b.createdAtMs) : 0;
    if (ta === tb) return 0;
    return ta < tb ? -dir : dir;
  }

  function sortLayerSnapshots(
    layers: LayersSnapshot | undefined,
  ): { sortBy: LayerSortBy; snaps: LayerSnapshot[] } {
    const sortBy = layers?.sortBy ?? 'name,ASC';
    const snaps = layers?.data ? Object.values(layers.data) : [];
    if (snaps.length < 2) return { sortBy, snaps };
    return { sortBy, snaps: [...snaps].sort((a, b) => compareSnapshots(a, b, sortBy)) };
  }

  function sortLayers(opts: { by: 'time' | 'name'; direction: 'asc' | 'desc' }): void {
    if (!runtime) return;
    const nextSortBy: LayerSortBy = `${opts.by},${opts.direction.toUpperCase()}` as LayerSortBy;
    layerSortBy.value = nextSortBy;
    runtime.sortLayers((a, b) => compareModelLayers(a, b, nextSortBy));
    scheduleSessionSave('layers');
  }

  function setLayerUseRealPositions(v: boolean): void {
    layerUseRealPositions.value = !!v;
    runtime?.applyLayerPositioningMode();
    scheduleSessionSave('layers');
  }

  function setActiveLayerTypeMap(map: LammpsTypeMapRecord): void {
    if (!runtime) return;
    runtime.setActiveLayerTypeMap(map);
    scheduleSessionSave('layers');
    // 立即持久化 LAMMPS 映射，避免刷新前未写入。
    // Persist LAMMPS mapping immediately to avoid missing restore.
    void persistSessionSnapshot();
  }

  function resetAllLayersTypeMapToDefaults(
    opts?: {
      templateMap?: LammpsTypeMapRecord;
      useAtomDefaults?: boolean;
    },
  ): void {
    if (!runtime) return;
    runtime.resetAllLayersTypeMapToDefaults(opts);
    syncUiFromRuntime();
    scheduleSessionSave('layers');
    // 立即持久化 LAMMPS 默认映射恢复。
    // Persist LAMMPS default mapping reset immediately.
    void persistSessionSnapshot();
  }

  function applyTypeMapToAllLayers(map: LammpsTypeMapRecord): void {
    if (!runtime) return;
    runtime.applyTypeMapToAllLayers(map);
    syncUiFromRuntime();
    scheduleSessionSave('layers');
    // 立即持久化批量映射应用结果。
    // Persist bulk mapping application immediately.
    void persistSessionSnapshot();
  }

  function applyTypeMapToVisibleLayers(map: LammpsTypeMapRecord): void {
    if (!runtime) return;
    runtime.applyTypeMapToVisibleLayers(map);
    syncUiFromRuntime();
    scheduleSessionSave('layers');
    void persistSessionSnapshot();
  }

  function setActiveLayerColorMap(map: ColorMapRecord): void {
    if (!runtime) return;
    runtime.setActiveLayerColorMap(map);
    scheduleSessionSave('layers');
  }

  function setAllLayersColorMap(map: ColorMapRecord): void {
    if (!runtime) return;
    runtime.setAllLayersColorMap(map);
    scheduleSessionSave('layers');
  }

  function setVisibleLayersColorMap(map: ColorMapRecord): void {
    if (!runtime) return;
    runtime.setVisibleLayersColorMap(map);
    scheduleSessionSave('layers');
  }

  function resetAllLayersColorMapToDefaults(): void {
    if (!runtime) return;
    runtime.resetAllLayersColorMapToDefaults();
    syncUiFromRuntime();
    scheduleSessionSave('layers');
  }

  // 重置所有图层动画状态并同步 UI。
  // Reset all layers animation state and sync UI.
  function resetAllLayersAnimToDefaults(): void {
    if (!runtime) return;
    runtime.resetAllLayersAnimToDefaults();
    syncUiFromRuntime();
    scheduleSessionSave('layers');
  }

  function setActiveLayerDisplay(
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean },
  ): void {
    if (!runtime) return;
    runtime.setActiveLayerDisplaySettings(patch, opts);
    syncUiFromRuntime();
    picking.updateSelectionVisuals();
    scheduleSessionSave('layers');
  }

  function setVisibleLayersDisplay(patch: Partial<DetailsSettingsGroup>): void {
    if (!runtime) return;
    runtime.setVisibleLayersDisplaySettings(patch);
    syncUiFromRuntime();
    picking.updateSelectionVisuals();
    scheduleSessionSave('layers');
  }

  function removeLayer(id: string): void {
    if (!runtime) return;
    // 删除图层时仅移除该图层的选中项。
    // When removing a layer, drop only selections from that layer.
    const nextSelected = inspectCtx.selected.value.filter(item => item.layerId !== id);
    if (nextSelected.length !== inspectCtx.selected.value.length) {
      inspectCtx.selected.value = nextSelected;
      picking.rebuildSelectionVisualsFromSelected();
    }
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
      view: {
        ...base.view,
        ...(overrides?.view ?? {}),
        rotationDeg: overrides?.view?.rotationDeg
          ? { ...base.view.rotationDeg, ...overrides.view.rotationDeg }
          : base.view.rotationDeg,
      },
      rotation: {
        ...base.rotation,
        ...(overrides?.rotation ?? {}),
      },
    };

    const presets = normalizeViewPresets(next.view.viewPresets);
    stage.setViewPresets(presets);

    const split = next.view.dualViewSplit;
    if (typeof split === 'number' && Number.isFinite(split)) {
      stage.setDualViewSplit(split);
    }

    stage.setProjectionMode(!!next.view.orthographic);

    const r = next.view.rotationDeg;
    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(r.x),
      THREE.MathUtils.degToRad(r.y),
      THREE.MathUtils.degToRad(r.z),
    );

    const dist = next.view.dualViewDistance;
    if (typeof dist === 'number' && Number.isFinite(dist)) {
      stage.setDualViewDistance(dist);
      lastSyncedDist = dist;
    }

    stage.setPanOffsets({
      single: next.pan.panOffset ?? { x: 0, y: 0, z: 0 },
      left: next.pan.panOffsetLeft ?? { x: 0, y: 0, z: 0 },
      right: next.pan.panOffsetRight ?? { x: 0, y: 0, z: 0 },
    });

    stage.getControls().update();
    stage.invalidate();
  }

  const panTmpCam = new THREE.Vector3();
  const panTmpMove = new THREE.Vector3();
  const panTmpRight = new THREE.Vector3();
  const panTmpUp = new THREE.Vector3();
  const panTargetSide = ref<'left' | 'right' | 'single'>('single');
  let removePanTargetListener: (() => void) | null = null;
  const panDirty = computed(() => {
    const eps = 1e-6;
    const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
    const isDual = presets.length === 2;
    const side = isDual ? panTargetSide.value : 'single';
    const v = side === 'left'
      ? settingsRef.value.pan.panOffsetLeft
      : side === 'right'
        ? settingsRef.value.pan.panOffsetRight
        : settingsRef.value.pan.panOffset;
    const off = v ?? { x: 0, y: 0, z: 0 };
    return Math.abs(off.x) > eps || Math.abs(off.y) > eps || Math.abs(off.z) > eps;
  });

  function panModel(dir: 'left' | 'right' | 'up' | 'down'): void {
    if (!stage) return;
    const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
    const isDual = presets.length === 2;
    const side = isDual ? panTargetSide.value : 'single';
    const cam = side === 'right'
      ? (stage.getAuxCamera() ?? stage.getCamera())
      : stage.getCamera();
    cam.updateMatrixWorld(true);

    const isOrtho = (cam as THREE.OrthographicCamera).isOrthographicCamera;
    let step = 0.1;
    if (isOrtho) {
      const ortho = cam as THREE.OrthographicCamera;
      step = Math.max(0.01, Math.abs(ortho.top - ortho.bottom) * 0.05);
    }
    else {
      const persp = cam as THREE.PerspectiveCamera;
      cam.getWorldPosition(panTmpCam);
      const dist = Math.max(0.01, panTmpCam.distanceTo(stage.getControls().target));
      const fov = THREE.MathUtils.degToRad(persp.fov);
      const viewH = 2 * dist * Math.tan(fov * 0.5);
      step = Math.max(0.01, viewH * 0.05);
    }

    const scale = Number.isFinite(settingsRef.value.other.panStepScale)
      ? Math.max(0.1, settingsRef.value.other.panStepScale)
      : 1;
    step *= scale;

    panTmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
    panTmpUp.set(0, 1, 0).applyQuaternion(cam.quaternion);

    let dx = 0;
    let dy = 0;
    if (dir === 'left') dx = -1;
    if (dir === 'right') dx = 1;
    if (dir === 'up') dy = 1;
    if (dir === 'down') dy = -1;

    panTmpMove.set(0, 0, 0);
    panTmpMove.addScaledVector(panTmpRight, dx * step);
    panTmpMove.addScaledVector(panTmpUp, dy * step);
    panTmpMove.multiplyScalar(-1);

    if (side === 'left') {
      const cur = settingsRef.value.pan.panOffsetLeft ?? { x: 0, y: 0, z: 0 };
      settingsSync.patch({
        pan: {
          panOffsetLeft: {
            x: cur.x + panTmpMove.x,
            y: cur.y + panTmpMove.y,
            z: cur.z + panTmpMove.z,
          },
        },
      });
    }
    else if (side === 'right') {
      const cur = settingsRef.value.pan.panOffsetRight ?? { x: 0, y: 0, z: 0 };
      settingsSync.patch({
        pan: {
          panOffsetRight: {
            x: cur.x + panTmpMove.x,
            y: cur.y + panTmpMove.y,
            z: cur.z + panTmpMove.z,
          },
        },
      });
    }
    else {
      const cur = settingsRef.value.pan.panOffset ?? { x: 0, y: 0, z: 0 };
      settingsSync.patch({
        pan: {
          panOffset: {
            x: cur.x + panTmpMove.x,
            y: cur.y + panTmpMove.y,
            z: cur.z + panTmpMove.z,
          },
        },
      });
    }
    stage.invalidate();
  }

  function resetPan(): void {
    if (!stage) return;
    const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
    const isDual = presets.length === 2;
    const side = isDual ? panTargetSide.value : 'single';
    if (side === 'left') {
      settingsSync.patch({ pan: { panOffsetLeft: { x: 0, y: 0, z: 0 } } });
    }
    else if (side === 'right') {
      settingsSync.patch({ pan: { panOffsetRight: { x: 0, y: 0, z: 0 } } });
    }
    else {
      settingsSync.patch({ pan: { panOffset: { x: 0, y: 0, z: 0 } } });
    }
    stage.invalidate();
  }

  function setPanStepScale(v: number): void {
    const next = Number.isFinite(v) ? Math.max(0.1, Math.min(5, v)) : 1;
    settingsSync.patch({ other: { panStepScale: next } });
  }

  const panStepScale = computed(() =>
    Number.isFinite(settingsRef.value.other.panStepScale)
      ? settingsRef.value.other.panStepScale
      : 1,
  );

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
      if (!settingsRef.value.rotation.pauseOnInteract) return;
      autoRotateInteracting = true;
      scheduleAutoRotateRotationSync();
    };
    const onControlsEnd = () => {
      if (!settingsRef.value.rotation.pauseOnInteract) return;
      autoRotateInteracting = false;
      const delay = settingsRef.value.rotation.resumeDelayMs;
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
      useRealLayerPositionsRef: layerUseRealPositions,
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
      applyShowAxes: () => runtime?.applyShowAxes(),

      setAutoRotateConfig: cfg => stage?.setAutoRotateConfig(cfg),
      setModelLightIntensity: v => stage?.setModelLightIntensity(v),

      hasModel,
      applyBackgroundColor: () => runtime?.applyBackgroundColor(),
    });

    runtime?.applyBackgroundColor();
    stage.start();

    picking.attach();

    const canvas = stage.renderer.domElement;
    const onPanTargetPointerDown = (e: PointerEvent) => {
      const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
      if (presets.length !== 2) {
        panTargetSide.value = 'single';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const split = typeof settingsRef.value.view.dualViewSplit === 'number'
        ? settingsRef.value.view.dualViewSplit
        : 0.5;
      const leftW = rect.width * Math.min(0.9, Math.max(0.1, split));
      const x = e.clientX - rect.left;
      panTargetSide.value = x <= leftW ? 'left' : 'right';
    };
    canvas.addEventListener('pointerdown', onPanTargetPointerDown, { passive: true });
    removePanTargetListener = () => {
      canvas.removeEventListener('pointerdown', onPanTargetPointerDown);
    };

    stopRotationWatch = watch(
      () => [
        settingsRef.value.view.rotationDeg.x,
        settingsRef.value.view.rotationDeg.y,
        settingsRef.value.view.rotationDeg.z,
      ],
      () => {
        if (!stage) return;
        const r = settingsRef.value.view.rotationDeg;
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

        if (Math.abs(dist - (settingsRef.value.view.dualViewDistance ?? dist)) > 1e-3) {
          settingsSync.patch({ view: { dualViewDistance: dist } });
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

    removePanTargetListener?.();
    removePanTargetListener = null;

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
    layerSortBy,
    layerUseRealPositions,
    setLayerUseRealPositions,
    removeLayer,

    activeLayerTypeMap,
    activeLayerTypeIds,
    activeLayerTypeMapApplied,
    setActiveLayerTypeMap,
    applyTypeMapToAllLayers,
    applyTypeMapToVisibleLayers,
    resetAllLayersTypeMapToDefaults,

    activeLayerColorMap,
    activeLayerColorKeys,
    setActiveLayerColorMap,
    setAllLayersColorMap,
    setVisibleLayersColorMap,
    resetAllLayersColorMapToDefaults,
    resetAllLayersAnimToDefaults,

    activeLayerDisplay,
    setActiveLayerDisplay,
    setVisibleLayersDisplay,
    clearSelections,
    applyViewFromSettings,
    suspendSettingsSync: (ms = 200) => settingsSync.suspend(ms),
    visibleCustomColors,
    getLayerSnapshots: async () => runtime?.getLayerSnapshots() ?? [],
    applyLayerSnapshots: async (snaps) => {
      runtime?.applyLayerSnapshots(snaps);
      forceAllLayersVisibleIfAllHidden({ notify: true });
      runtimeTick.value += 1;
      syncUiFromRuntime();
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

  watch(
    () => [
      settingsRef.value.pan.panOffset,
      settingsRef.value.pan.panOffsetLeft,
      settingsRef.value.pan.panOffsetRight,
    ],
    () => {
      if (!stage) return;
      stage.setPanOffsets({
        single: settingsRef.value.pan.panOffset,
        left: settingsRef.value.pan.panOffsetLeft,
        right: settingsRef.value.pan.panOffsetRight,
      });
    },
    { immediate: true, deep: true },
  );

  watch(
    () => settingsRef.value.view.viewPresets,
    () => {
      const presets = normalizeViewPresets(settingsRef.value.view.viewPresets);
      if (presets.length !== 2) {
        panTargetSide.value = 'single';
        return;
      }
      if (panTargetSide.value === 'single') {
        panTargetSide.value = 'right';
      }
    },
    { immediate: true, deep: true },
  );

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
    activeLayerTypeIds,
    activeLayerTypeMapApplied,
    setActiveLayerTypeMap,
    applyTypeMapToAllLayers,
    applyTypeMapToVisibleLayers,
    resetAllLayersTypeMapToDefaults,

    activeLayerColorMap,
    activeLayerColorKeys,
    setActiveLayerColorMap,
    setAllLayersColorMap,
    setVisibleLayersColorMap,
    resetAllLayersColorMapToDefaults,

    activeLayerDisplay,
    setActiveLayerDisplay,
    setVisibleLayersDisplay,
    clearSelections,
    applyViewFromSettings,
    panModel,
    panTargetSide,
    panDirty,
    resetPan,
    panStepScale,
    setPanStepScale,
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
    isLoading: uiLoading,

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
