<template>
  <a-form layout="vertical">
    <a-form-item>
      <a-row justify="space-between" align="middle" :gutter="8">
        <a-col :span="8">
          {{ t('viewer.theme.title') }}
        </a-col>
        <a-col :flex="1">
          <a-segmented v-model:value="themeModeModel" block :options="themeSegmentOptions" />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row :gutter="8" justify="space-between" align="middle">
        <!-- 左侧 label -->
        <a-col>
          {{ t('settings.panel.other.backgroundColor') }}
        </a-col>

        <!-- 右侧：三个控件成组，整体靠右 -->
        <a-col>
          <a-space :size="6" align="center">
            <!-- reset（建议用 v-show 占位，避免 input 跳动） -->
            <a-tooltip :title="t('viewer.record.bgReset')">
              <a-button
                v-show="!isBgTransparent"
                type="text"
                size="small"
                :aria-label="t('viewer.record.bgReset')"
                :title="t('viewer.record.bgReset')"
                @click="resetBgToTransparent"
              >
                <ReloadOutlined />
              </a-button>
            </a-tooltip>

            <!-- picker -->
            <a-color-picker
              size="small"
              show-text
              disabled-alpha
              :value="isBgTransparent ? '#00000000' : bgColorPickerValue(bgColorModel)"
              :aria-label="t('settings.panel.other.backgroundColor')"
              :title="t('settings.panel.other.backgroundColor')"
              @change="(value: unknown, css: unknown) => onBgColorPickerChange(resolveColorCssString(value, css))"
            />

            <!-- hex removed -->
          </a-space>
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.themeReadabilityLabel') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="themeReadabilityCheckOnOpenModel"
            :aria-label="t('settings.panel.other.themeReadabilityCheckOnOpen')"
            :title="t('settings.panel.other.themeReadabilityCheckOnOpen')"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.themeReadabilityCheckOnOpen') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col :span="8">
          {{ t('settings.panel.other.visualStyle') }}
        </a-col>
        <a-col />        <a-col flex="1">
          <a-select v-model:value="visualStyleModel" :options="visualStyleOptions" />
        </a-col>
      </a-row>

      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.visualStyleHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.details.modelLightIntensity')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="modelLightIntensityModel"
            :min="MODEL_LIGHT_INTENSITY_MIN"
            :max="MODEL_LIGHT_INTENSITY_MAX"
            :step="0.05"
          />
        </a-col>
        <a-col>
          <a-input-number
            v-model:value="modelLightIntensityModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.details.modelLightIntensity')"
            :title="t('settings.panel.details.modelLightIntensity')"
            :min="MODEL_LIGHT_INTENSITY_MIN"
            :max="MODEL_LIGHT_INTENSITY_MAX"
            :step="0.05"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.axes') }}</a-col>
        <a-col>
          <a-switch v-model:checked="showAxesModel" :aria-label="t('settings.panel.other.axes')" :title="t('settings.panel.other.axes')" />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.refreshBondsOnPlayLabel') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="refreshBondsOnPlayModel"
            :aria-label="t('settings.panel.other.refreshBondsOnPlay')"
            :title="t('settings.panel.other.refreshBondsOnPlay')"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ refreshBondsOnPlayHint }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row :gutter="8" justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.selectionColorLabel') }}</a-col>

        <a-col>
          <a-space :size="6" align="center">
            <a-tooltip
              v-if="selectionHighlightColorIsCustom"
              :title="t('settings.panel.other.selectionColorResetTooltip')"
            >
              <a-button
                type="text"
                size="small"
                :aria-label="t('settings.panel.other.selectionColorReset')"
                :title="t('settings.panel.other.selectionColorResetTooltip')"
                @click="resetSelectionHighlightColor"
              >
                <ReloadOutlined />
              </a-button>
            </a-tooltip>

            <a-color-picker
              size="small"
              show-text
              disabled-alpha
              :value="colorPickerValue(selectionHighlightColorModel)"
              @change="(value: unknown, css: unknown) => onSelectionColorPickerChange(resolveColorCssString(value, css))"
            />
            <!-- hex removed -->
          </a-space>
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.panel.other.selectionColorHint') }}
      </a-typography-text>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.other.keepActiveLayerOnHideLabel') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="keepActiveLayerOnHideModel"
            :aria-label="t('settings.panel.other.keepActiveLayerOnHide')"
            :title="t('settings.panel.other.keepActiveLayerOnHide')"
          />
        </a-col>
      </a-row>
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ keepActiveLayerOnHideHint }}
      </a-typography-text>
    </a-form-item>

    <a-form-item :label="t('settings.panel.other.panStep')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="panStepScaleModel"
            :min="PAN_STEP_MIN"
            :max="PAN_STEP_MAX"
            :step="PAN_STEP_STEP"
          />
        </a-col>
        <a-col>
          <a-input-number
            v-model:value="panStepScaleModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.other.panStep')"
            :title="t('settings.panel.other.panStep')"
            :min="PAN_STEP_MIN"
            :max="PAN_STEP_MAX"
            :step="PAN_STEP_STEP"
          />
        </a-col>
      </a-row>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@antdv-next/icons';
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'antdv-next';

