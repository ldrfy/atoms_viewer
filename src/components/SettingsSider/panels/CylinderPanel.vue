<template>
  <a-flex vertical gap="middle">
    <SettingSwitchField
      v-model:checked="enabledModel"
      :label="t('settings.panel.cylinder.enable')"
      :hint="t('settings.panel.cylinder.enableHint')"
    />

    <a-flex vertical>
      <a-typography-text>{{ t('settings.panel.cylinder.shapeType') }}</a-typography-text>
      <a-select
        v-model:value="shapeTypeModel"
        :options="shapeTypeOptions"
      />
    </a-flex>

    <a-flex vertical>
      <a-flex :gap="8" align="center" justify="space-between">
        <a-typography-text>{{ t('settings.panel.cylinder.color') }}</a-typography-text>
        <a-space :size="6" align="center">
          <span v-show="cylinderColorIsCustom">
            <a-tooltip :title="t('settings.panel.cylinder.colorResetTooltip')">
              <a-button
                type="text"
                size="small"
                @click="resetCylinderColor"
              >
                <ReloadOutlined />
              </a-button>
            </a-tooltip>
          </span>
          <a-color-picker
            size="small"
            show-text
            :value="colorPickerValue"
            @change="onCylinderColorPickerChange"
          />
        </a-space>
      </a-flex>
      <a-typography-text type="secondary" class="small-text">
        {{ t('settings.panel.cylinder.colorHint') }}
      </a-typography-text>
    </a-flex>

    <a-flex vertical :gap="8">
      <a-typography-text>{{ t('settings.panel.cylinder.center') }}</a-typography-text>
      <a-flex :gap="8" align="center">
        <a-typography-text class="small-text">
          X
        </a-typography-text>
        <a-input-number :value="centerModel.x" style="flex: 1; min-width: 0;" @change="(v) => updateCenter('x', v)" />
        <a-typography-text class="small-text">
          Y
        </a-typography-text>
        <a-input-number :value="centerModel.y" style="flex: 1; min-width: 0;" @change="(v) => updateCenter('y', v)" />
        <a-typography-text class="small-text">
          Z
        </a-typography-text>
        <a-input-number :value="centerModel.z" style="flex: 1; min-width: 0;" @change="(v) => updateCenter('z', v)" />
      </a-flex>
    </a-flex>

    <template v-if="shapeTypeModel === 'cylinder'">
      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.axis') }}</a-typography-text>
        <a-flex :gap="8" align="center">
          <a-typography-text class="small-text">
            X
          </a-typography-text>
          <a-input-number :value="axisModel.x" style="flex: 1; min-width: 0;" @change="(v) => updateAxis('x', v)" />
          <a-typography-text class="small-text">
            Y
          </a-typography-text>
          <a-input-number :value="axisModel.y" style="flex: 1; min-width: 0;" @change="(v) => updateAxis('y', v)" />
          <a-typography-text class="small-text">
            Z
          </a-typography-text>
          <a-input-number :value="axisModel.z" style="flex: 1; min-width: 0;" @change="(v) => updateAxis('z', v)" />
        </a-flex>
      </a-flex>

      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.height') }}</a-typography-text>
        <a-input-number
          :value="heightModel"
          :min="0.001"
          :step="0.01"
          style="width: 100%;"
          @change="onHeightInputChange"
        />
      </a-flex>

      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.radius') }}</a-typography-text>
        <a-input-number
          :value="radiusModel"
          :min="0.001"
          :step="0.01"
          style="width: 100%;"
          @change="onRadiusInputChange"
        />
      </a-flex>
    </template>

    <template v-else>
      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.sizeX') }}</a-typography-text>
        <a-input-number
          :value="sizeXModel"
          :min="0.001"
          :step="0.01"
          style="width: 100%;"
          @change="onSizeInputChange('x', $event)"
        />
      </a-flex>
      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.sizeY') }}</a-typography-text>
        <a-input-number
          :value="sizeYModel"
          :min="0.001"
          :step="0.01"
          style="width: 100%;"
          @change="onSizeInputChange('y', $event)"
        />
      </a-flex>
      <a-flex vertical :gap="8">
        <a-typography-text>{{ t('settings.panel.cylinder.sizeZ') }}</a-typography-text>
        <a-input-number
          :value="sizeZModel"
          :min="0.001"
          :step="0.01"
          style="width: 100%;"
          @change="onSizeInputChange('z', $event)"
        />
      </a-flex>
    </template>
  </a-flex>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@antdv-next/icons';
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'antdv-next';

