<template>
  <a-flex vertical gap="middle">
    <LayerScopeControl v-model:scope="scope" />

    <a-flex align="center" justify="space-between">
      <a-typography-text>
        {{ t('settings.panel.colors.mapLabel') }}
      </a-typography-text>
      <a-tooltip :title="t('settings.panel.colors.alert')" placement="left">
        <a-button
          variant="link"
          color="default"
        >
          <QuestionCircleOutlined />
        </a-button>
      </a-tooltip>
    </a-flex>

    <a-flex
      v-for="(key, idx) in colorKeys"
      :key="`${key}-${idx}`"
      align="center"
      justify="space-between"
      style="padding-inline: 8px;"
    >
      <a-tag color="success" variant="outlined">
        {{ key }}
      </a-tag>
      <a-typography-text>→</a-typography-text>
      <a-tooltip
        v-if="isKeyCustom(key, draftColorMap)"
        :title="t('settings.panel.colors.resetTooltip')"
      >
        <a-button
          type="text"
          size="small"
          @click="onResetColor(key)"
        >
          <ReloadOutlined />
        </a-button>
      </a-tooltip>

      <a-color-picker
        size="small"
        show-text
        :value="colorPickerValue(getDraftHexValue(key))"
        @change="(value: unknown, css: unknown) => onColorPickerChange(key, value, css)"
      />
    </a-flex>

    <a-space direction="vertical" :size="5">
      <a-button
        block
        type="primary"
        :disabled="isApplyDisabled"
        @click="onApplyColorEdits"
      >
        {{ t('settings.panel.colors.apply') }}
      </a-button>

      <a-typography-text type="secondary" class="small-text">
        {{ t('settings.panel.colors.hint') }}
      </a-typography-text>
    </a-space>
  </a-flex>
</template>

<script setup lang="ts">
import { ReloadOutlined, QuestionCircleOutlined } from '@antdv-next/icons';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { formatColorValue, parseColorMapKey, parseColorValue } from '../../ViewerStage/colorMap';
import { getElementColorHex } from '../../../lib/structure/chem';
import { getVisualStylePreset } from '../../../lib/viewer/visualStyles';
import LayerScopeControl from '../parts/LayerScopeControl.vue';
import { useLayerScope } from '../useLayerScope';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import { getDefaultLayerScope } from '../layerScopeStorage';

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
// Temporary cache for manual hex inputs, avoiding automatic resets.
// 缓存手动十六进制输入，避免自动重置。
const hexInputValues = ref<Record<string, string>>({});

// Reset all cached inputs when the draft map refreshes.
// 草稿映射刷新时清空所有缓存输入。
function resetHexInputValues(): void {
  hexInputValues.value = {};
}

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
  resetHexInputValues();
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
  // 重置生效范围为默认值。
  // Reset effect range to default.
  const defaultScope = getDefaultLayerScope('colors');
  scope.value = defaultScope;
  const keys = colorKeys.value;
  if (keys.length === 0) return;
  const api = viewerApi.value;
  const baseMap = buildKeyBaseColorMap(keys);
  draftColorMap.value = baseMap;
  resetHexInputValues();
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
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  let hex = m[1]!.toUpperCase();
  // Drop alpha channel if provided.
  // 若包含透明度通道，丢弃透明度。
  if (hex.length === 4) hex = hex.slice(0, 3);
  if (hex.length === 8) hex = hex.slice(0, 6);
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

function onColorPickerChange(key: string, value: unknown, css: unknown): void {
  const { hex, alpha } = resolveColorPayload(value, css);
  if (!hex) return;
  const nextAlpha = alpha ?? getDraftAlphaValue(key);
  patchDraftColor(key, hex, nextAlpha);
}

// Resolve color picker payload to a CSS color string.
// 将颜色选择器回调解析为 CSS 颜色字符串。
function resolveColorCssString(value: unknown, css: unknown): string {
  const hexString = (value as any)?.toHexString?.();
  if (typeof hexString === 'string' && hexString.trim()) return hexString.trim();
  if (typeof css === 'string' && css.trim()) return css.trim();
  const hex = (value as any)?.toHex?.();
  if (typeof hex === 'string' && hex.trim()) return `#${hex.trim()}`;
  return String(value ?? '').trim();
}

// Resolve color picker payload to hex + alpha.
// 解析颜色选择器回调得到 hex + 透明度。
function resolveColorPayload(
  value: unknown,
  css: unknown,
): { hex: string | null; alpha: number | null } {
  const hex = normalizeHexColor(resolveColorCssString(value, css));
  const rawAlpha = (value as any)?.toRgb?.()?.a;
  const alpha = Number.isFinite(rawAlpha)
    ? Math.min(1, Math.max(0, Number(rawAlpha)))
    : null;
  return { hex, alpha };
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

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterColorsReset = registerPanelReset(PANEL_KEYS.colors, resetColors);

onBeforeUnmount(() => {
  unregisterColorsReset();
});
</script>
