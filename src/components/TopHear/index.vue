<template>
    <div class="tophear-overlay">
        <div class="tophear-inner">
            <div class="top-left-bar">
                <a-button type="text" class="brand-btn btn-icon" :class="{ clickable: props.canGoHome }"
                    aria-label="home" @click="onClickBrand">
                    <HomeOutlined v-if="props.canGoHome" />
                    <span class="brand-text">{{ APP_DISPLAY_NAME }}</span>
                </a-button>
            </div>

            <div class="top-right-bar">
                <!-- ===== 桌面端 ===== -->
                <template v-if="!isMobile">
                    <!-- 语言 -->
                    <a-dropdown trigger="click" placement="bottomLeft">
                        <a-button type="text" class="btn-icon" aria-label="language" :title="t('viewer.locale.title')">
                            <GlobalOutlined />
                        </a-button>

                        <template #overlay>
                            <a-menu :selectedKeys="[curLocaleProxy]"
                                @click="(e: MenuInfo) => onSelectLocale(String(e.key))">
                                <a-menu-item v-for="item in localeItems" :key="item.key">
                                    {{ item.label }}
                                </a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>

                    <!-- 主题 -->
                    <a-dropdown trigger="click" placement="bottomLeft">
                        <a-button type="text" class="btn-icon" aria-label="theme" :title="t('viewer.theme.title')">
                            <BgColorsOutlined />
                        </a-button>

                        <template #overlay>
                            <a-menu :selectedKeys="[themeMode]"
                                @click="(e: MenuInfo) => onSelectThemeMode(e.key as ThemeMode)">
                                <a-menu-item v-for="item in themeSegmentOptions" :key="item.value">
                                    {{ item.label }}
                                </a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>

                    <!-- GitHub -->
                    <a-button type="text" class="btn-icon" aria-label="github" :title="t('viewer.links.github')"
                        @click="openGithub">
                        <GithubOutlined />
                    </a-button>

                    <!-- 设置 -->
                    <a-button type="text" class="btn-icon" aria-label="settings" :title="t('viewer.settings')"
                        @click="emit('open-settings')">
                        <SettingOutlined />
                    </a-button>
                </template>

                <!-- ===== 移动端 ===== -->
                <template v-else>
                    <a-button type="text" class="btn-icon" aria-label="menu" title="Menu" @click="mobileOpen = true">
                        <MenuOutlined />
                    </a-button>
                </template>
            </div>
        </div>

        <!-- ===== 移动端 Drawer ===== -->
        <a-drawer placement="top" height="auto" :open="mobileOpen" :closable="false" @close="closeDrawer">
            <a-collapse accordion ghost v-model:activeKey="activeKey">
                <!-- 语言 -->
                <a-collapse-panel key="locale">
                    <template #header>
                        <span class="collapse-header">
                            {{ t("viewer.locale.title") }}
                            <span class="collapse-value">
                                {{ currentLocaleItem?.label }}
                            </span>
                        </span>
                    </template>

                    <a-radio-group v-model:value="curLocaleProxy" @change="closeDrawer" class="lang_radio_group">
                        <a-radio v-for="item in localeItems" :key="item.key" :value="item.key" class="lang-radio-item">
                            {{ item.label }}
                        </a-radio>
                    </a-radio-group>
                </a-collapse-panel>

                <!-- 主题 -->
                <a-collapse-panel key="theme">
                    <template #header>
                        <span class="collapse-header">
                            {{ t("viewer.theme.title") }}
                            <span class="collapse-value">
                                {{ t(`viewer.theme.mode.${themeMode}`) }}
                            </span>
                        </span>
                    </template>

                    <a-segmented block v-model:value="themeModeProxy" :options="themeSegmentOptions"
                        class="theme_segmented" @change="onSelectThemeMode(themeModeProxy)" />
                </a-collapse-panel>
            </a-collapse>

            <a-space direction="vertical" style="width: 100%">
                <a-typography-text class="plain-click" @click="openGithub">
                    <GithubOutlined />
                    <span style="margin-left: 8px">GitHub</span>
                </a-typography-text>

                <a-typography-text class="plain-click" @click="openSettings">
                    <SettingOutlined />
                    <span style="margin-left: 8px">
                        {{ t("viewer.settings") }}
                    </span>
                </a-typography-text>
            </a-space>
        </a-drawer>
    </div>
</template>

<script setup lang="ts">
import type { MenuInfo } from "ant-design-vue/es/menu/src/interface";

import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    HomeOutlined,
    GlobalOutlined,
    BgColorsOutlined,
    SettingOutlined,
    MenuOutlined,
    GithubOutlined,
} from "@ant-design/icons-vue";
import { Grid } from "ant-design-vue";

import {
    SUPPORT_LOCALES,
    getLocaleSelfName,
    setLocale,
    type SupportLocale,
} from "../../i18n";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../theme/mode";
import { APP_DISPLAY_NAME, APP_GITHUB_URL } from "../../lib/appMeta";

const props = withDefaults(
    defineProps<{
        canGoHome?: boolean;
    }>(),
    {
        canGoHome: false,
    }
);

const emit = defineEmits<{
    (e: "open-settings"): void;
    (e: "go-home"): void;
}>();

const { t, locale } = useI18n();

/* ===== 响应式断点 ===== */
const { useBreakpoint } = Grid;
const screens = useBreakpoint();
const isMobile = computed(() => screens.value.lg === false);

/* ===== Drawer 状态 ===== */
const mobileOpen = ref(false);
const activeKey = ref<string | undefined>(undefined);

/* ===== locale（关键：绑定到 vue-i18n 的响应式 locale）===== */
const curLocaleProxy = computed<SupportLocale>({
    get: () => locale.value as SupportLocale,
    set: (v) => {
        setLocale(v); // 你的封装：通常会更新 i18n.locale + 本地存储
    },
});

const localeItems = computed(() =>
    SUPPORT_LOCALES.map((loc) => ({
        key: loc,
        label: getLocaleSelfName(loc),
    }))
);

const currentLocaleItem = computed(() =>
    localeItems.value.find((i) => i.key === curLocaleProxy.value)
);

/* ===== theme ===== */
const themeMode = computed(() => getThemeMode());
const themeModeProxy = ref<ThemeMode>(themeMode.value);

const themeSegmentOptions = computed(() => [
    { label: t("viewer.theme.mode.system"), value: "system" },
    { label: t("viewer.theme.mode.light"), value: "light" },
    { label: t("viewer.theme.mode.dark"), value: "dark" },
]);

/* ===== 行为 ===== */
function closeDrawer() {
    mobileOpen.value = false;
    activeKey.value = undefined;
}

function openSettings() {
    emit("open-settings");
    closeDrawer();
}

function openGithub() {
    window.open(APP_GITHUB_URL, "_blank", "noopener");
    closeDrawer();
}

function onSelectLocale(key: string) {
    curLocaleProxy.value = key as SupportLocale;
    closeDrawer();
}

function onSelectThemeMode(key: string) {
    setThemeMode(key as ThemeMode);
    closeDrawer();
}

function onClickBrand(): void {
    if (!props.canGoHome) return;
    emit("go-home");
}
</script>

<style scoped>
.tophear-overlay {
    position: absolute;
    inset: 0 0 auto 0;
    z-index: 50;
    pointer-events: none;
    padding: 12px;
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

.collapse-header {
    display: flex;
    justify-content: space-between;
    width: 100%;
}

.collapse-value {
    opacity: 0.6;
    font-size: 12px;
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

.theme_segmented {
    margin-left: 24px;
    margin-top: -8px;
    margin-bottom: 8px;
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
</style>
