<template>
  <a-config-provider :theme="{ algorithm: antdAlgorithm }">
    <a-layout class="root">
      <!-- 手动打开设置：不改变折叠项 -->
      <TopHear
        :can-go-home="page === 'viewer'"
        @go-home="goHome"
        @open-settings="onOpenSettings"
      />

      <a-layout-content>
        <EmptyPage
          v-if="page === 'empty'"
          @load-file="openWithFile"
          @load-files="openWithFiles"
          @preload-sample="preloadSample"
        />

        <ViewerPage
          v-else
          v-model:settings="settings"
          :load-request="loadRequest"
          @consume-load="loadRequest = null"
          @open-settings="onOpenSettings"
        />
      </a-layout-content>

      <!-- 关键：把 activeKey 也交给 App 管 -->
      <SettingsSider
        v-model:open="settingsOpen"
        v-model:settings="settings"
        v-model:active-key="settingsActiveKey"
      />
    </a-layout>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect, defineAsyncComponent, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import SettingsSider from './components/SettingsSider';
import TopHear from './components/TopHear';
import EmptyPage from './pages/EmptyPage.vue';
import type { ViewerSettings, OpenSettingsPayload } from './lib/viewer/settings';
import { theme as antdTheme, message, Modal } from 'ant-design-vue';
import { isDark, applyThemeToDom, setThemeMode, getThemeMode } from './theme/mode';
import type { LoadRequest } from './pages/types';
import type { SampleManifestItem } from './lib/structure/types';
import {
  loadSettingsFromStorage,
  saveSettingsToStorage,
} from './lib/viewer/settingsStorage';
import { readUrlListParam, writeUrlListParam, clearQueryParams } from './lib/urlParams';
import { mergeSettings } from './lib/viewer/mergeSettings';
import { readSettingsOverridesFromUrl } from './lib/settingsUrl';
import { viewerApiRef } from './lib/viewer/bridge';
import { readStoredSessionMeta, loadSessionFromStorage } from './lib/viewer/sessionStorage';
import type { SessionSnapshot, LayerSourceData } from './lib/viewer/sessionTypes';
import { mergeCategorizedSettings } from './lib/viewer/sessionTemplates';
import { writeApplyAllLayersFlags } from './components/SettingsSider/applyAllStorage';
import { PANEL_KEYS } from './lib/viewer/panelKeys';
import { VIEW_SETTINGS_SAVE_DELAY_MS } from './lib/viewer/constants';

const ViewerPage = defineAsyncComponent(() => import('./pages/ViewerPage.vue'));
const antdAlgorithm = computed(() =>
  isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
);
const { t } = useI18n();

const settingsOpen = ref(false);
let saveSettingsTimer: number | null = null;

function buildSettingsSignature(input: ViewerSettings): string {
  const {
    ...rest
  } = input;
  return JSON.stringify(rest);
}

/**
 * Settings 折叠面板当前展开项（非 accordion：可多项展开；空数组表示全部折叠）
 * Current expanded panel keys for SettingsSider (non-accordion; empty = all collapsed)
 */
const settingsActiveKey = ref<string[]>([PANEL_KEYS.view]);

const settings = ref<ViewerSettings>(loadSettingsFromStorage());
setThemeMode(settings.value.other.themeMode ?? getThemeMode());
let lastNonViewSignature = buildSettingsSignature(settings.value);
const settingsOverrides = readSettingsOverridesFromUrl(settings.value);
if (Object.keys(settingsOverrides).length > 0) {
  settings.value = mergeSettings(settings.value, settingsOverrides);
}
const pendingRestore = ref<{ snapshot: SessionSnapshot; files: File[] } | null>(null);

watch(
  settings,
  () => {
    const sig = buildSettingsSignature(settings.value);
    if (sig !== lastNonViewSignature) {
      if (saveSettingsTimer != null) {
        window.clearTimeout(saveSettingsTimer);
        saveSettingsTimer = null;
      }
      saveSettingsToStorage(settings.value);
      lastNonViewSignature = sig;
      return;
    }
    if (saveSettingsTimer != null) {
      window.clearTimeout(saveSettingsTimer);
    }
    saveSettingsTimer = window.setTimeout(() => {
      saveSettingsTimer = null;
      saveSettingsToStorage(settings.value);
      lastNonViewSignature = buildSettingsSignature(settings.value);
    }, VIEW_SETTINGS_SAVE_DELAY_MS);
  },
  { deep: true },
);

watchEffect(() => {
  applyThemeToDom(isDark.value);
});

message.config({ duration: 4 });

watch(
  viewerApiRef,
  () => {
    void tryApplyPendingRestore();
  },
);

onMounted(() => {
  void maybePromptSessionRestore();
});

function handleImportSessionEvent(ev: Event): void {
  const detail = (ev as CustomEvent).detail as { snapshot?: SessionSnapshot; files?: File[] } | undefined;
  if (!detail?.snapshot) return;
  message.loading(t('settings.importing'), 1);
  pendingRestore.value = {
    snapshot: detail.snapshot,
    files: detail.files ?? [],
  };
  page.value = 'viewer';
  void tryApplyPendingRestore();
}

