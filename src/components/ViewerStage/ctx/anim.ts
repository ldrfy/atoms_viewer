import type { Ref } from 'vue';
import type { ViewerSettings } from '../../../lib/viewer/settings';
import type { RecordingBindings } from '../recording';
import type { MaybeRef } from './common';

export type AnimCtx = {
  hasModel: MaybeRef<boolean>;

  // animation
  hasAnimation: MaybeRef<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: MaybeRef<boolean>;
  fps: Ref<number>;
  setFrame: (idx0: number) => void;
  togglePlay: () => void;

  // record
  isRecording: MaybeRef<boolean>;
  isRecordPaused: MaybeRef<boolean>;
  recordTimeText: MaybeRef<string>;
  toggleRecord: () => void;
  togglePause: () => void;

  // bg
  settings: MaybeRef<ViewerSettings>;
  patchSettings: (patch: Partial<ViewerSettings>) => void;
};

export function createAnimCtx(args: {
  hasModel: MaybeRef<boolean>;

  // animation
  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx0: number) => void;
  togglePlay: () => void;

  // record
  recording: RecordingBindings;

  // bg
  settingsRef: Readonly<Ref<ViewerSettings>>;
  patchSettings?: (patch: Partial<ViewerSettings>) => void;
}): AnimCtx {
  const patch = args.patchSettings ?? (() => void 0);

  return {
    hasModel: args.hasModel,

    hasAnimation: args.hasAnimation,
    frameIndex: args.frameIndex,
    frameCount: args.frameCount,
    isPlaying: args.isPlaying,
    fps: args.fps,
    setFrame: args.setFrame,
    togglePlay: args.togglePlay,

    isRecording: args.recording.isRecording,
    isRecordPaused: args.recording.isRecordPaused,
    recordTimeText: args.recording.recordTimeText,
    toggleRecord: args.recording.toggleRecord,
    togglePause: args.recording.togglePause,

    settings: args.settingsRef,
    patchSettings: patch,
  };
}
