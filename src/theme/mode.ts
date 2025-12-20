import { computed, ref } from "vue";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "themeMode";

function readStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

const mode = ref<ThemeMode>(readStoredMode());

// 系统是否偏好 dark
const media = window.matchMedia?.("(prefers-color-scheme: dark)");
const systemPrefersDark = ref<boolean>(media?.matches ?? false);

function onMediaChange(e: MediaQueryListEvent): void {
  systemPrefersDark.value = e.matches;
}

if (media?.addEventListener) {
  media.addEventListener("change", onMediaChange);
} else if (media) {
  // 兼容旧浏览器
  // @ts-expect-error legacy API
  media.addListener(onMediaChange);
}

export const isDark = computed(() => {
  if (mode.value === "dark") return true;
  if (mode.value === "light") return false;
  return systemPrefersDark.value;
});

export function getThemeMode(): ThemeMode {
  return mode.value;
}

export function setThemeMode(next: ThemeMode): void {
  mode.value = next;
  localStorage.setItem(STORAGE_KEY, next);
}

/**
 * 把主题状态写入 DOM，方便你用 CSS 控制自定义样式（包括你左上角图标黑/白）
 */
export function applyThemeToDom(dark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
}
