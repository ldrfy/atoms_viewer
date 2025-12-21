<template>
    <div v-if="hasModel" class="export-fab">

        <a-float-button type="primary" @click="open = true" aria-label="export">
            <template #icon>
                <DownloadOutlined />
            </template>
        </a-float-button>

        <a-drawer :open="open" placement="bottom" :height="220" @close="open = false">
            <template #title>
                {{ t("viewer.export.button") }}
            </template>

            <a-form layout="vertical">
                <a-form-item :label="t('viewer.export.scaleTip')">
                    <a-input-number :value="exportScale" :min="1" :max="5" :step="0.1" :precision="1" :controls="false"
                        style="width: 100%" @update:value="onUpdateExportScale" />
                </a-form-item>

                <a-form-item>
                    <a-button type="primary" block @click="onExport">
                        {{ t("viewer.export.button") }}
                    </a-button>
                </a-form-item>
            </a-form>
        </a-drawer>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { DownloadOutlined } from "@ant-design/icons-vue";

import { useI18n } from "vue-i18n";
const { t } = useI18n();

const props = defineProps<{
    hasModel: boolean;
    exportScale: number;
}>();

const emit = defineEmits<{
    (e: "export-png", scale: number): void;
    (e: "update:exportScale", v: number): void;
}>();

const open = ref(false);

function onUpdateExportScale(v: number | null): void {
    if (typeof v === "number") {
        emit("update:exportScale", v);
    }
}

function onExport(): void {
    emit("export-png", props.exportScale);
    open.value = false;
}
</script>

<style scoped>
/* 悬浮按钮固定在右下角，不影响布局 */
.export-fab {
    z-index: 60;
    pointer-events: auto;
}
</style>
