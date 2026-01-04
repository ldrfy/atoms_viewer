<template>
  <div v-if="visible" class="record-crop-dash" :style="style" />
</template>

<script setup lang="ts">
import { computed, unref, type CSSProperties } from 'vue';

import type { CropDashCtx } from '../ctx';

const props = defineProps<{ ctx: CropDashCtx }>();

const box = computed(() => unref(props.ctx.recordCropBox));
const visible = computed(() => !!unref(props.ctx.isRecording) && !!box.value);

const style = computed<CSSProperties>(() => {
  const b = box.value;
  if (!b) return {};
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
  };
});
</script>
