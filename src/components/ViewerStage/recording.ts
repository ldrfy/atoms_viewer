// src/components/ViewerStage/recording.ts
import { computed, ref, type ComputedRef, type Ref } from "vue";
import { message } from "ant-design-vue";
import type { ThreeStage } from "../../lib/three/stage";

export type CropBox = { x: number; y: number; w: number; h: number };

export type RecordingBindings = {
  // recording
  isRecording: Ref<boolean>;
  isRecordPaused: Ref<boolean>;
  recordElapsedMs: Ref<number>;
  recordTimeText: ComputedRef<string>;
  toggleRecord: () => void;
  togglePause: () => void;

  // record area selection/edit
  isSelectingRecordArea: Ref<boolean>;
  recordDraftBox: Ref<CropBox | null>;

  onRecordOverlayDown: (e: PointerEvent) => void;
  onRecordOverlayMove: (e: PointerEvent) => void;
  onRecordOverlayUp: (e: PointerEvent) => void;
  onRecordOverlayCancel: () => void;

  cancelRecordSelect: () => void;
  confirmRecordSelect: () => void;

  // show dash box while recording
  recordCropBox: Ref<CropBox | null>;
};

type CreateRecordingControllerArgs = {
  /** 延迟获取 stage：避免 onMounted 之前 stage 为空的问题 */
  getStage: () => ThreeStage | null;

  /** 如需录制时强制背景不透明，用它 */
  patchSettings?: (patch: Record<string, unknown>) => void;

  /** i18n 文案（可选） */
  t?: (key: string, params?: Record<string, unknown>) => string;
};

