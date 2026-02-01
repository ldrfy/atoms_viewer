<template>
  <a-form layout="vertical">
    <LayerScopeControl v-model:scope="scope" />

    <a-form-item class="settings-gap-top-md">
      <a-row align="middle" justify="space-between" class="settings-gap-bottom-sm">
        <a-col>
          <a-typography-text>
            {{ t('settings.panel.colors.mapLabel') }}
          </a-typography-text>
        </a-col>
        <a-col flex="1" class="header-right">
          <a-tooltip :title="t('settings.panel.colors.alert')" placement="left">
            <a-button
              type="text"
              :aria-label="t('settings.panel.colors.alert')"
              :title="t('settings.panel.colors.alert')"
            >
              <QuestionCircleOutlined />
            </a-button>
          </a-tooltip>
        </a-col>
      </a-row>

      <div v-for="(key, idx) in colorKeys" :key="`${key}-${idx}`" class="settings-gap-bottom-sm">
        <a-row :gutter="10" align="middle" class="settings-color-map-row">
          <a-col :span="0.5" />
          <a-col :span="2">
            <a-tag :bordered="false" color="success">
              {{ key }}
            </a-tag>
          </a-col>

          <a-col :span="2">
            <a-tooltip
              v-if="isKeyCustom(key, draftColorMap)"
              :title="t('settings.panel.colors.resetTooltip')"
            >
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
              @update:value="onOpacityChange(key, $event)"
              @change="onOpacityChange(key, $event)"
            />
          </a-col>
        </a-row>
      </div>

      <div class="settings-gap-top-sm">
        <a-button
          block
          type="primary"
          :disabled="isApplyDisabled"
          @click="onApplyColorEdits"
        >
          {{ t('settings.panel.colors.apply') }}
        </a-button>
      </div>

      <a-typography-text type="secondary" class="settings-text-secondary-tight">
        {{ t('settings.panel.colors.hint') }}
      </a-typography-text>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { formatColorValue, parseColorMapKey, parseColorValue } from '../../ViewerStage/colorMap';
import { getElementColorHex } from '../../../lib/structure/chem';
import { getVisualStylePreset } from '../../../lib/viewer/visualStyles';
import LayerScopeControl from './LayerScopeControl.vue';
import { useLayerScope } from '../useLayerScope';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

import type { ColorMapRecord } from '../../ViewerStage/colorMap';

const { t } = useI18n();
const { hasAnyLayer, settings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const colorKeys = computed(() => viewerApi.value?.activeLayerColorKeys.value ?? []);
const colorMap = computed(() => viewerApi.value?.activeLayerColorMap.value ?? {});
// Draft color map for "Apply" workflow.
// 用于“应用”按钮的颜色草稿映射。
const draftColorMap = ref<ColorMapRecord>({});
// Track active layer id to decide when to reset draft.
// 记录当前图层 id，用于判断是否需要重置草稿。
const lastActiveLayerId = ref<string | null>(null);
const scope = useLayerScope('colors');
const lastAppliedScope = ref(scope.value);
const scopeDirty = ref(false);
function markScopeApplied(): void {
  lastAppliedScope.value = scope.value;
  scopeDirty.value = false;
}
watch(
  scope,
  (value) => {
    scopeDirty.value = value !== lastAppliedScope.value;
  },
  { immediate: true },
);

type ColorMapDigest = string;
function computeColorMapDigest(map: ColorMapRecord): ColorMapDigest {
  const entries = Object.entries(map ?? {})
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

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
    const raw = String(colorMap.value[key] ?? '').trim();
    next[key] = raw || getBaseColorForKey(key);
  }
  draftColorMap.value = next;
}

let lastColorMapDigest: ColorMapDigest | null = null;
watch(
  [colorKeys, colorMap, activeLayerId],
  () => {
    const layerChanged = activeLayerId.value !== lastActiveLayerId.value;
    const nextDigest = computeColorMapDigest(colorMap.value);
    const mapChanged = lastColorMapDigest !== nextDigest;
    if (layerChanged || mapChanged || !hasPendingChanges.value) {
      syncDraftFromActive();
      lastColorMapDigest = nextDigest;
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
  if (scope.value === 'all') {
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

const isApplyDisabled = computed(() => (
  !hasAnyLayer.value || (!hasPendingChanges.value && !scopeDirty.value)
));

function onApplyColorEdits(): void {
  const api = viewerApi.value;
  if (!api) return;
  const map = { ...draftColorMap.value };
  if (scope.value === 'all') {
    api.setAllLayersColorMap(map);
    api.refreshColorMap({ applyToAll: true });
    markScopeApplied();
    return;
  }
  if (scope.value === 'visible') {
    api.setVisibleLayersColorMap(map);
    markScopeApplied();
    return;
  }
  api.setActiveLayerColorMap(map);
  api.refreshColorMap();
  markScopeApplied();
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
