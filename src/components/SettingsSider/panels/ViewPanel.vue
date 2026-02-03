<template>
  <a-form layout="vertical">
    <a-form-item :label="viewPresetsLabel">
      <div class="settings-center">
        <a-checkbox-group
          :value="viewPresetsModel"
          :options="viewPresetOptions"
          :disabled="!hasAnyLayer"
          @change="onViewPresetsChange"
        />
      </div>
    </a-form-item>

    <a-form-item>
      <a-row justify="space-between" align="middle">
        <a-col>{{ t('settings.panel.view.perspective') }}</a-col>
        <a-col>
          <a-switch
            v-model:checked="orthographicModel"
            :aria-label="t('settings.panel.view.perspective')"
            :title="t('settings.panel.view.perspective')"
            :disabled="!hasAnyLayer"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item
      v-if="viewPresetsModel.length > 0"
      :label="dualViewDistanceLabel"
    >
      <a-row :gutter="8" align="middle">
        <a-col :span="0.5" />

        <a-col :flex="1">
          <a-slider
            v-model:value="dualViewDistanceModel"
            :min="DUAL_VIEW_DISTANCE_MIN"
            :max="dualViewDistanceMax"
            :step="0.01"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col>
          <a-input-number
            v-model:value="dualViewDistanceModel"
            class="settings-col-compact"

            :aria-label="t('settings.panel.view.dualViewDistance')"
            :title="t('settings.panel.view.dualViewDistance')"
            :min="DUAL_VIEW_DISTANCE_MIN"
            :max="dualViewDistanceMax"
            :step="0.01"
            :precision="2"
            :disabled="!hasAnyLayer"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="rotationLabel">
      <a-space direction="vertical" :size="8" class="settings-full-width">
        <a-row :gutter="8" align="middle">
          <a-col :span="0.5" />

          <a-col>
            <a-tag color="processing">
              X
            </a-tag>
          </a-col>
          <a-col :flex="1">
            <a-slider
              v-model:value="rotXModel"
              :min="-180"
              :max="180"
              :step="0.1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
          <a-col>
            <a-input-number
              v-model:value="rotXModel"
              class="settings-col-compact"
              :aria-label="t('settings.panel.view.rotX')"
              :title="t('settings.panel.view.rotX')"
              :min="-180"
              :max="180"
              :step="1"
              :precision="1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
        </a-row>
        <a-row :gutter="8" align="middle">
          <a-col :span="0.5" />

          <a-col>
            <a-tag color="processing">
              Y
            </a-tag>
          </a-col>
          <a-col :flex="1">
            <a-slider
              v-model:value="rotYModel"
              :min="-180"
              :max="180"
              :step="0.1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
          <a-col>
            <a-input-number
              v-model:value="rotYModel"
              class="settings-col-compact"

              :aria-label="t('settings.panel.view.rotY')"
              :title="t('settings.panel.view.rotY')"
              :min="-180"
              :max="180"
              :step="1"
              :precision="1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
        </a-row>
        <a-row :gutter="8" align="middle">
          <a-col :span="0.5" />

          <a-col>
            <a-tag color="processing">
              Z
            </a-tag>
          </a-col>
          <a-col :flex="1">
            <a-slider
              v-model:value="rotZModel"
              :min="-180"
              :max="180"
              :step="0.1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
          <a-col>
            <a-input-number
              v-model:value="rotZModel"
              class="settings-col-compact"
              :aria-label="t('settings.panel.view.rotZ')"
              :title="t('settings.panel.view.rotZ')"
              :min="-180"
              :max="180"
              :step="1"
              :precision="1"
              :disabled="!hasAnyLayer"
            />
          </a-col>
        </a-row>
      </a-space>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, h, ref, watch, onBeforeUnmount } from 'vue';
import { Button, Space, Tooltip, message } from 'antdv-next';
import { QuestionCircleOutlined, ReloadOutlined } from '@antdv-next/icons';
import { useI18n } from 'vue-i18n';
import { normalizeViewPresets, type ViewPreset } from '../../../lib/viewer/viewPresets';
import { DUAL_VIEW_DISTANCE_MIN } from '../../../lib/viewer/constants';
import { DEFAULT_DISPLAY } from '../../../lib/viewer/settings';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

const { t } = useI18n();
const { settings, patchSettings, hasAnyLayer } = useSettingsSiderContext();

// Build FormItem label VNodes for antdv-next (label slot removed).
// 为 antdv-next 构建 FormItem label 的 VNode（已移除 label slot）。
function buildFormItemLabel(
  text: string,
  action?: {
    title: string;
    ariaLabel: string;
    onClick?: () => void;
    icon: any;
    show?: boolean;
    size?: 'small' | 'middle' | 'large';
  },
  tooltipPlacement: 'left' | 'right' | 'top' | 'bottom' = 'left',
) {
  const children = [
    h('span', text),
  ];

  if (action) {
    const showAction = action.show ?? true;
    const buttonNode = h(
      Button,
      {
        'type': 'text',
        'size': action.size ?? 'middle',
        'aria-label': action.ariaLabel,
        'title': action.title,
        'onClick': action.onClick,
        'style': showAction ? undefined : { visibility: 'hidden', pointerEvents: 'none' },
        'tabIndex': showAction ? undefined : -1,
      },
      () => h(action.icon),
    );

    if (showAction) {
      const tooltipNode = h(
        Tooltip,
        { title: action.title, placement: tooltipPlacement },
        () => buttonNode,
      );
      children.push(tooltipNode);
    }
    else {
      children.push(buttonNode);
    }
  }

  return h(Space, { size: 6, align: 'center' }, () => children);
}

