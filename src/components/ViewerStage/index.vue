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

        <!-- 这里建议把 LAMMPS dump 扩展名也加上 -->
        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz,.pdb,.dump,.lammpstrj,.traj"
            @change="onFilePicked" />

        <!-- 动画控制条：放在 stage 内，absolute 才会相对 stage 定位 -->
        <div v-if="hasAnimation" class="anim-bar">
            <a-space align="center" :size="8">
                <a-button size="small" @click="togglePlay">
                    {{ isPlaying ? "Pause" : "Play" }}
                </a-button>

                <span>{{ frameIndex + 1 }} / {{ frameCount }}</span>

                <a-slider style="width: 260px" :min="0" :max="frameCount - 1" v-model:value="frameIndexModel" />

                <span>FPS</span>
                <a-input-number size="small" :min="1" :max="120" v-model:value="fpsModel" />
            </a-space>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings, OpenSettingsPayload } from "../../lib/viewer/settings";

const { t } = useI18n();

const emit = defineEmits<{
    (e: "model-state", hasModel: boolean): void;
    (e: "update:settings", v: ViewerSettings): void;
    (e: "open-settings", payload?: OpenSettingsPayload): void;
}>();

const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");

/**
 * 统一的 settings patch：供 useViewerStage 在解析 LAMMPS 后自动补齐 typeId 映射使用
 *
 * Unified settings patch: used by useViewerStage to auto-fill typeId mapping for LAMMPS dump
 */
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

/**
 * 只调用一次 useViewerStage（关键修复点）
 *
 * Call useViewerStage only once (critical)
 *
 * 第三个参数：当加载 LAMMPS dump 并自动补齐/修改 typeId 映射时，触发打开设置面板
 * Third argument: request opening Settings when LAMMPS dump triggers auto-fill/update of typeId map
 */
const stage = useViewerStage(settingsRef, patchSettings, (payload) =>
    emit("open-settings", payload)
);

const {
    frameIndex,
    frameCount,
    hasAnimation,
    isPlaying,
    fps,
    setFrame,
    togglePlay,
    stopPlay,

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

/**
 * hasModel 同步给 App，用于 TopHear 控制导出区显示
 *
 * Sync hasModel to App for showing export area in header
 */
watch(
    hasModel,
    (v) => emit("model-state", v!),
    { immediate: true }
);

/**
 * slider / input-number 的 v-model 适配（避免 template 里 ref 赋值问题）
 *
 * v-model adapters for slider/input-number (avoid direct ref assignment in template)
 */
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

/**
 * 暴露给 App：App 通过 ref 调用导出
 *
 * Expose to App: App can call export via ref
 */
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
