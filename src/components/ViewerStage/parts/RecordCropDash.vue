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

<style>

.record-crop-dash {
    position: absolute;
    z-index: 45;
    /* 介于画布(默认)与控制条(20)/遮罩(50)之间即可 */
    pointer-events: none;
    /* 不抢事件 */
    border: 2px dashed rgba(255, 255, 255, 0.95);
    border-radius: 6px;
    box-sizing: border-box;
    /* 可选：轻微外发光，暗背景更明显 */
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
}

</style>
