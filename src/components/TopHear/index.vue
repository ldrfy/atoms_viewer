<template>
    <div class="tophear-overlay">
        <div class="tophear-inner">
            <div class="top-right-bar">
                <a-dropdown trigger="click" placement="bottomLeft">
                    <a-button type="text" class="top-btn" aria-label="language">
                        <GlobalOutlined />
                    </a-button>

                    <template #overlay>
                        <a-menu :selectedKeys="[curLocale]"
                            @click="(e: { key: string | number }) => onSelectLocale(String(e.key))">
                            <a-menu-item disabled key="__current">
                                {{ t("viewer.locale.current") }}：{{ getLocaleSelfName(curLocale) }}
                            </a-menu-item>
                            <a-menu-divider />
                            <a-menu-item v-for="item in localeItems" :key="item.key">
                                {{ item.label }}
                            </a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-dropdown trigger="click" placement="bottomLeft">
                    <a-button type="text" class="top-btn" aria-label="theme">
                        <BgColorsOutlined />
                    </a-button>

                    <template #overlay>
                        <a-menu :selectedKeys="[themeMode]"
                            @click="(e: { key: string | number }) => onSelectThemeMode(String(e.key))">
                            <a-menu-item disabled key="__current_theme">
                                {{ t("viewer.theme.current") }}：{{ t(`viewer.theme.mode.${themeMode}`) }}
                            </a-menu-item>
                            <a-menu-divider />
                            <a-menu-item key="system">
                                <template #icon>
                                    <DesktopOutlined />
                                </template>
                                {{ t("viewer.theme.mode.system") }}
                            </a-menu-item>
                            <a-menu-item key="light">
                                <template #icon>
                                    <BulbOutlined />
                                </template>
                                {{ t("viewer.theme.mode.light") }}
                            </a-menu-item>
                            <a-menu-item key="dark">
                                <template #icon>
                                    <BulbFilled />
                                </template>
                                {{ t("viewer.theme.mode.dark") }}
                            </a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>

                <a-tooltip :title="t('viewer.links.github')">
                    <a-button type="text" class="top-btn" aria-label="github" @click="openGithub">
                        <GithubOutlined />
                    </a-button>
                </a-tooltip>

                <a-button type="text" class="top-btn" aria-label="settings" @click="emit('open-settings')">
                    <SettingOutlined />
                </a-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    GlobalOutlined,
    GithubOutlined,
    BgColorsOutlined,
    DesktopOutlined,
    BulbOutlined,
    BulbFilled,
    SettingOutlined,
} from "@ant-design/icons-vue";
import { i18n, SUPPORT_LOCALES, getLocaleSelfName, setLocale } from "../../i18n";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../theme/mode";

const emit = defineEmits<{
    (e: "open-settings"): void;
}>();

const { t } = useI18n();

const curLocale = computed(() => i18n.global.locale.value as any);
const themeMode = computed(() => getThemeMode());

const localeItems = computed(() =>
    SUPPORT_LOCALES.map((loc) => ({
        key: loc,
        label: getLocaleSelfName(loc),
    }))
);

function onSelectThemeMode(key: string): void {
    setThemeMode(key as ThemeMode);
}

function onSelectLocale(key: string): void {
    setLocale(key as any);
}

const GITHUB_URL = "https://github.com/ldrfy/atoms_viewer";
function openGithub(): void {
    window.open(GITHUB_URL, "_blank", "noopener,noreferrer");
}
</script>

<style scoped>
/* 覆盖层：不占位，透明；空白穿透给画布 */
.tophear-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: transparent !important;
    pointer-events: none;
    padding: 8px;
}

/* 一行布局；这里只放右侧 */
.tophear-inner {
    display: flex;
    justify-content: flex-end;
    align-items: center;
}

/* 右侧可点击 */
.top-right-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
}

/* 图标按钮略放大（不改 Ant 响应式体系） */
.top-btn {
    font-size: 16px;
}
</style>