import { useSettingsSiderContext } from '../useSettingsSiderContext';
import {
  MODEL_LIGHT_INTENSITY_MIN,
  MODEL_LIGHT_INTENSITY_MAX,
} from '../../../lib/viewer/constants';
import { DEFAULT_SETTINGS, type VisualStyleId } from '../../../lib/viewer/settings';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { getThemeMode, setThemeMode, type ThemeMode } from '../../../theme/mode';
import { getVisualStylePreset, VISUAL_STYLE_PRESETS } from '../../../lib/viewer/visualStyles';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();
const viewerApi = computed(() => viewerApiRef.value);
const PAN_STEP_MIN = 0.2;
const PAN_STEP_MAX = 5;
const PAN_STEP_STEP = 0.1;

const showAxesModel = computed({
  get: () => settings.value.other.showAxes,
  set: (v: boolean) => patchSettings({ other: { showAxes: v } }),
});

const refreshBondsOnPlayModel = computed({
  get: () => settings.value.other.refreshBondsOnPlay ?? false,
  set: (v: boolean) => patchSettings({ other: { refreshBondsOnPlay: v } }),
});

// 播放时原子连接提示文案（按开关状态）。
// Hint for bond refresh based on toggle state.
const refreshBondsOnPlayHint = computed(() =>
  refreshBondsOnPlayModel.value
    ? t('settings.panel.other.refreshBondsOnPlayOn')
    : t('settings.panel.other.refreshBondsOnPlayOff'),
);

// Keep active selection when hiding a layer.
// 隐藏图层时保留选中状态。
const keepActiveLayerOnHideModel = computed({
  get: () => settings.value.other.keepActiveLayerOnHide ?? false,
  set: (v: boolean) => patchSettings({ other: { keepActiveLayerOnHide: v } }),
});

// 隐藏图层选中提示文案（按开关状态）。
// Hint for selection persistence based on toggle state.
const keepActiveLayerOnHideHint = computed(() =>
  keepActiveLayerOnHideModel.value
    ? t('settings.panel.other.keepActiveLayerOnHideOn')
    : t('settings.panel.other.keepActiveLayerOnHideOff'),
);

const panStepScaleModel = computed({
  get: () => settings.value.other.panStepScale ?? DEFAULT_SETTINGS.other.panStepScale,
  set: (v: number) => patchSettings({ other: { panStepScale: v } }),
});

const bgColorModel = computed<string>({
  get: () => settings.value.other.backgroundColor,
  set: (v: string) =>
    patchSettings({
      other: {
        backgroundColor: v,
        backgroundColorMode: 'custom',
        backgroundTransparent: false,
      },
    }),
});

const isBgTransparent = computed(() => settings.value.other.backgroundTransparent);

function resetBgToTransparent(): void {
  patchSettings({
    other: {
      backgroundTransparent: true,
      backgroundColorMode: 'custom',
    },
  });
}

