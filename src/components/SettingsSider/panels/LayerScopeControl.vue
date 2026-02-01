<template>
  <a-row
    class="settings-gap-top-sm"
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

  <a-divider style="margin-top: 8px;">
    <a-typography-text type="secondary">
      {{ t('settings.panel.scope.currentLayerLabel') }}:{{ activeLayerInfo?.name ?? "-" }}
    </a-typography-text>
  </a-divider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import type { LayerScope } from '../layerScopeStorage';

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

const scopeOptions = computed(() => ([
  { value: 'current', label: t('settings.panel.scope.options.current') },
  { value: 'visible', label: t('settings.panel.scope.options.visible') },
  { value: 'all', label: t('settings.panel.scope.options.all') },
]));
</script>
