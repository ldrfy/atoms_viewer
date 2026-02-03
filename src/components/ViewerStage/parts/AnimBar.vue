<template>
  <div v-if="hasModelOrParseError" class="anim-bar">
    <a-row
      v-if="hasModelOrParseError"
      :gutter="[6, 6]"
      align="middle"
      :wrap="false"
    >
      <a-col flex="none" class="anim-note-icon">
        <ParseInfoPopover :ctx="parseCtx" />
      </a-col>

      <a-col flex="auto" class="anim-note">
        <a-tooltip :title="frameNoteText" overlay-class-name="anim-note-tooltip">
          <a-typography-text type="secondary" ellipsis style="font-size: 12px;">
            {{ frameNoteText }}
          </a-typography-text>
        </a-tooltip>
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
        <span class="anim-frame-text">{{ frameIndexModel }} / {{ ctx.frameCount }}</span>
      </a-col>

      <a-col flex="auto" class="anim-col-min">
        <a-slider
          v-model:value="frameIndexModel"
          class="anim-slider"
          :min="1"
          :max="frameCountMax"
          :step="1"
        />
      </a-col>

      <a-col flex="none" class="anim-col-compact">
        <a-input-number
          v-model:value="frameIndexModel"
          :aria-label="t('viewer.play.frameIndex')"
          :title="t('viewer.play.frameIndex')"
          :min="1"
          :max="frameCountMax"
          :step="1"
          class="anim-input-full"
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
      <a-col flex="auto" class="anim-col-min">
        <div class="anim-field">
          <span class="anim-field-label">{{ t("viewer.play.fpsLabel") }}</span>
          <a-input-number
            v-model:value="fpsModel"
            class="anim-field-input"
            :aria-label="t('viewer.play.fps')"
            :title="t('viewer.play.fps')"
            :min="RECORD_FPS_MIN"
            :max="RECORD_FPS_MAX"
          />
        </div>
      </a-col>

      <a-col flex="none">
        <a-button type="primary" class="anim-action-btn" @click="ctx.togglePlay">
          {{ isPlaying ? t("viewer.play.pause") : t("viewer.play.start") }}
        </a-button>
      </a-col>
    </a-row>

    <!-- 第三行：录制帧率 + 录制按钮 -->
    <a-row
      :gutter="8"
      align="middle"
      :wrap="false"
    >
      <a-col flex="auto" class="anim-col-min">
        <template v-if="!isRecording && !isRecordDelayActive">
          <div class="anim-field">
            <span class="anim-field-label">{{ t("settings.panel.other.recordFps") }}</span>
            <a-input-number
              v-model:value="recordFpsModel"
              class="anim-field-input"
              :aria-label="t('settings.panel.other.recordFps')"
              :title="t('settings.panel.other.recordFps')"
              :min="RECORD_FPS_MIN"
              :max="RECORD_FPS_MAX"
            />
          </div>
        </template>
        <template v-else>
          <div class="anim-field">
            <a-tag v-if="isRecordDelayActive" color="orange" class="anim-rec-tag">
              {{ t("viewer.record.countdown") }} {{ recordDelayText }}
            </a-tag>
            <a-tag v-else-if="isRecording" color="red" class="anim-rec-tag">
              ● REC {{ recordTimeText }}
            </a-tag>
            <a-button
              v-if="isRecording"
              class="anim-action-btn anim-field-input"
              @click="ctx.togglePause"
            >
              {{ isRecordPaused ? t("viewer.record.resume") : t("viewer.record.pause") }}
            </a-button>
          </div>
        </template>
      </a-col>

      <a-col flex="none">
        <a-button
          v-if="isRecordDelayActive"
          type="primary"
          class="anim-action-btn"
          @click="ctx.cancelRecordDelay"
        >
          {{ t("viewer.record.stop") }}
        </a-button>
        <a-button
          v-else
          type="primary"
          class="anim-action-btn"
          @click="ctx.toggleRecord"
        >
          {{ isRecording ? t("viewer.record.stop") : t("viewer.record.start") }}
        </a-button>
      </a-col>
    </a-row>
  </div>
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
</script>

<style>

/* ===============================
   动画控制条：不换行 & 不溢出
   =============================== */
.anim-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 20;
    pointer-events: auto;

    display: flex;
    flex-direction: column;
    gap: 8px;

    /* 桌面不太宽 + 手机不超出横向宽度 */
    width: min(340px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    overflow: hidden;
}

/* 第一行/第二行/第三行：通用行容器 */
.anim-row {
    width: 100%;
}

/* 第一行：帧序号 + slider（flex） */
.anim-left-full {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    /* 允许 slider 收缩 */
}

/* 第二/三行：两列布局（不换行时推荐用 a-row :wrap="false"，CSS 只做配合） */
.anim-left {
    min-width: 0;
    display: flex;
    align-items: center;
}

.anim-col-min {
    min-width: 0;
}

.anim-col-compact {
    width: 96px;
}

.anim-input-full {
    width: 100%;
}

/* 右侧区域（当你用 a-space 包按钮时，这里主要负责不被撑爆） */
.anim-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    max-width: 100%;
}

/* 帧序号 */
.anim-frame-text {
    min-width: 72px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.anim-note {
    min-width: 0;
}

.anim-note-icon {
    display: inline-flex;
    align-items: center;
}

.anim-note-tooltip .ant-tooltip-inner {
    font-size: 12px;
    line-height: 1.4;
    padding: 6px 10px;
    border-radius: 6px;
    max-width: min(360px, 80vw);
    white-space: normal;
}

/* slider：自适应宽度（不要固定像素宽） */
.anim-slider {
    width: 100%;
    min-width: 0;
}

/* label 通用（原来的 anim-label 也保留） */
.anim-label {
    opacity: 0.85;
}

/* 左侧字段：label + 输入挨着，并允许整体被压缩 */
.anim-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    /* “词”和输入框挨着：关键 */
    min-width: 0;
    /* 允许压缩 */
}

/* 为了 fps 和 bg 两行左侧对齐：给 label 固定宽度 */
.anim-field-label {
    width: 96px;
    /* 需要更齐可以调 64~90 */
    opacity: 0.85;
    text-align: left;
    white-space: nowrap;
    flex: 0 0 auto;
}

/* fps 输入框宽度（紧凑） */
.anim-field-input {
    width: 80px;
}

/* 按钮文字不折行（不然会把高度撑得很怪） */
.anim-action-btn {
    white-space: nowrap;
}

.anim-inline-btn {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 6px;
}

/* REC tag */
.anim-rec-tag {
    margin-left: 2px;
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

    .anim-frame-text {
        min-width: 64px;
    }

    .anim-field-label {
        width: 80px;
    }

    .anim-field-input {
        width: 72px;
    }

    .color-hex {
        max-width: 64px;
        min-width: 0;
    }
}

</style>
