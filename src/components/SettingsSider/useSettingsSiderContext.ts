import { inject } from 'vue';

import { settingsSiderContextKey } from './context';

export function useSettingsSiderContext() {
  const ctx = inject(settingsSiderContextKey, null);
  if (!ctx) {
    throw new Error('SettingsSider panels must be used inside <SettingsSider>.');
  }
  return ctx;
}
