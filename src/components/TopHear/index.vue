<template>
  <div class="tophear-overlay">
    <div class="tophear-inner">
      <div class="top-left-bar">
        <a-button
          type="text"
          class="brand-btn btn-icon"
          :class="{ clickable: props.canGoHome }"
          aria-label="home"
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
              type="text"
              class="btn-icon"
              aria-label="language"
              :title="t('viewer.locale.title')"
            >
              <GlobalOutlined />
            </a-button>
          </a-dropdown>

          <!-- GitHub -->
          <a-button
            type="text"
            class="btn-icon"
            aria-label="github"
            :title="t('viewer.links.github')"
            @click="openGithub"
          >
            <GithubOutlined />
          </a-button>

          <!-- 文档 -->
          <a-button
            type="text"
            class="btn-icon"
            aria-label="docs"
            :title="t('viewer.links.docs')"
            @click="openDocs"
          >
            <QuestionCircleOutlined />
          </a-button>

          <!-- 设置 -->
          <a-button
            type="text"
            class="btn-icon"
            aria-label="settings"
            :title="t('settings.title')"
            @click="emit('open-settings')"
          >
            <SettingOutlined />
          </a-button>
        </template>

        <!-- ===== 移动端 ===== -->
        <template v-else>
          <a-button
            type="text"
            class="btn-icon"
            aria-label="menu"
            :title="t('common.menu')"
            @click="mobileOpen = true"
          >
            <MenuOutlined />
          </a-button>
        </template>
      </div>
    </div>

    <!-- ===== 移动端 Drawer ===== -->
    <a-drawer
      class="tophear-drawer"
      placement="top"
      size="default"
      :content-wrapper-style="drawerContentStyle"
      :body-style="drawerBodyStyle"
      :open="mobileOpen"
      :closable="false"
      @close="closeDrawer"
    >
      <a-collapse
        v-model:active-key="activeKey"
        accordion
        ghost
        :items="collapseItems"
      />

      <a-space direction="vertical" class="drawer-links">
        <a-space class="drawer-links-row" :size="16">
          <a-button type="text" class="drawer-link-btn" @click="openGithub">
            <GithubOutlined />
            <span class="drawer-link-text">GitHub</span>
          </a-button>

          <a-button type="text" class="drawer-link-btn" @click="openDocs">
            <QuestionCircleOutlined />
            <span class="drawer-link-text">{{ t('viewer.links.docs') }}</span>
          </a-button>
        </a-space>

        <a-button type="text" class="drawer-link-btn drawer-links-single" @click="openSettings">
          <SettingOutlined />
          <span class="drawer-link-text">
            {{ t("settings.title") }}
          </span>
        </a-button>
      </a-space>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import type { MenuEmits, MenuProps } from 'antdv-next';

import { computed, ref, h } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  HomeOutlined,
  GlobalOutlined,
  SettingOutlined,
  MenuOutlined,
  GithubOutlined,
  QuestionCircleOutlined,
} from '@antdv-next/icons';
import { Radio, RadioGroup, useBreakpoint } from 'antdv-next';

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

/* ===== 响应式断点 ===== */
const screens = useBreakpoint();
const isMobile = computed(() => screens.value ? screens.value.lg === false : false);

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
const activeKey = ref<string | undefined>(undefined);

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

const currentLocaleItem = computed(() =>
  localeItems.value.find(i => i.key === curLocaleProxy.value),
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

// 折叠项：移动端语言选择
// Collapse items: mobile locale picker
const collapseItems = computed(() => {
  const header = h('span', { class: 'collapse-header' }, [
    h('span', { class: 'collapse-title' }, t('viewer.locale.title')),
    h('span', { class: 'collapse-value' }, currentLocaleItem.value?.label ?? ''),
  ]);

  const radios = h(
    RadioGroup,
    {
      'class': 'lang_radio_group',
      'value': curLocaleProxy.value,
      'onUpdate:value': (val: SupportLocale) => {
        curLocaleProxy.value = val;
        closeDrawer();
      },
    },
    () => localeItems.value.map(item =>
      h(Radio, {
        key: item.key,
        value: item.key,
        class: 'lang-radio-item',
      }, () => item.label),
    ),
  );

  return [
    {
      key: 'locale',
      label: header,
      children: radios,
    },
  ];
});

/* ===== 行为 ===== */
function closeDrawer() {
  mobileOpen.value = false;
  activeKey.value = undefined;
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
    gap: 8px;
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

.action-item {
    cursor: pointer;
}

.action-text {
    margin-left: 8px;
}

.lang_radio_group {
    margin-left: 24px;
    margin-top: -12px;
}

.lang-radio-item {
    display: block;
    margin-bottom: 8px;
}

.lang-radio-item:last-child {
    margin-bottom: 0;
}

.plain-click {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
}

/* Ant Typography 默认不会给 hover / active 上色，这里只是兜底 */
.plain-click:hover,
.plain-click:active {
    color: inherit;
}

.drawer-links {
    width: 100%;
}

.drawer-links-row {
    width: 100%;
    justify-content: center;
}

.drawer-link-text {
    margin-left: 12px;
}

.drawer-link-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.collapse-value {
    margin-left: auto;
}

.collapse-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
}

.drawer-links-single {
    width: 100%;
    justify-content: center;
}

.tophear-drawer .ant-drawer-body {
    padding:
        calc(16px + env(safe-area-inset-top))
        calc(16px + env(safe-area-inset-right))
        calc(16px + env(safe-area-inset-bottom))
        calc(16px + env(safe-area-inset-left));
}

.tophear-drawer .ant-drawer-content-wrapper {
    height: fit-content !important;
}

.tophear-drawer .ant-drawer-body {
    max-height: calc(100vh - 24px);
    overflow: auto;
}
</style>
