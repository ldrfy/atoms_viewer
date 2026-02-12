<template>
  <a-flex gap="small" align="center">
    <component :is="icon" />
    <a-typography-text strong>
      {{ title }}
    </a-typography-text>

    <a-flex
      :class="[
        'settings-panel-indicator',
        { 'settings-panel-indicator--inactive': dirtyCount === 0 },
      ]"
    >
      <a-badge
        :count="dirtyCount > 0 ? dirtyCount : null"
        :overflow-count="99"
        :show-zero="false"
        color="blue"
        class="settings-panel-badge"
      />

      <a-tooltip v-if="showReset" :title="resetTooltip">
        <a-popconfirm
          :title="resetConfirmText"
          @confirm="onResetConfirm"
          @click.stop
        >
          <a-button
            variant="link"
            color="default"
            size="small"
            class="settings-panel-reset-button"
            @click.stop
          >
            <ReloadOutlined />
          </a-button>
        </a-popconfirm>
      </a-tooltip>
    </a-flex>
  </a-flex>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { ReloadOutlined } from '@antdv-next/icons';

defineProps<{
  icon: Component;
  title: string;
  dirtyCount: number;
  showReset: boolean;
  resetTooltip: string;
  resetConfirmText: string;
}>();

const emit = defineEmits<{
  (e: 'reset'): void;
}>();

function onResetConfirm(ev?: Event): void {
  // 阻止事件冒泡，避免触发折叠面板切换。
  // Stop event bubbling to avoid toggling the collapse panel.
  ev?.stopPropagation?.();
  emit('reset');
}
</script>
