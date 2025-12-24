<template>
    <div v-if="hasModel" class="anim-bar">
        <!-- 第一行：帧序号 + slider -->
        <a-row v-if="hasAnimation" :gutter="[16, 8]" align="middle" :wrap="false">
            <a-col flex="none">
                <span class="anim-frame-text">{{ frameIndexModel }} / {{ ctx.frameCount }}</span>
            </a-col>

            <a-col flex="auto" style="min-width: 0">
                <a-slider class="anim-slider" :min="1" :max="frameCountMax" :step="1" v-model:value="frameIndexModel" />
            </a-col>

            <a-col flex="none" style="width: 96px">
                <a-input-number v-model:value="frameIndexModel" :min="1" :max="frameCountMax" :step="1"
                    style="width: 100%" />
            </a-col>
        </a-row>

        <!-- 第二行：fps + 播放按钮 -->
        <a-row v-if="hasAnimation" :gutter="8" align="middle" justify="space-between" :wrap="false">
            <a-col flex="auto" style="min-width: 0">
                <div class="anim-field">
                    <span class="anim-field-label">{{ t("viewer.play.fps") }}</span>
                    <a-input-number class="anim-field-input" size="small" :min="1" :max="120"
                        v-model:value="fpsModel" />
                </div>
            </a-col>

            <a-col flex="none">
                <a-button type="primary" class="anim-action-btn" @click="ctx.togglePlay">
                    {{ isPlaying ? t("viewer.play.pause") : t("viewer.play.start") }}
                </a-button>
            </a-col>
        </a-row>

        <!-- 第三行：背景色 + 录制按钮 -->
        <a-row :gutter="8" align="middle" justify="space-between" :wrap="false">
            <a-col flex="auto" style="min-width: 0">
                <div class="anim-field anim-field-tight">
                    <span class="anim-field-label">{{ t("viewer.record.bg") }}</span>

                    <input class="native-color" type="color" v-model="bgColorModel" :disabled="isRecording" />

                    <a-typography-text v-if="!isRecording" class="color-hex" :content="bgColorModel" ellipsis />
                </div>
            </a-col>

            <a-col flex="none">
                <a-space :size="6" :wrap="false" style="justify-content: flex-end">
                    <a-tag v-if="isRecording" color="red" class="anim-rec-tag"> ● REC {{ recordTimeText }} </a-tag>

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
import { computed, unref } from "vue";
import { useI18n } from "vue-i18n";
import type { AnimCtx } from "../ctx";

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
        props.ctx.fps.value = isFinite(n) ? Math.min(Math.max(1, n), 120) : 6;
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
