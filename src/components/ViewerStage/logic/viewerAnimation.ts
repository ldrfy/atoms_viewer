// src/components/ViewerStage/logic/viewerAnimation.ts
import { ref } from "vue";
import type { ModelRuntime } from "../modelRuntime";
import type { InspectCtx } from "../ctx/inspect";

export function createViewerAnimationController(deps: {
  getRuntime: () => ModelRuntime | null;
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
    isPlaying.value = !isPlaying.value;
    animLastMs = 0;
    animAccMs = 0;
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

    runtime.applyFrameByIndex(clamped);

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

    while (animAccMs >= step) {
      const next = frameIndex.value + 1;
      setFrame(next >= n ? 0 : next);
      animAccMs -= step;
    }
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
