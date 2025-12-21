import { watch, type Ref } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";

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
  applyModelRotation: () => void;

  hasModel: Ref<boolean>;
  hasAnyTypeId: () => boolean;
  onTypeMapChanged: () => void;
}): () => void {
  const {
    settingsRef,
    setProjectionMode,
    resetView,
    applyAtomScale,
    applyShowBonds,
    applyShowAxes,
    applyModelRotation,
    hasModel,
    hasAnyTypeId,
    onTypeMapChanged,
  } = params;

  const stops: Array<() => void> = [];

  // 投影切换 / projection mode
  stops.push(
    watch(
      () => settingsRef.value.orthographic,
      (v) => setProjectionMode(v),
      { immediate: true }
    )
  );

  // 复位视角 / reset view
  stops.push(
    watch(
      () => settingsRef.value.resetViewSeq,
      () => resetView()
    )
  );

  // 原子缩放 / atom scale
  stops.push(
    watch(
      () => settingsRef.value.atomScale,
      () => applyAtomScale()
    )
  );

  // 显示键合 / show bonds
  stops.push(
    watch(
      () => settingsRef.value.showBonds,
      () => applyShowBonds(),
      { immediate: true }
    )
  );

  // 显示坐标轴 / show axes
  stops.push(
    watch(
      () => settingsRef.value.showAxes,
      () => applyShowAxes(),
      { immediate: true }
    )
  );

  // 模型旋转 / model rotation
  stops.push(
    watch(
      () => {
        const s = settingsRef.value.rotationDeg;
        return [s.x, s.y, s.z];
      },
      () => applyModelRotation(),
      { immediate: true }
    )
  );

  // LAMMPS type map 改动：只对包含 typeId 的数据有意义
  // LAMMPS type map changes: only meaningful if any atoms have typeId
  stops.push(
    watch(
      () => settingsRef.value.lammpsTypeMap,
      () => {
        if (!hasModel.value) return;
        if (!hasAnyTypeId()) return;
        onTypeMapChanged();
      },
      { deep: true }
    )
  );

  return (): void => {
    for (const s of stops) s();
  };
}
