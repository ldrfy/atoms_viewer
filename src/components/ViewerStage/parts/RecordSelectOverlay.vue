<template>
  <div
    v-if="isSelecting"
    class="record-select-overlay"
    @pointerdown.prevent="ctx.onRecordOverlayDown"
    @pointermove.prevent="ctx.onRecordOverlayMove"
    @pointerup.prevent="ctx.onRecordOverlayUp"
    @pointercancel.prevent="ctx.onRecordOverlayCancel"
  >
    <div class="record-select">
      <div class="record-select-hint" @pointerdown.stop>
        {{ t("viewer.record.selectHint") }}
      </div>

      <div class="record-select-actions" @pointerdown.stop @pointerup.stop>
        <a-space :size="8">
          <a-button @click="ctx.cancelRecordSelect">
            {{ t("viewer.record.selectCancel") }}
          </a-button>
          <a-button type="primary" :disabled="!draftBox" @click="ctx.confirmRecordSelect">
            {{ t("viewer.record.selectConfirm") }}
          </a-button>
        </a-space>
      </div>
    </div>

    <!-- 草稿框（可编辑） -->
    <div v-if="draftBox" class="record-draft-box" :style="draftStyle">
      <!-- 8 个缩放点 -->
      <span class="rh rh-nw" data-h="nw" />
      <span class="rh rh-n" data-h="n" />
      <span class="rh rh-ne" data-h="ne" />
      <span class="rh rh-e" data-h="e" />
      <span class="rh rh-se" data-h="se" />
      <span class="rh rh-s" data-h="s" />
      <span class="rh rh-sw" data-h="sw" />
      <span class="rh rh-w" data-h="w" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, unref, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';

import type { RecordSelectCtx } from '../ctx';

const props = defineProps<{ ctx: RecordSelectCtx }>();
const { t } = useI18n();

const isSelecting = computed(() => !!unref(props.ctx.isSelectingRecordArea));
const draftBox = computed(() => unref(props.ctx.recordDraftBox));

const draftStyle = computed<CSSProperties>(() => {
  const b = draftBox.value;
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

/* Select */
.record-select-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    /* 比 anim-bar 高一点 */
    cursor: crosshair;
    /* 允许在 overlay 上接收 pointer 事件 */
    pointer-events: auto;

    /* 淡淡遮罩 */
    background: rgba(0, 0, 0, 0.08);
}

.record-select {
    position: absolute;

    display: flex;
    flex-direction: column;
    margin-left: 12px;
    margin-top: 12px;
}
.record-select-hint {
    margin-bottom: 12px;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 12px;
    -webkit-user-select: none;
    user-select: none;
}

.record-select-actions {
    z-index: 55;
    pointer-events: auto;
}

.record-select-box {
    position: absolute;
    border: 2px solid rgba(24, 144, 255, 0.95);
    background: rgba(24, 144, 255, 0.12);
    border-radius: 6px;
    box-sizing: border-box;
}

/* 可编辑框 */
.record-draft-box {
    position: absolute;
    border: 2px solid rgba(24, 144, 255, 0.95);
    background: rgba(24, 144, 255, 0.1);
    border-radius: 6px;
    box-sizing: border-box;
    pointer-events: auto;
    /* 允许点到手柄 */
}

/* resize handles */
.rh {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(0, 0, 0, 0.35);
    box-sizing: border-box;
}

/* 位置 */
.rh-nw {
    left: -5px;
    top: -5px;
    cursor: nwse-resize;
}

.rh-n {
    left: calc(50% - 5px);
    top: -5px;
    cursor: ns-resize;
}

.rh-ne {
    right: -5px;
    top: -5px;
    cursor: nesw-resize;
}

.rh-e {
    right: -5px;
    top: calc(50% - 5px);
    cursor: ew-resize;
}

.rh-se {
    right: -5px;
    bottom: -5px;
    cursor: nwse-resize;
}

.rh-s {
    left: calc(50% - 5px);
    bottom: -5px;
    cursor: ns-resize;
}

.rh-sw {
    left: -5px;
    bottom: -5px;
    cursor: nesw-resize;
}

.rh-w {
    left: -5px;
    top: calc(50% - 5px);
    cursor: ew-resize;
}

</style>
