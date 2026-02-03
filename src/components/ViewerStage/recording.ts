// src/components/ViewerStage/recording.ts
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { message } from 'antdv-next';
import type { ThreeStage } from '../../lib/three/stage';
import { buildExportFilename } from '../../lib/file/filename';
import { clampNumber } from '../../lib/utils/number';
import { getThemeMode, isDark } from '../../theme/mode';
import type { ViewerSettings } from '../../lib/viewer/settings';

export type CropBox = { x: number; y: number; w: number; h: number };

export type RecordingBindings = {
  // recording
  isRecording: Ref<boolean>;
  isRecordPaused: Ref<boolean>;
  recordElapsedMs: Ref<number>;
  recordTimeText: ComputedRef<string>;
  recordDelaySec: Ref<number>;
  recordDelayRemainingSec: Ref<number>;
  isRecordDelayActive: Ref<boolean>;
  cancelRecordDelay: () => void;
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
  confirmRecordSelect: () => Promise<void>;
  selectConfirmLoading: Ref<boolean>;

  // show dash box while recording
  recordCropBox: Ref<CropBox | null>;

  // selection overlay labels (optional overrides)
  selectHint: Ref<string | null>;
  selectConfirmLabel: Ref<string | null>;
  selectCancelLabel: Ref<string | null>;
  showDelayInput: Ref<boolean>;

  // sync persisted record box
  // 同步持久化录制框
  setLastRecordBox: (box: CropBox | null) => void;

  // select an area for non-recording actions (e.g., export)
  selectExportArea: (opts: {
    onConfirm: (box: CropBox) => Promise<void> | void;
    onCancel?: () => void;
    hint?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => void;
};

type CreateRecordingControllerArgs = {
  /** 延迟获取 stage：避免 onMounted 之前 stage 为空的问题 */
  getStage: () => ThreeStage | null;

  /** 如需录制时强制背景不透明，用它 */
  patchSettings?: (patch: Record<string, unknown>) => void;

  /** 读取当前设置（用于录制时临时调整背景） */
  getSettings?: () => ViewerSettings;

  /** i18n 文案（可选） */
  t?: (key: string, params?: Record<string, unknown>) => string;

  /** 录制帧率（从 settings 读） */
  getRecordFps?: () => number;

  /** 读取上次录制框（用于持久化） */
  /** Read last record crop box (for persistence) */
  getRecordBox?: () => CropBox | null;

  /** 记录最新录制框（用于持久化） */
  /** Persist latest record crop box */
  onRecordBoxChange?: (box: CropBox | null) => void;

  /** 当前模型文件名（用于生成下载文件名） */
  getModelFileName?: () => string | undefined;
};

export function createRecordingController(
  args: CreateRecordingControllerArgs,
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
  const recordDelaySec = ref(0);
  const recordDelayRemainingSec = ref(0);
  const isRecordDelayActive = ref(false);

  const recordCropBox = ref<CropBox | null>(null);
  const selectHint = ref<string | null>(null);
  const selectConfirmLabel = ref<string | null>(null);
  const selectCancelLabel = ref<string | null>(null);
  const showDelayInput = ref(true);
  const selectConfirmLoading = ref(false);
  let recordCropRect: CropBox | null = null;
  let lastRecordBox: CropBox | null = args.getRecordBox?.() ?? null;
  let selectMode: 'record' | 'custom' = 'record';
  let selectConfirmCb: ((box: CropBox) => void) | null = null;
  let selectCancelCb: (() => void) | null = null;
  let recordBgRestore: Pick<
    ViewerSettings['other'],
    'backgroundTransparent' | 'backgroundColor' | 'backgroundColorMode'
  > | null = null;

  // ----------------------------
  // internal: pointer edit
  // ----------------------------
  type EditMode = 'idle' | 'draw' | 'move' | 'resize';
  let editMode: EditMode = 'idle';
  let activeHandle: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null
    = null;

  let selectPointerId: number | null = null;
  let startPt: { x: number; y: number } | null = null;
  let startBox: CropBox | null = null;

  // ----------------------------
  // internal: record pipeline
  // ----------------------------
  let cropCanvas: HTMLCanvasElement | null = null;
  let cropCtx: CanvasRenderingContext2D | null = null;
  let cropRafId: number | null = null;
  /** Whether the capture pump is running. / 录制捕获循环是否运行中。 */
  let pumpActive = false;
  /** Cached crop parameters (in device pixels). */
  let pumpSx = 0;
  let pumpSy = 0;
  let pumpSw = 1;
  let pumpSh = 1;

  const stopPump = (): void => {
    pumpActive = false;
    if (cropRafId) {
      cancelAnimationFrame(cropRafId);
      cropRafId = null;
    }
  };

  const startPump = (): void => {
    const st = getStage();
    if (!st || !cropCanvas || !cropCtx) return;

    // Ensure any previous pump is stopped.
    stopPump();
    pumpActive = true;

    // Kick the stage loop first so it can render before our first capture.
    st.invalidate();

    const pump = (): void => {
      if (!pumpActive) return;
      const s = getStage();
      if (!cropCtx || !cropCanvas || !s) return;

      cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCtx.drawImage(
        s.renderer.domElement,
        pumpSx,
        pumpSy,
        pumpSw,
        pumpSh,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height,
      );

      // stopPump() may be called while this callback is running.
      if (!pumpActive) return;

      // Ask the stage to render again for the next pump tick.
      // The stage is invalidate-on-demand; without this, a static scene may stop rendering and
      // some browsers can produce an almost-empty WebM.
      if (!pumpActive) return;
      s.invalidate();

      if (!pumpActive) return;
      cropRafId = window.requestAnimationFrame(pump);
    };

    cropRafId = window.requestAnimationFrame(pump);
  };

  const getRecordBgColor = (): string => {
    const mode = getThemeMode();
    if (mode === 'dark') return '#000000';
    if (mode === 'light') return '#ffffff';
    return isDark.value ? '#000000' : '#ffffff';
  };

  const applyRecordBackground = (): void => {
    if (!patchSettings || !args.getSettings) return;
    if (recordBgRestore) return;
    const settings = args.getSettings();
    if (!settings.other.backgroundTransparent) return;
    recordBgRestore = {
      backgroundTransparent: settings.other.backgroundTransparent,
      backgroundColor: settings.other.backgroundColor,
      backgroundColorMode: settings.other.backgroundColorMode,
    };
    patchSettings({
      other: {
        backgroundTransparent: false,
        backgroundColor: getRecordBgColor(),
        backgroundColorMode: 'custom',
      },
    });
  };

  const restoreRecordBackground = (): void => {
    if (!recordBgRestore || !patchSettings) return;
    patchSettings({
      other: {
        backgroundTransparent: recordBgRestore.backgroundTransparent,
        backgroundColor: recordBgRestore.backgroundColor,
        backgroundColorMode: recordBgRestore.backgroundColorMode,
      },
    });
    recordBgRestore = null;
  };

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  // timer
  let recordTimerId: number | null = null;
  let recordStartTs = 0;
  let recordAccumulated = 0;
  let recordDelayTimerId: number | null = null;
  let recordDelayTickId: number | null = null;
  let recordDelayStartTs = 0;
  let recordDelayMs = 0;

  // ----------------------------
  // helpers
  // ----------------------------
  function getCanvasClientRect(): DOMRect | null {
    const stage = getStage();
    if (!stage) return null;
    return stage.renderer.domElement.getBoundingClientRect();
  }

  function toLocalXY(e: PointerEvent): { x: number; y: number } | null {
    const r = getCanvasClientRect();
    if (!r) return null;
    return {
      x: clampNumber(e.clientX - r.left, 0, r.width),
      y: clampNumber(e.clientY - r.top, 0, r.height),
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
    const x = clampNumber(b.x, 0, r.width);
    const y = clampNumber(b.y, 0, r.height);
    const w = clampNumber(b.w, 0, r.width - x);
    const h = clampNumber(b.h, 0, r.height - y);
    return { x, y, w, h };
  }

  function getInitDraftBox(): CropBox | null {
    if (!lastRecordBox) return null;
    const b = clampBoxToCanvas(normBox(lastRecordBox));
    if (b.w < 8 || b.h < 8) return null;
    return b;
  }

  // 从外部同步最近一次录制框。
  // Sync last record crop box from outside (e.g. restored settings).
  function setLastRecordBox(box: CropBox | null): void {
    lastRecordBox = box ? { ...box } : null;
  }

  function resetSelectOverrides(): void {
    selectHint.value = null;
    selectConfirmLabel.value = null;
    selectCancelLabel.value = null;
    showDelayInput.value = true;
    selectMode = 'record';
    selectConfirmCb = null;
    selectCancelCb = null;
  }

  function resetSelectState(): void {
    editMode = 'idle';
    activeHandle = null;
    selectPointerId = null;
    startPt = null;
    startBox = null;
  }

  // ----------------------------
  // timer
  // ----------------------------
  function startRecordTimer(): void {
    recordAccumulated = 0;
    recordStartTs = performance.now();
    recordElapsedMs.value = 0;

    recordTimerId = window.setInterval(() => {
      recordElapsedMs.value
        = recordAccumulated + (performance.now() - recordStartTs);
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
      recordElapsedMs.value
        = recordAccumulated + (performance.now() - recordStartTs);
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

  function clearRecordDelayTimer(): void {
    if (recordDelayTimerId) {
      clearTimeout(recordDelayTimerId);
      recordDelayTimerId = null;
    }
    if (recordDelayTickId) {
      clearInterval(recordDelayTickId);
      recordDelayTickId = null;
    }
    recordDelayRemainingSec.value = 0;
    isRecordDelayActive.value = false;
  }

  const recordTimeText = computed(() => {
    const s = Math.floor(recordElapsedMs.value / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });

  // ----------------------------
  // record core
  // ----------------------------
  function startRecordCropped(streamFps = 60): void {
    const stage = getStage();
    if (!stage || isRecording.value) return;
    if (!recordCropRect) return;

    clearRecordDelayTimer();
    applyRecordBackground();

    // 建 crop canvas
    if (!cropCanvas) cropCanvas = document.createElement('canvas');
    cropCtx = cropCanvas.getContext('2d', { alpha: true });
    if (!cropCtx) {
      restoreRecordBackground();
      return;
    }

    // IMPORTANT: use renderer pixel ratio (may be clamped, e.g. to 2) instead of
    // window.devicePixelRatio; otherwise crop coordinates can be wrong on high-DPR devices.
    const dpr = stage.renderer.getPixelRatio?.() ?? (window.devicePixelRatio || 1);

    // 选择框是 CSS 像素，src 实际像素乘 dpr
    const sx = Math.round(recordCropRect.x * dpr);
    const sy = Math.round(recordCropRect.y * dpr);
    const sw = Math.round(recordCropRect.w * dpr);
    const sh = Math.round(recordCropRect.h * dpr);

    cropCanvas.width = Math.max(1, sw);
    cropCanvas.height = Math.max(1, sh);

    // Cache pump parameters and start pump.
    pumpSx = sx;
    pumpSy = sy;
    pumpSw = Math.max(1, sw);
    pumpSh = Math.max(1, sh);
    startPump();

    const stream = cropCanvas.captureStream(streamFps);

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
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
    const mr = mediaRecorder;
    if (!mr || !stage) return;

    // Stop pumping immediately to avoid wasting CPU and to stop forcing the stage loop.
    stopPump();

    // 先挂 onstop（关键：避免竞态）
    mr.onstop = () => {
      stopPump();

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename({
        modelFileName: args.getModelFileName?.(),
        ext: '.webm',
      });
      a.click();

      // 不要立刻 revoke，延迟释放更稳
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

      stopRecordTimer();

      mediaRecorder = null;
      isRecording.value = false;
      isRecordPaused.value = false;
      restoreRecordBackground();
    };

    // 让 recorder 尽量把最后缓存吐出来（有的浏览器有效）
    try {
      mr.requestData();
    }
    catch {
      // ignore
    }

    mr.stop();

    recordCropBox.value = null;
    recordCropRect = null;
  }

  function togglePause(): void {
    if (!mediaRecorder) return;

    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      pauseRecordTimer();
      isRecordPaused.value = true;

      // Stop the capture pump while paused to avoid unnecessary renders/CPU.
      stopPump();
    }
    else if (mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      resumeRecordTimer();
      isRecordPaused.value = false;

      // Resume pump (and keep the stage rendering) when recording resumes.
      startPump();
    }
  }

  function toggleRecord(): void {
    clearRecordDelayTimer();
    if (isRecording.value) {
      stopRecord();
      return;
    }

    resetSelectOverrides();
    showDelayInput.value = true;
    selectMode = 'record';

    // 进入框选模式
    isSelectingRecordArea.value = true;
    recordDraftBox.value = getInitDraftBox();

    resetSelectState();
  }

  // ----------------------------
  // overlay edit handlers
  // ----------------------------
  function onRecordOverlayDown(e: PointerEvent): void {
    if (!isSelectingRecordArea.value) return;

    const el = e.target as HTMLElement | null;
    if (el?.closest('.record-select-actions')) return;
    if (el?.closest('.record-select-hint')) return;

    const p = toLocalXY(e);
    if (!p) return;

    selectPointerId = e.pointerId;
    startPt = p;
    startBox = recordDraftBox.value ? { ...recordDraftBox.value } : null;

    const target = e.target as HTMLElement;
    const h = (target?.dataset?.h ?? null) as
      | 'n'
      | 's'
      | 'e'
      | 'w'
      | 'nw'
      | 'ne'
      | 'sw'
      | 'se'
      | null;

    const hasBox = !!recordDraftBox.value;

    if (hasBox && h) {
      editMode = 'resize';
      activeHandle = h;
    }
    else if (hasBox && startBox) {
      editMode = 'move';
      activeHandle = null;
    }
    else {
      editMode = 'draw';
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

    if (editMode === 'draw') {
      const b0 = recordDraftBox.value;
      if (!b0) return;
      recordDraftBox.value = normBox({ x: b0.x, y: b0.y, w: dx, h: dy });
      return;
    }

    if (!startBox) return;

    if (editMode === 'move') {
      recordDraftBox.value = clampBoxToCanvas({
        x: startBox.x + dx,
        y: startBox.y + dy,
        w: startBox.w,
        h: startBox.h,
      });
      return;
    }

    if (editMode === 'resize') {
      const b: CropBox = { ...startBox };

      if (activeHandle?.includes('w')) {
        b.x = startBox.x + dx;
        b.w = startBox.w - dx;
      }
      if (activeHandle?.includes('e')) {
        b.w = startBox.w + dx;
      }
      if (activeHandle?.includes('n')) {
        b.y = startBox.y + dy;
        b.h = startBox.h - dy;
      }
      if (activeHandle?.includes('s')) {
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
    editMode = 'idle';
    activeHandle = null;
  }

  function cancelRecordSelect(): void {
    if (selectConfirmLoading.value) return;
    clearRecordDelayTimer();
    isSelectingRecordArea.value = false;
    recordDraftBox.value = null;

    resetSelectState();

    const onCancel = selectCancelCb;
    resetSelectOverrides();
    selectConfirmLoading.value = false;
    onCancel?.();
  }

  function onRecordOverlayCancel(): void {
    cancelRecordSelect();
  }

  async function confirmRecordSelect(): Promise<void> {
    if (selectConfirmLoading.value) return;
    const box = recordDraftBox.value;
    if (!box) return;

    if (box.w < 8 || box.h < 8) {
      message.warning(t?.('viewer.record.tooSmall') ?? 'Selection too small');
      return;
    }

    if (selectMode !== 'record') {
      const onConfirm = selectConfirmCb;
      selectConfirmLoading.value = true;
      try {
        await Promise.resolve(onConfirm?.(box));
      }
      finally {
        selectConfirmLoading.value = false;
      }
      isSelectingRecordArea.value = false;
      recordDraftBox.value = null;
      lastRecordBox = box;
      resetSelectOverrides();
      return;
    }

    isSelectingRecordArea.value = false;
    recordDraftBox.value = null;
    lastRecordBox = box;

    recordCropRect = box;
    recordCropBox.value = box;
    // 持久化最近一次录制框。
    // Persist the latest record crop box.
    args.onRecordBoxChange?.({ ...box });

    const fps = Math.max(1, Math.floor(args.getRecordFps?.() ?? 60));
    const delaySec = Math.max(0, Number(recordDelaySec.value) || 0);
    if (delaySec <= 0) {
      startRecordCropped(fps);
      return;
    }

    clearRecordDelayTimer();
    recordDelayStartTs = performance.now();
    recordDelayMs = delaySec * 1000;
    recordDelayRemainingSec.value = delaySec;
    isRecordDelayActive.value = true;
    recordDelayTickId = window.setInterval(() => {
      const elapsed = performance.now() - recordDelayStartTs;
      const remainMs = Math.max(0, recordDelayMs - elapsed);
      recordDelayRemainingSec.value = remainMs / 1000;
      if (remainMs <= 0 && recordDelayTickId) {
        clearInterval(recordDelayTickId);
        recordDelayTickId = null;
      }
    }, 100);
    recordDelayTimerId = window.setTimeout(() => {
      recordDelayTimerId = null;
      startRecordCropped(fps);
    }, Math.round(delaySec * 1000));
  }

  function selectExportArea(opts: {
    onConfirm: (box: CropBox) => Promise<void> | void;
    onCancel?: () => void;
    hint?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): void {
    if (isRecording.value) return;

    clearRecordDelayTimer();
    selectMode = 'custom';
    selectConfirmCb = opts.onConfirm;
    selectCancelCb = opts.onCancel ?? null;

    selectHint.value = opts.hint ?? null;
    selectConfirmLabel.value = opts.confirmLabel ?? null;
    selectCancelLabel.value = opts.cancelLabel ?? null;
    showDelayInput.value = false;

    isSelectingRecordArea.value = true;
    recordDraftBox.value = getInitDraftBox();
    resetSelectState();
  }

  function cancelRecordDelay(): void {
    clearRecordDelayTimer();
    isSelectingRecordArea.value = false;
    recordDraftBox.value = null;
    recordCropBox.value = null;
    recordCropRect = null;
  }

  return {
    isRecording,
    isRecordPaused,
    recordElapsedMs,
    recordTimeText,
    recordDelaySec,
    recordDelayRemainingSec,
    isRecordDelayActive,
    cancelRecordDelay,
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
    selectConfirmLoading,

    recordCropBox,

    selectHint,
    selectConfirmLabel,
    selectCancelLabel,
    showDelayInput,
    selectExportArea,
    setLastRecordBox,
  };
}
