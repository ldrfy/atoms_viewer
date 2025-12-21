import { onBeforeUnmount, onMounted, ref, reactive } from "vue";
import type { Ref } from "vue";
import type {
  ViewerSettings,
  LammpsTypeMapItem,
  OpenSettingsPayload,
} from "../../lib/viewer/settings";
import { hasUnknownElementMappingForTypeIds } from "../../lib/viewer/settings";
import type { StructureModel } from "../../lib/structure/types";

import { message } from "ant-design-vue";
import { useI18n } from "vue-i18n";
import xyzText from "../../assets/samples/mos2_cnt.xyz?raw";
import { parseStructure, toForcedFilename } from "../../lib/structure/parse";
import type { ParseMode, ParseInfo } from "../../lib/structure/parse";
import {
  buildLammpsTypeToElementMap,
  collectTypeIdsFromAtoms,
  mergeTypeMap,
  normalizeTypeMapRows,
  typeMapEquals,
} from "./typeMap";
type RenderReason = "load" | "reparse";

import { exportTransparentCroppedPng } from "../../lib/three/exportPng";
import { createThreeStage, type ThreeStage } from "../../lib/three/stage";

import { bindViewerStageSettings } from "./bindSettings";
import { createModelRuntime, type ModelRuntime } from "./modelRuntime";
import { isLammpsDumpFormat } from "../../lib/structure/parsers/lammpsDump";
import { isLammpsDataFormat } from "../../lib/structure/parsers/lammpsData";
import { applyAnimationInfo } from "./animation";

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

  openFilePicker: () => void;
  onDragEnter: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => Promise<void>;
  onFilePicked: (e: Event) => Promise<void>;
  onExportPng: (scale: number) => Promise<void>;
  preloadDefault: () => void;

  // animation
  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;

  // parse info / reparse
  parseInfo: ParseInfo;
  parseMode: Ref<ParseMode>;
  setParseMode: (mode: ParseMode) => void;
};

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

  const isDragging = ref(false);
  const dragDepth = ref(0);
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
  });

  /**
   * 缓存最近一次载入文件的源文本，供“手动选择格式后重新解析”
   *
   * Cache last loaded raw text for manual re-parse.
   */
  let lastRawText: string | null = null;
  let lastRawFileName: string | null = null;

  const getSettings = (): ViewerSettings => settingsRef.value;

  function openFilePicker(): void {
    fileInputRef.value?.click();
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
    // 加载前的映射快照（用于判断是否新增/是否存在占位符 E）
    // Snapshot before patching (for change detection)
    const beforeRows = (
      (getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[]
    ).map((r) => ({
      typeId: r.typeId,
      element: r.element,
    }));

    // 本次 dump 第一帧出现的 typeId
    // TypeIds detected from the first frame of this dump
    const atoms0 =
      model.frames && model.frames[0] ? model.frames[0] : model.atoms;
    const detectedTypeIds = collectTypeIdsFromAtoms(atoms0);

    // 合并：只补缺（缺失的 typeId 默认 element="E"）
    // Merge: append missing typeIds (placeholder element is "E")
    const mergedRows = mergeTypeMap(
      beforeRows,
      detectedTypeIds
    ) as LammpsTypeMapItem[];

    // 是否发生变化（新增了 typeId）
    // Whether we added missing typeIds
    const typeMapAdded = !typeMapEquals(
      normalizeTypeMapRows(beforeRows),
      normalizeTypeMapRows(mergedRows)
    );

    // 是否仍存在未完成映射（对本次 dump 相关 typeId 判断）
    // Whether unresolved mapping ("E") still exists for this dump
    const hasUnknownForThisDump = hasUnknownElementMappingForTypeIds(
      mergedRows,
      detectedTypeIds
    );

    // 写回 settings（仅在确实发生变化时）
    // Patch settings only when changed
    if (patchSettings && typeMapAdded) {
      patchSettings({ lammpsTypeMap: mergedRows });
    }

    // 自动打开/聚焦策略：
    // - 需要用户补映射：打开抽屉并聚焦 lammps
    // - 否则：不强制打开，只把下次聚焦设置为 display
    //
    // Auto-open/focus strategy:
    // - If user action required: open drawer and focus lammps panel
    // - Otherwise: do not force open, but preset focus back to display
    if (typeMapAdded || hasUnknownForThisDump) {
      requestOpenSettings?.({ focusKey: "lammps", open: true });
    } else {
      requestOpenSettings?.({ focusKey: "display", open: false });
    }

    // 提示：存在未完成映射时给 warning（走 i18n）
    // Warn user when unresolved mapping exists (use i18n)
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
    reason: RenderReason
  ): void {
    if (!stage || !runtime) return;

    // 1) parse
    const forcedName = toForcedFilename(fileName, parseMode.value);
    const model = parseStructure(text, forcedName, {
      lammpsTypeToElement: buildLammpsTypeToElementMap(
        (getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[]
      ),
      lammpsSortById: true,
    });

    // 2) render
    const info = runtime.renderModel(model);

    // 3) sync animation state
    applyAnimationInfo(info, frameIndex, frameCount, hasAnimation);

    // 4) update overlay parse info
    updateParseInfo(model, fileName);

    // 5) apply settings focus policy by format
    const fmt = model.source?.format ?? "";
    const isLmp = isLammpsDumpFormat(fmt) || isLammpsDataFormat(fmt);

    if (isLmp) {
      handleLammpsTypeMapAndSettings(model);
    } else {
      // 关键：从 LAMMPS 切回 XYZ/PDB 时，要把焦点切回 display
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
    // 如果没变就不做任何事，避免重复 render
    // No-op if unchanged to avoid redundant render.
    if (parseMode.value === mode) return;

    parseMode.value = mode;

    if (!lastRawText || !lastRawFileName) return;
    if (!stage || !runtime) return;

    try {
      stopPlay();
      renderFromText(lastRawText, lastRawFileName, "reparse");
    } catch (err) {
      message.error(
        t("viewer.parse.reparseFailed", { reason: (err as Error).message })
      );
    }
  }

  /**
   * 加载文件并渲染模型。
   *
   * Load a file and render the model.
   */
  async function loadFile(file: File): Promise<void> {
    if (!stage || !runtime) return;
    if (isLoading.value) return;

    isLoading.value = true;
    await nextFrame();

    const t0 = performance.now();
    try {
      stopPlay();

      // 新文件默认回到自动解析（避免上次强制解析影响下一次）
      // Reset to auto for each new file to avoid leaking previous forced mode.
      parseMode.value = "auto";

      // 读取并缓存源文本，供 setParseMode 重新解析
      // Read & cache raw text for setParseMode re-parse.
      const text = await file.text();
      lastRawText = text;
      lastRawFileName = file.name;

      // 核心渲染管线
      // Core rendering pipeline
      renderFromText(text, file.name, "load");

      // 成功提示 / Success toast
      message.success(
        t("viewer.load.success", {
          fileName: file.name,
          atomCount: parseInfo.atomCount,
          bondSegCount: runtime.getLastBondSegCount(),
        }) + `（${((performance.now() - t0) / 1000).toFixed(2)} s）`
      );
    } finally {
      isLoading.value = false;
    }
  }

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
      console.log(err);

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

  /**
   * 导出透明背景并裁剪的 PNG。
   *
   * Export a transparent, cropped PNG.
   */
  async function onExportPng(exportScale: number): Promise<void> {
    if (!stage) return;

    try {
      await exportTransparentCroppedPng({
        renderer: stage.renderer,
        scene: stage.scene,
        camera: stage.getCamera(),
        host: stage.host,
        filename: "snapshot.png",
        scale: exportScale,
        orthoHalfHeight: stage.getOrthoHalfHeight(),
        alphaThreshold: 8,
        padding: 3,
      });

      message.success(t("viewer.export.pngSuccess"));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("export png failed:", e);
      message.error(t("viewer.export.fail", { reason: (e as Error).message }));
    }
  }

  /**
   * 预加载内置样例（mos2_cnt.xyz）。
   *
   * Preload embedded sample (mos2_cnt.xyz).
   */
  function preloadDefault(): void {
    if (!runtime) return;
    stopPlay();

    const model = parseStructure(xyzText, "sample.xyz");
    const info = runtime.renderModel(model);

    applyAnimationInfo(info, frameIndex, frameCount, hasAnimation);
  }

  onMounted(() => {
    const host = canvasHostRef.value;
    if (!host) return;

    // 1) 创建 three 舞台（含 raf loop、resize、projection 切换）
    // 1) Create Three stage (raf loop, resize, projection switch)
    stage = createThreeStage({
      host,
      orthoHalfHeight: 5,
      onBeforeRender: () => tickAnimation(),
    });

    // 2) 创建模型运行时（负责 mesh/frames/fit）
    // 2) Create model runtime (meshes/frames/fit)
    runtime = createModelRuntime({
      stage,
      settingsRef,
      hasModel,
      atomSizeFactor: ATOM_SIZE_FACTOR,
      bondFactor: BOND_FACTOR,
      bondRadius: BOND_RADIUS,
    });

    // 3) 绑定 settings watchers
    // 3) Bind settings watchers
    stopBind = bindViewerStageSettings({
      settingsRef,
      setProjectionMode: (v) => stage?.setProjectionMode(v),
      resetView,

      applyAtomScale: () => runtime?.applyAtomScale(),
      applyShowBonds: () => runtime?.applyShowBonds(),
      applyShowAxes: () => runtime?.applyShowAxes(),
      applyModelRotation: () => runtime?.applyModelRotation(),

      hasModel,
      hasAnyTypeId: () => runtime?.hasAnyTypeId() ?? false,
      onTypeMapChanged: () => runtime?.onTypeMapChanged(frameIndex.value),
    });

    stage.start();

    // 全局阻止浏览器默认 drop（避免打开文件替换页面）
    // Prevent default browser drop behavior (avoid replacing current page)
    window.addEventListener("dragover", preventWindowDropDefault);
    window.addEventListener("drop", preventWindowDropDefault);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("dragover", preventWindowDropDefault);
    window.removeEventListener("drop", preventWindowDropDefault);

    stopBind?.();
    stopBind = null;

    stopPlay();

    runtime?.clearModel();
    runtime = null;

    stage?.dispose();
    stage = null;
  });

  return {
    // parse
    parseInfo,
    parseMode,
    setParseMode,

    hasAnimation,
    frameIndex,
    frameCount,
    isPlaying,
    fps,
    setFrame,
    togglePlay,
    stopPlay,

    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    isLoading,
    openFilePicker,

    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
    preloadDefault,
  };
}
