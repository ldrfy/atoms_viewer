<template>
  <a-space direction="vertical" :size="8" class="settings-full-width">
    <a-alert
      v-if="!viewerApi"
      type="info"
      show-icon
      :message="t('settings.panel.layers.noViewer')"
    />

    <a-alert
      v-else-if="layerList.length === 0"
      type="info"
      show-icon
      :message="t('settings.panel.layers.empty')"
    />

    <div v-else class="settings-gap-top-sm">
      <a-row align="middle" justify="space-between" class="settings-full-width">
        <a-col>
          <a-space :size="8">
            <a-select
              :disabled="layerList.length < 2"
              :value="sortValue"
              @change="onSortChange"
            >
              <a-select-option
                v-for="opt in sortOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </a-select-option>
            </a-select>
            <a-tooltip :title="t('settings.panel.files.openFileHint')">
              <a-button
                type="text"
                :aria-label="t('settings.panel.files.openFile')"
                @click="onOpenFile"
              >
                <FolderOpenOutlined />
              </a-button>
            </a-tooltip>
            <a-tooltip :title="selectAllLabel">
              <a-button
                type="text"
                :disabled="layerList.length === 0"
                :aria-label="selectAllLabel"
                @click="onToggleSelectAll"
              >
                <CheckSquareOutlined :class="{ 'layers-selectall-icon': allSelected }" />
              </a-button>
            </a-tooltip>
            <a-tooltip :title="toggleAllLabel">
              <a-button
                type="text"
                :disabled="layerList.length === 0"
                :aria-label="toggleAllLabel"
                @click="onToggleAllVisible"
              >
                <component :is="allVisible ? EyeInvisibleOutlined : EyeOutlined" />
              </a-button>
            </a-tooltip>
          </a-space>
        </a-col>
        <a-col>
          <a-tooltip :title="t('settings.panel.layers.hint')" placement="left">
            <a-button
              type="text"
              :aria-label="t('settings.panel.layers.hint')"
            >
              <QuestionCircleOutlined />
            </a-button>
          </a-tooltip>
        </a-col>
      </a-row>
      <a-divider class="settings-divider" />

      <div class="layers-list">
        <div
          v-for="l in layerList"
          :key="l.id"
          class="layer-row"
        >
          <div class="layer-left" @click.stop>
            <a-checkbox
              :checked="isLayerSelected(l.id)"
              :aria-label="t('settings.panel.layers.selectLayer')"
              :title="t('settings.panel.layers.selectLayer')"
              @change="onToggleLayerSelected(l.id, ($event as any).target?.checked)"
            />
          </div>

          <div class="layer-main">
            <div class="layer-name" :title="layerPrimaryText(l)">
              {{ layerPrimaryText(l) }}
            </div>
            <div class="layer-meta" :title="layerSecondaryText(l)">
              {{ layerSecondaryText(l) }}
            </div>
          </div>

          <div class="layer-right" @click.stop>
            <a-space :size="6">
              <a-switch
                :checked="l.visible"
                :aria-label="t('settings.panel.layers.visible')"
                :title="t('settings.panel.layers.visible')"
                @change="onToggleLayer(l.id, !!$event)"
              />

              <a-popconfirm
                :title="t('settings.panel.layers.deleteConfirm')"
                :ok-text="t('common.delete')"
                :cancel-text="t('common.cancel')"
                placement="left"
                @confirm="onDeleteLayer(l.id)"
              >
                <a-button
                  type="text"
                  size="small"
                  danger
                  :aria-label="t('common.delete')"
                  :title="t('common.delete')"
                >
                  <DeleteOutlined />
                </a-button>
              </a-popconfirm>
            </a-space>
          </div>
        </div>
      </div>
    </div>
  </a-space>
</template>

