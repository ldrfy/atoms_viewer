<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">
        <a-tooltip title="下方模型基础上，再次放大的倍率。为避免放大过多导致错误，请先滑动鼠标放大下面的模型">
            <div v-if="hasModel" class="export-bar">
                <a-space align="center">
                    <a-button class="export-btn" type="primary" @click="onExportPng(exportScale ?? 2)">
                        导出 PNG
                    </a-button>

                    <a-input-number v-model:value="exportScale" :min="1" :max="5" :step="0.1" :precision="1"
                        placeholder="越大越清晰" />
                </a-space>
            </div>
        </a-tooltip>


        <div ref="canvasHostRef" class="canvas-host"></div>

        <div v-if="isDragging" class="drop-overlay">
            <div class="drop-card">把 .xyz 文件拖到这里</div>
        </div>

        <div v-if="!hasModel" class="empty-overlay">
            <div class="empty-card">
                <div class="empty-title">拖拽 .xyz 文件到这里</div>
                <div class="empty-sub">
                    加载后可旋转/缩放查看结构（原子按元素着色、大小按元素半径、键双色分段）
                </div>
                <div class="empty-actions">
                    <a-button type="primary" @click="openFilePicker">选择文件</a-button>
                </div>
            </div>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz" @change="onFilePicked" />
    </div>
</template>
<script setup lang="ts">
import { ref, toRef } from "vue";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings } from "../../lib/viewer/settings";

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");
const exportScale = ref<number | null>(2);
const {
    canvasHostRef,
    fileInputRef,
    isDragging,
    hasModel,
    openFilePicker,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
} = useViewerStage(settingsRef);
</script>

<style scoped src="./index.css"></style>
