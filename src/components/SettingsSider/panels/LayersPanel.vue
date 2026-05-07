<template>
  <a-flex vertical gap="small">
    <a-flex align="center" justify="space-between">
      <a-select
        style="max-width: 120px; width: 100%;"
        :disabled="layerList.length < 2"
        :value="sortValue"
        :options="sortOptions"
        @change="onSortChange"
      />
      <a-tooltip :title="t('settings.panel.files.openFileHint')">
        <a-button
          variant="link"
          color="default"
          :disabled="!viewerApi"
          style="margin-left: 8px;"
          @click="onOpenFile"
        >
          <FolderOpenOutlined />
        </a-button>
      </a-tooltip>
      <a-tooltip :title="toggleAllLabel">
        <a-button
          variant="link"
          color="default"
          :disabled="layerList.length === 0"
          @click="onToggleAllVisible"
        >
          <component :is="allVisible ? EyeInvisibleOutlined : EyeOutlined" />
        </a-button>
      </a-tooltip>
      <a-tooltip :title="t('settings.panel.layers.hint')">
        <a-button variant="link" color="default">
          <QuestionCircleOutlined />
        </a-button>
      </a-tooltip>
    </a-flex>

    <SettingSwitchField
      v-model:checked="realLayerPositionsModel"
      :label="t('settings.panel.view.useRealLayerPositions')"
      :disabled="layerList.length === 0"
    />

    <a-divider style="margin-top: 2px; margin-bottom: 8px;" />

    <a-alert
      v-if="layerList.length === 0"
      type="info"
      show-icon
      :message="t('settings.panel.layers.empty')"
    />

    <a-card
      v-for="l in layerList"
      :key="l.id"
      :style="layerItemStyle(l.id === activeLayerId)"
      :styles="{ body: { padding: '5px 8px 5px 10px' } }"
      @click="onSetActive(l.id)"
    >
      <a-flex :gap="8" align="center">
        <a-radio :checked="l.id === activeLayerId" />

        <a-space direction="vertical" :size="0" style="flex: 1; min-width: 0;">
          <a-typography-text
            ellipsis
            strong
          >
            {{ layerPrimaryText(l) }}
          </a-typography-text>
          <a-typography-text
            ellipsis
            type="secondary"
            class="small-text"
          >
            {{ layerSecondaryText(l) }}
          </a-typography-text>
        </a-space>

        <a-space
          direction="vertical"
          align="center"
          :size="0"
          @click.stop
        >
          <a-button
            :type="l.visible ? 'link' : 'text'"
            size="small"
            @click="onToggleLayer(l.id, !l.visible)"
          >
            <component :is="l.visible ? EyeOutlined : EyeInvisibleOutlined" />
          </a-button>

          <a-popconfirm
            :title="t('settings.panel.layers.deleteConfirm')"
            placement="left"
            @confirm="onDeleteLayer(l.id)"
          >
            <a-button
              type="text"
              size="small"
              danger
            >
              <DeleteOutlined />
            </a-button>
          </a-popconfirm>
        </a-space>
      </a-flex>
    </a-card>
  </a-flex>
</template>

<script setup lang="ts">
import { DeleteOutlined, QuestionCircleOutlined, FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined } from '@antdv-next/icons';
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { formatLayerDisplayName } from '../../../lib/viewer/layerDisplayName';
import { PANEL_KEYS } from '../../../lib/viewer/panelKeys';
import SettingSwitchField from '../parts/SettingSwitchField.vue';
import { useSettingsSiderResetContext } from '../useSettingsSiderResetContext';

const { t } = useI18n();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const allVisible = computed(() => layerList.value.length > 0 && layerList.value.every(l => l.visible));

const toggleAllLabel = computed(() => (
  allVisible.value ? t('settings.panel.layers.hideAll') : t('settings.panel.layers.showAll')
));
const sortValue = computed(() => viewerApi.value?.layerSortBy?.value ?? 'name,ASC');
const sortOptions = computed(() => ([
  { value: 'time,ASC', label: t('settings.panel.layers.sort.timeAsc') },
  { value: 'time,DESC', label: t('settings.panel.layers.sort.timeDesc') },
  { value: 'name,ASC', label: t('settings.panel.layers.sort.nameAsc') },
  { value: 'name,DESC', label: t('settings.panel.layers.sort.nameDesc') },
]));

