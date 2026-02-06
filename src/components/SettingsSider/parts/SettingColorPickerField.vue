<template>
  <a-flex vertical>
    <a-flex
      :gap="8"
      align="center"
      justify="space-between"
    >
      <a-typography-text>{{ label }}</a-typography-text>
      <a-space :size="6" align="center">
        <a-tooltip v-if="showReset" :title="resetTooltip">
          <a-button
            type="text"
            size="small"
            :disabled="disabled"
            @click="emit('reset')"
          >
            <ReloadOutlined />
          </a-button>
        </a-tooltip>
        <a-color-picker
          size="small"
          show-text
          disabled-alpha
          :disabled="disabled"
          :value="value"
          @change="onColorChange"
        />
      </a-space>
    </a-flex>
    <a-typography-text v-if="hint" type="secondary" class="small-text">
      {{ hint }}
    </a-typography-text>
  </a-flex>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@antdv-next/icons';
import { toRefs } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    value: string;
    showReset?: boolean;
    resetTooltip?: string;
    disabled?: boolean;
  }>(),
  {
    hint: '',
    showReset: false,
    resetTooltip: '',
    disabled: false,
  },
);
const { label, hint, value, showReset, resetTooltip, disabled } = toRefs(props);

const emit = defineEmits<{
  (e: 'change', value: unknown, css: unknown): void;
  (e: 'reset'): void;
}>();

// 颜色变更事件透传给父组件，保持颜色解析逻辑集中在面板层。
// Forward color change event to parent so parsing logic stays in panel layer.
function onColorChange(value: unknown, css: unknown): void {
  emit('change', value, css);
}
</script>
