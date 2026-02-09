<template>
  <div
    v-if="isSelecting"
    class="record-select-overlay"
    @pointerdown.prevent="ctx.onRecordOverlayDown"
    @pointermove.prevent="ctx.onRecordOverlayMove"
    @pointerup.prevent="ctx.onRecordOverlayUp"
    @pointercancel.prevent="ctx.onRecordOverlayCancel"
  >
    <a-flex vertical :gap="12" class="record-select">
      <div class="record-select-hint" @pointerdown.stop>
        {{ selectHint }}
      </div>

      <a-flex class="record-select-actions" @pointerdown.stop @pointerup.stop>
        <a-space :size="8" align="center">
          <a-button :disabled="confirmLoading" @click="ctx.cancelRecordSelect">
            {{ selectCancelLabel }}
          </a-button>
          <a-button
            type="primary"
            :loading="confirmLoading"
            :disabled="!draftBox || confirmLoading"
            @click="ctx.confirmRecordSelect"
          >
            {{ selectConfirmLabel }}
          </a-button>
          <a-flex v-if="showDelayInput" align="center" :gap="6">
            <a-typography-text type="secondary">
              {{ t("viewer.record.delay") }}
            </a-typography-text>
            <a-input-number
              v-model:value="recordDelayModel"
              size="small"
              :min="0"
              :step="0.1"
              :precision="2"
              style="width: 88px;"
            />
            <a-typography-text type="secondary">
              s
            </a-typography-text>
          </a-flex>
        </a-space>
      </a-flex>
    </a-flex>

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
import { computed, unref, type CSSProperties, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

import type { RecordSelectCtx } from '../ctx';

const props = defineProps<{ ctx: RecordSelectCtx }>();
const { t } = useI18n();

const isSelecting = computed(() => !!unref(props.ctx.isSelectingRecordArea));
const draftBox = computed(() => unref(props.ctx.recordDraftBox));
const selectHint = computed(() => unref(props.ctx.selectHint) ?? t('viewer.record.selectHint'));
const selectConfirmLabel = computed(() => unref(props.ctx.selectConfirmLabel) ?? t('viewer.record.selectConfirm'));
const selectCancelLabel = computed(() => unref(props.ctx.selectCancelLabel) ?? t('viewer.record.selectCancel'));
const confirmLoading = computed(() => !!unref(props.ctx.selectConfirmLoading));
const showDelayInput = computed(() => {
  const v = unref(props.ctx.showDelayInput);
  if (typeof v === 'boolean') return v;
  return true;
});
const recordDelayModel = computed<number>({
  get: () => Number(unref(props.ctx.recordDelaySec) ?? 0),
  set: (v: number) => {
    const next = Number(v);
    if (!Number.isFinite(next)) return;
    const target = props.ctx.recordDelaySec as Ref<number>;
    if (target && 'value' in target) target.value = Math.max(0, next);
  },
});

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
    margin-left: 12px;
    margin-top: 12px;
}
.record-select-hint {
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
