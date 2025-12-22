<template>
    <a-config-provider :theme="{ algorithm: antdAlgorithm }">
        <a-layout class="root">
            <!-- 手动打开设置：不改变折叠项 -->
            <TopHear @open-settings="onOpenSettings" />

            <a-layout-content>
                <ViewerStage ref="viewerRef" v-model:settings="settings" @model-state="hasModel = $event"
                    @open-settings="onOpenSettings" />
            </a-layout-content>

            <ExportFab :has-model="hasModel" v-model:exportScale="exportScale"
                v-model:exportTransparent="exportTransparent" @export-png="handleExportPng" />


            <!-- 关键：把 activeKey 也交给 App 管 -->
            <SettingsSider v-model:open="settingsOpen" v-model:settings="settings"
                v-model:activeKey="settingsActiveKey" />
        </a-layout>
    </a-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import SettingsSider from "./components/SettingsSider";
import ViewerStage from "./components/ViewerStage";
import TopHear from "./components/TopHear";
import ExportFab from "./components/ExportFab";
import { DEFAULT_SETTINGS, type ViewerSettings, type OpenSettingsPayload } from "./lib/viewer/settings";
import { theme as antdTheme } from "ant-design-vue";
import { isDark, applyThemeToDom } from "./theme/mode";


const antdAlgorithm = computed(() =>
    isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
);

const settingsOpen = ref(false);

/**
 * Settings 折叠面板当前展开项（accordion 下是单 key）
 * Current expanded panel key for SettingsSider (single key with accordion)
 */
const settingsActiveKey = ref<string>("display");

const settings = ref<ViewerSettings>({
    ...DEFAULT_SETTINGS,
    rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
});

watchEffect(() => {
    applyThemeToDom(isDark.value);
});

/* 导出与模型状态上提 / Lift model state & export */
const hasModel = ref(false);

type ViewerStageExpose = {
    exportPng: (payload: { scale: number; transparent: boolean }) => void | Promise<void>;
};

const exportScale = ref<number>(2);
const exportTransparent = ref<boolean>(false);

// 让导出面板的勾选与 viewer settings 同步（勾选即把背景变透明）

// watch(
//     exportTransparent,
//     (v) => {
//         settings.value.backgroundTransparent = v;
//     },
//     { immediate: true }
// );


const viewerRef = ref<ViewerStageExpose | null>(null);

function handleExportPng(payload: { scale: number; transparent: boolean }): void {
    void viewerRef.value?.exportPng(payload);
}

/**
 * 统一打开设置入口：
 * - 总是打开抽屉 / Always open drawer
 * - 如果 focusKey 存在（自动打开），只展开该面板 / If focusKey exists, expand only that panel
 */
function onOpenSettings(payload?: OpenSettingsPayload): void {
    // 默认行为：打开抽屉
    // Default: open drawer
    if (payload?.open !== false) {
        settingsOpen.value = true;
    }



    // 只要给了 focusKey，就切换折叠面板
    // Switch collapse panel when focusKey is provided
    if (payload?.focusKey) {
        settingsActiveKey.value = payload.focusKey;
    }
}
</script>

<style scoped>
.root {
    height: 100%;
    position: relative;
}
</style>