<script setup lang="ts">
import {
  DeleteOutlined,
  QuestionCircleOutlined,
  FolderOpenOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons-vue';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';

const { t } = useI18n();

const { selectedLayerIds } = useSettingsSiderContext();
const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const allVisible = computed(() => layerList.value.length > 0 && layerList.value.every(l => l.visible));
// Selected layer id set for quick lookup.
// 选中图层 id 的集合，用于快速判断。
const selectedLayerSet = computed(() => new Set(selectedLayerIds.value));
const allSelected = computed(
  () => layerList.value.length > 0 && layerList.value.every(l => selectedLayerSet.value.has(l.id)),
);

const toggleAllLabel = computed(() => (
  allVisible.value ? t('settings.panel.layers.hideAll') : t('settings.panel.layers.showAll')
));
const selectAllLabel = computed(() => (
  allSelected.value ? t('settings.panel.layers.clearSelection') : t('settings.panel.layers.selectAll')
));
const sortValue = computed(() => viewerApi.value?.layerSortBy?.value ?? 'name,ASC');
const sortOptions = computed(() => ([
  { value: 'time,ASC', label: t('settings.panel.layers.sort.timeAsc') },
  { value: 'time,DESC', label: t('settings.panel.layers.sort.timeDesc') },
  { value: 'name,ASC', label: t('settings.panel.layers.sort.nameAsc') },
  { value: 'name,DESC', label: t('settings.panel.layers.sort.nameDesc') },
]));

/**
 * Primary text shown for a layer.
 * - Prefer a user-friendly layer name.
 * - Fall back to source file name.
 */
function layerPrimaryText(l: any): string {
  const name = String(l?.name ?? '').trim();
  const file = String(l?.source?.fileName ?? '').trim();
  return name || file || String(l?.id ?? '');
}

/**
 * Secondary text shown under the layer name.
 * Avoid showing the same file name twice (e.g. when l.name === l.source?.fileName).
 */
function layerSecondaryText(l: any): string {
  const name = String(l?.name ?? '').trim();
  const file = String(l?.source?.fileName ?? '').trim();
  const atoms = Number.isFinite(l?.atomCount) ? Number(l.atomCount) : 0;
  const frames = Number.isFinite(l?.frameCount) ? Number(l.frameCount) : 0;
  const atomsText = new Intl.NumberFormat().format(atoms);
  const framesText = new Intl.NumberFormat().format(frames);
  const meta = t('settings.panel.layers.meta', {
    atoms: atomsText,
    frames: framesText,
  });

  const fmt = String(l?.sourceFormat ?? '').trim();
  const parts: string[] = [];

  // If the layer has a user-friendly name, also show the source filename.
  if (file && name && file !== name) parts.push(file);
  if (fmt) parts.push(fmt.toUpperCase());
  parts.push(meta);

  return parts.join(' · ');
}

function onOpenFile(): void {
  viewerApi.value?.openFilePicker();
}

function isLayerSelected(id: string): boolean {
  return selectedLayerSet.value.has(id);
}

function onToggleLayerSelected(id: string, checked: boolean): void {
  const next = new Set(selectedLayerIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedLayerIds.value = Array.from(next);
}

// Toggle select all / clear selection.
// 切换“全选/取消全选”。
function onToggleSelectAll(): void {
  if (allSelected.value) {
    selectedLayerIds.value = [];
    return;
  }
  selectedLayerIds.value = layerList.value.map(l => l.id);
}

function onToggleLayer(id: string, visible: boolean): void {
  viewerApi.value?.setLayerVisible(id, visible);
}

function onDeleteLayer(id: string): void {
  viewerApi.value?.removeLayer(id);
}

watch(
  layerList,
  (next) => {
    const ids = new Set(next.map(l => l.id));
    const filtered = selectedLayerIds.value.filter(id => ids.has(id));
    if (filtered.length !== selectedLayerIds.value.length) {
      selectedLayerIds.value = filtered;
    }
  },
  { immediate: true },
);

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
</script>
