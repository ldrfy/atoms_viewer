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
import { ref, computed, watchEffect, defineAsyncComponent } from 'vue';
import SettingsSider from './components/SettingsSider';
import TopHear from './components/TopHear';
import EmptyPage from './pages/EmptyPage.vue';
import {
  DEFAULT_SETTINGS,
  type ViewerSettings,
  type OpenSettingsPayload,
} from './lib/viewer/settings';
import { theme as antdTheme } from 'ant-design-vue';
import { isDark, applyThemeToDom } from './theme/mode';
import type { LoadRequest } from './pages/types';
import type { SampleManifestItem } from './lib/structure/types';

const ViewerPage = defineAsyncComponent(() => import('./pages/ViewerPage.vue'));
const antdAlgorithm = computed(() =>
  isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
);

const settingsOpen = ref(false);

/**
 * Settings 折叠面板当前展开项（非 accordion：可多项展开；空数组表示全部折叠）
 * Current expanded panel keys for SettingsSider (non-accordion; empty = all collapsed)
 */
const settingsActiveKey = ref<string[]>(['display']);

const settings = ref<ViewerSettings>({
  ...DEFAULT_SETTINGS,
  rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
});

watchEffect(() => {
  applyThemeToDom(isDark.value);
});

// 页面流程控制（空页 / viewer）
const page = ref<'empty' | 'viewer'>('empty');
const loadRequest = ref<LoadRequest | null>(null);

function openWithFile(file: File): void {
  loadRequest.value = { kind: 'file', file };
  page.value = 'viewer';
}

function openWithFiles(files: File[]): void {
  if (!files || files.length === 0) return;
  // Single file keeps the legacy path; multi-file uses batch loading.
  if (files.length === 1) {
    openWithFile(files[0]!);
    return;
  }
  loadRequest.value = { kind: 'files', files };
  page.value = 'viewer';
}

async function preloadSample(sample: SampleManifestItem): Promise<void> {
  const { url, fileName } = sample;
  loadRequest.value = { kind: 'url', url, fileName };
  page.value = 'viewer';
}

function goHome(): void {
  page.value = 'empty';
  loadRequest.value = null;
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
  if (payload?.focusKey) {
    // “聚焦某一项”时：只展开该项，其他全部收起
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
