<template>
  <a-space direction="vertical" :size="8" class="settings-full-width">
    <a-space :size="8">
      <a-select
        size="small"
        :disabled="layerList.length < 2"
        :value="sortValue"
        :options="sortOptions"
        @change="onSortChange"
      />
      <a-tooltip :title="t('settings.panel.files.openFileHint')">
        <a-button
          type="text"
          :aria-label="t('settings.panel.files.openFile')"
          :disabled="!viewerApi"
          @click="onOpenFile"
        >
          <FolderOpenOutlined />
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
      <a-tooltip :title="t('settings.panel.layers.hint')">
        <a-button
          type="text"
          :aria-label="t('settings.panel.layers.hint')"
        >
          <QuestionCircleOutlined />
        </a-button>
      </a-tooltip>
    </a-space>
    <a-divider style="margin-top: 2px; margin-bottom: 8px;" />

    <div class="layers-list">
      <a-alert
        v-if="layerList.length === 0"
        type="info"
        show-icon
        :message="t('settings.panel.layers.empty')"
      />

      <div
        v-for="l in layerList"
        v-else
        :key="l.id"
        class="layer-row"
        :class="{ active: l.id === activeLayerId }"
        @click="onSetActive(l.id)"
      >
        <div class="layer-left">
          <a-radio :checked="l.id === activeLayerId" />
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
          <a-space direction="vertical" align="center" :size="2">
            <a-button
              :type="l.visible ? 'link' : 'text'"
              size="small"
              :title="t('settings.panel.layers.visible')"
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
        </div>
      </div>
    </div>
  </a-space>
</template>

<script setup lang="ts">
import { DeleteOutlined, QuestionCircleOutlined, FolderOpenOutlined, EyeOutlined, EyeInvisibleOutlined } from '@antdv-next/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { viewerApiRef } from '../../../lib/viewer/bridge';

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
</script>
