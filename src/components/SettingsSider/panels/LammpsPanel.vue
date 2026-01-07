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

    <a-form-item :label="t('settings.panel.lammps.mapLabel')" class="settings-gap-top-md">
      <div
        v-for="(row, idx) in lammpsTypeMapModel"
        :key="`${row.typeId}-${idx}`"
        class="settings-gap-bottom-sm"
      >
        <a-row :gutter="8" align="middle">
          <a-col :span="8">
            <a-input-number
              :aria-label="t('settings.panel.lammps.typePlaceholder')"
              :title="t('settings.panel.lammps.typePlaceholder')"
              :min="1"
              :step="1"
              :value="row.typeId"
              class="settings-full-width"
              :placeholder="t('settings.panel.lammps.typePlaceholder')"
              @change="onLammpsTypeId(idx, $event)"
            />
          </a-col>

          <a-col :span="10">
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

          <a-col :span="6">
            <a-button danger block @click="removeLammpsRow(idx)">
              {{ t('common.delete') }}
            </a-button>
          </a-col>
        </a-row>
      </div>

      <a-row :gutter="8">
        <a-col :span="12">
          <a-button block @click="addLammpsRow">
            {{ t('settings.panel.lammps.addMapping') }}
          </a-button>
        </a-col>
        <a-col :span="12">
          <a-button block @click="clearLammpsRows">
            {{ t('settings.panel.lammps.clear') }}
          </a-button>
        </a-col>
      </a-row>

      <div class="settings-gap-top-sm">
        <a-button
          block
          type="primary"
          :disabled="!hasAnyLayer"
          @click="onRefreshTypeMap"
        >
          {{ t('settings.panel.lammps.refresh') }}
        </a-button>
      </div>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.lammps.hint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOLS, normalizeElementSymbol } from '../../../lib/structure/chem';

type LammpsTypeMapItem = { typeId: number; element: string };

const { t } = useI18n();
const { patchSettings, hasAnyLayer } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const lammpsTypeMapModel = computed<LammpsTypeMapItem[]>({
  get: () => (viewerApi.value?.activeLayerTypeMap.value as (LammpsTypeMapItem[] | undefined)) ?? [],
  set: v => viewerApi.value?.setActiveLayerTypeMap(v),
});

const atomicOptions = computed(() =>
  ATOMIC_SYMBOLS.map((symRaw) => {
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

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function toElement(v: unknown): string {
  return normalizeElementSymbol(String(v ?? '')) || 'E';
}

function addLammpsRow(): void {
  const used = new Set(lammpsTypeMapModel.value.map(r => toInt((r as any).typeId, 1)));
  let next = 1;
  while (used.has(next)) next += 1;
  lammpsTypeMapModel.value = [...lammpsTypeMapModel.value, { typeId: next, element: 'E' }];
}

function removeLammpsRow(idx: number): void {
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.filter((_, i) => i !== idx);
}

function clearLammpsRows(): void {
  lammpsTypeMapModel.value = [];
  patchSettings({ lammpsTypeMap: [] });
}

function onLammpsTypeId(idx: number, v: unknown): void {
  const typeId = toInt(v, 1);
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.map((row, i) =>
    i === idx ? { ...row, typeId } : row,
  );
}

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.map((row, i) =>
    i === idx ? { ...row, element } : row,
  );
}

function onRefreshTypeMap(): void {
  viewerApi.value?.refreshTypeMap();
}
</script>
