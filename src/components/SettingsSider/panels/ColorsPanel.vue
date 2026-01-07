<template>
  <a-form layout="vertical">
    <a-alert type="info" show-icon :message="t('settings.panel.colors.alert')" />

    <a-space :size="6" class="settings-gap-top-sm settings-flex-wrap">
      <a-typography-text type="secondary">
        {{ t('settings.panel.colors.currentLayer') }}:
      </a-typography-text>
      <a-tooltip v-if="activeLayerInfo" :title="activeLayerInfo.sourceFileName || activeLayerInfo.id">
        <a-tag class="settings-tag-full">
          <span
            class="settings-tag-ellipsis"
          >
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
          {{ t('settings.panel.colors.applyAll') }}
        </a-typography-text>
      </a-col>
      <a-col>
        <a-switch
          v-model:checked="applyToAllLayers"
          :disabled="!hasAnyLayer"
          :aria-label="t('settings.panel.colors.applyAll')"
          :title="t('settings.panel.colors.applyAll')"
        />
      </a-col>
    </a-row>

    <a-form-item :label="t('settings.panel.colors.mapLabel')" class="settings-gap-top-md">
      <template v-if="colorMapModel.length === 0">
        <a-alert type="info" show-icon :message="t('settings.panel.colors.empty')" />
      </template>

      <template v-else>
        <div
          v-for="(row, idx) in colorMapModel"
          :key="`${row.element}-${row.typeId ?? 0}-${idx}`"
          class="settings-gap-bottom-sm"
        >
          <a-row :gutter="8" align="middle">
            <a-col :span="8">
              <a-tag>{{ formatColorKey(row) }}</a-tag>
            </a-col>

            <a-col :span="9">
              <a-input
                :value="row.color"
                :placeholder="t('settings.panel.colors.hexPlaceholder')"
                :aria-label="t('settings.panel.colors.hexPlaceholder')"
                :title="t('settings.panel.colors.hexPlaceholder')"
                @change="onColorHexChange(idx, ($event as any).target?.value)"
              />
            </a-col>

            <a-col :span="4">
              <input
                class="color-picker"
                type="color"
                :value="colorPickerValue(row.color)"
                :aria-label="formatColorKey(row) + ' color'"
                :title="formatColorKey(row) + ' color'"
                @input="onColorPickerChange(idx, ($event as any).target?.value)"
              >
            </a-col>

            <a-col :span="3">
              <a-tooltip v-if="row.isCustom" :title="t('settings.panel.colors.resetTooltip')">
                <a-button
                  class="btn-icon"
                  type="text"
                  size="small"
                  :aria-label="t('settings.panel.colors.reset')"
                  :title="t('settings.panel.colors.resetTooltip')"
                  @click="onResetColor(idx)"
                >
                  <ReloadOutlined />
                </a-button>
              </a-tooltip>
            </a-col>
          </a-row>
        </div>
      </template>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.colors.hint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@ant-design/icons-vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import type { AtomTypeColorMapItem } from '../../../lib/viewer/settings';
import { getElementColorHex } from '../../../lib/structure/chem';

import { getAtomTypeColorKey } from '../../ViewerStage/colorMap';

const { t } = useI18n();
const { patchSettings, hasAnyLayer } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const applyToAllLayers = ref(false);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const colorMapModel = computed<AtomTypeColorMapItem[]>({
  get: () => (viewerApi.value?.activeLayerColorMap.value as (AtomTypeColorMapItem[] | undefined)) ?? [],
  set: (v) => {
    if (!viewerApi.value) return;
    if (applyToAllLayers.value) viewerApi.value.setAllLayersColorMap(v);
    else viewerApi.value.setActiveLayerColorMap(v);
  },
});

function formatColorKey(row: AtomTypeColorMapItem): string {
  return getAtomTypeColorKey(row.element, row.typeId);
}

function normalizeHexColor(input: unknown): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let hex = m[1]!.toUpperCase();
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  return `#${hex}`;
}

function colorPickerValue(color: unknown): string {
  return normalizeHexColor(color) ?? '#FFFFFF';
}

function patchColorAt(idx: number, colorHex: string): void {
  const rows = colorMapModel.value;
  if (!rows || idx < 0 || idx >= rows.length) return;
  const nextRows = rows.map((r, i) =>
    i === idx
      ? {
        ...r,
        color: colorHex,
        // Mark as user-customized so future LAMMPS remapping won't overwrite it.
        isCustom: true,
      }
      : r,
  );
  colorMapModel.value = nextRows;
  patchSettings({ colorMapTemplate: nextRows.map(r => ({ ...r })) });
  scheduleRefreshColorMap();
}

function onResetColor(idx: number): void {
  const rows = colorMapModel.value;
  if (!rows || idx < 0 || idx >= rows.length) return;
  const row = rows[idx];
  const def = getElementColorHex(row?.element ?? 'E');
  const nextRows = rows.map((r, i) =>
    i === idx
      ? {
        ...r,
        color: def,
        // Reset to built-in color; treat it as NOT customized.
        isCustom: false,
      }
      : r,
  );
  colorMapModel.value = nextRows;
  patchSettings({ colorMapTemplate: nextRows.map(r => ({ ...r })) });
  scheduleRefreshColorMap();
}

function onColorHexChange(idx: number, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) {
    message.error(t('settings.panel.colors.invalidHex'));
    return;
  }
  patchColorAt(idx, hex);
}

function onColorPickerChange(idx: number, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) return;
  patchColorAt(idx, hex);
}

let refreshTimer: number | null = null;

function scheduleRefreshColorMap(): void {
  if (!viewerApi.value) return;
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    viewerApi.value?.refreshColorMap({ applyToAll: applyToAllLayers.value });
  }, 120);
}

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
});
</script>
