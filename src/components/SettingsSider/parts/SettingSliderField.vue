<template>
  <a-flex vertical>
    <a-typography-text v-if="label">
      {{ label }}
    </a-typography-text>

    <a-flex :gap="8" align="center">
      <slot name="prefix" />
      <a-slider
        v-model:value="valueModel"
        style="flex: 1; min-width: 0;"
        :min="min"
        :max="max"
        :step="sliderStep"
        :disabled="disabled"
      />
      <a-input-number
        v-model:value="valueModel"
        :min="min"
        :max="max"
        :step="inputStepModel"
        :precision="precisionModel"
        :disabled="disabled"
      />
    </a-flex>

    <a-typography-text v-if="hint" type="secondary" class="small-text">
      {{ hint }}
    </a-typography-text>
  </a-flex>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    label?: string;
    hint?: string;
    min: number;
    max: number;
    sliderStep: number;
    inputStep?: number;
    precision?: number;
    disabled?: boolean;
    gap?: number;
  }>(),
  {
    label: '',
    hint: '',
    inputStep: undefined,
    precision: undefined,
    disabled: false,
    gap: 8,
  },
);

const emit = defineEmits<{
  (e: 'update:value', value: number): void;
}>();

// 归一化输入框回传值，确保始终发出 number，避免字符串导致按钮步进失效。
// Normalize input-number payload so emitted value is always number, avoiding step-control issues caused by strings.
function normalizeNextValue(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return props.value;
}

// 数值代理，统一 slider / input-number 的双向绑定。
// Value proxy shared by slider and input-number two-way binding.
const valueModel = computed({
  get: () => props.value,
  set: (value: number | string | null) => emit('update:value', normalizeNextValue(value)),
});

// 输入框步进默认跟随滑条步进，避免配置不一致。
// Input step follows slider step by default to keep behavior aligned.
const inputStepModel = computed(() => props.inputStep ?? props.sliderStep);

// 输入框精度：优先使用外部传入值，否则根据步进自动推导小数位。
// Input precision: prefer explicit prop, otherwise infer decimal places from step.
const precisionModel = computed(() => {
  if (typeof props.precision === 'number' && Number.isFinite(props.precision)) {
    return props.precision;
  }
  const step = Number(inputStepModel.value);
  if (!Number.isFinite(step)) return undefined;
  const normalized = String(step).toLowerCase();
  if (normalized.includes('e-')) {
    const exp = Number(normalized.split('e-')[1] ?? 0);
    return Number.isFinite(exp) ? exp : undefined;
  }
  const dotIdx = normalized.indexOf('.');
  if (dotIdx < 0) return 0;
  return normalized.length - dotIdx - 1;
});

</script>
