<template>
  <a-space direction="vertical" :size="8" style="width: 100%">
    <!-- 文件选择放在“模型图层”最上方 -->
    <div>
      <a-button
        type="primary"
        block
        :disabled="!viewerApi"
        @click="onOpenFile"
      >
        {{ t('settings.panel.files.openFile') }}
      </a-button>
      <a-typography-text type="secondary" style="display: block; margin-top: 6px">
        {{ t('settings.panel.files.openFileHint') }}
      </a-typography-text>
    </div>

    <a-divider style="margin: 8px 0" />

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

    <div v-else class="layers-list">
      <div
        v-for="l in layerList"
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
              @confirm="onDeleteLayer(l.id)"
            >
              <a-button
                type="text"
                size="small"
                danger
                aria-label="delete layer"
                title="Delete layer"
              >
                <DeleteOutlined />
              </a-button>
            </a-popconfirm>
          </a-space>
        </div>
      </div>
    </div>

    <a-typography-text type="secondary" style="display: block">
      {{ t('settings.panel.layers.hint') }}
    </a-typography-text>
  </a-space>
</template>

<script setup lang="ts">
import { DeleteOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { viewerApiRef } from '../../../lib/viewer/bridge';

const { t } = useI18n();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);

/**
 * Primary text shown for a layer.
 * - Prefer a user-friendly layer name.
 * - Fall back to source file name.
 */
function layerPrimaryText(l: any): string {
  const name = String(l?.name ?? '').trim();
  const file = String(l?.sourceFileName ?? '').trim();
  return name || file || String(l?.id ?? '');
}

/**
 * Secondary text shown under the layer name.
 * Avoid showing the same file name twice (e.g. when l.name === l.sourceFileName).
 */
function layerSecondaryText(l: any): string {
  const name = String(l?.name ?? '').trim();
  const file = String(l?.sourceFileName ?? '').trim();
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
</script>
