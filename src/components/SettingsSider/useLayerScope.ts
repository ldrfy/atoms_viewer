import { ref, watch } from 'vue';
import type { Ref } from 'vue';

import { useSettingsSiderContext } from './useSettingsSiderContext';
import {
  getDefaultLayerScope,
  type LayerScope,
  type PanelScopeKey,
  readLayerScope,
  writeLayerScope,
} from './layerScopeStorage';

// 提供一个响应式的图层作用域状态，并同步到本地存储。
// Provide a reactive layer-scope ref that stays synced with storage.
export function useLayerScope(panel: PanelScopeKey): Ref<LayerScope> {
  const { settings, patchSettings } = useSettingsSiderContext();
  const stored = readLayerScope(panel);
  const defaultScope = getDefaultLayerScope(panel);
  const settingsScope = settings.value.effectRange?.[panel] ?? defaultScope;
  const scope = ref<LayerScope>(settingsScope);

  // 设置默认值但本地有旧值时，做一次迁移到 settings。
  // Migrate legacy storage into settings when only defaults exist.
  if (stored && settingsScope === defaultScope && stored !== settingsScope) {
    scope.value = stored;
    patchSettings({ effectRange: { [panel]: stored } });
  }

  watch(
    () => settings.value.effectRange?.[panel],
    (value) => {
      const next = value ?? defaultScope;
      if (next !== scope.value) scope.value = next;
    },
    { immediate: true },
  );

  watch(
    scope,
    (value) => {
      writeLayerScope(panel, value);
      if ((settings.value.effectRange?.[panel] ?? defaultScope) !== value) {
        patchSettings({ effectRange: { [panel]: value } });
      }
    },
    { immediate: true },
  );
  return scope;
}
