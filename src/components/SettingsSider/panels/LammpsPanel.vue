<template>
  <a-form layout="vertical">
    <LayerScopeControl v-model:scope="scope" />

    <a-form-item class="settings-gap-top-md">
      <a-row align="middle" justify="space-between" class="settings-gap-bottom-sm">
        <a-col>
          <a-typography-text>
            {{ t('settings.panel.lammps.mapLabel') }}
          </a-typography-text>
        </a-col>
        <a-col flex="1" class="header-right">
          <a-tooltip :title="t('settings.panel.lammps.alert')" placement="left">
            <a-button
              type="text"
              :aria-label="t('settings.panel.lammps.alert')"
              :title="t('settings.panel.lammps.alert')"
            >
              <QuestionCircleOutlined />
            </a-button>
          </a-tooltip>
        </a-col>
      </a-row>

      <div
        v-for="(typeId, idx) in activeLayerTypeIds"
        :key="`${typeId}-${idx}`"
        class="settings-gap-bottom-sm"
      >
        <a-row align="middle" :gutter="8">
          <a-col :span="0.5" />

          <a-col :span="3">
            <a-tag color="processing" variant="outlined">
              {{ typeId }}
            </a-tag>
          </a-col>
          <a-col :span="1" />

          <a-col :span="3">
            →
          </a-col>

          <a-col :span="16">
            <a-select
              show-search
              :title="t('settings.panel.lammps.elementPlaceholder')"
              :value="draftMap[String(typeId)] || 'E'"
              :options="atomicOptions"
              :filter-option="filterAtomicOption"
              @change="onLammpsElementChange(idx, $event)"
            />
          </a-col>
        </a-row>
      </div>

      <div class="settings-gap-top-sm">
        <a-button
          block
          type="primary"
          :disabled="!hasAnyLayer"
          @click="onApplyTypeMap"
        >
          {{ t('settings.panel.lammps.apply') }}
        </a-button>
      </div>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.lammps.hint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
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
<style scoped lang="css">

</style>
