<template>
  <div class="settings-header">
    <!-- Mobile only: grab handle -->
    <div
      v-if="showGrab"
      class="settings-grab"
      aria-label="resize"
      title="Resize"
      role="button"
      tabindex="0"
      @pointerdown.prevent="onResizeStart"
    >
      <div class="settings-grab-bar" />
    </div>

    <div class="settings-header-row">
      <a-typography-text strong>
        {{ t('settings.title') }}
      </a-typography-text>

      <a-button
        type="text"
        size="small"
        aria-label="close"
        title="Close"
        @click="emit('close')"
      >
        <CloseOutlined />
      </a-button>
    </div>
  </div>

  <div class="settings-body">
    <a-collapse
      v-model:active-key="activeKeyProxy"
      ghost
      class="settings-collapse"
      expand-icon-position="end"
    >
      <a-collapse-panel
        v-for="p in panels"
        :key="p.key"
      >
        <template #header>
          <span class="settings-panel-header">
            <component :is="p.icon" class="settings-panel-icon" />
            <a-typography-text strong>
              {{ t(p.headerKey) }}
            </a-typography-text>
            <span v-if="isPanelDirty(p.key)" class="settings-panel-dirty" aria-hidden="true" />
          </span>
        </template>
        <component :is="p.comp" />
      </a-collapse-panel>
    </a-collapse>

    <div class="settings-reset">
      <a-button block @click="onClearStorage">
        {{ t('settings.clearStorage') }}
      </a-button>
      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.clearStorageHint') }}
      </a-typography-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  AppstoreOutlined,
  BgColorsOutlined,
  CloseOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  SlidersOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';

import FilesPanel from './panels/FilesPanel.vue';
import LayersPanel from './panels/LayersPanel.vue';
import DisplayPanel from './panels/DisplayPanel.vue';
import AutoRotatePanel from './panels/AutoRotatePanel.vue';
import LammpsPanel from './panels/LammpsPanel.vue';
import ColorsPanel from './panels/ColorsPanel.vue';
import LayerDisplayPanel from './panels/LayerDisplayPanel.vue';
import OtherPanel from './panels/OtherPanel.vue';
import {
  DEFAULT_SETTINGS,
  DEFAULT_LAYER_DISPLAY,
} from '../../lib/viewer/settings';
import { useSettingsSiderContext } from './useSettingsSiderContext';
import { useSettingsSiderControlContext } from './useSettingsSiderControlContext';
import { viewerApiRef } from '../../lib/viewer/bridge';
import {
  buildDefaultSettings,
  clearSettingsStorage,
  saveSettingsToStorage,
} from '../../lib/viewer/settingsStorage';

const props = withDefaults(
  defineProps<{
    showGrab?: boolean;
    activeKey: string[];
  }>(),
  {
    showGrab: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'resize-start', ev: PointerEvent): void;
  (e: 'update:activeKey', v: string[]): void;
}>();

const { t } = useI18n();
const { settings } = useSettingsSiderContext();
const { replaceSettings } = useSettingsSiderControlContext();

const viewerApi = computed(() => viewerApiRef.value);

