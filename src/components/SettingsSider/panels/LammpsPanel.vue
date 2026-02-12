<template>
  <a-flex vertical gap="small">
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

    <a-row
      v-for="(typeId, idx) in activeLayerTypeIds"
      :key="`${typeId}-${idx}`"
      align="middle"
      style="padding-inline: 8px;"
    >
      <a-col :span="8">
        <a-tag color="processing" variant="outlined">
          {{ typeId }}
        </a-tag>
      </a-col>
      <a-col :span="2" style="text-align: center;">
        <a-typography-text>→</a-typography-text>
      </a-col>
      <a-col :span="14" style="text-align: right;">
        <a-select
          show-search
          size="small"
          style="width: 120px;"
          :value="draftMap[String(typeId)] || 'E'"
          :options="atomicOptions"
          :filter-option="filterAtomicOption"
          @change="onLammpsElementChange(idx, $event)"
        />
      </a-col>
    </a-row>

    <a-button
      block
      type="primary"
      style="margin-top: 8px;"
      :disabled="!hasAnyLayer"
      @click="onApplyTypeMap"
    >
      {{ t('settings.panel.lammps.apply') }}
    </a-button>

    <a-typography-text type="secondary" class="small-text">
      {{ t('settings.panel.lammps.hint') }}
    </a-typography-text>
  </a-flex>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { QuestionCircleOutlined } from '@antdv-next/icons';

import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOL_LIST, normalizeElementSymbol } from '../../../lib/structure/chem';
import LayerScopeControl from '../parts/LayerScopeControl.vue';
import { useLayerScope } from '../useLayerScope';
import { getDefaultLayerScope } from '../layerScopeStorage';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
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

function resetLammpsTypeMap(): void {
  // 重置生效范围为默认值。
  // Reset effect range to default.
  const defaultScope = getDefaultLayerScope('lammps');
  scope.value = defaultScope;
  const typeIds = viewerApi.value?.activeLayerTypeIds?.value ?? [];
  const nextMap: LammpsTypeMapRecord = {};
  for (const tid0 of typeIds) {
    const tid = Math.max(1, Math.floor(tid0));
    if (!Number.isFinite(tid)) continue;
    nextMap[String(tid)] = 'E';
  }
  draftMap.value = { ...nextMap };
  viewerApi.value?.setActiveLayerTypeMap?.(nextMap);
  viewerApi.value?.refreshTypeMap?.();
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterLammpsReset = registerPanelReset(PANEL_KEYS.lammps, resetLammpsTypeMap);
onBeforeUnmount(() => {
  unregisterLammpsReset();
});

</script>
