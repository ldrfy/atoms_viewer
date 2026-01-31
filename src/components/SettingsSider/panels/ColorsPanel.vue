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
          <a-row :gutter="10" align="middle" class="settings-color-map-row">
            <a-col :span="3">
              <a-tag>{{ key }}</a-tag>
            </a-col>

            <a-col :span="2">
              <a-tooltip v-if="isKeyCustom(key, draftColorMap)" :title="t('settings.panel.colors.resetTooltip')">
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
                :value="colorPickerValue(getDraftHexValue(key))"
                :aria-label="t('settings.panel.colors.colorPickerLabel', { key })"
                :title="t('settings.panel.colors.colorPickerLabel', { key })"
                @input="onColorPickerChange(key, ($event as any).target?.value)"
              >
            </a-col>

            <a-col :span="7">
              <a-input
                :value="getDraftHexValue(key)"
                :placeholder="t('settings.panel.colors.hexPlaceholder')"
                :aria-label="t('settings.panel.colors.hexPlaceholder')"
                :title="t('settings.panel.colors.hexPlaceholder')"
                @change="onColorHexChange(key, ($event as any).target?.value)"
              />
            </a-col>

            <a-col :span="8">
              <a-input-number
                :value="getDraftOpacityValue(key)"
                :min="0"
                :max="100"
                :step="1"
                addon-after="%"
                :aria-label="t('settings.panel.colors.opacity')"
                :title="t('settings.panel.colors.opacity')"
                class="settings-full-width"
                @update:value="onOpacityChange(key, $event)"
                @change="onOpacityChange(key, $event)"
              />
            </a-col>
          </a-row>
        </div>
      </template>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.colors.hint') }}
      </a-typography-text>

      <a-row justify="end" class="settings-gap-top-sm">
        <a-button
          type="primary"
          :disabled="!hasAnyLayer || !hasPendingChanges"
          @click="onApplyColorEdits"
        >
          {{ t('settings.panel.colors.apply') }}
        </a-button>
      </a-row>
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
import { formatColorValue, parseColorMapKey, parseColorValue } from '../../ViewerStage/colorMap';
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
// Draft color map for "Apply" workflow.
// 用于“应用”按钮的颜色草稿映射。
const draftColorMap = ref<ColorMapRecord>({});
// Track active layer id to decide when to reset draft.
// 记录当前图层 id，用于判断是否需要重置草稿。
const lastActiveLayerId = ref<string | null>(null);
const applyToAllLayers = ref(
  readApplyAllLayersFlags().colors ?? true,
);

watch(
  applyToAllLayers,
  (v) => {
    writeApplyAllLayersFlags({ colors: v });
  },
);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});

const hasPendingChanges = computed(() => {
  const keys = colorKeys.value;
  if (keys.length === 0) return false;
  for (const key of keys) {
    const cur = String(colorMap.value[key] ?? '').trim();
    const draft = String(draftColorMap.value[key] ?? '').trim();
    if (cur !== draft) return true;
  }
  return false;
});

function syncDraftFromActive(): void {
  const next: ColorMapRecord = {};
  for (const key of colorKeys.value) {
    next[key] = String(colorMap.value[key] ?? '').trim();
  }
  draftColorMap.value = next;
}

watch(
  [colorKeys, colorMap, activeLayerId],
  () => {
    const layerChanged = activeLayerId.value !== lastActiveLayerId.value;
    if (layerChanged || !hasPendingChanges.value) {
      syncDraftFromActive();
    }
    lastActiveLayerId.value = activeLayerId.value;
  },
  { immediate: true },
);

function resetColors(): void {
  const keys = colorKeys.value;
  if (keys.length === 0) return;
  const api = viewerApi.value;
  const baseMap = buildKeyBaseColorMap(keys);
  draftColorMap.value = baseMap;
  if (!api) return;
  if (applyToAllLayers.value) {
    api.resetAllLayersColorMapToDefaults();
    api.refreshColorMap({ applyToAll: true });
    syncDraftFromActive();
    return;
  }
  onApplyColorEdits();
  syncDraftFromActive();
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

// Patch draft color for a key (hex + opacity).
// 更新某个 key 的草稿颜色（十六进制 + 透明度）。
function patchDraftColor(key: string, colorHex: string, alpha: number): void {
  if (!key) return;
  const next = { ...draftColorMap.value, [key]: formatColorValue(colorHex, alpha) };
  draftColorMap.value = next;
}

function onResetColor(key: string): void {
  const def = getBaseColorForKey(key);
  patchDraftColor(key, def, 1);
}

function onColorHexChange(key: string, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) {
    message.error(t('settings.panel.colors.invalidHex'));
    return;
  }
  const alpha = getDraftAlphaValue(key);
  patchDraftColor(key, hex, alpha);
}

function onColorPickerChange(key: string, v: unknown): void {
  const hex = normalizeHexColor(v);
  if (!hex) return;
  const alpha = getDraftAlphaValue(key);
  patchDraftColor(key, hex, alpha);
}

function onOpacityChange(key: string, v: unknown): void {
  const percent = normalizeOpacityInput(v);
  if (percent == null) return;
  const alpha = percent / 100;
  const hex = getDraftHexValue(key);
  patchDraftColor(key, hex, alpha);
}

function onApplyColorEdits(): void {
  const api = viewerApi.value;
  if (!api) return;
  const map = { ...draftColorMap.value };
  if (applyToAllLayers.value) api.setAllLayersColorMap(map);
  else api.setActiveLayerColorMap(map);
  api.refreshColorMap({ applyToAll: applyToAllLayers.value });
}

function getDraftHexValue(key: string): string {
  const raw = draftColorMap.value[key] ?? '';
  const parsed = parseColorValue(raw);
  return parsed?.hex ?? '';
}

function getDraftAlphaValue(key: string): number {
  const raw = draftColorMap.value[key] ?? '';
  const parsed = parseColorValue(raw);
  return parsed?.alpha ?? 1;
}

function getDraftOpacityValue(key: string): number {
  return Math.round(getDraftAlphaValue(key) * 100);
}

function clampOpacityPercent(v: number): number {
  return Math.max(0, Math.min(100, Math.floor(v)));
}

function normalizeOpacityInput(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const raw = String(v ?? '').replace('%', '').trim();
    const parsed = Number(raw);
    return clampOpacityPercent(parsed);
  }
  if (Number.isFinite(v as number)) {
    return clampOpacityPercent(Number(v));
  }
  return null;
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterColorsReset = registerPanelReset(PANEL_KEYS.colors, resetColors);

onBeforeUnmount(() => {
  unregisterColorsReset();
});
</script>
