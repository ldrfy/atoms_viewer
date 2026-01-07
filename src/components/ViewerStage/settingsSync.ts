import type { ViewerSettings } from '../../lib/viewer/settings';

export type PatchSettingsFn = (patch: Partial<ViewerSettings>) => void;

export type SettingsSync = {
  patch: (patch: Partial<ViewerSettings>) => void;
  suspend: (ms?: number) => void;
  isSuppressed: () => boolean;
};

export function createSettingsSync(patchSettings?: PatchSettingsFn): SettingsSync {
  // Suppress settings writes for a short window to avoid feedback loops.
  // 短时间内抑制设置写回，避免视图/控件间的反馈回环。
  let suppressUntil = 0;

  const isSuppressed = (): boolean => performance.now() < suppressUntil;

  const suspend = (ms = 200): void => {
    suppressUntil = Math.max(suppressUntil, performance.now() + ms);
  };

  const patch = (patch: Partial<ViewerSettings>): void => {
    if (!patchSettings) return;
    if (isSuppressed()) return;
    patchSettings(patch);
  };

  return { patch, suspend, isSuppressed };
}
