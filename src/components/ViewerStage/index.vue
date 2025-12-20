<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">
        <div ref="canvasHostRef" class="canvas-host"></div>

        <div v-if="!hasModel" class="empty-overlay">
            <div class="empty-card">
                <div class="empty-title">{{ t("viewer.empty.title") }}</div>
                <div class="empty-sub">{{ t("viewer.empty.subtitle") }}</div>

                <div class="empty-actions">
                    <a-button type="primary" @click="openFilePicker">
                        {{ t("viewer.empty.pickFile") }}
                    </a-button>
                </div>

                <div class="empty-actions">
                    <a-button type="primary" @click="preloadDefault">
                        {{ t("viewer.empty.preloadDefault") }}
                    </a-button>
                </div>
            </div>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz" @change="onFilePicked" />
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
    canvasHostRef,
    fileInputRef,
    hasModel,
    openFilePicker,
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
    (v) => emit("model-state", v),
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

.drop-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    backdrop-filter: blur(2px);
}

.drop-card {
    padding: 16px 18px;
    border-radius: 12px;
}

.empty-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
}

.empty-card {
    pointer-events: auto;
    padding: 16px 18px;
    border-radius: 12px;
    max-width: 520px;
}

.empty-title {
    font-weight: 600;
    margin-bottom: 6px;
}

.empty-sub {
    opacity: 0.85;
}

.empty-actions {
    margin-top: 12px;
}

.file-input {
    display: none;
}
</style>
