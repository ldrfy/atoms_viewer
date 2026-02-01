<template>
  <a-form layout="vertical">
    <a-form-item class="settings-gap-bottom-sm">
      <ApplyLayerTargets
        :label="t('settings.panel.layers.applyTargets')"
        :apply-title="t('settings.panel.colors.apply')"
        :show-apply="hasPendingChanges"
        :apply-disabled="!hasAnyLayer || !hasPendingChanges"
        :apply-active="hasAnyLayer && hasPendingChanges"
        :layers="targetLayerInfos"
        :active-layer-id="activeLayerId"
        @apply="onApplyColorEdits"
      />
    </a-form-item>

    <a-form-item class="settings-gap-top-sm settings-gap-bottom-sm">
      <a-row align="middle" justify="space-between">
        <a-col>
          <span>{{ t('settings.panel.colors.mapLabel') }}</span>
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
import { ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';
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
import ApplyLayerTargets from '../components/ApplyLayerTargets.vue';
import { usePendingAutoApply } from '../composables/usePendingAutoApply';
import { useSettingsTargetLayers } from '../composables/useSettingsTargetLayers';

import type { ColorMapRecord } from '../../ViewerStage/colorMap';

const { t } = useI18n();
const { hasAnyLayer, settings, selectedLayerIds } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const colorKeys = computed(() => {
  const keys: string[] = [];
  const seen = new Set<string>();
  const pushKey = (key: unknown) => {
    const k = String(key ?? '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  };
  const targets = targetLayerInfos.value;
  if (targets.length > 0) {
    for (const l of targets) {
      const list = (l as any)?.colorKeys ?? [];
      for (const key of list) pushKey(key);
    }
  }
  if (keys.length === 0) {
    const fallback = viewerApi.value?.activeLayerColorKeys.value ?? [];
    for (const key of fallback) pushKey(key);
  }
  return keys;
});
const colorMap = computed(() => viewerApi.value?.activeLayerColorMap.value ?? {});
// Draft color map for "Apply" workflow.
// 用于“应用”按钮的颜色草稿映射。
const draftColorMap = ref<ColorMapRecord>({});
// Track active layer id to decide when to reset draft.
// 记录当前图层 id，用于判断是否需要重置草稿。
const lastActiveLayerId = ref<string | null>(null);
const lastColorKeysSig = ref<string>('');
const lastSelectedIds = ref<string[]>([]);
const { targetLayerIds, targetLayerInfos } = useSettingsTargetLayers({
  selectedLayerIds,
  activeLayerId,
  layerList,
});
const { filterPending } = usePendingAutoApply(layerList);
// Track target layer color/key changes.
// 跟踪目标图层颜色/键变化。
const targetLayerColorDeps = computed(() => (
  targetLayerInfos.value.map(l => ({
    keys: (l as any)?.colorKeys ?? [],
    map: (l as any)?.colorMap ?? {},
  }))
));

function getMergedColorValue(key: string): string {
  const { element } = parseColorMapKey(key);
  const targets = targetLayerInfos.value;
  if (targets.length > 0) {
    const base = getBaseColorForKey(key);
    let firstExplicit = '';
    for (const layer of targets) {
      const map = (layer as any)?.colorMap ?? {};
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      const val = String(map[key] ?? '').trim();
      if (!firstExplicit) firstExplicit = val;
      if (val && String(val).toUpperCase() !== String(base).toUpperCase()) {
        return val;
      }
    }
    if (firstExplicit) return firstExplicit;
    // Fallback: use element-level custom color if present (e.g. C -> C.1).
    // 回退：使用元素级自定义颜色（例如 C -> C.1）。
    const elementKey = String(element ?? '').trim();
    if (elementKey) {
      const baseElement = getBaseColorForKey(elementKey);
      for (const layer of targets) {
        const map = (layer as any)?.colorMap ?? {};
        if (!Object.prototype.hasOwnProperty.call(map, elementKey)) continue;
        const val = String(map[elementKey] ?? '').trim();
        if (val && String(val).toUpperCase() !== String(baseElement).toUpperCase()) {
          return val;
        }
      }
    }
  }
  const cur = String(colorMap.value[key] ?? '').trim();
  if (cur) return cur;
  return getBaseColorForKey(key);
}

// Resolve per-layer effective color (hex + alpha).
// 解析单层的实际颜色（包含透明度）。
function resolveLayerColorValue(key: string, layer: any): string {
  const { element } = parseColorMapKey(key);
  const map = (layer as any)?.colorMap ?? {};
  const base = getBaseColorForKey(key);
  let raw = '';
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    raw = String(map[key] ?? '').trim();
  }
  else if (element && Object.prototype.hasOwnProperty.call(map, element)) {
    raw = String(map[element] ?? '').trim();
  }
  const parsed = parseColorValue(raw);
  if (!parsed) return formatColorValue(base, 1);
  return formatColorValue(parsed.hex, parsed.alpha);
}

// Detect if selected layers have conflicting colors.
// 判断选中图层是否存在颜色冲突。
function hasMixedColorsAcrossTargets(): boolean {
  const targets = targetLayerInfos.value;
  if (targets.length <= 1) return false;
  for (const key of colorKeys.value) {
    let first = '';
    for (const layer of targets) {
      const cur = resolveLayerColorValue(key, layer);
      if (!first) {
        first = cur;
        continue;
      }
      if (cur !== first) return true;
    }
  }
  return false;
}

function getCurrentColorValue(key: string): string {
  return getMergedColorValue(key);
}

const hasPendingChanges = computed(() => {
  const keys = colorKeys.value;
  if (keys.length === 0) return false;
  // If selected layers disagree, allow applying to unify.
  // 若选中图层存在差异，则允许应用统一设置。
  if (hasMixedColorsAcrossTargets()) return true;
  for (const key of keys) {
    const cur = String(getCurrentColorValue(key) ?? '').trim();
    const draft = String(draftColorMap.value[key] ?? '').trim();
    if (cur !== draft) return true;
  }
  return false;
});

function syncDraftFromActive(): void {
  const next: ColorMapRecord = {};
  for (const key of colorKeys.value) {
    next[key] = getCurrentColorValue(key);
  }
  draftColorMap.value = next;
}

watch(
  [colorKeys, colorMap, activeLayerId, targetLayerColorDeps],
  () => {
    const nextSig = colorKeys.value.join('|');
    const keysChanged = nextSig !== lastColorKeysSig.value;
    const layerChanged = activeLayerId.value !== lastActiveLayerId.value;
    if (keysChanged || layerChanged || !hasPendingChanges.value) {
      syncDraftFromActive();
    }
    lastActiveLayerId.value = activeLayerId.value;
    lastColorKeysSig.value = nextSig;
  },
  { immediate: true, deep: true },
);

// Auto-apply custom colors to newly selected layers.
// 将自定义颜色自动应用到新选中的图层。
watch(
  targetLayerIds,
  (nextIds) => {
    const prev = new Set(lastSelectedIds.value);
    const added = nextIds.filter(id => !prev.has(id));
    lastSelectedIds.value = [...nextIds];
    if (added.length === 0) return;
    if (hasPendingChanges.value) return;
    const toApply = filterPending(added);
    if (toApply.length === 0) return;
    const customMap: ColorMapRecord = {};
    for (const [key, value] of Object.entries(draftColorMap.value)) {
      const base = getBaseColorForKey(key);
      const val = String(value ?? '').trim();
      if (val && String(val).toUpperCase() !== String(base).toUpperCase()) {
        customMap[key] = val;
      }
    }
    if (Object.keys(customMap).length === 0) return;
    viewerApi.value?.setLayerColorMapForIds?.(customMap, toApply);
    viewerApi.value?.refreshColorMap({ layerIds: toApply });
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
  syncDraftFromActive();
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
.colors-hint-tooltip :deep(.ant-tooltip-inner) {
  max-width: 320px;
  white-space: normal;
  word-break: break-word;
}
</style>
