<template>
  <a-row
    align="middle"
    :gutter="8"
  >
    <a-col :span="8">
      <a-typography-text>
        {{ t('settings.panel.scope.effectRangeLabel') }}
      </a-typography-text>
    </a-col>
    <a-col :span="16">
      <a-select
        v-model:value="scopeModel"
        class="settings-full-width"
        :options="scopeOptions"
        :placeholder="t('settings.panel.scope.selectPlaceholder')"
      />
    </a-col>
  </a-row>

  <a-divider style="margin-top: 8px;" plain>
    <a-popover trigger="click" :content="activeLayerName">
      <a-typography-text
        type="secondary"
        :ellipsis="{ tooltip: false }"
        style="max-width: 28ch; cursor: pointer; "
      >
        {{ t('settings.panel.scope.currentLayerLabel') }}: {{ activeLayerName }}
      </a-typography-text>
    </a-popover>
  </a-divider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import type { LayerScope } from '../layerScopeStorage';
import { formatLayerDisplayName } from '../../../lib/viewer/layerDisplayName';

const props = defineProps<{
  scope: LayerScope;
}>();
const emit = defineEmits<{
  (e: 'update:scope', value: LayerScope): void;
}>();

const scopeModel = computed({
  get: () => props.scope,
  set: (value: LayerScope) => {
    emit('update:scope', value);
  },
});

const { t } = useI18n();
const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});
// 当前激活图层名（用于省略展示与点击弹出完整内容）。
// Active layer name for ellipsis display and click popover content.
const activeLayerName = computed(() =>
  formatLayerDisplayName(activeLayerInfo.value, layerList.value),
);

const scopeOptions = computed(() => ([
  { value: 'current', label: t('settings.panel.scope.options.current') },
  { value: 'visible', label: t('settings.panel.scope.options.visible') },
  { value: 'all', label: t('settings.panel.scope.options.all') },
]));
</script>
