<template>
    <div v-if="hasModel" class="export-fab">
        <a-float-button type="primary" @click="open = true" aria-label="export" :style="{ right: '40px', top: '50%' }">
            <template #icon>
                <DownloadOutlined />
            </template>
        </a-float-button>

        <a-modal v-model:open="open" :title="t('viewer.export.button')" :destroyOnClose="false" :maskClosable="true"
            :centered="true" :width="360">
            <a-form layout="vertical">
                <a-form-item :label="t('viewer.export.scaleTip')">
                    <a-input-number :value="exportScale" :min="1" :max="5" :step="0.1" :precision="1" :controls="false"
                        style="width: 100%" @update:value="onUpdateExportScale" />
                </a-form-item>

                <a-form-item>
                    <a-checkbox :checked="exportTransparent" @update:checked="onUpdateTransparent">
                        {{ t("viewer.export.transparent") }}
                    </a-checkbox>
                </a-form-item>
            </a-form>

            <template #footer>
                <a-space style="width: 100%; justify-content: flex-end">
                    <a-button @click="open = false">
                        {{ t("common.cancel") }}
                    </a-button>
                    <a-button type="primary" @click="onExport">
                        {{ t("viewer.export.button") }}
                    </a-button>
                </a-space>
            </template>
        </a-modal>
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
    exportTransparent: boolean;
}>();

const emit = defineEmits<{
    (e: "export-png", payload: { scale: number; transparent: boolean }): void;
    (e: "update:exportScale", v: number): void;
    (e: "update:exportTransparent", v: boolean): void;
}>();

const open = ref(false);

function onUpdateExportScale(v: number | null): void {
    if (typeof v === "number") emit("update:exportScale", v);
}

function onUpdateTransparent(v: boolean): void {
    emit("update:exportTransparent", v);
}

function onExport(): void {
    emit("export-png", { scale: props.exportScale, transparent: props.exportTransparent });
    open.value = false;
}
</script>

<style scoped>
.export-fab {
    z-index: 60;
    pointer-events: auto;
}
</style>
