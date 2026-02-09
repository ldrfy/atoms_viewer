<template>
  <a-flex
    v-if="hasModelOrParseError"
    vertical
    gap="small"
    class="anim-bar"
  >
    <a-row
      :gutter="[6, 6]"
      align="middle"
      :wrap="false"
    >
      <a-col flex="none">
        <ParseInfoPopover :ctx="parseCtx" />
      </a-col>

      <a-col flex="auto">
        <a-typography-text
          type="secondary"
          :ellipsis="{ tooltip: true }"
          style="font-size: 12px;cursor: pointer; "
        >
          {{ frameNoteText }}
        </a-typography-text>
      </a-col>
    </a-row>

    <!-- 第一行：帧序号 + slider -->
    <a-row
      v-if="hasAnimation"
      :gutter="[16, 8]"
      align="middle"
      :wrap="false"
    >
      <a-col flex="none">
        <a-typography-text style="min-width: 72px; text-align: right; font-variant-numeric: tabular-nums;">
          {{ frameIndexModel }} / {{ ctx.frameCount }}
        </a-typography-text>
      </a-col>

      <a-col flex="auto" style="min-width: 0;">
        <a-slider
          v-model:value="frameIndexModel"
          style="width: 100%; min-width: 0;"
          :min="1"
          :max="frameCountMax"
          :step="1"
        />
      </a-col>

      <a-col flex="none" style="width: 96px;">
        <a-input-number
          v-model:value="frameIndexModel"
          :title="t('viewer.play.frameIndex')"
          :min="1"
          :max="frameCountMax"
          :step="1"
          style="width: 100%;"
        />
      </a-col>
    </a-row>

    <!-- 第二行：fps + 播放按钮 -->
    <a-row
      v-if="hasAnimation"
      :gutter="8"
      align="middle"
      justify="space-between"
      :wrap="false"
    >
      <a-col flex="none">
        <a-button type="primary" :style="actionButtonStyle" @click="ctx.togglePlay">
          {{ isPlaying ? t("viewer.play.pause") : t("viewer.play.start") }}
        </a-button>
      </a-col>

      <a-col flex="auto" style="min-width: 0;">
        <a-flex
          align="center"
          justify="flex-end"
          :gap="6"
          style="min-width: 0; width: 100%;"
        >
          <a-typography-text type="secondary" style="white-space: nowrap;">
            {{ t("viewer.play.fpsLabel") }}
          </a-typography-text>
          <a-input-number
            v-model:value="fpsModel"
            :title="t('viewer.play.fps')"
            :min="RECORD_FPS_MIN"
            :max="RECORD_FPS_MAX"
            style="width: 80px;"
          />
        </a-flex>
      </a-col>
    </a-row>

    <!-- 第三行：录制帧率 + 录制按钮 -->
    <a-row
      :gutter="8"
      align="middle"
      :wrap="false"
    >
      <a-col flex="none">
        <a-button
          v-if="isRecordDelayActive"
          type="primary"
          :style="actionButtonStyle"
          @click="ctx.cancelRecordDelay"
        >
          {{ t("viewer.record.stop") }}
        </a-button>
        <a-button
          v-else
          type="primary"
          :style="actionButtonStyle"
          @click="ctx.toggleRecord"
        >
          {{ isRecording ? t("viewer.record.stop") : t("viewer.record.start") }}
        </a-button>
      </a-col>

      <a-col flex="auto" style="min-width: 0;">
        <template v-if="!isRecording && !isRecordDelayActive">
          <a-flex
            align="center"
            justify="flex-end"
            :gap="6"
            style="min-width: 0; width: 100%;"
          >
            <a-typography-text type="secondary" style="white-space: nowrap;">
              {{ t("settings.panel.other.recordFps") }}
            </a-typography-text>
            <a-input-number
              v-model:value="recordFpsModel"
              :title="t('settings.panel.other.recordFps')"
              :min="RECORD_FPS_MIN"
              :max="RECORD_FPS_MAX"
              style="width: 80px;"
            />
          </a-flex>
        </template>
        <template v-else>
          <a-flex
            align="center"
            justify="flex-end"
            :gap="6"
            style="min-width: 0; width: 100%;"
          >
            <a-tag v-if="isRecordDelayActive" color="orange">
              {{ t("viewer.record.countdown") }} {{ recordDelayText }}
            </a-tag>
            <a-tag v-else-if="isRecording" color="red">
              ● REC {{ recordTimeText }}
            </a-tag>
            <a-button
              v-if="isRecording"
              style="width: 80px; white-space: nowrap; display: inline-flex; justify-content: center;"
              @click="ctx.togglePause"
            >
              {{ isRecordPaused ? t("viewer.record.resume") : t("viewer.record.pause") }}
            </a-button>
          </a-flex>
        </template>
      </a-col>
    </a-row>
  </a-flex>