function bgColorPickerValue(v: string): string {
  return normalizeHexColor(v) ?? DEFAULT_SETTINGS.other.backgroundColor;
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

function onBgColorPickerChange(v: unknown): void {
  const next = normalizeHexColor(v);
  if (!next) {
    message.error(t('settings.panel.colors.invalidHex'));
    return;
  }
  patchSettings({
    other: {
      backgroundColor: next,
      backgroundColorMode: 'custom',
      backgroundTransparent: false,
    },
  });
}

const themeReadabilityCheckOnOpenModel = computed({
  get: () => settings.value.other.themeReadabilityCheckOnOpen ?? true,
  set: (v: boolean) => patchSettings({ other: { themeReadabilityCheckOnOpen: v } }),
});

const modelLightIntensityModel = computed({
  get: () => settings.value.other.modelLightIntensity ?? DEFAULT_SETTINGS.other.modelLightIntensity,
  set: (v: number) => patchSettings({ other: { modelLightIntensity: v } }),
});

const selectionHighlightColorModel = computed({
  get: () => settings.value.other.selectionHighlightColor ?? DEFAULT_SETTINGS.other.selectionHighlightColor,
  set: (v: string) => patchSettings({ other: { selectionHighlightColor: v } }),
});

const selectionHighlightColorIsCustom = computed(() => {
  const base = normalizeHexColor(DEFAULT_SETTINGS.other.selectionHighlightColor)
    ?? DEFAULT_SETTINGS.other.selectionHighlightColor;
  const current = normalizeHexColor(settings.value.other.selectionHighlightColor ?? '')
    ?? base;
  return current.toUpperCase() !== base.toUpperCase();
});

const themeModeModel = computed<ThemeMode>({
  get: () => settings.value.other.themeMode ?? getThemeMode(),
  set: (v) => {
    setThemeMode(v);
    patchSettings({ other: { themeMode: v } });
  },
});

const themeSegmentOptions = computed(() => [
  { label: t('viewer.theme.mode.system'), value: 'system' },
  { label: t('viewer.theme.mode.light'), value: 'light' },
  { label: t('viewer.theme.mode.dark'), value: 'dark' },
]);

function applyVisualStyle(styleId: VisualStyleId): void {
  const preset = getVisualStylePreset(styleId);
  const api = viewerApi.value;
  const isDefault = styleId === 'default';
  const colorTemplate = isDefault
    ? {}
    : { ...preset.colorMapTemplate };
  patchSettings({
    other: { visualStyle: styleId, modelLightIntensity: preset.display.modelLightIntensity },
  });
  if (!api) return;
  api.suspendSettingsSync(300);
  if (isDefault) {
    api.resetAllLayersColorMapToDefaults();
  }
  else {
    api.setAllLayersColorMap(colorTemplate);
    api.refreshColorMap({ applyToAll: true });
  }
  api.setActiveLayerDisplay(
    {
      atomScale: preset.display.atomScale,
      atomRoughness: preset.display.atomRoughness,
      bondRadius: preset.display.bondRadius,
      bondFactor: preset.display.bondFactor,
    },
    { applyToAll: true },
  );
}

const visualStyleModel = computed<VisualStyleId>({
  get: () => settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  set: (v) => {
    applyVisualStyle(v);
  },
});

const visualStyleOptions = computed(() =>
  (Object.values(VISUAL_STYLE_PRESETS) as typeof VISUAL_STYLE_PRESETS[keyof typeof VISUAL_STYLE_PRESETS][])
    .map(p => ({ label: t(p.labelKey), value: p.id })),
);

function normalizeHexColor(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  let hex = m[1]!;
  // Drop alpha channel if provided.
  // 若包含透明度通道，丢弃透明度。
  if (hex.length === 4) hex = hex.slice(0, 3);
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  return `#${hex}`;
}

function colorPickerValue(v: string): string {
  return normalizeHexColor(v) ?? DEFAULT_SETTINGS.other.selectionHighlightColor;
}

function onSelectionColorPickerChange(v: unknown): void {
  const next = normalizeHexColor(v);
  if (!next) return;
  selectionHighlightColorModel.value = next;
}

function resetSelectionHighlightColor(): void {
  selectionHighlightColorModel.value = DEFAULT_SETTINGS.other.selectionHighlightColor;
}

function resetOtherSettings(): void {
  patchSettings({
    other: { ...DEFAULT_SETTINGS.other },
  });
  setThemeMode(DEFAULT_SETTINGS.other.themeMode);
  applyVisualStyle(DEFAULT_SETTINGS.other.visualStyle);
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterOtherReset = registerPanelReset(PANEL_KEYS.other, resetOtherSettings);
onBeforeUnmount(() => {
  unregisterOtherReset();
});
</script>
