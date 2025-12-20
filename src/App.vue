<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import SettingsSider from "./components/SettingsSider";
import ViewerStage from "./components/ViewerStage";
import {
    DEFAULT_SETTINGS,
    type ViewerSettings,
} from "./lib/viewer/settings";
import { theme as antdTheme } from "ant-design-vue";
import { isDark, applyThemeToDom } from "./theme/mode";

const antdAlgorithm = computed(() =>
    isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
);

const settingsOpen = ref(false);

// 关键：用 ref，而不是 reactive
const settings = ref<ViewerSettings>({
    ...DEFAULT_SETTINGS,
    rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
});


watchEffect(() => {
    applyThemeToDom(isDark.value);
});
</script>
<template>
    <a-config-provider :theme="{ algorithm: antdAlgorithm }">
        <a-layout class="root">
            <a-layout-content>
                <ViewerStage :settings="settings" @open-settings="settingsOpen = true" />
            </a-layout-content>

            <SettingsSider v-model:open="settingsOpen" v-model:settings="settings" />
        </a-layout>
    </a-config-provider>
</template>

<style scoped>
.root {
    height: 100%;
}
</style>
