<template>
    <div class="empty-page" :class="{ dragging: isDragging }" @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
        <!-- 中间：卡片 -->
        <div class="empty-center">
            <div class="empty-card">
                <a-empty class="empty-block">
                    <template #image>
                        <img :src="logoSrc" alt="logo" />
                    </template>

                    <template #description>
                        <div class="empty-desc">
                            <a-typography-text>
                                {{ t("viewer.empty.title") }}
                            </a-typography-text>

                            <div class="hint">
                                <a-typography-text type="secondary">
                                    {{
                                        t("viewer.empty.subtitle") ??
                                        "Drag & drop a file here, or use the buttons below."
                                    }}
                                </a-typography-text>
                            </div>
                        </div>
                    </template>
                </a-empty>

                <a-space direction="vertical" :size="12" class="actions">
                    <a-button type="primary" block @click="openFilePicker">
                        {{ t("viewer.empty.pickFile") }}
                    </a-button>
                    <a-button block @click="emit('preload-default')">
                        {{ t("viewer.empty.preloadDefault") }}
                    </a-button>
                </a-space>
            </div>
        </div>

        <!-- 底部：Footer（页面底部） -->
        <div class="page-footer">
            <a class="footer-link" :href="APP_GITHUB_URL" target="_blank" rel="noopener noreferrer">
                <span>{{ APP_DISPLAY_NAME }}</span>
                <span class="sep">·</span>
                <span>v{{ APP_VERSION }}</span>
                <template v-if="APP_AUTHOR">
                    <span class="sep">·</span>
                    <span>{{ APP_AUTHOR }}</span>
                </template>
            </a>
        </div>

        <input ref="fileInputRef" class="file-input" type="file" accept=".xyz,.pdb,.dump,.lammpstrj,.traj,.data,.lmp"
            @change="onFilePicked" />
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { APP_AUTHOR, APP_DISPLAY_NAME, APP_GITHUB_URL, APP_VERSION } from "../lib/appMeta";

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        logoSrc?: string;
    }>(),
    {
        // ✅ public/lav.svg -> 运行时路径用 BASE_URL 拼接，dev/生产都稳
        logoSrc: import.meta.env.BASE_URL + "lav.svg",
    }
);

const emit = defineEmits<{
    (e: "load-file", file: File): void;
    (e: "preload-default"): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const dragDepth = ref(0);

function openFilePicker(): void {
    fileInputRef.value?.click();
}

function onDragEnter(): void {
    dragDepth.value += 1;
    isDragging.value = true;
}

function onDragOver(e: DragEvent): void {
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

function onDragLeave(): void {
    dragDepth.value -= 1;
    if (dragDepth.value <= 0) {
        dragDepth.value = 0;
        isDragging.value = false;
    }
}

function onDrop(e: DragEvent): void {
    dragDepth.value = 0;
    isDragging.value = false;

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    emit("load-file", file);
}

function onFilePicked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    emit("load-file", file);
}

const logoSrc = props.logoSrc;
</script>

<style scoped>
/* 页面：上中下布局 */
.empty-page {
    position: relative;
    min-height: 100vh;
    /* 关键：撑满视口，footer 才能沉底 */
    width: 100%;
    display: flex;
    flex-direction: column;
    /* 关键：纵向布局 */
    padding: 24px;

    background: var(--ant-colorBgLayout);
}

/* 拖拽高亮 */
.empty-page.dragging {
    outline: 2px dashed var(--ant-colorPrimary);
    outline-offset: -12px;
}

/* 中间区域：把卡片居中 */
.empty-center {
    flex: 1;
    /* 占据中间可伸缩空间 */
    display: flex;
    align-items: center;
    justify-content: center;
}

/* 卡片样式 */
.empty-card {
    width: min(560px, 100%);
    border-radius: 16px;
    padding: 20px;

    background: var(--ant-colorBgContainer);
    border: 1px solid var(--ant-colorBorderSecondary);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--ant-colorTextBase) 10%, transparent);
}

/* a-empty block spacing */
.empty-block {
    margin-top: 10px;
    margin-bottom: 6px;
}


.empty-desc {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    text-align: center;
}

.hint {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;

    background: var(--ant-colorFillTertiary);
    border: 1px solid var(--ant-colorBorderSecondary);
}

.actions {
    margin-top: 14px;
    width: 100%;
}

/* 页面底部 footer */
.page-footer {
    padding-top: 16px;
    padding-bottom: 6px;
    text-align: center;
}

.footer-link {
    color: var(--ant-colorTextSecondary);
    text-decoration: none;
}

.footer-link:hover {
    color: var(--ant-colorText);
}

.sep {
    margin: 0 8px;
}

.file-input {
    display: none;
}
</style>
