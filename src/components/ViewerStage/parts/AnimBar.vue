<template>
  <div v-if="hasModel" class="anim-bar">
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
          size="small"
          aria-label="Frame index"
          title="Frame index"
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
          <span class="anim-field-label">{{ t("viewer.play.fps") }}</span>
          <a-input-number
            v-model:value="fpsModel"
            class="anim-field-input"
            size="small"
            :aria-label="t('viewer.play.fps')"
            :title="t('viewer.play.fps')"
            :min="1"
            :max="120"
          />
        </div>
      </a-col>

      <a-col flex="none">
        <a-button type="primary" class="anim-action-btn" @click="ctx.togglePlay">
          {{ isPlaying ? t("viewer.play.pause") : t("viewer.play.start") }}
        </a-button>
      </a-col>
    </a-row>

    <!-- 第三行：背景色 + 录制按钮 -->
    <a-row
      :gutter="8"
      align="middle"
      justify="space-between"
      :wrap="false"
    >
      <a-col flex="auto" class="anim-col-min">
        <div class="anim-field anim-field-tight">
          <span class="anim-field-label">{{ t("viewer.record.bg") }}</span>

          <input
            v-model="bgColorModel"
            class="color-picker"
            type="color"
            :disabled="isRecording"
            :aria-label="t('viewer.record.bg')"
            :title="t('viewer.record.bg')"
          >

          <a-typography-text
            v-if="!isRecording"
            class="color-hex"
            :content="bgColorModel"
            ellipsis
          />
        </div>
      </a-col>

      <a-col flex="none">
        <a-space :size="6" :wrap="false" class="anim-right">
          <a-tag v-if="isRecording" color="red" class="anim-rec-tag">
            ● REC {{ recordTimeText }}
          </a-tag>

          <a-button v-if="isRecording" class="anim-action-btn" @click="ctx.togglePause">
            {{ isRecordPaused ? t("viewer.record.resume") : t("viewer.record.pause") }}
          </a-button>

          <a-button type="primary" class="anim-action-btn" @click="ctx.toggleRecord">
            {{ isRecording ? t("viewer.record.stop") : t("viewer.record.start") }}
          </a-button>
        </a-space>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { computed, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AnimCtx } from '../ctx';
import { clampNumber } from '../../../lib/utils/number';
import { RECORD_FPS_MIN, RECORD_FPS_MAX } from '../../../lib/viewer/ranges';

const props = defineProps<{ ctx: AnimCtx }>();
const { t } = useI18n();

const hasModel = computed(() => !!unref(props.ctx.hasModel));
const hasAnimation = computed(() => !!unref(props.ctx.hasAnimation));
const isPlaying = computed(() => !!unref(props.ctx.isPlaying));
const isRecording = computed(() => !!unref(props.ctx.isRecording));
const isRecordPaused = computed(() => !!unref(props.ctx.isRecordPaused));
const recordTimeText = computed(() => unref(props.ctx.recordTimeText));
const frameCountMax = computed(() => Math.max(1, props.ctx.frameCount.value));

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
    const n = Number(v);
    // ctx 是父组件注入的控制上下文对象，按设计需要在子组件里写入。
    // eslint-disable-next-line vue/no-mutating-props
    props.ctx.fps.value = Number.isFinite(n)
      ? clampNumber(n, RECORD_FPS_MIN, RECORD_FPS_MAX)
      : 6;
  },
});

const bgColorModel = computed<string>({
  get: () => unref(props.ctx.settings).backgroundColor,
  set: (v: string) =>
    props.ctx.patchSettings({
      backgroundColor: v,
      backgroundTransparent: false,
    }),
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

/* 第三行更紧凑一点（可选） */
.anim-field-tight {
    gap: 4px;
}

/* 为了 fps 和 bg 两行左侧对齐：给 label 固定宽度 */
.anim-field-label {
    width: 72px;
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

/* 颜色输入控件 */
.color-picker {
    width: 48px;
    height: 32px;
    flex: 0 0 auto;
}

/* 颜色 hex：必须能省略，否则手机会横向溢出 */
.color-hex {
    min-width: 0;
    max-width: 80px;
    /* 手机关键：控制住 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    min-width: 72px;
    /* 若你想更紧，可删掉这一行 */
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
}

/* 按钮文字不折行（不然会把高度撑得很怪） */
.anim-action-btn {
    white-space: nowrap;
}

/* REC tag */
.anim-rec-tag {
    margin-left: 2px;
}

/* 超小屏进一步收紧，避免任何溢出 */
@media (max-width: 360px) {
    .anim-bar {
        width: min(320px, calc(100vw - 24px));
    }

    .anim-frame-text {
        min-width: 64px;
    }

    .anim-field-label {
        width: 64px;
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
