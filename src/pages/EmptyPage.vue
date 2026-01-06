<template>
  <div
    class="empty-page"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- 中间：卡片 -->
    <div class="empty-center" :class="{ dragging: isDragging }">
      <a-card :title="t(APP_DISPLAY_NAME)">
        <a-empty class="empty-block">
          <template #image>
            <img :src="logoSrc" alt="logo">
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
            <a-button block class="dropdown-btn">
              <span class="dropdown-btn__text">
                {{ t("viewer.empty.preloadDefault") }}
              </span>
              <DownOutlined class="dropdown-btn__icon" />
            </a-button>
            <template #overlay>
              <a-menu @click="onSampleMenuClick">
                <a-menu-item v-if="loadingSamples" key="__loading" disabled>
                  {{ t("viewer.empty.samples.loading") }}
                </a-menu-item>

                <template v-else>
                  <!-- 失败提示：展示，但不阻断下面的样例列表 -->
                  <a-menu-item v-if="sampleLoadError" key="__error" disabled>
                    {{ t("viewer.empty.samples.loadFailed", { error: sampleLoadError }) }}
                  </a-menu-item>
                  <a-menu-divider v-if="sampleLoadError" />

                  <!-- 空状态 -->
                  <a-menu-item v-if="sampleOptions.length === 0" key="__empty" disabled>
                    {{ t("viewer.empty.samples.empty") }}
                  </a-menu-item>

                  <!-- 正常列表（包含 fallback 内置样例） -->
                  <a-menu-item v-for="s in sampleOptions" v-else :key="s.url">
                    {{ s.label }} ({{ s.size }}MB)
                  </a-menu-item>
                </template>
              </a-menu>
            </template>
          </a-dropdown>
        </a-space>
      </a-card>
    </div>

    <!-- 底部：Footer（页面底部） -->
    <div class="page-footer">
      <div class="footer-lines">
        <a
          v-if="APP_AUTHOR"
          class="footer-link footer-line"
          :href="APP_YUHLDR_URL"
          target="_blank"
          rel="noopener noreferrer"
        >
          v{{ APP_VERSION }}
          <span class="sep">·</span>
          {{ t('viewer.empty.footer.copyright', { years: copyrightYearsText, author: APP_AUTHOR }) }}
        </a>

        <div class="footer-line footer-privacy">
          {{ t('viewer.empty.footer.localOnly') }}
        </div>
      </div>
    </div>

    <input
      ref="fileInputRef"
      class="file-input"
      type="file"
      multiple
      :aria-label="t('viewer.empty.pickFile')"
      :title="t('viewer.empty.pickFile')"
      accept=".xyz,.pdb,.dump,.lammpstrj,.traj,.data,.lmp"
      @change="onFilePicked"
    >
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { APP_SAMPLES_URL } from '../lib/appMeta';
import type { SampleManifestItem } from '../lib/structure/types';
import { DownOutlined } from '@ant-design/icons-vue';
import { APP_AUTHOR, APP_DISPLAY_NAME, APP_VERSION, APP_YUHLDR_URL } from '../lib/appMeta';
import { fetchWithTimeout } from '../lib/net/index.ts';

const { t } = useI18n();

const COPYRIGHT_START_YEAR = 2025;
const copyrightEndYear = new Date().getFullYear();
const copyrightYearsText
  = copyrightEndYear > COPYRIGHT_START_YEAR
    ? `${COPYRIGHT_START_YEAR}–${copyrightEndYear}`
    : String(COPYRIGHT_START_YEAR);

const props = withDefaults(
  defineProps<{
    logoSrc?: string;
  }>(),
  {
    logoSrc: import.meta.env.BASE_URL + 'lav.svg',
  },
);

const emit = defineEmits<{
  (e: 'load-file', file: File): void;
  (e: 'load-files', files: File[]): void;
  (e: 'preload-sample', item: SampleManifestItem): void; // ✅ 改成传对象
}>();

