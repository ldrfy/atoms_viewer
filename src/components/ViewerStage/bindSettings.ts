import { watch, type Ref } from 'vue';
import type { ViewerSettings } from '../../lib/viewer/settings';
import {
  normalizeViewPresets,
  type ViewPreset,
} from '../../lib/viewer/viewPresets';
import {
  DEFAULT_AUTO_ROTATE_PRESET_ID,
  getAutoRotatePreset,
} from '../../lib/viewer/autoRotate';
import { clampDualViewSplit } from '../../lib/viewer/viewLayout';

/**
 * 绑定 ViewerStage 与 settings 的 watch 逻辑，并返回统一的 stop 函数。
 *
 * Bind ViewerStage to settings watchers, and return a unified stop() function.
 *
 * @param params - 参数 / Params
 * @returns stop - 停止所有 watch / Stop all watchers
 */
export function bindViewerStageSettings(params: {
  settingsRef: Readonly<Ref<ViewerSettings>>;

  setProjectionMode: (orthographic: boolean) => void;
  resetView: () => void;

  applyAtomScale: () => void;
  applyShowBonds: () => void;
  applyShowAxes: () => void;

  setAutoRotateConfig: (cfg: {
    enabled: boolean;
    axis: [number, number, number];
    speedDegPerSec: number;
    pauseOnInteract: boolean;
    resumeDelayMs: number;
  }) => void;

  setViewPresets: (presets: ViewPreset[]) => void;
  setDualViewDistance: (dist: number) => void;
  setDualViewSplit: (ratio: number) => void;

  hasModel: Ref<boolean>;
  hasAnyTypeId: () => boolean;
  onTypeMapChanged: () => void;
  applyBackgroundColor: () => void;
}): () => void {
  const {
    settingsRef,
    setProjectionMode,
    resetView,
    applyAtomScale,
    applyShowBonds,
    applyShowAxes,

    setAutoRotateConfig,
    setViewPresets,
    setDualViewDistance,
    setDualViewSplit,
    applyBackgroundColor,
  } = params;

  const stops: Array<() => void> = [];

  // 投影切换 / projection mode
  stops.push(
    watch(
      () => settingsRef.value.orthographic,
      v => setProjectionMode(v),
      { immediate: true },
    ),
  );

  // 多视角视图 / multi-view presets
  stops.push(
    watch(
      () =>
        [
          settingsRef.value.viewPresets,
          settingsRef.value.dualViewEnabled,
        ] as const,
      () => {
        const v = normalizeViewPresets(settingsRef.value.viewPresets);
        if (v.length > 0) {
          setViewPresets(v);
          return;
        }
        // Backward-compat: old dualViewEnabled implies [front, side]
        if (settingsRef.value.dualViewEnabled) {
          setViewPresets(['front', 'side']);
          return;
        }
        setViewPresets([]);
      },
      { immediate: true, deep: true },
    ),
  );

  stops.push(
    watch(
      () => settingsRef.value.dualViewDistance,
      (v) => {
        const d = typeof v === 'number' && Number.isFinite(v) ? v : 10;
        setDualViewDistance(d);
      },
      { immediate: true },
    ),
  );

  stops.push(
    watch(
      () => settingsRef.value.dualViewSplit,
      (v) => {
        const r = typeof v === 'number' && Number.isFinite(v) ? v : 0.5;
        // clamp to reasonable range to avoid extremely narrow viewports
        setDualViewSplit(clampDualViewSplit(r));
      },
      { immediate: true },
    ),
  );

  // 复位视角 / reset view
  stops.push(
    watch(
      () => settingsRef.value.resetViewSeq,
      () => resetView(),
    ),
  );

  // 原子缩放 / atom scale
  stops.push(
    watch(
      () => settingsRef.value.atomScale,
      () => applyAtomScale(),
    ),
  );

  // Sphere quality / sphere segments
  stops.push(
    watch(
      () => settingsRef.value.sphereSegments,
      () => applyAtomScale(),
    ),
  );

  // 显示键合 / show bonds
  stops.push(
    watch(
      () => settingsRef.value.showBonds,
      () => applyShowBonds(),
      { immediate: true },
    ),
  );

  // Bond inference factor: rebuild bond meshes when changed.
  stops.push(
    watch(
      () => settingsRef.value.bondFactor,
      () => applyShowBonds(),
    ),
  );

  // 显示坐标轴 / show axes
  stops.push(
    watch(
      () => settingsRef.value.showAxes,
      () => applyShowAxes(),
      { immediate: true },
    ),
  );

  // Auto rotation / 自动旋转
  stops.push(
    watch(
      [
        () => settingsRef.value.autoRotate.enabled,
        () => settingsRef.value.autoRotate.presetId,
        () => settingsRef.value.autoRotate.speedDegPerSec,
        () => settingsRef.value.autoRotate.pauseOnInteract,
        () => settingsRef.value.autoRotate.resumeDelayMs,
      ],
      () => {
        const a = settingsRef.value.autoRotate;
        // Legacy: earlier versions allowed "presetId=off".
        // Now ON/OFF is controlled solely by a.enabled.
        const legacyOff = a.presetId === 'off';
        const preset = getAutoRotatePreset(
          legacyOff ? DEFAULT_AUTO_ROTATE_PRESET_ID : a.presetId,
        );
        const sp = a.speedDegPerSec;
        const speedDegPerSec = Number.isFinite(sp) ? sp : preset.speedDegPerSec;
        setAutoRotateConfig({
          enabled: !!a.enabled && !legacyOff,
          axis: preset.axis,
          speedDegPerSec,
          pauseOnInteract: !!a.pauseOnInteract,
          resumeDelayMs: Number.isFinite(a.resumeDelayMs) ? a.resumeDelayMs : 600,
        });
      },
      { immediate: true },
    ),
  );

  // LAMMPS type map changes can be expensive (rebuilding instanced meshes).
  // To prevent UI stalls, we DO NOT rebuild on every edit.
  // The caller should trigger a rebuild explicitly ("Refresh display").

  stops.push(
    watch(
      () => [
        settingsRef.value.backgroundColor,
        settingsRef.value.backgroundTransparent,
      ],
      () => applyBackgroundColor(),
    ),
  );

  return (): void => {
    for (const s of stops) s();
  };
}