</template>

<script setup lang="ts">
import { computed, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AnimCtx, ParseCtx } from '../ctx';
import { RECORD_FPS_MIN, RECORD_FPS_MAX } from '../../../lib/viewer/constants';
import ParseInfoPopover from './ParseInfoPopover.vue';

const props = defineProps<{ ctx: AnimCtx; parseCtx: ParseCtx }>();
const { t } = useI18n();

const hasModel = computed(() => !!unref(props.ctx.hasModel));
const hasModelOrParseError = computed(() =>
  hasModel.value || parseCtx.value.parseInfo?.success === false,
);
const hasAnimation = computed(() => !!unref(props.ctx.hasAnimation));
const isPlaying = computed(() => !!unref(props.ctx.isPlaying));
const isRecording = computed(() => !!unref(props.ctx.isRecording));
const isRecordPaused = computed(() => !!unref(props.ctx.isRecordPaused));
const isRecordDelayActive = computed(() => !!unref(props.ctx.isRecordDelayActive));
const recordTimeText = computed(() => unref(props.ctx.recordTimeText));
const recordDelayRemainingSec = computed(() =>
  Number(unref(props.ctx.recordDelayRemainingSec) ?? 0),
);
const recordDelayText = computed(() => `${recordDelayRemainingSec.value.toFixed(1)}s`);
const frameCountMax = computed(() => Math.max(1, props.ctx.frameCount.value));
const frameMeta = computed(() => unref(props.ctx.frameMeta));
const frameNoteText = computed(() => {
  const meta = frameMeta.value;
  // 无注释时显示占位文案
  // Show placeholder when no note is available
  if (!meta) return t('viewer.play.noNote');
  const parts: string[] = [];
  if (Number.isFinite(meta.timestep)) {
    parts.push(t('viewer.play.timestep', { value: meta.timestep }));
  }
  if (meta.comment) parts.push(meta.comment);
  return parts.length ? parts.join(' · ') : t('viewer.play.noNote');
});
const parseCtx = computed(() => props.parseCtx);

/** UI 1-based <-> 内部 0-based */
const frameIndexModel = computed<number>({
  get: () => props.ctx.frameIndex.value + 1,
  set: (v: number) => {
    const n = Math.floor(Number(v) || 1);
    const idx0 = n - 1;
    const max0 = Math.max(0, props.ctx.frameCount.value - 1);
    props.ctx.setFrame(Math.max(0, Math.min(max0, idx0)));
  },
});

const fpsModel = computed<number>({
  get: () => props.ctx.fps.value,
  set: (v: number) => {
    // eslint-disable-next-line vue/no-mutating-props
    props.ctx.fps.value = v;
  },
});

const recordFpsModel = computed<number>({
  get: () => unref(props.ctx.settings).record.frame_rate ?? 60,
  set: (v: number) => {
    props.ctx.patchSettings({ record: { frame_rate: v } });
  },
});

// 统一播放/录制主按钮宽度，取多语言文案中最长的一项。
// Keep play/record primary buttons at the same width using the longest i18n label.
const actionButtonStyle = computed<Record<string, string>>(() => {
  const labels = [
    t('viewer.play.start'),
    t('viewer.play.pause'),
    t('viewer.record.start'),
    t('viewer.record.stop'),
  ];
  const maxChars = labels.reduce((m, text) => Math.max(m, Array.from(String(text ?? '')).length), 0);
  return {
    width: `${Math.max(8, maxChars + 2)}ch`,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    justifyContent: 'center',
  };
});
</script>

<style>
.anim-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 20;
    pointer-events: auto;

    /* 桌面不太宽 + 手机不超出横向宽度 */
    width: min(340px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    overflow: hidden;
}

@media (max-width: 768px) {
    .anim-bar {
        width: min(320px, calc(100vw - 24px - var(--pan-pad-width, 0px) - 8px));
        max-width: calc(100vw - 24px - var(--pan-pad-width, 0px) - 8px);
    }
}

/* 超小屏进一步收紧，避免任何溢出 */
@media (max-width: 360px) {
    .anim-bar {
        width: min(260px, calc(100vw - 24px - var(--pan-pad-width, 0px) - 6px));
        max-width: calc(100vw - 24px - var(--pan-pad-width, 0px) - 6px);
    }

}

</style>
