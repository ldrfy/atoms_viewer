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
            <span>{{ t(p.headerKey) }}</span>
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
