<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">

        <!-- 录制框选/编辑遮罩 -->
        <div v-if="isSelectingRecordArea" class="record-select-overlay" @pointerdown.prevent="onRecordOverlayDown"
            @pointermove.prevent="onRecordOverlayMove" @pointerup.prevent="onRecordOverlayUp"
            @pointercancel.prevent="onRecordOverlayCancel">

            <div class="record-select">
                <div class="record-select-hint" @pointerdown.stop>
                    {{ t("viewer.record.selectHint") }}
                </div>
                <div class="record-select-actions" @pointerdown.stop @pointerup.stop>
                    <a-space :size="8">
                        <a-button @click="cancelRecordSelect">
                            {{ t("viewer.record.selectCancel") }}
                        </a-button>
                        <a-button type="primary" :disabled="!recordDraftBox" @click="confirmRecordSelect">
                            {{ t("viewer.record.selectConfirm") }}
                        </a-button>
                    </a-space>
                </div>
            </div>


            <!-- 草稿框（可编辑） -->
            <div v-if="recordDraftBox" class="record-draft-box" :style="{
                left: recordDraftBox.x + 'px',
                top: recordDraftBox.y + 'px',
                width: recordDraftBox.w + 'px',
                height: recordDraftBox.h + 'px',
            }">
                <!-- 8 个缩放点 -->
                <span class="rh rh-nw" data-h="nw"></span>
                <span class="rh rh-n" data-h="n"></span>
                <span class="rh rh-ne" data-h="ne"></span>
                <span class="rh rh-e" data-h="e"></span>
                <span class="rh rh-se" data-h="se"></span>
                <span class="rh rh-s" data-h="s"></span>
                <span class="rh rh-sw" data-h="sw"></span>
                <span class="rh rh-w" data-h="w"></span>
            </div>

        </div>


        <div ref="canvasHostRef" class="canvas-host"></div>

        <!-- 右侧：解析信息（可收起） -->
        <div v-if="hasModel" class="parse-overlay">

            <!-- 左侧侧把手：始终显示 -->
            <a-button class="parse-handle" type="text" size="small" @click="toggleParsePanel"
                :aria-label="parseCollapsed ? 'expand parse panel' : 'collapse parse panel'">
                <component :is="parseCollapsed ? RightOutlined : LeftOutlined" />
            </a-button><!-- 卡片容器：用于做收起动画 -->
            <div class="parse-card-wrap" :class="{ collapsed: parseCollapsed }">
                <a-card size="small" class="parse-card" :bordered="false">
                    <template #title>
                        {{ t("viewer.parse.mode") }}
                    </template>

                    <a-space direction="vertical" :size="6" style="width: 100%">
                        <a-select size="small" v-model:value="parseModeModel" :options="parseModeOptions"
                            style="width: 100%" />

                        <a-descriptions size="small" :column="1" class="parse-desc" bordered>
                            <a-descriptions-item :label="t('viewer.parse.format')">
                                <a-tag>{{ parseInfo.format || "-" }}</a-tag>
                            </a-descriptions-item>

                            <a-descriptions-item :label="t('viewer.parse.file')">
                                <span class="parse-filename">{{ parseInfo.fileName || "-" }}</span>
                            </a-descriptions-item>

                            <a-descriptions-item :label="t('viewer.parse.atoms')">
                                {{ parseInfo.atomCount }}
                            </a-descriptions-item>

                            <a-descriptions-item v-if="parseInfo.frameCount > 1" :label="t('viewer.parse.frames')">
                                {{ parseInfo.frameCount }}
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-space>
                </a-card>
            </div>



        </div>


        <!-- 放下后开始加载：旋转图标 -->
        <div v-if="isLoading" class="loading-overlay">
            <a-spin size="large" />
        </div>

        <div v-if="!hasModel && !isDragging && !isLoading" class="empty-overlay">
            <div class="empty-card">
                <a-empty>
                    <template #description>
                        <a-typography style="text-align: center">
                            <a-typography-title :level="4" style="margin: 0">
                                {{ t("viewer.empty.title") }}
                            </a-typography-title>

                            <a-typography-text type="secondary">
                                {{ t("viewer.empty.subtitle") }}
                            </a-typography-text>
                        </a-typography>
                    </template>

                    <a-space direction="vertical" :size="12" class="empty-actions">
                        <a-button type="primary" @click="openFilePicker">
                            {{ t("viewer.empty.pickFile") }}
                        </a-button>

                        <a-button @click="preloadDefault">
                            {{ t("viewer.empty.preloadDefault") }}
                        </a-button>
                    </a-space>
                </a-empty>
            </div>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz,.pdb,.dump,.lammpstrj,.traj,.data,.lmp"
            @change="onFilePicked" />

        <!-- 动画控制条 -->

        <!-- 动画控制条：三行布局（修改版） -->
        <div class="anim-bar" v-if="hasModel">
            <!-- 第一行：帧序号 + slider（不固定宽，slider 自适应） -->
            <a-row v-if="hasAnimation" :gutter="[8, 8]" align="middle" :wrap="false">
                <a-col flex="none">
                    <span class="anim-frame-text">{{ frameIndex + 1 }} / {{ frameCount }}</span>
                </a-col>
                <a-col flex="auto" style="min-width: 0">
                    <a-slider class="anim-slider" :min="0" :max="Math.max(0, frameCount - 1)"
                        v-model:value="frameIndexModel" />
                </a-col>
            </a-row>

            <a-row v-if="hasAnimation" :gutter="8" align="middle" justify="space-between" :wrap="false">
                <!-- 左：允许被压缩 -->
                <a-col flex="auto" style="min-width: 0">
                    <div class="anim-field">
                        <span class="anim-field-label">{{ t("viewer.play.fps") }}</span>
                        <a-input-number class="anim-field-input" size="small" :min="1" :max="120"
                            v-model:value="fpsModel" />
                    </div>
                </a-col>

                <!-- 右：不压缩 -->
                <a-col flex="none">
                    <a-button type="primary" class="anim-action-btn" @click="togglePlay">
                        {{ isPlaying ? t("viewer.play.pause") : t("viewer.play.start") }}
                    </a-button>
                </a-col>
            </a-row>


            <a-row :gutter="8" align="middle" justify="space-between" :wrap="false">
                <!-- 左：允许被压缩；hex 省略 -->
                <a-col flex="auto" style="min-width: 0">
                    <div class="anim-field anim-field-tight">
                        <span class="anim-field-label">{{ t("viewer.record.bg") }}</span>

                        <input class="native-color" type="color" v-model="bgColorModel" :disabled="isRecording" />

                        <a-typography-text v-if="!isRecording" class="color-hex" :content="{ tooltip: bgColorModel }">
                            {{ bgColorModel }}
                        </a-typography-text>
                    </div>
                </a-col>

                <!-- 右：不压缩；仍右对齐 -->
                <a-col flex="none">
                    <a-space :size="6" :wrap="false" style="justify-content: flex-end">

                        <a-tag v-if="isRecording" color="red" class="anim-rec-tag">
                            ● REC {{ recordTimeText }}
                        </a-tag>
                        <a-button v-if="isRecording" class="anim-action-btn" @click="togglePause">
                            {{ isRecordPaused ? t("viewer.record.resume") : t("viewer.record.pause") }}
                        </a-button>
                        <a-button type="primary" class="anim-action-btn" @click="toggleRecord">
                            {{ isRecording ? t("viewer.record.stop") : t("viewer.record.start") }}
                        </a-button>

                    </a-space>
                </a-col>
            </a-row>
        </div>

        <!-- 录制中：显示裁剪虚线框（不影响操作） -->
        <div v-if="isRecording && recordCropBox" class="record-crop-dash" :style="{
            left: recordCropBox.x + 'px',
            top: recordCropBox.y + 'px',
            width: recordCropBox.w + 'px',
            height: recordCropBox.h + 'px',
        }" />

    </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings, OpenSettingsPayload } from "../../lib/viewer/settings";
