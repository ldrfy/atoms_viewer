import { watch, type Ref } from 'vue';
import type { ViewerSettings } from '../../lib/viewer/settings';
import { DEFAULT_SETTINGS } from '../../lib/viewer/settings';
import {
  normalizeViewPresets,
  type ViewPreset,
} from '../../lib/viewer/viewPresets';
import { getAutoRotatePreset } from '../../lib/viewer/autoRotate';

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
  setModelLightIntensity: (intensity: number) => void;

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
    setModelLightIntensity,
    setViewPresets,
    setDualViewDistance,
    setDualViewSplit,
    applyBackgroundColor,
  } = params;

  const stops: Array<() => void> = [];

  // 投影切换 / projection mode
  stops.push(
    watch(
      () => settingsRef.value.view.orthographic,
      v => setProjectionMode(v),
      { immediate: true },
    ),
  );

  // 多视角视图 / multi-view presets
  stops.push(
    watch(
      () => settingsRef.value.view.viewPresets,
      () => {
        const v = normalizeViewPresets(settingsRef.value.view.viewPresets);
        if (v.length > 0) {
          setViewPresets(v);
          return;
        }
        setViewPresets([]);
      },
      { immediate: true, deep: true },
    ),
  );

  stops.push(
    watch(
      () => settingsRef.value.view.dualViewDistance,
      (v) => {
        const d = typeof v === 'number' && Number.isFinite(v) ? v : 10;
        setDualViewDistance(d);
      },
      { immediate: true },
    ),
  );

  stops.push(
    watch(() => settingsRef.value.view.dualViewSplit,
      v => setDualViewSplit(v ?? 0.5),
      { immediate: true },
    ),
  );

  // 复位视角 / reset view
  stops.push(
    watch(
      () => settingsRef.value.view.resetViewSeq,
      () => resetView(),
    ),
  );

  // 原子缩放 / atom scale
  stops.push(
    watch(
      () => settingsRef.value.details.atomScale,
      () => applyAtomScale(),
    ),
  );

  // Sphere quality / sphere segments
  stops.push(
    watch(
      () => settingsRef.value.details.sphereSegments,
      () => applyAtomScale(),
    ),
  );

  // 显示键合 / show bonds
  stops.push(
    watch(
      () => settingsRef.value.details.showBonds,
      () => applyShowBonds(),
      { immediate: true },
    ),
  );

  // Bond inference factor: rebuild bond meshes when changed.
  stops.push(
    watch(
      () => settingsRef.value.details.bondFactor,
      () => applyShowBonds(),
    ),
  );

  // 显示坐标轴 / show axes
  stops.push(
    watch(
      () => settingsRef.value.other.showAxes,
      () => applyShowAxes(),
      { immediate: true },
    ),
  );

  stops.push(
    watch(
      () => settingsRef.value.other.modelLightIntensity,
      v => setModelLightIntensity(Number.isFinite(v) ? v : DEFAULT_SETTINGS.other.modelLightIntensity),
      { immediate: true },
    ),
  );

  // Auto rotation / 自动旋转
  stops.push(
    watch(
      [
        () => settingsRef.value.rotation.enabled,
        () => settingsRef.value.rotation.presetId,
        () => settingsRef.value.rotation.speedDegPerSec,
        () => settingsRef.value.rotation.pauseOnInteract,
        () => settingsRef.value.rotation.resumeDelayMs,
      ],
      () => {
        const a = settingsRef.value.rotation;
        const preset = getAutoRotatePreset(a.presetId);
        const sp = a.speedDegPerSec;
        const speedDegPerSec = Number.isFinite(sp) ? sp : preset.speedDegPerSec;
        setAutoRotateConfig({
          enabled: !!a.enabled,
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
        settingsRef.value.anim.backgroundColor,
        settingsRef.value.anim.backgroundTransparent,
      ],
      () => applyBackgroundColor(),
    ),
  );

  return (): void => {
    for (const s of stops) s();
  };
}
