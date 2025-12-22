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
        <div v-if="hasAnimation" class="anim-bar">
            <a-space align="center" :size="8">
                <a-button size="small" @click="togglePlay">
                    {{ isPlaying ? t("viewer.pause") : t("viewer.play") }}
                </a-button>

                <span>{{ frameIndex + 1 }} / {{ frameCount }}</span>

                <a-slider style="width: 120px" :min="0" :max="frameCount - 1" v-model:value="frameIndexModel" />

                <span>{{ t("viewer.fps") }}</span>
                <a-input-number size="small" :min="1" :max="120" v-model:value="fpsModel" />
            </a-space>
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
    stopPlay,

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
    stopPlay,
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

.anim-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 20;
    pointer-events: auto;
}
</style>
