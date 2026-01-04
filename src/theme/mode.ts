import { computed, ref } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'themeMode';

function readStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

const mode = ref<ThemeMode>(readStoredMode());

// 系统是否偏好 dark
const media = window.matchMedia?.('(prefers-color-scheme: dark)');
const systemPrefersDark = ref<boolean>(media?.matches ?? false);

function onMediaChange(e: MediaQueryListEvent): void {
  systemPrefersDark.value = e.matches;
}

if (media?.addEventListener) {
  media.addEventListener('change', onMediaChange);
}

export const isDark = computed(() => {
  if (mode.value === 'dark') return true;
  if (mode.value === 'light') return false;
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
  root.dataset.theme = dark ? 'dark' : 'light';
}

// 设置背景时，主题要跟着改
export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const v
    = h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h;

  const n = parseInt(v, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return L < 0.5;
}
