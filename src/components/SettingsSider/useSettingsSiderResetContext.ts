import { inject } from 'vue';

import { settingsSiderResetContextKey } from './context';

export function useSettingsSiderResetContext() {
  const ctx = inject(settingsSiderResetContextKey, null);
  if (!ctx) {
    throw new Error('SettingsSider panels must be used inside <SettingsSider>.');
  }
  return ctx;
}