// 图层位置模式存放在图层会话状态中。
// Layer positioning is stored in layer session state.
const realLayerPositionsModel = computed({
  get: () => viewerApi.value?.layerUseRealPositions.value ?? true,
  set: (v: boolean) => viewerApi.value?.setLayerUseRealPositions(!!v),
});

// 图层项样式，尽量复用 Ant 列表并只保留激活态差异。
// Layer item style keeps Ant List base behavior and only adds active-state difference.
function layerItemStyle(active: boolean): Record<string, string> {
  return {
    borderRadius: '10px',
    cursor: 'pointer',
    outline: active ? '1px solid var(--ant-colorPrimary, #1677ff)' : 'none',
    background: active ? 'rgba(22, 119, 255, 0.1)' : 'transparent',
  };
}

/**
 * Primary text shown for a layer.
 * - Prefer a user-friendly layer name.
 * - Fall back to source file name.
 */
function layerPrimaryText(l: any): string {
  return formatLayerDisplayName(l, layerList.value);
}

/**
 * Secondary text shown under the layer name.
 * Avoid showing the same file name twice (e.g. when l.name === l.source?.fileName).
 */
function layerSecondaryText(l: any): string {
  const atoms = Number.isFinite(l?.atomCount) ? Number(l.atomCount) : 0;
  const frames = Number.isFinite(l?.frameCount) ? Number(l.frameCount) : 0;
  const atomsText = new Intl.NumberFormat().format(atoms);
  const framesText = new Intl.NumberFormat().format(frames);
  const meta = t('settings.panel.layers.meta', {
    atoms: atomsText,
    frames: framesText,
  });

  const fmt = String(l?.sourceFormat ?? '').trim();
  // 副标题仅显示格式与统计信息，不显示文件名。
  // Secondary text only shows format and stats, without filename.
  const parts: string[] = [];
  if (fmt) parts.push(layerFormatLabel(fmt));
  parts.push(meta);

  return parts.join(' · ');
}

// 统一格式显示名，避免 LAMMPS 只显示 DUMP/DATA。
// Normalize format label so LAMMPS does not collapse to DUMP/DATA only.
function layerFormatLabel(fmt: string): string {
  const raw = String(fmt ?? '').trim();
  const key = raw.toLowerCase();
  if (['dump', 'lammpstrj', 'traj', 'lammpsdump', 'lammps-dump'].includes(key)) return 'LAMMPS-DUMP';
  if (['data', 'lmp', 'lammpsdata', 'lammps-data'].includes(key)) return 'LAMMPS-DATA';
  return raw.toUpperCase();
}

function onOpenFile(): void {
  viewerApi.value?.openFilePicker();
}

function onSetActive(id: string): void {
  viewerApi.value?.setActiveLayer(id);
}

function onToggleLayer(id: string, visible: boolean): void {
  viewerApi.value?.setLayerVisible(id, visible);
}

function onDeleteLayer(id: string): void {
  viewerApi.value?.removeLayer(id);
}

function onToggleAllVisible(): void {
  viewerApi.value?.setAllLayersVisible(!allVisible.value);
}

function onSortChange(val: string): void {
  const raw = String(val ?? 'name,ASC');
  const [byRaw, dirRaw] = raw.split(',').map(v => v.trim().toLowerCase());
  const by = byRaw === 'time' ? 'time' : 'name';
  const direction = dirRaw === 'desc' ? 'desc' : 'asc';
  viewerApi.value?.sortLayers({ by, direction });
}

function resetLayersPanel(): void {
  viewerApi.value?.setLayerUseRealPositions(true);
}

const { registerPanelReset } = useSettingsSiderResetContext();
const unregisterLayersReset = registerPanelReset(PANEL_KEYS.layers, resetLayersPanel);
onBeforeUnmount(() => {
  unregisterLayersReset();
});
</script>
