<template>
    <div class="viewer-page">
        <ViewerStage ref="viewerRef" v-model:settings="settingsModel" @model-state="hasModel = $event"
            @open-settings="(p) => emit('open-settings', p)" />

        <!-- 导出与打开文件：应用动作层，而非舞台层 -->
        <a-float-button class="open-file-fab" type="primary" :style="{ left: '24px', top: '60%' }"
            @click="viewerRef?.openFilePicker()" :aria-label="t('viewer.empty.pickFile')">
            <template #icon>
                <FolderOpenOutlined />
            </template>
        </a-float-button>

        <ExportFab :has-model="hasModel" v-model:exportScale="exportScale" v-model:exportTransparent="exportTransparent"
            @export-png="handleExportPng" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import { FolderOpenOutlined } from "@ant-design/icons-vue";

import ExportFab from "../components/ExportFab";

import type { ViewerSettings, OpenSettingsPayload } from "../lib/viewer/settings";
import type { LoadRequest } from "./types";

const { t } = useI18n();

const ViewerStage = defineAsyncComponent(() => import("../components/ViewerStage/index.vue"));
const props = defineProps<{
    settings: ViewerSettings;
    loadRequest?: LoadRequest | null;
}>();

const emit = defineEmits<{
    (e: "update:settings", v: ViewerSettings): void;
    (e: "open-settings", payload?: OpenSettingsPayload): void;
    (e: "consume-load"): void;
}>();

const settingsModel = computed<ViewerSettings>({
    get: () => props.settings,
    set: (v) => emit("update:settings", v),
});

type ViewerStageExpose = {
    exportPng: (payload: { scale: number; transparent: boolean }) => void | Promise<void>;
    openFilePicker: () => void;
    loadFile: (file: File) => Promise<void>;
    loadText: (text: string, fileName: string) => Promise<void>;
};

const viewerRef = ref<ViewerStageExpose | null>(null);
const hasModel = ref(false);

const exportScale = ref<number>(2);
const exportTransparent = ref<boolean>(true);

function handleExportPng(payload: { scale: number; transparent: boolean }): void {
    void viewerRef.value?.exportPng(payload);
}

watch(
    [() => props.loadRequest ?? null, viewerRef],
    async ([req, refVal]) => {
        if (!req) return;
        if (!refVal) {
            await nextTick();
        }
        const api = viewerRef.value;
        if (!api) return;

        if (req.kind === "file") {
            await api.loadFile(req.file);
        } else {
            await api.loadText(req.text, req.fileName);
        }

        emit("consume-load");
    },
    { immediate: true, flush: "post" }
);
</script>

<style scoped>
.viewer-page {
    height: 100%;
    width: 100%;
    position: relative;
}

/* open-file-fab 原来在 ViewerStage 内；现在属于页面动作层 */
.open-file-fab {
    position: absolute;
    z-index: 40;
}
</style>
