import type { Ref } from 'vue';
import type { ViewerSettings } from '../../../lib/viewer/settings';
import type { SettingsPatch } from '../../../lib/viewer/mergeSettings';
import type { FrameMeta } from '../../../lib/structure/types';
import type { RecordingBindings } from '../recording';
import type { MaybeRef } from './common';

export type AnimCtx = {
  hasModel: MaybeRef<boolean>;

  // animation
  hasAnimation: MaybeRef<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  frameMeta: Ref<FrameMeta | null>;
  isPlaying: MaybeRef<boolean>;
  fps: Ref<number>;
  setFrame: (idx0: number) => void;
  togglePlay: () => void;

  // record
  isRecording: MaybeRef<boolean>;
  isRecordPaused: MaybeRef<boolean>;
  recordTimeText: MaybeRef<string>;
  recordDelayRemainingSec: MaybeRef<number>;
  isRecordDelayActive: MaybeRef<boolean>;
  cancelRecordDelay: () => void;
  toggleRecord: () => void;
  togglePause: () => void;

  // bg
  settings: MaybeRef<ViewerSettings>;
  patchSettings: (patch: SettingsPatch) => void;
};

export function createAnimCtx(args: {
  hasModel: MaybeRef<boolean>;

  // animation
  hasAnimation: Ref<boolean>;
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  frameMeta: Ref<FrameMeta | null>;
  isPlaying: Ref<boolean>;
  fps: Ref<number>;
  setFrame: (idx0: number) => void;
  togglePlay: () => void;

  // record
  recording: RecordingBindings;

  // bg
  settingsRef: Readonly<Ref<ViewerSettings>>;
  patchSettings?: (patch: SettingsPatch) => void;
}): AnimCtx {
  const patch = args.patchSettings ?? (() => void 0);

  return {
    hasModel: args.hasModel,

    hasAnimation: args.hasAnimation,
    frameIndex: args.frameIndex,
    frameCount: args.frameCount,
    frameMeta: args.frameMeta,
    isPlaying: args.isPlaying,
    fps: args.fps,
    setFrame: args.setFrame,
    togglePlay: args.togglePlay,

    isRecording: args.recording.isRecording,
    isRecordPaused: args.recording.isRecordPaused,
    recordTimeText: args.recording.recordTimeText,
    recordDelayRemainingSec: args.recording.recordDelayRemainingSec,
    isRecordDelayActive: args.recording.isRecordDelayActive,
    cancelRecordDelay: args.recording.cancelRecordDelay,
    toggleRecord: args.recording.toggleRecord,
    togglePause: args.recording.togglePause,

    settings: args.settingsRef,
    patchSettings: patch,
  };
}
