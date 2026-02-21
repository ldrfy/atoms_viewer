<template>
  <div class="tophear-overlay">
    <div class="tophear-inner">
      <div class="top-left-bar">
        <a-button
          variant="link"
          color="default"
          class="brand-btn"
          :class="{ clickable: props.canGoHome }"
          @click="onClickBrand"
        >
          <HomeOutlined v-if="props.canGoHome" />
          <span class="brand-text">{{ APP_DISPLAY_NAME }}</span>
        </a-button>
      </div>

      <div class="top-right-bar">
        <!-- ===== 桌面端 ===== -->
        <template v-if="!isMobile">
          <!-- 语言 -->
          <a-dropdown :trigger="['click']" placement="bottomLeft" :menu="localeMenu">
            <a-button
              variant="link"
              color="default"
              class="btn-icon-top"
              :title="t('viewer.locale.title')"
            >
              <GlobalOutlined />
            </a-button>
          </a-dropdown>

          <!-- GitHub -->
          <a-button
            variant="link"
            color="default"
            class="btn-icon-top"
            :title="t('viewer.links.github')"
            @click="openGithub"
          >
            <GithubOutlined />
          </a-button>

          <!-- 文档 -->
          <a-button
            variant="link"
            color="default"
            class="btn-icon-top"
            :title="t('viewer.links.docs')"
            @click="openDocs"
          >
            <QuestionCircleOutlined />
          </a-button>

          <!-- 设置 -->
          <a-button
            variant="link"
            color="default"
            class="btn-icon-top"
            :title="t('settings.title')"
            @click="emit('open-settings')"
          >
            <SettingOutlined />
          </a-button>
        </template>

        <!-- ===== 移动端 ===== -->
        <template v-else>
          <a-flex>
            <a-button
              variant="link"
              color="default"
              :title="t('settings.title')"
              @click="openSettings"
            >
              <SettingOutlined />
            </a-button>
            <a-button
              variant="link"
              color="default"
              :title="t('common.menu')"
              @click="openMobilePanel"
            >
              <MenuOutlined />
            </a-button>
          </a-flex>
        </template>
      </div>
    </div>

    <!-- ===== 移动端 Drawer ===== -->
    <a-drawer
      class="tophear-drawer"
      placement="top"
      size="default"
      :styles="{ wrapper: drawerContentStyle, body: drawerBodyStyle }"
      :open="mobileOpen"
      :closable="false"
      @close="closeDrawer"
    >
      <a-flex vertical :gap="8">
        <a-flex justify="space-between" align="center">
          <a-space :size="12" align="center">
            <GlobalOutlined />
            <a-typography-text>
              {{ t('viewer.locale.title') }}
            </a-typography-text>
          </a-space>
          <a-select
            :value="curLocaleProxy"
            :options="localeSelectOptions"
            style="min-width: 128px;"
            show-search
            option-filter-prop="label"
            @change="onMobileLocaleChange"
          />
        </a-flex>

        <DrawerActionItem
          label="GitHub"
          :left-icon="GithubOutlined"
          :right-icon="LinkOutlined"
          @click="openGithub"
        />

        <DrawerActionItem
          :label="t('viewer.links.docs')"
          :left-icon="QuestionCircleOutlined"
          :right-icon="LinkOutlined"
          @click="openDocs"
        />
      </a-flex>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import type { MenuEmits, MenuProps } from 'antdv-next';

import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  HomeOutlined,
  GlobalOutlined,
  SettingOutlined,
  MenuOutlined,
  GithubOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
} from '@antdv-next/icons';
import DrawerActionItem from './parts/DrawerActionItem.vue';

type MenuInfo = Parameters<MenuEmits['click']>[0];

import {
  SUPPORT_LOCALES,
  getLocaleSelfName,
  setLocale,
  getLocale,
  type SupportLocale,
} from '../../i18n';
import { APP_DISPLAY_NAME, APP_GITHUB_URL, APP_DOCS_URL } from '../../lib/appMeta';

const props = withDefaults(
  defineProps<{
    canGoHome?: boolean;
  }>(),
  {
    canGoHome: false,
  },
);

const emit = defineEmits<{
  (e: 'open-settings'): void;
  (e: 'go-home'): void;
}>();

const { t } = useI18n();