export function createRecordingController(
  args: CreateRecordingControllerArgs
): RecordingBindings {
  const { getStage, patchSettings, t } = args;

  // ----------------------------
  // state
  // ----------------------------
  const isSelectingRecordArea = ref(false);
  const recordDraftBox = ref<CropBox | null>(null);

  const isRecording = ref(false);
  const isRecordPaused = ref(false);

  const recordElapsedMs = ref(0);

  const recordCropBox = ref<CropBox | null>(null);
  let recordCropRect: CropBox | null = null;

  // ----------------------------
  // internal: pointer edit
  // ----------------------------
  type EditMode = "idle" | "draw" | "move" | "resize";
  let editMode: EditMode = "idle";
  let activeHandle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | null =
    null;

  let selectPointerId: number | null = null;
  let startPt: { x: number; y: number } | null = null;
  let startBox: CropBox | null = null;

  // ----------------------------
  // internal: record pipeline
  // ----------------------------
  let cropCanvas: HTMLCanvasElement | null = null;
  let cropCtx: CanvasRenderingContext2D | null = null;
  let cropRafId: number | null = null;

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  // timer
  let recordTimerId: number | null = null;
  let recordStartTs = 0;
  let recordAccumulated = 0;

  // ----------------------------
  // helpers
  // ----------------------------
  function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
  }

  function getCanvasClientRect(): DOMRect | null {
    const stage = getStage();
    if (!stage) return null;
    return stage.renderer.domElement.getBoundingClientRect();
  }

  function toLocalXY(e: PointerEvent): { x: number; y: number } | null {
    const r = getCanvasClientRect();
    if (!r) return null;
    return {
      x: clamp(e.clientX - r.left, 0, r.width),
      y: clamp(e.clientY - r.top, 0, r.height),
    };
  }

  function normBox(b: CropBox): CropBox {
    const x2 = b.x + b.w;
    const y2 = b.y + b.h;
    const x = Math.min(b.x, x2);
    const y = Math.min(b.y, y2);
    const w = Math.abs(b.w);
    const h = Math.abs(b.h);
    return { x, y, w, h };
  }

  function clampBoxToCanvas(b: CropBox): CropBox {
    const r = getCanvasClientRect();
    if (!r) return b;
    const x = clamp(b.x, 0, r.width);
    const y = clamp(b.y, 0, r.height);
    const w = clamp(b.w, 0, r.width - x);
    const h = clamp(b.h, 0, r.height - y);
    return { x, y, w, h };
  }

  // ----------------------------
  // timer
  // ----------------------------
  function startRecordTimer(): void {
    recordAccumulated = 0;
    recordStartTs = performance.now();
    recordElapsedMs.value = 0;

    recordTimerId = window.setInterval(() => {
      recordElapsedMs.value =
        recordAccumulated + (performance.now() - recordStartTs);
    }, 200);
  }

  function pauseRecordTimer(): void {
    if (!recordTimerId) return;
    recordAccumulated += performance.now() - recordStartTs;
    clearInterval(recordTimerId);
    recordTimerId = null;
  }

  function resumeRecordTimer(): void {
    if (recordTimerId) return;
    recordStartTs = performance.now();
    recordTimerId = window.setInterval(() => {
      recordElapsedMs.value =
        recordAccumulated + (performance.now() - recordStartTs);
    }, 200);
  }

  function stopRecordTimer(): void {
    if (recordTimerId) {
      clearInterval(recordTimerId);
      recordTimerId = null;
    }
    recordElapsedMs.value = 0;
    recordAccumulated = 0;
  }

  const recordTimeText = computed(() => {
    const s = Math.floor(recordElapsedMs.value / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  });

  // ----------------------------
  // record core
  // ----------------------------
  function startRecordCropped(streamFps = 60): void {
    const stage = getStage();
    if (!stage || isRecording.value) return;
    if (!recordCropRect) return;

    // 建 crop canvas
    if (!cropCanvas) cropCanvas = document.createElement("canvas");
    cropCtx = cropCanvas.getContext("2d", { alpha: true });
    if (!cropCtx) return;

    const src = stage.renderer.domElement;
    const dpr = window.devicePixelRatio || 1;

    // 选择框是 CSS 像素，src 实际像素乘 dpr
    const sx = Math.round(recordCropRect.x * dpr);
    const sy = Math.round(recordCropRect.y * dpr);
    const sw = Math.round(recordCropRect.w * dpr);
    const sh = Math.round(recordCropRect.h * dpr);

    cropCanvas.width = Math.max(1, sw);
    cropCanvas.height = Math.max(1, sh);

    // 每帧拷贝裁剪区域
    const pump = (): void => {
      const st = getStage();
      if (!cropCtx || !cropCanvas || !st) return;
      cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCtx.drawImage(
        src,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );
      cropRafId = window.requestAnimationFrame(pump);
    };
    pump();

    const stream = cropCanvas.captureStream(streamFps);

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp9",
      videoBitsPerSecond: 8_000_000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.start();
    startRecordTimer();

    isRecording.value = true;
    isRecordPaused.value = false;
  }

  function stopRecord(): void {
    const stage = getStage();
    if (!mediaRecorder || !stage) return;

    mediaRecorder.stop();

    mediaRecorder.onstop = () => {
      if (cropRafId) {
        cancelAnimationFrame(cropRafId);
        cropRafId = null;
      }

      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "three-record.webm";
      a.click();
      URL.revokeObjectURL(url);

      stopRecordTimer();

      mediaRecorder = null;
      isRecording.value = false;
      isRecordPaused.value = false;
    };

    recordCropBox.value = null;
    recordCropRect = null;
  }

  function togglePause(): void {
    if (!mediaRecorder) return;

    if (mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      pauseRecordTimer();
      isRecordPaused.value = true;
    } else if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      resumeRecordTimer();
      isRecordPaused.value = false;
    }
  }

  function toggleRecord(): void {
    if (isRecording.value) {
      stopRecord();
      return;
    }

    // 进入框选模式
    isSelectingRecordArea.value = true;
    recordDraftBox.value = null;

    editMode = "idle";
    activeHandle = null;
    selectPointerId = null;
    startPt = null;
    startBox = null;
  }

  // ----------------------------
  // overlay edit handlers
  // ----------------------------
  function onRecordOverlayDown(e: PointerEvent): void {
    if (!isSelectingRecordArea.value) return;

    const el = e.target as HTMLElement | null;
    if (el?.closest(".record-select-actions")) return;
    if (el?.closest(".record-select-hint")) return;

    const p = toLocalXY(e);
    if (!p) return;

    selectPointerId = e.pointerId;
    startPt = p;
    startBox = recordDraftBox.value ? { ...recordDraftBox.value } : null;

    const target = e.target as HTMLElement;
    const h = (target?.dataset?.h ?? null) as
      | "n"
      | "s"
      | "e"
      | "w"
      | "nw"
      | "ne"
      | "sw"
      | "se"
      | null;

    const hasBox = !!recordDraftBox.value;

    if (hasBox && h) {
      editMode = "resize";
      activeHandle = h;
    } else if (hasBox && startBox) {
      editMode = "move";
      activeHandle = null;
    } else {
      editMode = "draw";
      activeHandle = null;
      recordDraftBox.value = { x: p.x, y: p.y, w: 0, h: 0 };
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onRecordOverlayMove(e: PointerEvent): void {
    if (!isSelectingRecordArea.value) return;
    if (selectPointerId !== e.pointerId) return;
    if (!startPt) return;

    const p = toLocalXY(e);
    if (!p) return;

    const dx = p.x - startPt.x;
    const dy = p.y - startPt.y;

    if (editMode === "draw") {
      const b0 = recordDraftBox.value;
      if (!b0) return;
      recordDraftBox.value = normBox({ x: b0.x, y: b0.y, w: dx, h: dy });
      return;
    }

    if (!startBox) return;

    if (editMode === "move") {
      recordDraftBox.value = clampBoxToCanvas({
        x: startBox.x + dx,
        y: startBox.y + dy,
        w: startBox.w,
        h: startBox.h,
      });
      return;
    }

    if (editMode === "resize") {
      const b: CropBox = { ...startBox };

      if (activeHandle?.includes("w")) {
        b.x = startBox.x + dx;
        b.w = startBox.w - dx;
      }
      if (activeHandle?.includes("e")) {
        b.w = startBox.w + dx;
      }
      if (activeHandle?.includes("n")) {
        b.y = startBox.y + dy;
        b.h = startBox.h - dy;
      }
      if (activeHandle?.includes("s")) {
        b.h = startBox.h + dy;
      }

      recordDraftBox.value = clampBoxToCanvas(normBox(b));
    }
  }

  function onRecordOverlayUp(e: PointerEvent): void {
    if (!isSelectingRecordArea.value) return;
    if (selectPointerId !== e.pointerId) return;

    selectPointerId = null;
    startPt = null;
    startBox = null;
    editMode = "idle";
    activeHandle = null;
  }

  function cancelRecordSelect(): void {
    isSelectingRecordArea.value = false;
    recordDraftBox.value = null;

    selectPointerId = null;
    startPt = null;
    startBox = null;
    editMode = "idle";
    activeHandle = null;
  }

  function onRecordOverlayCancel(): void {
    cancelRecordSelect();
  }

  function confirmRecordSelect(): void {
    const box = recordDraftBox.value;
    if (!box) return;

    if (box.w < 8 || box.h < 8) {
      message.warning(t?.("viewer.record.tooSmall") ?? "Selection too small");
      return;
    }

    isSelectingRecordArea.value = false;

    // 录制时建议强制不透明背景（你原来全画布录制 startRecord 才做，这里裁剪录制也建议做）
    patchSettings?.({ backgroundTransparent: false });

    recordCropRect = box;
    recordCropBox.value = box;
    startRecordCropped(60);
  }

  return {
    isRecording,
    isRecordPaused,
    recordElapsedMs,
    recordTimeText,
    toggleRecord,
    togglePause,

    isSelectingRecordArea,
    recordDraftBox,
    onRecordOverlayDown,
    onRecordOverlayMove,
    onRecordOverlayUp,
    onRecordOverlayCancel,
    cancelRecordSelect,
    confirmRecordSelect,

    recordCropBox,
  };
}
