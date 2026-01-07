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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
</script>
