import type { RecordingBindings, CropBox } from '../recording';
import type { MaybeRef } from './common';

/**
 * Ctx for record area selection overlay.
 */
export type RecordSelectCtx = {
  isSelectingRecordArea: MaybeRef<boolean>;
  recordDraftBox: MaybeRef<CropBox | null>;

  onRecordOverlayDown: (e: PointerEvent) => void;
  onRecordOverlayMove: (e: PointerEvent) => void;
  onRecordOverlayUp: (e: PointerEvent) => void;
  onRecordOverlayCancel: (e?: PointerEvent) => void;

  cancelRecordSelect: () => void;
  confirmRecordSelect: () => void;
};

export function createRecordSelectCtx(
  recording: RecordingBindings,
): RecordSelectCtx {
  return {
    isSelectingRecordArea: recording.isSelectingRecordArea,
    recordDraftBox: recording.recordDraftBox,

    onRecordOverlayDown: recording.onRecordOverlayDown,
    onRecordOverlayMove: recording.onRecordOverlayMove,
    onRecordOverlayUp: recording.onRecordOverlayUp,
    onRecordOverlayCancel: recording.onRecordOverlayCancel as any,

    cancelRecordSelect: recording.cancelRecordSelect,
    confirmRecordSelect: recording.confirmRecordSelect,
  };
}

/**
 * Ctx for showing a dash crop box while recording.
 */
export type CropDashCtx = {
  isRecording: MaybeRef<boolean>;
  recordCropBox: MaybeRef<CropBox | null>;
};

export function createCropDashCtx(
  recording: RecordingBindings,
): CropDashCtx {
  return {
    isRecording: recording.isRecording,
    recordCropBox: recording.recordCropBox,
  };
}