import { DEFAULT_SETTINGS } from '../../../lib/viewer/settings';
import { formatColorValue, parseColorValue } from '../../ViewerStage/colorMap';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';
import SettingSwitchField from '../parts/SettingSwitchField.vue';

const { t } = useI18n();
const { settings, patchSettings } = useSettingsSiderContext();
const viewerApi = computed(() => viewerApiRef.value);

const shapeTypeModel = computed<'cylinder' | 'cuboid'>({
  get: () => settings.value.cylinder.shapeType ?? DEFAULT_SETTINGS.cylinder.shapeType,
  set: v => patchSettings({ cylinder: { shapeType: v } }),
});

const shapeTypeOptions = computed(() => [
  { label: t('settings.panel.cylinder.shapeOptions.cylinder'), value: 'cylinder' },
  { label: t('settings.panel.cylinder.shapeOptions.cuboid'), value: 'cuboid' },
]);

const enabledModel = computed({
  get: () => settings.value.cylinder.enabled ?? DEFAULT_SETTINGS.cylinder.enabled,
  set: (v: boolean) => patchSettings({ cylinder: { enabled: v } }),
});

const cylinderColorModel = computed({
  get: () => settings.value.cylinder.color ?? DEFAULT_SETTINGS.cylinder.color,
  set: (v: string) => patchSettings({ cylinder: { color: v } }),
});

const radiusModel = computed({
  get: () => settings.value.cylinder.radius ?? DEFAULT_SETTINGS.cylinder.radius,
  set: (v: number) => patchSettings({ cylinder: { radius: v } }),
});

const heightModel = computed({
  get: () => settings.value.cylinder.height ?? DEFAULT_SETTINGS.cylinder.height,
  set: (v: number) => patchSettings({ cylinder: { height: v } }),
});

const sizeXModel = computed({
  get: () => settings.value.cylinder.sizeX ?? DEFAULT_SETTINGS.cylinder.sizeX,
  set: (v: number) => patchSettings({ cylinder: { sizeX: v } }),
});
const sizeYModel = computed({
  get: () => settings.value.cylinder.sizeY ?? DEFAULT_SETTINGS.cylinder.sizeY,
  set: (v: number) => patchSettings({ cylinder: { sizeY: v } }),
});
const sizeZModel = computed({
  get: () => settings.value.cylinder.sizeZ ?? DEFAULT_SETTINGS.cylinder.sizeZ,
  set: (v: number) => patchSettings({ cylinder: { sizeZ: v } }),
});

const centerModel = computed(() => settings.value.cylinder.center ?? DEFAULT_SETTINGS.cylinder.center);
const axisModel = computed(() => settings.value.cylinder.axis ?? DEFAULT_SETTINGS.cylinder.axis);

// 更新圆柱中心坐标（手动参数模式）。
// Update cylinder center coordinates (manual-parameter mode).
function updateCenter(axis: 'x' | 'y' | 'z', raw: unknown): void {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  patchSettings({
    cylinder: {
      center: {
        ...centerModel.value,
        [axis]: parsed,
      },
    },
  });
}

// 更新圆柱方向向量（会在渲染时归一化）。
// Update cylinder axis vector (normalized at render time).
function updateAxis(axis: 'x' | 'y' | 'z', raw: unknown): void {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  patchSettings({
    cylinder: {
      axis: {
        ...axisModel.value,
        [axis]: parsed,
      },
    },
  });
}

const cylinderColorIsCustom = computed(() => {
  const base = parseColorValue(DEFAULT_SETTINGS.cylinder.color)
    ?? { hex: '#FFD400', alpha: 1 };
  const current = parseColorValue(settings.value.cylinder.color ?? '')
    ?? base;
  if (current.hex.toUpperCase() !== base.hex.toUpperCase()) return true;
  return Math.abs(current.alpha - base.alpha) > 1e-6;
});

