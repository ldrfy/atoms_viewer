<template>
  <a-space direction="vertical" :size="12" class="settings-full-width">
    <LayerScopeControl v-model:scope="scope" />

    <a-flex align="center" justify="space-between">
      <a-typography-text>
        {{ t('settings.panel.lammps.mapLabel') }}
      </a-typography-text>
      <a-tooltip :title="t('settings.panel.lammps.alert')" placement="left">
        <a-button
          variant="link"
          color="default"
        >
          <QuestionCircleOutlined />
        </a-button>
      </a-tooltip>
    </a-flex>

    <a-flex
      v-for="(typeId, idx) in activeLayerTypeIds"
      :key="`${typeId}-${idx}`"
      :gap="32"
      align="center"
      class="settings-full-width"
    >
      <a-tag color="processing" variant="outlined">
        {{ typeId }}
      </a-tag>
      <a-typography-text>→</a-typography-text>
      <a-select
        show-search
        style="flex: 1; min-width: 0;"
        :value="draftMap[String(typeId)] || 'E'"
        :options="atomicOptions"
        :filter-option="filterAtomicOption"
        @change="onLammpsElementChange(idx, $event)"
      />
    </a-flex>
    <a-space direction="vertical" :size="5">
      <a-button
        block
        type="primary"
        :disabled="!hasAnyLayer"
        @click="onApplyTypeMap"
      >
        {{ t('settings.panel.lammps.apply') }}
      </a-button>

      <a-typography-text type="secondary">
        {{ t('settings.panel.lammps.hint') }}
      </a-typography-text>
    </a-space>
  </a-space>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { QuestionCircleOutlined } from '@antdv-next/icons';

import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOL_LIST, normalizeElementSymbol } from '../../../lib/structure/chem';
import LayerScopeControl from './LayerScopeControl.vue';
import { useLayerScope } from '../useLayerScope';
import type { LammpsTypeMapRecord } from '../../../lib/viewer/settings';

const { t } = useI18n();
const { hasAnyLayer } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);

const activeLayerTypeIds = computed(() => viewerApi.value?.activeLayerTypeIds.value ?? []);

const draftMap = ref<LammpsTypeMapRecord>({});
const scope = useLayerScope('lammps');

const atomicOptions = computed(() =>
  ATOMIC_SYMBOL_LIST.map((symRaw) => {
    const sym = normalizeElementSymbol(symRaw) || 'E';
    return { value: sym, label: sym === 'E' ? 'E (Unknown)' : sym };
  }),
);

function filterAtomicOption(
  input: string,
  option?: { value?: unknown; label?: unknown },
): boolean {
  const q = (input ?? '').trim().toLowerCase();
  if (!q) return true;
  const value = String(option?.value ?? '').toLowerCase();
  const label = String(option?.label ?? '').toLowerCase();
  return value.includes(q) || label.includes(q);
}

function toElement(v: unknown): string {
  return normalizeElementSymbol(String(v ?? '')) || 'E';
}

watch(
  () => [activeLayerId.value, activeLayerTypeIds.value, viewerApi.value?.activeLayerTypeMapApplied?.value],
  () => {
    const map = viewerApi.value?.activeLayerTypeMap.value ?? {};
    draftMap.value = { ...map };
  },
  { immediate: true },
);

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  const typeIds = activeLayerTypeIds.value ?? [];
  const tid = typeIds[idx];
  if (!tid) return;
  draftMap.value = { ...draftMap.value, [String(tid)]: element };
}

function onApplyTypeMap(): void {
  const map = { ...draftMap.value };
  if (scope.value === 'all') {
    viewerApi.value?.applyTypeMapToAllLayers?.(map);
    return;
  }
  if (scope.value === 'visible') {
    viewerApi.value?.applyTypeMapToVisibleLayers?.(map);
    return;
  }
  viewerApi.value?.setActiveLayerTypeMap?.(map);
  viewerApi.value?.refreshTypeMap?.();
}

</script>
