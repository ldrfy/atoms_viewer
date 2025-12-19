<template>
    <div class="stage" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop">


        <div class="top-left-bar">
            <a-space :size="6" align="center">
                <a-dropdown trigger="click" placement="bottomLeft">
                    <a-button type="text" class="lang-btn" aria-label="language">
                        <!-- 一个语言图标 -->
                        <GlobalOutlined />
                    </a-button>

                    <template #overlay>
                        <a-menu :selectedKeys="[curLocale]" @click="({ key }) => onSelectLocale(String(key))">
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

                <!-- GitHub -->
                <a-tooltip :title="t('viewer.links.github')">
                    <a-button type="text" class="icon-btn" aria-label="github" @click="openGithub">
                        <GithubOutlined />
                    </a-button>
                </a-tooltip>
            </a-space>
        </div>

        <!-- 右上角工具条：始终存在 -->
        <div class="top-right-bar">
            <a-space align="center">
                <!-- 导出相关：仅有模型时显示 -->
                <template v-if="hasModel">
                    <a-tooltip :title="t('viewer.export.scaleTip')">
                        <a-input-number v-model:value="exportScale" :min="1" :max="5" :step="0.1" :precision="1"
                            :placeholder="t('viewer.export.scalePlaceholder')" style="width: 140px" />
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
            </div>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz" @change="onFilePicked" />
    </div>
</template>


<script setup lang="ts">
import { ref, toRef, computed } from "vue";
import { useViewerStage } from "./useViewerStage";
import type { ViewerSettings } from "../../lib/viewer/settings";

import { GlobalOutlined, GithubOutlined } from "@ant-design/icons-vue";
import { i18n, SUPPORT_LOCALES, getLocaleSelfName, setLocale } from "../../i18n";

const curLocale = computed(() => i18n.global.locale.value as any);

const localeItems = computed(() =>
    SUPPORT_LOCALES.map((loc) => ({
        key: loc,
        label: getLocaleSelfName(loc),
    }))
);


const props = defineProps<{ settings: ViewerSettings }>();
const settingsRef = toRef(props, "settings");
const exportScale = ref<number>(2);
import { useI18n } from "vue-i18n";
const { t } = useI18n();
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
    isDragging,
    hasModel,
    openFilePicker,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
    onExportPng,
} = useViewerStage(settingsRef);
</script>

<style scoped src="./index.css"></style>
