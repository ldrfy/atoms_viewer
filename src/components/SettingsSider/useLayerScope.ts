import { ref, watch } from 'vue';
import type { Ref } from 'vue';

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
  const stored = readLayerScope(panel);
  const scope = ref<LayerScope>(stored ?? getDefaultLayerScope(panel));
  watch(
    scope,
    (value) => {
      writeLayerScope(panel, value);
    },
    { immediate: true },
  );
  return scope;
}
