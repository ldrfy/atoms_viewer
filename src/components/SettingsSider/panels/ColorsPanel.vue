<template>
  <a-form layout="vertical">
    <a-form-item class="settings-gap-top-md">
      <a-row align="middle" justify="space-between">
        <a-col>
          <a-space :size="6" align="center">
            <span>{{ t('settings.panel.colors.mapLabel') }}</span>
            <a-tooltip :title="t('settings.panel.colors.apply')">
              <a-button
                type="text"
                :disabled="!hasAnyLayer || !hasPendingChanges"
                :aria-label="t('settings.panel.colors.apply')"
                :title="t('settings.panel.colors.apply')"
                @click="onApplyColorEdits"
              >
                <CheckCircleOutlined :class="{ 'colors-apply-icon': hasAnyLayer && hasPendingChanges }" />
              </a-button>
            </a-tooltip>
          </a-space>
        </a-col>
        <a-col>
          <a-tooltip
            placement="left"
            :title="t('settings.panel.colors.hint')"
            :overlay-class-name="'colors-hint-tooltip'"
          >
            <a-button
              type="text"
              :aria-label="t('settings.panel.colors.hint')"
              :title="t('settings.panel.colors.hint')"
            >
              <QuestionCircleOutlined />
            </a-button>
          </a-tooltip>
        </a-col>
      </a-row>
      <a-space :size="6" class="colors-layer-row settings-flex-wrap">
        <a-typography-text type="secondary">
          {{ t('settings.panel.layers.applyTargets') }}:
        </a-typography-text>
        <template v-if="targetLayerInfos.length > 0">
          <a-tooltip
            v-for="l in targetLayerInfos"
            :key="l.id"
            :title="l.source?.fileName || l.id"
          >
            <a-tag class="settings-tag-full">
              <span class="settings-tag-ellipsis">
                {{ l.name || l.source?.fileName || l.id }}
              </span>
            </a-tag>
          </a-tooltip>
        </template>
        <a-typography-text v-else type="secondary">
          -
        </a-typography-text>
      </a-space>
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
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { ReloadOutlined, QuestionCircleOutlined, CheckCircleOutlined } from '@ant-design/icons-vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { formatColorValue, parseColorMapKey, parseColorValue } from '../../ViewerStage/colorMap';
import { getElementColorHex } from '../../../lib/structure/chem';
import { getVisualStylePreset } from '../../../lib/viewer/visualStyles';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

import type { ColorMapRecord } from '../../ViewerStage/colorMap';

const { t } = useI18n();
const { hasAnyLayer, settings, selectedLayerIds } = useSettingsSiderContext();

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
// Resolve target layers: selection first, otherwise active layer.
// 解析目标图层：优先选中列表，否则回退到当前图层。
const targetLayerIds = computed(() => {
  const picked = selectedLayerIds.value.filter(Boolean);
  if (picked.length > 0) return picked;
  return activeLayerId.value ? [activeLayerId.value] : [];
});
const targetLayerInfos = computed(() => {
  if (targetLayerIds.value.length === 0) return [];
  const byId = new Map(layerList.value.map(l => [l.id, l]));
  return targetLayerIds.value.map(id => byId.get(id)).filter(Boolean) as any[];
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
  const targets = targetLayerIds.value;
  if (targets.length === 0) return;
  api.resetLayerColorMapToDefaults?.(targets);
  api.refreshColorMap({ layerIds: targets });
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
  const targets = targetLayerIds.value;
  if (targets.length === 0) return;
  api.setLayerColorMapForIds?.(map, targets);
  api.refreshColorMap({ layerIds: targets });
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

<style scoped>
.colors-apply-icon {
  color: var(--ant-colorPrimary, #1677ff);
}

.colors-hint-tooltip :deep(.ant-tooltip-inner) {
  max-width: 320px;
  white-space: normal;
  word-break: break-word;
}

.colors-layer-row {
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 2px;
}
</style>
