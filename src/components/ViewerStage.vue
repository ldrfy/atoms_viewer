<template>
  <div class="stage">
    <div class="hint">
      这里是 Viewer 区域（下一步接：拖拽 .xyz → 解析 → three 渲染）
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.stage {
  height: 100%;
  width: 100%;
  display: grid;
  place-items: center;
}

.hint {
  color: rgba(255, 255, 255, 0.75);
  border: 1px dashed rgba(255, 255, 255, 0.35);
  padding: 16px 18px;
  border-radius: 10px;
}
</style>
