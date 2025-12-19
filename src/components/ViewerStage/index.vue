<template>
  <div
    class="stage"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <a-button
      v-if="hasModel"
      class="export-btn"
      type="primary"
      @click="onExportPng"
    >
      导出 PNG
    </a-button>

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

    <input
      ref="fileInputRef"
      class="file-input"
      type="file"
      accept=".xyz"
      @change="onFilePicked"
    />
  </div>
</template>

<script setup lang="ts">
import { useViewerStage } from "./index";

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
} = useViewerStage();
</script>

<style scoped src="./index.css"></style>
