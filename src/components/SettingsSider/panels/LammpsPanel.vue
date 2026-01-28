<template>
  <a-form layout="vertical">
    <a-alert type="info" show-icon :message="t('settings.panel.lammps.alert')" />

    <a-space :size="6" class="settings-gap-top-sm settings-flex-wrap">
      <a-typography-text type="secondary">
        {{ t('settings.panel.lammps.currentLayer') }}:
      </a-typography-text>
      <a-tooltip v-if="activeLayerInfo" :title="activeLayerInfo.sourceFileName || activeLayerInfo.id">
        <a-tag class="settings-tag-full">
          <span class="settings-tag-ellipsis">
            {{ activeLayerInfo.name }}
          </span>
        </a-tag>
      </a-tooltip>
      <a-typography-text v-else type="secondary">
        -
      </a-typography-text>
    </a-space>

    <a-row justify="space-between" align="middle" class="settings-gap-top-sm">
      <a-col>
        <a-typography-text type="secondary">
          {{ t('settings.panel.lammps.applyAll') }}
        </a-typography-text>
      </a-col>
      <a-col>
        <a-switch v-model:checked="applyAllLayersModel" />
      </a-col>
    </a-row>

    <a-form-item :label="t('settings.panel.lammps.mapLabel')" class="settings-gap-top-md">
      <div
        v-for="(row, idx) in lammpsTypeMapModel"
        :key="`${row.typeId}-${idx}`"
        class="settings-gap-bottom-sm"
      >
        <a-row :gutter="8" align="middle">
          <a-col :span="6">
            <a-tag class="settings-lammps-type">
              {{ row.typeId }}
            </a-tag>
          </a-col>

          <a-col :span="18">
            <a-select
              show-search
              :aria-label="t('settings.panel.lammps.elementPlaceholder')"
              :title="t('settings.panel.lammps.elementPlaceholder')"
              :value="row.element"
              class="settings-full-width"
              :placeholder="t('settings.panel.lammps.elementPlaceholder')"
              :options="atomicOptions"
              :filter-option="filterAtomicOption"
              @change="onLammpsElementChange(idx, $event)"
            />
          </a-col>
        </a-row>
      </div>

      <div class="settings-gap-top-sm">
        <a-row :gutter="8">
          <a-col :span="12">
            <a-button
              block
              type="primary"
              :disabled="!hasAnyLayer"
              @click="onApplyTypeMap"
            >
              {{ t('settings.panel.lammps.apply') }}
            </a-button>
          </a-col>
          <a-col :span="12">
            <a-button
              block
              :disabled="!hasAnyLayer || !hasUndo"
              @click="onUndoTypeMap"
            >
              {{ t('settings.panel.lammps.undo') }}
            </a-button>
          </a-col>
        </a-row>
      </div>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.lammps.hint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOL_LIST, normalizeElementSymbol } from '../../../lib/structure/chem';
import { readApplyAllLayersFlags, writeApplyAllLayersFlags } from '../applyAllStorage';
import {
  lammpsRecordToRows,
  lammpsRowsToRecord,
  type LammpsTypeMapRecord,
} from '../../../lib/viewer/settings';

type LammpsTypeMapRow = { typeId: number; element: string };

const { t } = useI18n();
const { patchSettings, hasAnyLayer, settings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const activeLayerTypeIds = computed(() => viewerApi.value?.activeLayerTypeIds.value ?? []);

const lammpsTypeMapModel = computed<LammpsTypeMapRow[]>({
  get: () => {
    const map = viewerApi.value?.activeLayerTypeMap.value ?? {};
    return (activeLayerTypeIds.value ?? []).map(tid => ({
      typeId: tid,
      element: normalizeElementSymbol(map[String(tid)] ?? '') || 'E',
    }));
  },
  set: (rows) => {
    const map = lammpsRowsToRecord(rows);
    viewerApi.value?.setActiveLayerTypeMap(map);
  },
});

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

const lastApplied = ref<LammpsTypeMapRecord | null>(null);
const hasUndo = computed(() => Object.keys(lastApplied.value ?? {}).length > 0);

watch(
  () => activeLayerId.value,
  () => {
    lastApplied.value = { ...(viewerApi.value?.activeLayerTypeMap.value ?? {}) };
  },
  { immediate: true },
);

const applyAllLayersModel = computed<boolean>({
  get: () => settings.value.lammps.applyAllLayers
    ?? readApplyAllLayersFlags().lammps
    ?? false,
  set: (v: boolean) => {
    patchSettings({ lammps: { applyAllLayers: v } });
    writeApplyAllLayersFlags({
      ...readApplyAllLayersFlags(),
      lammps: v,
    });
    if (v) {
      const map = lammpsRowsToRecord(lammpsTypeMapModel.value);
      patchSettings({ lammps: { data: map } });
      viewerApi.value?.applyTypeMapToAllLayers?.(map);
    }
  },
});

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.map((row, i) =>
    i === idx ? { ...row, element } : row,
  );
}

function onApplyTypeMap(): void {
  const map = lammpsRowsToRecord(lammpsTypeMapModel.value);
  lastApplied.value = { ...map };
  patchSettings({ lammps: { data: map } });
  if (applyAllLayersModel.value) {
    viewerApi.value?.applyTypeMapToAllLayers?.(map);
  }
  else {
    viewerApi.value?.setActiveLayerTypeMap?.(map);
    viewerApi.value?.refreshTypeMap?.();
  }
}

function onUndoTypeMap(): void {
  if (!lastApplied.value) return;
  const map = { ...lastApplied.value };
  lammpsTypeMapModel.value = lammpsRecordToRows(map);
  patchSettings({ lammps: { data: map } });
  if (applyAllLayersModel.value) {
    viewerApi.value?.applyTypeMapToAllLayers?.(map);
  }
  else {
    viewerApi.value?.setActiveLayerTypeMap?.(map);
    viewerApi.value?.refreshTypeMap?.();
  }
}
</script>
