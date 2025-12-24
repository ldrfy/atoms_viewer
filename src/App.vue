<template>
    <a-config-provider :theme="{ algorithm: antdAlgorithm }">
        <a-layout class="root">
            <!-- 手动打开设置：不改变折叠项 -->
            <TopHear :can-go-home="page === 'viewer'" @go-home="goHome" @open-settings="onOpenSettings" />

            <a-layout-content>
                <EmptyPage v-if="page === 'empty'" @load-file="openWithFile" @preload-sample="preloadSample" />

                <ViewerPage v-else v-model:settings="settings" :loadRequest="loadRequest"
                    @consume-load="loadRequest = null" @open-settings="onOpenSettings" />
            </a-layout-content>

            <!-- 关键：把 activeKey 也交给 App 管 -->
            <SettingsSider v-model:open="settingsOpen" v-model:settings="settings"
                v-model:activeKey="settingsActiveKey" />
        </a-layout>
    </a-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect, defineAsyncComponent } from "vue";
import SettingsSider from "./components/SettingsSider";
import TopHear from "./components/TopHear";
import EmptyPage from "./pages/EmptyPage.vue";
import { DEFAULT_SETTINGS, type ViewerSettings, type OpenSettingsPayload } from "./lib/viewer/settings";
import { theme as antdTheme } from "ant-design-vue";
import { isDark, applyThemeToDom } from "./theme/mode";
import type { LoadRequest } from "./pages/types";
import type { SampleManifestItem } from "./lib/structure/types";


const ViewerPage = defineAsyncComponent(() => import("./pages/ViewerPage.vue"));
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

// 页面流程控制（空页 / viewer）
const page = ref<"empty" | "viewer">("empty");
const loadRequest = ref<LoadRequest | null>(null);

function openWithFile(file: File): void {
    loadRequest.value = { kind: "file", file };
    page.value = "viewer";
}

async function preloadSample(sample: SampleManifestItem): Promise<void> {
    const { url, fileName } = sample
    loadRequest.value = { kind: "url", url, fileName };
    page.value = "viewer";
}

function goHome(): void {
    page.value = "empty";
    loadRequest.value = null;
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
