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
                    t("viewer.empty.subtitle", {
                      action: t("viewer.empty.preloadDefault"),
                    })
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
          <a-dropdown :trigger="['click']" :menu="sampleMenu">
            <a-button block class="dropdown-btn">
              <span class="dropdown-btn__text">
                {{ t("viewer.empty.preloadDefault") }}
              </span>
              <DownOutlined class="dropdown-btn__icon" />
            </a-button>
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
        >v{{ APP_VERSION }}
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
      :title="t('viewer.empty.pickFile')"
      accept=".xyz,.pdb,.mol,.sdf,.dump,.lammpstrj,.traj,.data,.lmp,.zip"
      @change="onFilePicked"
    >
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MenuProps } from 'antdv-next';
import { readUrlListParam, writeUrlListParam } from '../lib/urlParams';
import type { SampleManifestItem } from '../lib/structure/types';
import { DownOutlined } from '@antdv-next/icons';
import {
  APP_AUTHOR,
  APP_DISPLAY_NAME,
  APP_SAMPLES_URL,
  APP_VERSION,
  APP_YUHLDR_URL,
} from '../lib/appMeta';
import { fetchWithTimeout } from '../lib/net/index.ts';

const { t } = useI18n();

const COPYRIGHT_START_YEAR = 2025;
const copyrightEndYear = new Date().getFullYear();
const copyrightYearsText
  = copyrightEndYear > COPYRIGHT_START_YEAR
    ? `${COPYRIGHT_START_YEAR}–${copyrightEndYear}`
    : String(COPYRIGHT_START_YEAR);

withDefaults(
  defineProps<{
    logoSrc?: string;
  }>(),
  { logoSrc: import.meta.env.BASE_URL + 'lav.svg' },
);

const emit = defineEmits<{
  (e: 'load-file', file: File): void;
  (e: 'load-files', files: File[]): void;
  (e: 'preload-sample', item: SampleManifestItem): void; // ✅ 改成传对象
}>();

const sampleOptions = ref<SampleManifestItem[]>([]);
const loadingSamples = ref(false);
const sampleLoadError = ref<string | null>(null);
const LOCAL_SAMPLES_MANIFEST_URL = import.meta.env.BASE_URL + 'samples/data.json';
const SAMPLES_URL_STORAGE_KEY = 'samples_manifest_url';

// CN: 从 sessionStorage 读取上次的 samples 清单地址
// EN: Read last samples manifest URL from sessionStorage.
function getStoredSamplesManifestUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(SAMPLES_URL_STORAGE_KEY) ?? '';
  }
  catch {
    return '';
  }
}

// CN: 保存 samples 清单地址到 sessionStorage
// EN: Persist samples manifest URL into sessionStorage.
function setStoredSamplesManifestUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SAMPLES_URL_STORAGE_KEY, url);
  }
  catch {}
}

// CN: 统一获取 samples 清单地址，必要时回写 URL
// EN: Resolve samples manifest URL and sync it into the query when needed.
function getSamplesManifestUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const hasSamplesParam = params.has('samples');
  const fromQuery = (readUrlListParam('samples')[0] ?? '').trim();
  if (fromQuery) {
    setStoredSamplesManifestUrl(fromQuery);
    return fromQuery;
  }
  if (!hasSamplesParam) {
    // CN: 手动移除 samples 参数时视为恢复默认。
    // EN: Treat removing the samples param as resetting to defaults.
    setStoredSamplesManifestUrl('');
  }
  const fromStorage = getStoredSamplesManifestUrl().trim();
  if (fromStorage) {
    writeUrlListParam('samples', [fromStorage]);
    return fromStorage;
  }
  const fallback = APP_SAMPLES_URL.trim();
  if (!fallback) return '';
  writeUrlListParam('samples', [fallback]);
  setStoredSamplesManifestUrl(fallback);
  return fallback;
}

// CN: 站内地址尽量保持为相对 URL
// EN: Keep same-origin URLs as relative paths when possible.
function compactSameOriginUrl(url: URL): string {
  if (url.origin === window.location.origin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return url.toString();
}

// CN: 解析并规范化 manifest 项
// EN: Parse and normalize manifest items.
function normalizeManifestItems(manifestUrl: string, data: unknown): SampleManifestItem[] {
  if (!Array.isArray(data)) throw new Error('manifest JSON 不是数组');

  const base = new URL(manifestUrl, window.location.href);

  return data
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any): SampleManifestItem | null => {
      const fileName = typeof x.fileName === 'string' ? x.fileName.trim() : '';
      const rawUrl = typeof x.url === 'string' ? x.url.trim() : '';
      if (!fileName || !rawUrl) return null;

      let url = rawUrl;
      try {
        url = compactSameOriginUrl(new URL(rawUrl, base));
      }
      catch {}

      const label = typeof x.label === 'string' && x.label.trim() ? x.label.trim() : fileName;
      const size = typeof x.size === 'number' && Number.isFinite(x.size) ? x.size : 0;

      return { fileName, label, url, size };
    })
    .filter((x): x is SampleManifestItem => !!x);
}

// CN: 拉取并解析 manifest
// EN: Fetch and parse the manifest.
async function fetchManifest(manifestUrl: string): Promise<SampleManifestItem[]> {
  const res = await fetchWithTimeout(manifestUrl, { cache: 'no-store' }, 5000);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as unknown;
  return normalizeManifestItems(manifestUrl, data);
}

async function loadSampleManifest(): Promise<void> {
  loadingSamples.value = true;
  sampleLoadError.value = null;

  try {
    const targetUrl = getSamplesManifestUrl();
    if (!targetUrl) throw new Error('samples url is empty');

    sampleOptions.value = await fetchManifest(targetUrl);
  }
  catch (e: any) {
    if (e?.name === 'AbortError') {
      sampleLoadError.value = t('net.timeout');
    }
    else {
      sampleLoadError.value = e?.message ? String(e.message) : String(e);
    }
    try {
      writeUrlListParam('samples', [LOCAL_SAMPLES_MANIFEST_URL]);
      sampleOptions.value = await fetchManifest(LOCAL_SAMPLES_MANIFEST_URL);
    }
    catch {
      sampleOptions.value = [];
    }
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

// 下拉菜单项：按加载状态/错误/空列表组装
// Dropdown items: built from loading/error/empty/samples state.
const sampleMenuItems = computed<NonNullable<MenuProps['items']>>(() => {
  if (loadingSamples.value) {
    return [{ key: '__loading', label: t('viewer.empty.samples.loading'), disabled: true }];
  }

  const items: Array<NonNullable<MenuProps['items']>[number]> = [];

  if (sampleLoadError.value) {
    items.push({
      key: '__error',
      label: t('viewer.empty.samples.loadFailed', { error: sampleLoadError.value }),
      disabled: true,
    });
    items.push({ key: '__divider', type: 'divider' });
  }

  if (sampleOptions.value.length === 0) {
    items.push({ key: '__empty', label: t('viewer.empty.samples.empty'), disabled: true });
    return items;
  }

  items.push(
    ...sampleOptions.value.map(s => ({
      key: s.url,
      label: `${s.label} (${s.size}MB)`,
    })),
  );

  return items;
});

// 下拉菜单配置：使用 antdv-next 的 menu 方式
// Dropdown menu config: use antdv-next menu prop.
const sampleMenu = computed<MenuProps>(() => ({
  items: sampleMenuItems.value,
  onClick: onSampleMenuClick,
}));

onMounted(() => {
  void loadSampleManifest();
});
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
    margin: 0 2px;
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
