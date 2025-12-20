<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">
        <div class="top-right-bar">
            <a-space :size="6" align="center">
                <a-dropdown trigger="click" placement="bottomLeft">
                    <a-button type="text" class="lang-btn" aria-label="language">
                        <!-- 一个语言图标 -->
                        <GlobalOutlined />
                    </a-button>


                    <template #overlay>
                        <a-menu :selectedKeys="[curLocale]"
                            @click="(e: { key: string | number }) => onSelectLocale(String(e.key))">

                            <!-- 顶部：显示当前选中 -->
                            <a-menu-item disabled key="__current">
                                {{ t("viewer.locale.current") }}：{{ getLocaleSelfName(curLocale) }}
                            </a-menu-item>

                            <a-menu-divider />

                            <!-- 语言列表 -->
                            <a-menu-item v-for="item in localeItems" :key="item.key">
                                {{ item.label }}
                            </a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <!-- 主题（新增） -->
                <a-dropdown trigger="click" placement="bottomLeft">
                    <a-button type="text" class="icon-btn" aria-label="theme">
                        <BgColorsOutlined />
                    </a-button>

                    <template #overlay>
                        <a-menu :selectedKeys="[themeMode]"
                            @click="(e: { key: string | number }) => onSelectThemeMode(String(e.key))">
                            <a-menu-item disabled key="__current_theme">
                                {{ t("viewer.theme.current") }}：{{ t(`viewer.theme.mode.${themeMode}`) }}
                            </a-menu-item>
                            <a-menu-divider />

                            <a-menu-item key="system">
                                <template #icon>
                                    <DesktopOutlined />
                                </template>
                                {{ t("viewer.theme.mode.system") }}
                            </a-menu-item>

                            <a-menu-item key="light">
                                <template #icon>
                                    <BulbOutlined />
                                </template>
                                {{ t("viewer.theme.mode.light") }}
                            </a-menu-item>

                            <a-menu-item key="dark">
                                <template #icon>
                                    <BulbFilled />
                                </template>
                                {{ t("viewer.theme.mode.dark") }}
                            </a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <!-- GitHub -->
                <a-tooltip :title="t('viewer.links.github')">
                    <a-button type="text" class="icon-btn" aria-label="github" @click="openGithub">
                        <GithubOutlined />
                    </a-button>
                </a-tooltip>

                <a-button type="text" class="icon-btn" @click="$emit('open-settings')">
                    <!-- 一个语言图标 -->
                    <SettingOutlined />
                </a-button>
            </a-space>
        </div>

        <!-- 右上角工具条：始终存在 -->
        <div class="top-left-bar">
            <a-space align="center">
                <!-- 导出相关：仅有模型时显示 -->
                <template v-if="hasModel">
                    <a-tooltip :title="t('viewer.export.scaleTip')">
                        <a-input-number v-model:value="exportScale" :min="1" :max="5" :step="0.1" :precision="1"
                            :placeholder="t('viewer.export.scalePlaceholder')" />
                    </a-tooltip>

                    <a-button class="export-btn" type="primary" @click="onExportPng(exportScale)">
                        {{ t("viewer.export.button") }}
                    </a-button>
                </template>

            </a-space>
        </div>

        <div ref="canvasHostRef" class="canvas-host"></div>

        <div v-if="!hasModel" class="empty-overlay">
            <div class="empty-card">
                <div class="empty-title">{{ t("viewer.empty.title") }}</div>
                <div class="empty-sub">{{ t("viewer.empty.subtitle") }}</div>
                <div class="empty-actions">
                    <a-button type="primary" @click="openFilePicker">
                        {{ t("viewer.empty.pickFile") }}
                    </a-button>
                </div>
                    <div class="empty-actions">
                    <a-button type="primary" @click="preloadDefault">
                        {{ t("viewer.empty.preloadDefault") }}
                    </a-button>
                </div>
            </div>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz" @change="onFilePicked" />
    </div>
</template>


<script setup lang="ts">
import { ref, toRef, computed } from "vue";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings } from "../../lib/viewer/settings";
import {
    GlobalOutlined,
    GithubOutlined,
    BgColorsOutlined,
    DesktopOutlined,
    BulbOutlined,
    BulbFilled, SettingOutlined,
} from "@ant-design/icons-vue";
import { i18n, SUPPORT_LOCALES, getLocaleSelfName, setLocale } from "../../i18n";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../theme/mode";
import { useI18n } from "vue-i18n";

const curLocale = computed(() => i18n.global.locale.value as any);

const themeMode = computed(() => getThemeMode());

const localeItems = computed(() =>
    SUPPORT_LOCALES.map((loc) => ({
        key: loc,
        label: getLocaleSelfName(loc),
    }))
);



defineEmits<{
    (e: "open-settings"): void;
}>();
const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");
const exportScale = ref<number>(2);
const { t } = useI18n();


function onSelectThemeMode(key: string): void {
    setThemeMode(key as ThemeMode);
}
function onSelectLocale(key: string) {
    setLocale(key as any);
}
const GITHUB_URL = "https://github.com/ldrfy/ldr_atoms_viewer"; // 改成你的

function openGithub() {
    window.open(GITHUB_URL, "_blank", "noopener,noreferrer");
}
const {
    canvasHostRef,
    fileInputRef,
    hasModel,
    openFilePicker,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
    preloadDefault,
} = useViewerStage(settingsRef);
void canvasHostRef;
void fileInputRef;
</script>

<style scoped src="./index.css"></style>
