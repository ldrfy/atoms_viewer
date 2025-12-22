<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">
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
                    <a-button size="small" class="anim-action-btn" @click="togglePlay">
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

                        <a-typography-text v-if="!isRecording" class="color-hex" :ellipsis="{ tooltip: recordBgColor }">
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
                        <a-button v-if="isRecording" size="small" class="anim-action-btn" @click="togglePause">
                            {{ isRecordPaused ? t("viewer.record.resume") : t("viewer.record.pause") }}
                        </a-button> <a-button size="small" class="anim-action-btn" @click="toggleRecord">
                            {{ isRecording ? t("viewer.record.stop") : t("viewer.record.start") }}
                        </a-button>

                    </a-space>
                </a-col>
            </a-row>
        </div>


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
    recordBgColor,
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

<style scoped>
.stage {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    /* 容器显式禁止浏览器触控行为 */
    touch-action: none;
}

.canvas-host {
    /* 容器显式禁止浏览器触控行为 */
    touch-action: none;
    height: 100%;
    width: 100%;
}

/* 右侧垂直居中 */
.parse-overlay {
    position: absolute;
    left: 0px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 25;

    display: flex;
    align-items: center;
    gap: 2px;

    pointer-events: auto;
}

/* 卡片固定宽度，便于动画稳定 */
.parse-card {
    width: 240px;
    /* 你可按需要改 */
}

/* 用 max-width 做“收起”动画：把卡片压缩到 0 */
.parse-card-wrap {
    overflow: hidden;
    max-width: 320px;
    /* >= parse-card 宽度即可 */
    opacity: 1;
    transition: max-width 0.2s ease, opacity 0.2s ease;
}

.parse-card-wrap.collapsed {
    max-width: 0;
    opacity: 0;
    pointer-events: none;
}

/* 把手按钮 */
.parse-handle {
    width: 32px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.empty-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
}

.loading-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: 30;
}


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
.native-color {
    width: 34px;
    height: 26px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    background: transparent;
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
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
        "Courier New", monospace;
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
