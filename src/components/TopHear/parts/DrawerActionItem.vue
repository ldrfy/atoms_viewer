<template>
  <a-button
    type="text"
    block
    class="drawer-action-btn"
    @click="emit('click')"
  >
    <a-flex
      align="center"
      justify="space-between"
      :gap="12"
      class="drawer-action-content"
    >
      <a-space :size="12" align="center">
        <component :is="leftIcon" />
        <a-typography-text>{{ label }}</a-typography-text>
      </a-space>
      <span class="drawer-action-tail-wrap">
        <component :is="rightIcon" />
      </span>
    </a-flex>
  </a-button>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

// 操作项文案（如 GitHub / 文档 / 设置）。
// Action item label (e.g. GitHub / Docs / Settings).
// 左侧图标组件（业务图标）。
// Left icon component (business icon).
// 右侧图标组件（动作图标）。
// Right icon component (action icon).
const props = defineProps<{
  label: string;
  leftIcon: Component;
  rightIcon: Component;
}>();

const { label, leftIcon, rightIcon } = props;

const emit = defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped>
.drawer-action-btn {
    text-align: left;
    padding-left: 0;
    padding-right: 0;
}

.drawer-action-content {
    width: 100%;
}

.drawer-action-tail-wrap {
    margin-right: 10px;
}
</style>