function arraysEqual(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

function hasCustomColors(): boolean {
  const template = settings.value.colorMapTemplate ?? [];
  if (template.some(r => r.isCustom)) return true;
  const rows = viewerApi.value?.activeLayerColorMap?.value ?? [];
  return rows.some(r => r.isCustom);
}

function hasCustomTypeMap(): boolean {
  const template = settings.value.lammpsTypeMap ?? [];
  const rows = viewerApi.value?.activeLayerTypeMap?.value ?? [];
  const all = [...template, ...rows];
  return all.some(r => (r.element ?? '').toString().trim().toUpperCase() !== 'E');
}

function isTypeMapApplied(): boolean {
  return !!viewerApi.value?.activeLayerTypeMapApplied?.value;
}

function isLayerDisplayDirty(): boolean {
  const active = viewerApi.value?.activeLayerDisplay?.value;
  const cur = active ?? settings.value;
  return (
    cur.atomScale !== DEFAULT_LAYER_DISPLAY.atomScale
    || cur.showBonds !== DEFAULT_LAYER_DISPLAY.showBonds
    || cur.sphereSegments !== DEFAULT_LAYER_DISPLAY.sphereSegments
    || cur.bondFactor !== DEFAULT_LAYER_DISPLAY.bondFactor
    || cur.bondRadius !== DEFAULT_LAYER_DISPLAY.bondRadius
  );
}

function isPanelDirty(key: string): boolean {
  if (key === 'files' || key === 'layers') return false;
  if (key === 'colors') return hasCustomColors();
  if (key === 'lammps') return isTypeMapApplied() && hasCustomTypeMap();
  if (key === 'layerDisplay') return isLayerDisplayDirty();
  if (key === 'display') {
    const defaultDistance = Number.isFinite(settings.value.initialDualViewDistance)
      ? (settings.value.initialDualViewDistance as number)
      : DEFAULT_SETTINGS.dualViewDistance;
    return (
      settings.value.orthographic !== DEFAULT_SETTINGS.orthographic
      || settings.value.dualViewEnabled !== DEFAULT_SETTINGS.dualViewEnabled
      || !arraysEqual(settings.value.viewPresets, DEFAULT_SETTINGS.viewPresets)
      || settings.value.dualViewSplit !== DEFAULT_SETTINGS.dualViewSplit
      || (settings.value.dualViewDistance ?? defaultDistance) !== defaultDistance
      || settings.value.rotationDeg.x !== 0
      || settings.value.rotationDeg.y !== 0
      || settings.value.rotationDeg.z !== 0
    );
  }
  if (key === 'autoRotate') {
    const cur = settings.value.autoRotate;
    const def = DEFAULT_SETTINGS.autoRotate;
    return (
      !!cur.enabled !== !!def.enabled
      || cur.presetId !== def.presetId
      || cur.speedDegPerSec !== def.speedDegPerSec
      || !!cur.pauseOnInteract !== !!def.pauseOnInteract
      || cur.resumeDelayMs !== def.resumeDelayMs
      || !!cur.autoEnabledBySystem
    );
  }
  if (key === 'other') {
    return (
      settings.value.showAxes !== DEFAULT_SETTINGS.showAxes
      || settings.value.refreshBondsOnPlay !== DEFAULT_SETTINGS.refreshBondsOnPlay
      || settings.value.frame_rate !== DEFAULT_SETTINGS.frame_rate
    );
  }
  return false;
}

const panels = [
  { key: 'files', headerKey: 'settings.panel.files.header', comp: FilesPanel, icon: FolderOpenOutlined },
  { key: 'display', headerKey: 'settings.panel.display.header', comp: DisplayPanel, icon: EyeOutlined },
  { key: 'autoRotate', headerKey: 'settings.panel.autoRotate.header', comp: AutoRotatePanel, icon: SyncOutlined },
  { key: 'layers', headerKey: 'settings.panel.layers.header', comp: LayersPanel, icon: AppstoreOutlined },
  { key: 'lammps', headerKey: 'settings.panel.lammps.header', comp: LammpsPanel, icon: SwapOutlined },
  { key: 'colors', headerKey: 'settings.panel.colors.header', comp: ColorsPanel, icon: BgColorsOutlined },
  { key: 'layerDisplay', headerKey: 'settings.panel.layerDisplay.header', comp: LayerDisplayPanel, icon: SlidersOutlined },
  { key: 'other', headerKey: 'settings.panel.other.header', comp: OtherPanel, icon: SettingOutlined },
] as const;

const activeKeyProxy = computed<string[]>({
  get: () => props.activeKey,
  set: (v: unknown) => {
    const next = Array.isArray(v)
      ? v.map(x => String(x))
      : v != null && String(v) !== ''
        ? [String(v)]
        : [];
    emit('update:activeKey', next);
  },
});

function onResizeStart(ev: PointerEvent): void {
  emit('resize-start', ev);
}

function applyDefaults() {
  const defaults = buildDefaultSettings();
  const initialDistance = settings.value.initialDualViewDistance;
  const dist = typeof initialDistance === 'number' && Number.isFinite(initialDistance)
    ? initialDistance
    : defaults.initialDualViewDistance;

  const nextSettings = {
    ...defaults,
    dualViewDistance: dist,
    initialDualViewDistance: dist,
    rotationDeg: { x: 0, y: 0, z: 0 },
    resetViewSeq: settings.value.resetViewSeq,
  };

  const api = viewerApiRef.value;
  if (api) {
    api.suspendSettingsSync(300);
  }

  replaceSettings(nextSettings);
  if (api) {
    void nextTick(() => {
      api.applyViewFromSettings(nextSettings);
    });
  }

  if (!api) return nextSettings;

  api.setActiveLayerDisplay(
    {
      atomScale: DEFAULT_LAYER_DISPLAY.atomScale,
      showBonds: DEFAULT_LAYER_DISPLAY.showBonds,
      sphereSegments: DEFAULT_LAYER_DISPLAY.sphereSegments,
      bondFactor: DEFAULT_LAYER_DISPLAY.bondFactor,
      bondRadius: DEFAULT_LAYER_DISPLAY.bondRadius,
    },
    { applyToAll: true },
  );

  api.resetAllLayersTypeMapToDefaults({
    templateRows: [...(DEFAULT_SETTINGS.lammpsTypeMap ?? [])],
    useAtomDefaults: false,
  });
  api.resetAllLayersColorMapToDefaults();

  return nextSettings;
}

function onClearStorage(): void {
  Modal.confirm({
    title: t('settings.clearStorageConfirmTitle'),
    content: t('settings.clearStorageConfirmBody'),
    centered: true,
    wrapClassName: 'settings-clear-confirm',
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: () => {
      clearSettingsStorage();
      const nextSettings = applyDefaults();
      if (nextSettings) {
        saveSettingsToStorage(nextSettings);
      }
    },
  });
}
</script>
