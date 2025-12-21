<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">
        <div ref="canvasHostRef" class="canvas-host"></div>

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


        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz,.pdb" @change="onFilePicked" />

    </div>


    <div v-if="hasAnimation" class="anim-bar">
        <a-space align="center" :size="8">
            <a-button size="small" @click="togglePlay">
                {{ isPlaying ? "Pause" : "Play" }}
            </a-button>

            <span>{{ frameIndex + 1 }} / {{ frameCount }}</span>

            <a-slider style="width: 260px" :min="0" :max="frameCount - 1" :value="frameIndex"
                @change="(v: number) => setFrame(v)" />

            <span>FPS</span>
            <a-input-number size="small" :min="1" :max="120" :value="fps" @change="(v: number) => fps = v" />
        </a-space>
    </div>
</template>

<script setup lang="ts">
import { toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings } from "../../lib/viewer/settings";
const emit = defineEmits<{
    (e: "model-state", hasModel: boolean): void;
}>();

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");
const { t } = useI18n();

const {
    frameIndex,
    frameCount,
    hasAnimation,
    isPlaying,
    fps,
    setFrame,
    togglePlay,
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
} = useViewerStage(settingsRef);

/** hasModel 同步给 App，用于 TopHear 控制导出区显示 */
watch(
    hasModel,
    (v) => emit("model-state", v!),
    { immediate: true }
);

/** 暴露给 App：App 通过 ref 调用导出 */
defineExpose({
    exportPng: onExportPng,
});

void canvasHostRef;
void fileInputRef;
</script>

<style scoped>
.stage {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.canvas-host {
    height: 100%;
    width: 100%;
}


.empty-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    /* 空白穿透给画布 */
}

.loading-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;

    /* 不挡 drop/画布事件（你若希望加载时禁止交互，可改成 auto） */
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
