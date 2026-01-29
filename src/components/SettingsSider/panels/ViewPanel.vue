<template>
  <a-form layout="vertical">
    <a-form-item :label="t('settings.panel.view.viewPresets')">
      <div class="settings-center">
        <a-checkbox-group
          :value="viewPresetsModel"
          :options="viewPresetOptions"
          :disabled="!hasAnyLayer"
          @change="onViewPresetsChange"
        />
      </div>

      <a-typography-text type="secondary" class="settings-text-secondary settings-text-center">
        {{ t('settings.panel.view.viewPresetsHint') }}
      </a-typography-text>
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
      :label="t('settings.panel.view.dualViewDistance')"
    >
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="dualViewDistanceModel"
            :min="DUAL_VIEW_DISTANCE_MIN"
            :max="dualViewDistanceMax"
            :step="0.5"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="dualViewDistanceModel"
            :aria-label="t('settings.panel.view.dualViewDistance')"
            :title="t('settings.panel.view.dualViewDistance')"
            :min="DUAL_VIEW_DISTANCE_MIN"
            :max="dualViewDistanceMax"
            :step="0.5"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.view.rotX')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotXModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="rotXModel"
            :aria-label="t('settings.panel.view.rotX')"
            :title="t('settings.panel.view.rotX')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.view.rotY')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotYModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="rotYModel"
            :aria-label="t('settings.panel.view.rotY')"
            :title="t('settings.panel.view.rotY')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item :label="t('settings.panel.view.rotZ')">
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-slider
            v-model:value="rotZModel"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
          />
        </a-col>
        <a-col class="settings-col-compact">
          <a-input-number
            v-model:value="rotZModel"
            :aria-label="t('settings.panel.view.rotZ')"
            :title="t('settings.panel.view.rotZ')"
            :min="-180"
            :max="180"
            :step="1"
            :disabled="!hasAnyLayer"
            class="settings-full-width"
          />
        </a-col>
      </a-row>
    </a-form-item>

    <a-form-item>
      <a-row :gutter="8" align="middle">
        <a-col :flex="1">
          <a-button block :disabled="!hasAnyLayer" @click="resetPose">
            {{ t('settings.panel.view.resetPose') }}
          </a-button>
        </a-col>
        <a-col :flex="1">
          <a-button block :disabled="!hasAnyLayer" @click="resetDistance">
            {{ t('settings.panel.view.resetView') }}
          </a-button>
        </a-col>
      </a-row>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { normalizeViewPresets, type ViewPreset } from '../../../lib/viewer/viewPresets';
import { DUAL_VIEW_DISTANCE_MIN } from '../../../lib/viewer/constants';
import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();
const { settings, patchSettings, hasAnyLayer } = useSettingsSiderContext();

const viewPresetOptions = computed(() => [
  { label: t('settings.panel.view.viewPresetFront'), value: 'front' as const },
  { label: t('settings.panel.view.viewPresetSide'), value: 'side' as const },
  { label: t('settings.panel.view.viewPresetTop'), value: 'top' as const },
]);

// Controlled selection (max two, min one)
const viewPresetsModel = ref<ViewPreset[]>(['front']);

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

function resetDistance(): void {
  const s = settings.value.view;
  const d
    = typeof s.initialDualViewDistance === 'number' && Number.isFinite(s.initialDualViewDistance)
      ? s.initialDualViewDistance
      : typeof s.dualViewDistance === 'number' && Number.isFinite(s.dualViewDistance)
        ? s.dualViewDistance
        : 10;
  patchSettings({ view: { dualViewDistance: d } });
}

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
</script>
