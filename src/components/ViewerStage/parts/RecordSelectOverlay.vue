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
