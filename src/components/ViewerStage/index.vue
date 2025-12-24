<template>
    <div class="stage" @dragenter.prevent="stage.onDragEnter" @dragover.prevent="stage.onDragOver"
        @dragleave.prevent="stage.onDragLeave" @drop.prevent="stage.onDrop">
        <!-- 录制框选/编辑遮罩 -->
        <RecordSelectOverlay :ctx="recordSelectCtx" />

        <!-- three canvas 宿主 -->
        <div ref="canvasHostRef" class="canvas-host"></div>

        <!-- 左侧：解析信息（贴边弹框） -->
        <ParseInfoPopover :ctx="parseCtx" />

        <!-- 放下后开始加载：旋转图标 -->
        <div v-if="stage.isLoading.value" class="loading-overlay">
            <a-spin size="large" />
        </div>

        <!-- 隐藏文件输入 -->
        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz,.pdb,.dump,.lammpstrj,.traj,.data,.lmp"
            @change="stage.onFilePicked" />

        <!-- 动画 + 录制控制条 -->
        <AnimBar :ctx="animCtx" />

        <!-- 录制中：显示裁剪虚线框（不影响操作） -->
        <RecordCropDash :ctx="cropDashCtx" />
    </div>
</template>

<script setup lang="ts">
import { toRef, watch } from "vue";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings, OpenSettingsPayload } from "../../lib/viewer/settings";
import { setThemeMode, isDarkColor } from "../../theme/mode";

import RecordSelectOverlay from "./parts/RecordSelectOverlay.vue";
import ParseInfoPopover from "./parts/ParseInfoPopover.vue";
import AnimBar from "./parts/AnimBar.vue";
import RecordCropDash from "./parts/RecordCropDash.vue";

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");

const emit = defineEmits<{
    (e: "model-state", hasModel: boolean): void;
    (e: "update:settings", v: ViewerSettings): void;
    (e: "open-settings", payload?: OpenSettingsPayload): void;
}>();

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

const stage = useViewerStage(settingsRef, patchSettings, (payload) => emit("open-settings", payload));

/** template ref 必须是本地标识符，因此这里保留解构 */
const { fileInputRef, canvasHostRef } = stage;
void fileInputRef;
void canvasHostRef;

// ctx groups are created inside useViewerStage() and returned directly
const { recordSelectCtx, parseCtx, animCtx, cropDashCtx } = stage;

defineExpose({
    exportPng: stage.onExportPng,
    openFilePicker: stage.openFilePicker,
    loadFile: stage.loadFile,
    loadUrl: stage.loadUrl,
});

watch(
    stage.hasModel,
    (v) => emit("model-state", !!v),
    { immediate: true }
);

watch(
    () => props.settings.backgroundColor,
    (color) => {
        if (!color) return;
        setThemeMode(isDarkColor(color) ? "dark" : "light");
    }
);
</script>

<!-- 关键修改：去掉 scoped，让 index.css 能作用到子组件内部 DOM -->
<style src="./index.css"></style>
