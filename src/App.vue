<template>
    <a-config-provider :theme="{ algorithm: antdAlgorithm }">
        <a-layout class="root">
            <TopHear @open-settings="settingsOpen = true" />

            <a-layout-content>
                <ViewerStage ref="viewerRef" v-model:settings="settings" @model-state="hasModel = $event" />
            </a-layout-content>

            <ExportFab :has-model="hasModel" v-model:exportScale="exportScale" @export-png="handleExportPng" />

            <SettingsSider v-model:open="settingsOpen" v-model:settings="settings" />
        </a-layout>
    </a-config-provider>
</template>


<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import SettingsSider from "./components/SettingsSider";
import ViewerStage from "./components/ViewerStage";
import TopHear from "./components/TopHear";
import ExportFab from "./components/ExportFab";
import { DEFAULT_SETTINGS, type ViewerSettings } from "./lib/viewer/settings";
import { theme as antdTheme } from "ant-design-vue";
import { isDark, applyThemeToDom } from "./theme/mode";

type ViewerStageExpose = {
    exportPng: (scale: number) => void | Promise<void>;
};

const antdAlgorithm = computed(() =>
    isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
);

const settingsOpen = ref(false);

const settings = ref<ViewerSettings>({
    ...DEFAULT_SETTINGS,
    rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
});

watchEffect(() => {
    applyThemeToDom(isDark.value);
});

/* 导出与模型状态上提 */
const hasModel = ref(false);
const exportScale = ref<number>(2);

const viewerRef = ref<ViewerStageExpose | null>(null);

function handleExportPng(scale: number): void {
    void viewerRef.value?.exportPng(scale);
}
</script>


<style scoped>
.root {
    height: 100%;
    position: relative;
    /* 让 TopHear 的 absolute 有参照 */
}
</style>