onMounted(() => {
  window.addEventListener('atoms-viewer:import-session', handleImportSessionEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('atoms-viewer:import-session', handleImportSessionEvent);
  if (saveSettingsTimer != null) {
    window.clearTimeout(saveSettingsTimer);
    saveSettingsTimer = null;
  }
});

// 页面流程控制（空页 / viewer）
const page = ref<'empty' | 'viewer'>('empty');

watch(
  [page, pendingRestore, viewerApiRef],
  async ([p]) => {
    if (p !== 'viewer') return;
    await tryApplyPendingRestore();
  },
);
const loadRequest = ref<LoadRequest | null>(null);
function fileNameWithMd5(src: LayerSourceData, idx: number): string {
  if (src.fileName) return src.fileName;
  const ext = (() => {
    const name = src.fileName ?? '';
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i) : '.bin';
  })();
  if (src.md5) return `${src.md5}${ext}`;
  return `model-${idx + 1}${ext}`;
}
function buildFilesFromSources(sources: LayerSourceData[]): File[] {
  const files: File[] = [];
  sources.forEach((src, idx) => {
    if (!src.buffer) return;
    const name = fileNameWithMd5(src, idx);
    files.push(new File([src.buffer], name, { type: src.mime }));
  });
  return files;
}

function inferFileNameFromUrl(url: string, index: number): string {
  try {
    const parsed = new URL(url, window.location.href);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const base = parts[parts.length - 1];
    if (base) return decodeURIComponent(base);
  }
  catch {}
  return `remote-${index + 1}`;
}

function parseUrlLoadRequest(): LoadRequest | null {
  const urls = readUrlListParam('url');
  if (urls.length === 0) return null;

  const items = urls.map((url, idx) => ({
    url,
    fileName: inferFileNameFromUrl(url, idx),
  }));

  if (items.length === 1) {
    const first = items[0]!;
    return { kind: 'url', url: first.url, fileName: first.fileName };
  }

  return { kind: 'urls', items };
}

const initialLoad = parseUrlLoadRequest();
if (initialLoad) {
  loadRequest.value = initialLoad;
  page.value = 'viewer';
}

function openWithFile(file: File): void {
  loadRequest.value = { kind: 'file', file };
  page.value = 'viewer';
}

function openWithFiles(files: File[]): void {
  if (!files || files.length === 0) return;
  loadRequest.value = { kind: 'files', files };
  page.value = 'viewer';
}

async function preloadSample(sample: SampleManifestItem): Promise<void> {
  const { url, fileName } = sample;
  writeUrlListParam('url', [url]);
  // Keep the viewer URL short: `samples` is only useful on EmptyPage.
  writeUrlListParam('samples', []);
  loadRequest.value = { kind: 'url', url, fileName };
  page.value = 'viewer';
}

function goHome(): void {
  page.value = 'empty';
  loadRequest.value = null;
  clearQueryParams();
}

async function tryApplyPendingRestore(): Promise<void> {
  const payload = pendingRestore.value;
  const api = viewerApiRef.value;
  if (!payload || !api?.applySessionSnapshot) return;
  try {
    await api.applySessionSnapshot(payload.snapshot as SessionSnapshot, payload.files);
    pendingRestore.value = null;
  }
  catch (err) {
    console.error(err);
    message.error(t('common.error'));
  }
}

async function maybePromptSessionRestore(): Promise<void> {
  const meta = readStoredSessionMeta();
  const layers = meta?.snapshot?.layers as any;
  const layerCount = Array.isArray(layers)
    ? layers.length
    : layers && typeof layers === 'object' && typeof layers.data === 'object'
      ? Object.keys(layers.data as Record<string, unknown>).length
      : 0;
  if (!meta || !layers || layerCount === 0) return;
  if (loadRequest.value) return;
  Modal.confirm({
    title: t('viewer.session.restoreTitle'),
    content: t('viewer.session.restoreContent'),
    okText: t('viewer.session.restoreConfirm'),
    cancelText: t('common.cancel'),
    centered: true,
    onOk: async () => {
      try {
        const stored = await loadSessionFromStorage();
        if (!stored) throw new Error('missing session');
        const files = buildFilesFromSources(stored.sources ?? []);
        const rawSettings = stored.snapshot.settings as any;
        const hasSettings = rawSettings && typeof rawSettings === 'object';
        if (!hasSettings) {
          message.error(t('settings.importFailed'));
          return;
        }
        const detailFlags = rawSettings.details as Record<string, unknown>;
        const colorFlags = rawSettings.colors as Record<string, unknown>;
        if (
          typeof detailFlags?.applyAllLayers === 'boolean'
          && typeof colorFlags?.applyAllLayers === 'boolean'
          && typeof colorFlags?.data === 'object'
        ) {
          for (const key of Object.keys(colorFlags.data as Record<string, unknown>)) {
            if (/\d/.test(key)) {
              message.error(t('settings.importFailed'));
              return;
            }
          }
          writeApplyAllLayersFlags({
            details: detailFlags.applyAllLayers,
            colors: colorFlags.applyAllLayers,
          });
        }
        settings.value = mergeCategorizedSettings(rawSettings);
        pendingRestore.value = { snapshot: stored.snapshot, files };
        page.value = 'viewer';

        await tryApplyPendingRestore();
      }
      catch (err) {
        console.error(err);
        message.error(t('common.error'));
      }
    },
  });
}

/**
 * 统一打开设置入口：
 * - 总是打开抽屉 / Always open drawer
 * - 如果 focusKey 存在（自动打开），只展开该面板 / If focusKey exists, expand only that panel
 */
function onOpenSettings(payload?: OpenSettingsPayload): void {
  // 默认行为：打开抽屉
  // Default: open drawer
  if (payload?.open !== false) {
    settingsOpen.value = true;
  }

  // 只要给了 focusKey，就切换折叠面板
  // Switch collapse panel when focusKey is provided
  if (payload?.focusKeys && payload.focusKeys.length > 0) {
    settingsActiveKey.value = payload.focusKeys.map(k => String(k));
    return;
  }
  if (payload?.focusKey) {
    settingsActiveKey.value = [payload.focusKey];
  }
}
</script>

<style scoped>
.root {
  height: 100%;
  position: relative;
}
</style>
