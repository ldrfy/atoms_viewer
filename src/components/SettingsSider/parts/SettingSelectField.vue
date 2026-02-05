<template>
  <a-space direction="vertical" :size="0" class="settings-full-width">
    <a-flex :gap="8" align="center">
      <a-typography-text :style="labelMinWidthStyle">
        {{ label }}
      </a-typography-text>
      <a-select
        v-model:value="valueModel"
        style="flex: 1; min-width: 0;"
        :options="options"
        :disabled="disabled"
      />
    </a-flex>
    <a-typography-text v-if="hint" type="secondary">
      {{ hint }}
    </a-typography-text>
  </a-space>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
  [key: string]: unknown;
};

const props = withDefaults(
  defineProps<{
    value: string | number;
    label: string;
    hint?: string;
    options: SelectOption[];
    labelMinWidth?: number;
    disabled?: boolean;
  }>(),
  {
    hint: '',
    labelMinWidth: 84,
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:value', value: string | number): void;
}>();

// 选择值代理，统一组件内外的双向绑定。
// Proxy select value for consistent two-way binding.
const valueModel = computed({
  get: () => props.value,
  set: (value: string | number) => emit('update:value', value),
});

// 标签最小宽度样式，保证左侧文案对齐。
// Label min-width style to keep left text aligned.
const labelMinWidthStyle = computed(() => ({ minWidth: `${props.labelMinWidth}px` }));
</script>