import type { ParseMode } from "../../lib/structure/parse";
import { LeftOutlined, RightOutlined } from "@ant-design/icons-vue";


const parseCollapsed = ref(false);

function toggleParsePanel(): void {
    parseCollapsed.value = !parseCollapsed.value;
}
const { t } = useI18n();

const emit = defineEmits<{
    (e: "model-state", hasModel: boolean): void;
    (e: "update:settings", v: ViewerSettings): void;
    (e: "open-settings", payload?: OpenSettingsPayload): void;
}>();

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");

/** 统一 patch settings / Unified patch settings */
function patchSettings(patch: Partial<ViewerSettings>): void {
    emit("update:settings", {
        ...props.settings,
        ...patch,
        rotationDeg: {
            ...props.settings.rotationDeg,
            ...(patch.rotationDeg ?? {}),
        },
    });
}

const stage = useViewerStage(settingsRef, patchSettings, (payload) =>
    emit("open-settings", payload)
);

const {
    // record
    isRecording,
    isRecordPaused,
    recordTimeText,

    toggleRecord,
    togglePause,

    // parse info
    parseInfo,
    parseMode,
    setParseMode,

    // animation
    frameIndex,
    frameCount,
    hasAnimation,
    isPlaying,
    fps,
    setFrame,
    togglePlay,

    // stage basics
    canvasHostRef,
    fileInputRef,
    isLoading,
    hasModel,
    openFilePicker,
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
    preloadDefault,

    // Select
    isSelectingRecordArea,
    recordDraftBox,
    onRecordOverlayDown,
    onRecordOverlayMove,
    onRecordOverlayUp,
    onRecordOverlayCancel,
    cancelRecordSelect,
    confirmRecordSelect,
    recordCropBox,
} = stage;

void fileInputRef
void canvasHostRef

watch(
    hasModel,
    (v) => emit("model-state", v!),
    { immediate: true }
);

const frameIndexModel = computed({
    get: () => frameIndex.value,
    set: (v: number) => setFrame(v),
});

const bgColorModel = computed({
    get: () => props.settings.backgroundColor ?? "#ffffff",
    set: (v: string) => patchSettings({ backgroundColor: v }),
});

const fpsModel = computed({
    get: () => fps.value,
    set: (v: number) => {
        const nv = Number(v);
        fps.value = Number.isFinite(nv) ? Math.min(Math.max(1, nv), 120) : 6;
    },
});

/** 左上角格式选择：切换即触发重新解析 */
const parseModeModel = computed<ParseMode>({
    get: () => parseMode.value,
    set: (v) => setParseMode(v),
});

const parseModeOptions = computed(() => [
    { value: "auto", label: t("viewer.parse.modeOptions.auto") },
    { value: "xyz", label: t("viewer.parse.modeOptions.xyz") },
    { value: "pdb", label: t("viewer.parse.modeOptions.pdb") },
    { value: "lammpsdump", label: t("viewer.parse.modeOptions.lammpsdump") },
    { value: "lammpsdata", label: t("viewer.parse.modeOptions.lammpsdata") },
]);
defineExpose({
    exportPng: onExportPng,
});


</script>

<style scoped src="./index.css"></style>
