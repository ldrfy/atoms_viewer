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

        <!-- 无模型：左上角显示项目名 -->
        <AppTitle v-if="!stage.hasModel.value" :appName="APP_DISPLAY_NAME" />

        <!-- 有模型：右侧 top60% 悬浮打开按钮 -->
        <a-float-button v-if="stage.hasModel.value && !stage.isLoading.value" class="open-file-fab" type="primary"
            :style="{ right: '24px', top: '60%' }" @click="stage.openFilePicker"
            :aria-label="t('viewer.empty.pickFile')">
            <template #icon>
                <FolderOpenOutlined />
            </template>
        </a-float-button>

        <!-- 无模型：底部中间版本号 + 开发者（可点击跳 github） -->
        <AppFooter v-if="!stage.hasModel.value" :appName="APP_DISPLAY_NAME" :version="APP_VERSION" :author="APP_AUTHOR"
            :githubUrl="APP_GITHUB_URL" />

        <!-- 无模型：空态引导 -->
        <EmptyOverlay :ctx="emptyCtx" />

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
import { useI18n } from "vue-i18n";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings, OpenSettingsPayload } from "../../lib/viewer/settings";
import { FolderOpenOutlined } from "@ant-design/icons-vue";
import { setThemeMode, isDarkColor } from "../../theme/mode";
import { APP_DISPLAY_NAME, APP_VERSION, APP_AUTHOR, APP_GITHUB_URL } from "../../lib/appMeta";

import RecordSelectOverlay from "./parts/RecordSelectOverlay.vue";
import ParseInfoPopover from "./parts/ParseInfoPopover.vue";
import EmptyOverlay from "./parts/EmptyOverlay.vue";
import AnimBar from "./parts/AnimBar.vue";
import RecordCropDash from "./parts/RecordCropDash.vue";
import AppTitle from "./parts/AppTitle.vue";
import AppFooter from "./parts/AppFooter.vue";

const { t } = useI18n();

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
const { recordSelectCtx, parseCtx, emptyCtx, animCtx, cropDashCtx } = stage;

defineExpose({
    exportPng: stage.onExportPng,
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
