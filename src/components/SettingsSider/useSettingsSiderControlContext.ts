import { inject } from 'vue';

import { settingsSiderControlContextKey } from './context';

export function useSettingsSiderControlContext() {
  const ctx = inject(settingsSiderControlContextKey, null);
  if (!ctx) {
    throw new Error('SettingsSider controls must be used inside <SettingsSider>.');
  }
  return ctx;
}