// 解析颜色选择器回调得到 CSS 颜色字符串。
// Resolve color picker callback into CSS color string.
function resolveColorCssString(value: unknown, css: unknown): string {
  const hexString = (value as any)?.toHexString?.();
  if (typeof hexString === 'string' && hexString.trim()) return hexString.trim();
  if (typeof css === 'string' && css.trim()) return css.trim();
  const hex = (value as any)?.toHex?.();
  if (typeof hex === 'string' && hex.trim()) return `#${hex.trim()}`;
  return String(value ?? '').trim();
}

function normalizeHexColor(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 4) hex = hex.slice(0, 3);
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  return `#${hex}`;
}

const colorPickerValue = computed(() => {
  const parsed = parseColorValue(cylinderColorModel.value);
  if (!parsed) return DEFAULT_SETTINGS.cylinder.color;
  if (parsed.alpha >= 0.999) return parsed.hex;
  const rgb = parseHexRgb(parsed.hex);
  if (!rgb) return parsed.hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${parsed.alpha})`;
});

// 处理颜色选择器（含透明度）回调。
// Handle color-picker callback with alpha channel.
function onCylinderColorPickerChange(value: unknown, css: unknown): void {
  const colorCss = resolveColorCssString(value, css);
  const hex = normalizeHexColor(colorCss);
  if (!hex) {
    message.error(t('settings.panel.colors.invalidHex'));
    return;
  }
  const rawAlpha = (value as any)?.toRgb?.()?.a ?? resolveAlphaFromCss(colorCss);
  const alpha = Number.isFinite(rawAlpha)
    ? Math.min(1, Math.max(0, Number(rawAlpha)))
    : 1;
  cylinderColorModel.value = formatColorValue(hex, alpha);
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;
  return { r, g, b };
}

function resolveAlphaFromCss(css: string): number | null {
  const s = String(css ?? '').trim().toLowerCase();
  if (!s) return null;
  const rgba = s.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/);
  if (rgba?.[1]) return Number(rgba[1]);
  const hsla = s.match(/^hsla\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*([\d.]+)\s*\)$/);
  if (hsla?.[1]) return Number(hsla[1]);
  return null;
}

// 半径手填输入，支持小数。
// Manual radius input with decimal support.
function onRadiusInputChange(raw: unknown): void {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  radiusModel.value = Math.max(0.001, parsed);
}

function onHeightInputChange(raw: unknown): void {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  heightModel.value = Math.max(0.001, parsed);
}

function onSizeInputChange(axis: 'x' | 'y' | 'z', raw: unknown): void {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const next = Math.max(0.001, parsed);
  if (axis === 'x') sizeXModel.value = next;
  if (axis === 'y') sizeYModel.value = next;
  if (axis === 'z') sizeZModel.value = next;
}

function resetCylinderColor(): void {
  cylinderColorModel.value = DEFAULT_SETTINGS.cylinder.color;
}

// 重置圆柱面板配置为默认值。
// Reset cylinder panel settings to defaults.
function resetCylinderSettings(): void {
  const computedDefaults = viewerApi.value?.computeDefaultCylinderParams?.();
  patchSettings({
    cylinder: {
      ...DEFAULT_SETTINGS.cylinder,
      center: computedDefaults?.center ?? DEFAULT_SETTINGS.cylinder.center,
      axis: computedDefaults?.axis ?? DEFAULT_SETTINGS.cylinder.axis,
      radius: computedDefaults?.radius ?? DEFAULT_SETTINGS.cylinder.radius,
      height: computedDefaults?.height ?? DEFAULT_SETTINGS.cylinder.height,
      sizeX: computedDefaults?.sizeX ?? DEFAULT_SETTINGS.cylinder.sizeX,
      sizeY: computedDefaults?.sizeY ?? DEFAULT_SETTINGS.cylinder.sizeY,
      sizeZ: computedDefaults?.sizeZ ?? DEFAULT_SETTINGS.cylinder.sizeZ,
    },
  });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterReset = registerPanelReset(PANEL_KEYS.cylinder, resetCylinderSettings);
onBeforeUnmount(() => {
  unregisterReset();
});
</script>
