// src/components/ViewerStage/logic/viewerAnimation.ts
import { ref, type Ref } from 'vue';
import type { ModelRuntime } from '../modelRuntime';
import type { ViewerSettings } from '../../../lib/viewer/settings';
import type { InspectCtx } from '../ctx/inspect';

export function createViewerAnimationController(deps: {
  getRuntime: () => ModelRuntime | null;
  settingsRef: Readonly<Ref<ViewerSettings>>;
  inspectCtx: InspectCtx;
  onSelectionVisualsNeedUpdate: () => void;
}) {
  const hasAnimation = ref(false);
  const frameIndex = ref(0);
  const frameCount = ref(1);
  const isPlaying = ref(false);
  const fps = ref(6);

  let animLastMs = 0;
  let animAccMs = 0;

  function stopPlay(): void {
    isPlaying.value = false;
    animLastMs = 0;
    animAccMs = 0;
  }

  function togglePlay(): void {
    if (!hasAnimation.value) return;

    const wasPlaying = isPlaying.value;
    isPlaying.value = !isPlaying.value;
    animLastMs = 0;
    animAccMs = 0;

    // If bonds were not refreshed during playback, refresh once when pausing
    if (wasPlaying && !isPlaying.value) {
      const refreshOnPlay = deps.settingsRef.value.refreshBondsOnPlay ?? true;
      if (!refreshOnPlay) {
        setFrame(frameIndex.value);
      }
    }
  }

  function syncFromRuntime(): void {
    const runtime = deps.getRuntime();
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
  }

  function setFrame(idx: number): void {
    const runtime = deps.getRuntime();
    if (!runtime) return;
    if (!hasAnimation.value) return;

    const n = runtime.getFrameCount();
    const clamped = Math.min(Math.max(0, idx), Math.max(0, n - 1));
    frameIndex.value = clamped;

    const refreshBonds = !isPlaying.value || (deps.settingsRef.value.refreshBondsOnPlay ?? true);

    runtime.applyFrameByIndex(clamped, { refreshBonds });

    if (deps.inspectCtx.selected.value.length > 0) {
      deps.onSelectionVisualsNeedUpdate();
    }
  }

  function tickAnimation(): void {
    const runtime = deps.getRuntime();
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

    // Avoid calling setFrame() in a tight loop (can trigger expensive work like
    // bond refresh / UI sync). Instead, jump directly by the number of steps.
    const steps = Math.floor(animAccMs / step);
    if (steps <= 0) return;

    const next = (frameIndex.value + steps) % n;
    setFrame(next);
    animAccMs -= steps * step;
  }

  return {
    hasAnimation,
    frameIndex,
    frameCount,
    isPlaying,
    fps,
    stopPlay,
    togglePlay,
    tickAnimation,
    setFrame,
    syncFromRuntime,
  };
}

export type ViewerAnimationController = ReturnType<
  typeof createViewerAnimationController
>;
