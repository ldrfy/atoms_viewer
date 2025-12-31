<template>
    <div class="viewer-page">
        <ViewerStage ref="viewerRef" v-model:settings="settingsModel"
            @open-settings="(p) => emit('open-settings', p)" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, defineAsyncComponent } from "vue";

import type { ViewerSettings, OpenSettingsPayload } from "../lib/viewer/settings";
import type { LoadRequest } from "./types";

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
    loadFiles: (files: File[]) => Promise<void>;
    loadUrl: (url: string, fileName: string) => Promise<void>;
};

const viewerRef = ref<ViewerStageExpose | null>(null);

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
        } else if (req.kind === "files") {
            await api.loadFiles(req.files);
        } else if (req.kind === "url") {
            await api.loadUrl(req.url, req.fileName);
        } else {
            throw new Error("unknown loadRequest");
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
</style>
