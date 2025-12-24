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
                    <a-dropdown :trigger="['click']">
                        <a-button block>
                            {{ t("viewer.empty.preloadDefault") }}
                            <DownOutlined class="down-icon" />
                        </a-button>
                        <template #overlay><a-menu @click="onSampleMenuClick">
                                <a-menu-item v-if="loadingSamples" disabled key="__loading">
                                    Loading…
                                </a-menu-item>

                                <a-menu-item v-else-if="sampleLoadError" disabled key="__error">
                                    加载失败：{{ sampleLoadError }}
                                </a-menu-item>

                                <a-menu-item v-else-if="sampleOptions.length === 0" disabled key="__empty">
                                    无可用样例
                                </a-menu-item>

                                <a-menu-item v-else v-for="s in sampleOptions" :key="s.url">
                                    {{ s.label }}
                                </a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>
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
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { APP_SAMPLES_URL } from "../lib/appMeta"
import type { SampleManifestItem } from "../lib/structure/types";
import { DownOutlined } from "@ant-design/icons-vue";
import { APP_AUTHOR, APP_DISPLAY_NAME, APP_GITHUB_URL, APP_VERSION } from "../lib/appMeta";

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        logoSrc?: string;
    }>(),
    {
        logoSrc: import.meta.env.BASE_URL + "lav.svg",
    }
);


const emit = defineEmits<{
    (e: "load-file", file: File): void;
    (e: "preload-sample", item: SampleManifestItem): void; // ✅ 改成传对象
}>();

const sampleOptions = ref<SampleManifestItem[]>([]);
const loadingSamples = ref(false);
const sampleLoadError = ref<string | null>(null);

async function loadSampleManifest(): Promise<void> {
    loadingSamples.value = true;
    sampleLoadError.value = null;

    try {
        const res = await fetch(APP_SAMPLES_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) throw new Error("manifest JSON 不是数组");

        const parsed: SampleManifestItem[] = data
            .filter((x) => x.fileName && x.url);

        sampleOptions.value = parsed;
    } catch (e: any) {
        sampleOptions.value = [];
        sampleLoadError.value = e?.message ? String(e.message) : String(e);
    } finally {
        loadingSamples.value = false;
    }
}

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

function onSampleMenuClick(info: { key: string | number }): void {
    const url = String(info.key);
    const item = sampleOptions.value.find((s) => s.url === url);
    if (!item) return;
    emit("preload-sample", item);
}

onMounted(() => {
    void loadSampleManifest();
});

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

.down-icon {
    margin-left: 8px;
    font-size: 12px;
    opacity: 0.85;
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