const viewPresetOptions = computed(() => [
  { label: t('settings.panel.view.viewPresetFront'), value: 'front' as const },
  { label: t('settings.panel.view.viewPresetSide'), value: 'side' as const },
  { label: t('settings.panel.view.viewPresetTop'), value: 'top' as const },
]);

// Controlled selection (max two, min one)
const viewPresetsModel = ref<ViewPreset[]>(['front']);

// View presets label (text + hint).
// 视角预设 label（文本 + 提示）。
const viewPresetsLabel = computed(() => buildFormItemLabel(
  t('settings.panel.view.viewPresets'),
  {
    title: t('settings.panel.view.viewPresetsHint'),
    ariaLabel: t('settings.panel.view.viewPresetsHint'),
    icon: QuestionCircleOutlined,
  },
));

function syncViewPresetsFromSettings(): void {
  const cur = normalizeViewPresets(settings.value.view.viewPresets);
  if (cur.length > 0) {
    viewPresetsModel.value = cur;
    return;
  }
  viewPresetsModel.value = ['front'];
}

watch(
  () => settings.value.view.viewPresets,
  () => syncViewPresetsFromSettings(),
  { immediate: true, deep: true },
);

function onViewPresetsChange(nextRaw: any): void {
  if (!hasAnyLayer.value) return;
  const arr = Array.isArray(nextRaw) ? nextRaw : [];
  const next = arr.filter(
    (x): x is ViewPreset => x === 'front' || x === 'side' || x === 'top',
  );
  const prev = viewPresetsModel.value;

  if (!next || next.length === 0) {
    message.warning(t('settings.panel.view.viewPresetsNeedOne'));
    return;
  }

  const keep = prev.filter(p => next.includes(p));
  const added = next.filter(p => !prev.includes(p));
  const merged = [...keep, ...added];
  while (merged.length > 2) merged.shift();

  viewPresetsModel.value = merged;
  patchSettings({ view: { viewPresets: merged } });
}

const dualViewDistanceModel = computed({
  get: () => settings.value.view.dualViewDistance ?? 10,
  set: (v: number) => patchSettings({ view: { dualViewDistance: v } }),
});

const dualViewDistanceMax = computed(() => {
  const v = settings.value.view.dualViewDistance ?? 10;
  return Math.max(200, Math.ceil(v * 1.2));
});
// const dualViewDistanceMax = 500;

// Switch label is "perspective"; stored setting is `orthographic`.
// UI "ON" means perspective, so invert.
const orthographicModel = computed({
  get: () => !settings.value.view.orthographic,
  set: (v: boolean) => patchSettings({ view: { orthographic: !v } }),
});

function getDefaultDistance(): number {
  const s = settings.value.view;
  const d
    = typeof s.initialDualViewDistance === 'number' && Number.isFinite(s.initialDualViewDistance)
      ? s.initialDualViewDistance
      : typeof s.dualViewDistance === 'number' && Number.isFinite(s.dualViewDistance)
        ? s.dualViewDistance
        : 10;
  return d;
}

const distanceDirty = computed(() => {
  const cur = settings.value.view.dualViewDistance ?? 10;
  const def = getDefaultDistance();
  return Math.abs(cur - def) > 1e-6;
});

// Dual view distance label (text + reset when dirty).
// 双视图间距 label（文本 + 脏数据时重置）。
const dualViewDistanceLabel = computed(() => buildFormItemLabel(
  t('settings.panel.view.dualViewDistance'),
  {
    title: t('settings.panel.view.resetView'),
    ariaLabel: t('settings.panel.view.resetView'),
    onClick: resetDistance,
    icon: ReloadOutlined,
    size: 'small',
    show: distanceDirty.value,
  },
));

function resetDistance(): void {
  patchSettings({ view: { dualViewDistance: getDefaultDistance() } });
}

const rotationDirty = computed(() => {
  const r = settings.value.view.rotationDeg;
  return Math.abs(r.x) > 1e-6 || Math.abs(r.y) > 1e-6 || Math.abs(r.z) > 1e-6;
});

// Rotation label (text + reset when dirty).
// 旋转 label（文本 + 脏数据时重置）。
const rotationLabel = computed(() => buildFormItemLabel(
  t('settings.panel.view.rotation'),
  {
    title: t('settings.panel.view.resetPose'),
    ariaLabel: t('settings.panel.view.resetPose'),
    onClick: resetPose,
    icon: ReloadOutlined,
    size: 'small',
    show: rotationDirty.value,
  },
));

const rotXModel = computed({
  get: () => settings.value.view.rotationDeg.x,
  set: (v: number) => patchSettings({ view: { rotationDeg: { x: v } } }),
});

const rotYModel = computed({
  get: () => settings.value.view.rotationDeg.y,
  set: (v: number) => patchSettings({ view: { rotationDeg: { y: v } } }),
});

const rotZModel = computed({
  get: () => settings.value.view.rotationDeg.z,
  set: (v: number) => patchSettings({ view: { rotationDeg: { z: v } } }),
});

function resetPose(): void {
  patchSettings({ view: { rotationDeg: { x: 0, y: 0, z: 0 } } });
}

function resetViewPanel(): void {
  resetPose();
  resetDistance();
  patchSettings({
    view: {
      orthographic: DEFAULT_DISPLAY.orthographic,
      viewPresets: [...DEFAULT_DISPLAY.viewPresets],
    },
  });
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterViewReset = registerPanelReset(PANEL_KEYS.view, resetViewPanel);
onBeforeUnmount(() => {
  unregisterViewReset();
});
</script>

<style scoped>
</style>
