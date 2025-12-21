import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";

import { message } from "ant-design-vue";
import { useI18n } from "vue-i18n";

import xyzText from "../../assets/samples/mos2_cnt.xyz?raw";
import {
  parseStructure,
  loadStructureFromFile,
} from "../../lib/structure/parse";

import {
  buildLammpsTypeToElementMap,
  collectTypeIdsFromAtoms,
  mergeTypeMap,
  normalizeTypeMapRows,
  typeMapEquals,
} from "./typeMap";

import { exportTransparentCroppedPng } from "../../lib/three/exportPng";
import { createThreeStage, type ThreeStage } from "../../lib/three/stage";

import { bindViewerStageSettings } from "./bindSettings";
import { createModelRuntime, type ModelRuntime } from "./modelRuntime";

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
  patchSettings?: (patch: Partial<ViewerSettings>) => void
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

      const model = await loadStructureFromFile(file, {
        // 注意：这里要传当前 settings 的 rows，否则映射为空
        // NOTE: pass current settings rows; otherwise mapping is empty
        lammpsTypeToElement: buildLammpsTypeToElementMap(
          getSettings().lammpsTypeMap ?? []
        ),
        lammpsSortById: true,
      });

      const info = runtime.renderModel(model);

      // 同步动画状态 / sync animation state
      frameIndex.value = 0;
      frameCount.value = info.frameCount;
      hasAnimation.value = info.hasAnimation;

      // 自动把 dump 中出现的 typeId 写到 Settings（只补缺）
      // Auto-fill detected LAMMPS typeIds into settings (append-only)
      if (patchSettings) {
        const atoms0 =
          model.frames && model.frames[0] ? model.frames[0] : model.atoms;
        const detected = collectTypeIdsFromAtoms(atoms0);

        if (detected.length > 0) {
          const current = getSettings().lammpsTypeMap ?? [];
          const merged = mergeTypeMap(current, detected);

          if (
            !typeMapEquals(
              normalizeTypeMapRows(current),
              normalizeTypeMapRows(merged)
            )
          ) {
            patchSettings({ lammpsTypeMap: merged });
          }
        }
      }

      if (
        model.source?.format &&
        ["dump", "lammpstrj", "traj", "lammpsdump"].includes(
          model.source.format
        ) &&
        (getSettings().lammpsTypeMap?.length ?? 0) === 0
      ) {
        message.warning(
          "当前未配置 LAMMPS type→元素映射，元素将使用占位 E（颜色/半径可能不准确）。"
        );
      }

      message.success(
        t("viewer.load.success", {
          fileName: file.name,
          atomCount: model.atoms.length,
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

    frameIndex.value = 0;
    frameCount.value = info.frameCount;
    hasAnimation.value = info.hasAnimation;
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
