<template>
  <a-space direction="vertical" :size="0" class="settings-full-width">
    <a-flex align="center" justify="space-between">
      <a-typography-text>{{ label }}</a-typography-text>
      <a-switch
        v-model:checked="checkedModel"
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

const props = withDefaults(
  defineProps<{
    checked: boolean;
    label: string;
    hint?: string;
    disabled?: boolean;
  }>(),
  {
    hint: '',
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:checked', value: boolean): void;
}>();

// 开关值代理，统一组件内外的双向绑定。
// Proxy switch value for consistent two-way binding.
const checkedModel = computed({
  get: () => props.checked,
  set: (value: boolean) => emit('update:checked', !!value),
});
</script>
