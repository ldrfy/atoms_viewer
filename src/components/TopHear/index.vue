<template>
    <div class="tophear-overlay">
        <div class="tophear-inner">
            <div class="top-right-bar">
                <!-- ===== 桌面端 ===== -->
                <template v-if="!isMobile">
                    <!-- 语言 -->
                    <a-dropdown trigger="click" placement="bottomLeft">
                        <a-button type="text" class="top-btn" aria-label="language">
                            <GlobalOutlined />
                        </a-button>
                        <template #overlay>

                            <a-menu :selectedKeys="[curLocale]" @click="(e: MenuInfo) => onSelectLocale(String(e.key))">
                                <a-menu-item v-for="item in localeItems" :key="item.key">
                                    {{ item.label }}
                                </a-menu-item>
                            </a-menu>
                        </template>
                    </a-dropdown>

                    <!-- 主题 -->
                    <!-- 主题 -->
                    <a-dropdown trigger="click" placement="bottomLeft">
                        <a-button type="text" class="top-btn" aria-label="theme">
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
                    <a-button type="text" class="top-btn" aria-label="github" @click="openGithub">
                        <GithubOutlined />
                    </a-button>

                    <!-- 设置 -->
                    <a-button type="text" class="top-btn" aria-label="settings" @click="emit('open-settings')">
                        <SettingOutlined />
                    </a-button>
                </template>

                <!-- ===== 移动端 ===== -->
                <template v-else>
                    <a-button type="text" class="top-btn" aria-label="menu" @click="mobileOpen = true">
                        <MenuOutlined />
                    </a-button>
                </template>
            </div>
        </div>

        <!-- ===== 移动端 Drawer ===== -->
        <a-drawer placement="top" height="auto" :open="mobileOpen" :closable="false" @close="closeDrawer">
            <!-- 展开区：完全使用 Ant -->
            <a-collapse accordion ghost v-model:activeKey="activeKey">
                <!-- 语言 -->
                <a-collapse-panel key="locale">
                    <template #header>
                        <span class="collapse-header">
                            {{ t("viewer.locale.title") }}
                            <span class="collapse-value">
                                {{ getLocaleSelfName(curLocale) }}
                            </span>
                        </span>
                    </template>

                    <a-radio-group v-model:value="curLocaleProxy" @change="onSelectLocale(curLocaleProxy)"
                        class="lang_radio_group">
                        <a-radio v-for="item in localeItems" :key="item.key" :value="item.key" style="display: block; ">
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
                <a-button type="text" block @click="openGithub" style="justify-content: flex-start">
                    <GithubOutlined />
                    <span>GitHub</span>
                </a-button>

                <a-button type="text" block @click="openSettings" style="justify-content: flex-start">
                    <SettingOutlined />
                    <span>
                        {{ t("viewer.settings") }}
                    </span>
                </a-button>
            </a-space>
        </a-drawer>
    </div>
</template>

<script setup lang="ts">
import type { MenuInfo } from "ant-design-vue/es/menu/src/interface";

import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    GlobalOutlined,
    BgColorsOutlined,
    SettingOutlined,
    MenuOutlined,
    GithubOutlined,
} from "@ant-design/icons-vue";
import { Grid } from "ant-design-vue";

import {
    i18n,
    SUPPORT_LOCALES,
    getLocaleSelfName,
    setLocale,
} from "../../i18n";
import {
    getThemeMode,
    setThemeMode,
    type ThemeMode,
} from "../../theme/mode";
import { APP_GITHUB_URL } from "../../lib/appMeta";
import type { SupportLocale } from "../../i18n";

const emit = defineEmits<{
    (e: "open-settings"): void;
}>();

const { t } = useI18n();

/* ===== 响应式断点 ===== */
const { useBreakpoint } = Grid;
const screens = useBreakpoint();
const isMobile = computed(() => screens.value.lg === false);

/* ===== Drawer 状态 ===== */
const mobileOpen = ref(false);
const activeKey = ref<string | undefined>(undefined);

/* ===== locale ===== */
const curLocale = computed<SupportLocale>(
    () => i18n.global.locale.value as SupportLocale
);
const curLocaleProxy = ref(curLocale.value);

const localeItems = computed(() =>
    SUPPORT_LOCALES.map((loc) => ({
        key: loc,
        label: getLocaleSelfName(loc),
    }))
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
    setLocale(key as any);
    closeDrawer();
}

function onSelectThemeMode(key: string) {
    setThemeMode(key as ThemeMode);
    closeDrawer();
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
    justify-content: flex-end;
}

.top-right-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
}

.top-btn {
    font-size: 20px;
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

.theme_segmented {
    margin-left: 24px;
    margin-top: -8px;
    margin-bottom: 8px;
}
</style>