// 统一与设置侧栏一致的移动端断点，避免两个区域判断不一致。
// Keep the same mobile breakpoint as SettingsSider to avoid split-brain UI mode.
const isMobile = ref(false);

// 按 768px 阈值同步设备模式（与 SettingsSider 完全一致）。
// Sync device mode with a 768px threshold (exactly same as SettingsSider).
function updateIsMobile(): void {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
});

// 用户选择的语言（区分 system 与实际解析语言）
// User-selected locale (distinguish "system" from resolved locale)
const storedLocale = ref<SupportLocale>(getLocale());

// 抽屉高度跟随内容（顶部抽屉默认会撑满）
// Drawer height follows content (top placement defaults to full height)
const drawerContentStyle = computed(() => ({
  height: 'auto',
}));

// 抽屉内容区最大高度与滚动
// Drawer body max height and scrolling
const drawerBodyStyle = computed(() => ({
  maxHeight: 'calc(100vh - 24px)',
  overflow: 'auto',
}));

/* ===== Drawer 状态 ===== */
const mobileOpen = ref(false);

/* ===== locale（关键：绑定到 vue-i18n 的响应式 locale）===== */
const curLocaleProxy = computed<SupportLocale>({
  get: () => storedLocale.value,
  set: (v) => {
    storedLocale.value = v;
    setLocale(v); // 你的封装：通常会更新 i18n.locale + 本地存储
  },
});

const localeItems = computed(() =>
  SUPPORT_LOCALES.map(loc => ({
    key: loc,
    label: getLocaleSelfName(loc),
  })),
);

// 移动端语言选择器选项。
// Locale options for mobile select.
const localeSelectOptions = computed(() =>
  localeItems.value.map(item => ({
    value: item.key,
    label: item.label,
  })),
);

// Desktop dropdown menu for locale picker.
// 桌面端语言下拉菜单配置。
const localeMenu = computed<MenuProps>(() => ({
  items: localeItems.value.map(item => ({
    key: item.key,
    label: item.label,
  })),
  selectedKeys: [curLocaleProxy.value],
  onClick: (e: MenuInfo) => onSelectLocale(String(e.key)),
}));

/* ===== 行为 ===== */
function closeDrawer() {
  mobileOpen.value = false;
}

// 打开移动端语言等操作抽屉。
// Open the mobile action drawer for locale and links.
function openMobilePanel(): void {
  mobileOpen.value = true;
}

// 移动端语言切换后立即关闭抽屉，减少一次额外点击。
// Close drawer right after mobile locale switch to reduce one extra tap.
function onMobileLocaleChange(val: SupportLocale | string): void {
  curLocaleProxy.value = val as SupportLocale;
  closeDrawer();
}

function openSettings() {
  emit('open-settings');
  closeDrawer();
}

function openGithub() {
  window.open(APP_GITHUB_URL, '_blank', 'noopener');
  closeDrawer();
}

function openDocs() {
  window.open(APP_DOCS_URL, '_blank', 'noopener');
  closeDrawer();
}

function onSelectLocale(key: string) {
  curLocaleProxy.value = key as SupportLocale;
  closeDrawer();
}

function onClickBrand(): void {
  if (!props.canGoHome) return;
  emit('go-home');
}
</script>

<style scoped>
.tophear-overlay {
    position: absolute;
    inset: 0 0 auto 0;
    z-index: 50;
    pointer-events: none;
    padding:
        calc(12px + env(safe-area-inset-top))
        calc(12px + env(safe-area-inset-right))
        12px
        calc(12px + env(safe-area-inset-left));
}

.tophear-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.top-left-bar {
    pointer-events: auto;
}

.brand-btn {
    font-size: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px;
}

.brand-btn.clickable {
    cursor: pointer;
}

.brand-text {
    font-weight: 600;
}

.top-right-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
}

.tophear-drawer .ant-drawer-body {
    padding:
        calc(16px + env(safe-area-inset-top))
        calc(16px + env(safe-area-inset-right))
        calc(16px + env(safe-area-inset-bottom))
        calc(16px + env(safe-area-inset-left));
    max-height: calc(100vh - 24px);
    overflow: auto;
}

.tophear-drawer .ant-drawer-content-wrapper {
    height: fit-content !important;
}

.btn-icon-top{
    font-size: 20px;
}
</style>
