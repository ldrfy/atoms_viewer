<template>
  <a-form layout="vertical">
    <a-form-item>
      <a-row justify="space-between">
        <a-col>
          {{ t('settings.panel.colors.applyAll') }}
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

      <a-row v-if="!applyToAllLayers">
        <a-space :size="6" class="settings-gap-top-sm settings-flex-wrap">
          <a-typography-text type="secondary">
            {{ t('settings.panel.colors.currentLayer') }}:
          </a-typography-text>
          <a-tooltip v-if="activeLayerInfo" :title="activeLayerInfo.source?.fileName || activeLayerInfo.id">
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
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.colors.mapLabel')" class="settings-gap-top-md">
      <template v-if="colorKeys.length === 0">
        <a-alert type="info" show-icon :message="t('settings.panel.colors.empty')" />
      </template>

      <template v-else>
        <div
          v-for="(key, idx) in colorKeys"
          :key="`${key}-${idx}`"
          class="settings-gap-bottom-sm"
        >
          <a-row :gutter="8" align="middle" class="settings-color-map-row">
            <a-col :span="7">
              <a-tag>{{ key }}</a-tag>
            </a-col>

            <a-col :span="3">
              <a-tooltip v-if="isKeyCustom(key)" :title="t('settings.panel.colors.resetTooltip')">
                <a-button
                  type="text"
                  size="small"
                  :aria-label="t('settings.panel.colors.reset')"
                  :title="t('settings.panel.colors.resetTooltip')"
                  @click="onResetColor(key)"
                >
                  <ReloadOutlined />
                </a-button>
              </a-tooltip>
            </a-col>

            <a-col :span="4">
              <input
                class="color-picker"
                type="color"
                :value="colorPickerValue(colorMap[key] ?? '')"
                :aria-label="t('settings.panel.colors.colorPickerLabel', { key })"
                :title="t('settings.panel.colors.colorPickerLabel', { key })"
                @input="onColorPickerChange(key, ($event as any).target?.value)"
              >
            </a-col>

            <a-col :span="10">
              <a-input
                :value="colorMap[key] ?? ''"
                :placeholder="t('settings.panel.colors.hexPlaceholder')"
                :aria-label="t('settings.panel.colors.hexPlaceholder')"
                :title="t('settings.panel.colors.hexPlaceholder')"
                @change="onColorHexChange(key, ($event as any).target?.value)"
              />
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { parseColorMapKey } from '../../ViewerStage/colorMap';
import { getElementColorHex } from '../../../lib/structure/chem';
import { getVisualStylePreset } from '../../../lib/viewer/visualStyles';
import { readApplyAllLayersFlags, writeApplyAllLayersFlags } from '../applyAllStorage';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

import type { ColorMapRecord } from '../../ViewerStage/colorMap';

const { t } = useI18n();
const { hasAnyLayer, settings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const colorKeys = computed(() => viewerApi.value?.activeLayerColorKeys.value ?? []);
const colorMap = computed(() => viewerApi.value?.activeLayerColorMap.value ?? {});
const applyToAllLayers = ref(
  readApplyAllLayersFlags().colors ?? true,
);

watch(
  applyToAllLayers,
  (v) => {
    writeApplyAllLayersFlags({ colors: v });
    if (!v) return;
    const api = viewerApi.value;
    if (!api) return;
    const map = api.activeLayerColorMap?.value ?? {};
    const keys = api.activeLayerColorKeys?.value ?? [];
    if (keys.length > 0) {
      api.setAllLayersColorMap(map);
      api.refreshColorMap({ applyToAll: true });
    }
  },
);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const colorMapModel = computed<ColorMapRecord>({
  get: () => colorMap.value,
  set: (v) => {
    if (!viewerApi.value) return;
    if (applyToAllLayers.value) viewerApi.value.setAllLayersColorMap(v);
    else viewerApi.value.setActiveLayerColorMap(v);
  },
});

function resetColors(): void {
  const api = viewerApi.value;
  const keys = colorKeys.value;
  if (keys.length === 0) return;
  const baseMap = buildKeyBaseColorMap(keys);
  if (applyToAllLayers.value) {
    if (api) {
      api.resetAllLayersColorMapToDefaults();
      api.refreshColorMap({ applyToAll: true });
    }
    return;
  }
  colorMapModel.value = baseMap;
  scheduleRefreshColorMap();
}

// 为每个颜色键构建默认颜色（避免 C.1 等缺失）。
// Build base color map for every key (keeps C.1, C.2, etc).
function buildKeyBaseColorMap(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = getBaseColorForKey(key);
  }
  return out;
}

function getBaseColorForKey(key: string): string {
  const styleId = settings.value.other.visualStyle ?? 'default';
  const { element } = parseColorMapKey(key);
  if (styleId !== 'default') {
    const preset = getVisualStylePreset(styleId);
    return preset.colorMapTemplate[element] ?? getElementColorHex(element);
  }
  return getElementColorHex(element);
}

function isKeyCustom(key: string, map?: ColorMapRecord): boolean {
  const base = getBaseColorForKey(key);
  const cur = String((map ?? colorMap.value)[key] ?? '').trim().toUpperCase();
  return cur !== String(base).trim().toUpperCase();
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

function patchColorAt(key: string, colorHex: string): void {
  if (!key) return;
  const next = { ...colorMapModel.value, [key]: colorHex };
  colorMapModel.value = next;
  scheduleRefreshColorMap();
}

function onResetColor(key: string): void {
  const def = getBaseColorForKey(key);
  const next = { ...colorMapModel.value, [key]: def };
  colorMapModel.value = next;
  scheduleRefreshColorMap();
}

function onColorHexChange(key: string, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) {
    message.error(t('settings.panel.colors.invalidHex'));
    return;
  }
  patchColorAt(key, hex);
}

function onColorPickerChange(key: string, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) return;
  patchColorAt(key, hex);
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

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterColorsReset = registerPanelReset(PANEL_KEYS.colors, resetColors);

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  unregisterColorsReset();
});
</script>