const sampleOptions = ref<SampleManifestItem[]>([]);
const loadingSamples = ref(false);
const sampleLoadError = ref<string | null>(null);
const FALLBACK_SAMPLES: SampleManifestItem[] = [
  {
    fileName: 'graphene.xyz',
    label: 'graphene.xyz',
    url: import.meta.env.BASE_URL + 'samples/graphene.xyz',
    size: 0.003,
  },
  {
    fileName: 'cnt.data',
    label: 'cnt.data',
    url: import.meta.env.BASE_URL + 'samples/cnt.data',
    size: 0.009,
  },
];

async function loadSampleManifest(): Promise<void> {
  loadingSamples.value = true;
  sampleLoadError.value = null;

  try {
    const res = await fetchWithTimeout(APP_SAMPLES_URL, { cache: 'no-store' }, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) throw new Error('manifest JSON 不是数组');

    const parsed: SampleManifestItem[] = data
      .filter(x => x.fileName && x.url);

    sampleOptions.value = parsed;
  }
  catch (e: any) {
    if (e?.name === 'AbortError') {
      sampleLoadError.value = t('net.timeout');
    }
    else {
      sampleLoadError.value = e?.message ? String(e.message) : String(e);
    }
    sampleOptions.value = FALLBACK_SAMPLES;
  }
  finally {
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
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
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

  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  if (files.length === 1) {
    emit('load-file', files[0]!);
  }
  else {
    emit('load-files', files);
  }
}

function onFilePicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;
  if (files.length === 1) {
    emit('load-file', files[0]!);
  }
  else {
    emit('load-files', files);
  }
}

function onSampleMenuClick(info: { key: string | number }): void {
  const url = String(info.key);
  const item = sampleOptions.value.find(s => s.url === url);
  if (!item) return;
  emit('preload-sample', item);
}

onMounted(() => {
  void loadSampleManifest();
});

const logoSrc = props.logoSrc;
</script>

<style scoped>
/* 页面负责把内容整体居中（中间区域） */
.empty-page {
    position: relative;
    width: 100%;
    min-height: 100vh;
    /* 兼容旧浏览器 */
    min-height: 100dvh;
    /* 现代移动端推荐 */
    display: flex;
    flex-direction: column;
}

/* 关键：不要让 empty-center flex:1 撑满；让它自适应内容 */
.empty-center {
    margin: auto;
    /* 在 empty-page 中水平+垂直居中 */
    position: relative;
    /* 伪元素相对它定位 */
    padding: 14px;
    /* “比 card 大一圈”的圈大小，按需调 */
    border-radius: 16px;
    /* 跟卡片视觉一致 */
    display: inline-flex;
    /* shrink-wrap 包住 a-card */
    align-items: stretch;
    justify-content: center;
}

/* 拖拽高亮：只包住 empty-center（也就只比 card 大一圈） */
.empty-center.dragging::before {
    content: "";
    position: absolute;
    inset: 0;
    /* 刚好贴着 empty-center 的边界 */
    border: 2px dashed var(--ant-colorPrimary, #1677ff);
    border-radius: 16px;
    pointer-events: none;
}

/* 可选：控制卡片宽度/样式 */
.empty-card {
    width: min(560px, 100%);
    border-radius: 16px;
}

.empty-desc {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    text-align: center;
}

.actions {
    margin-top: 14px;
    width: 100%;
}

.down-icon {
    margin-left: 18px;
    font-size: 12px;
    opacity: 0.85;
}

/* 页面底部 footer */
.page-footer {
    margin: 12px 0 16px;
    padding: 0 14px;
    text-align: center;
}

.footer-lines {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
}

.footer-line {
    line-height: 1.4;
    font-size: 12px;
}

.footer-privacy {
    max-width: min(720px, 92vw);
    word-break: break-word;
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

.dropdown-btn {
    position: relative;
}

/* 文字居中：占满按钮宽度并居中 */
.dropdown-btn__text {
    display: block;
    width: 100%;
    text-align: center;
}

/* 图标固定在最右侧，不影响文字居中 */
.dropdown-btn__icon {
    position: absolute;
    right: 12px;
    /* 按需调整 */
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    opacity: 0.85;
    pointer-events: none;
    /* 避免影响点击 */
}
</style>
