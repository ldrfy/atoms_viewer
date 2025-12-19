import { createI18n } from "vue-i18n";

type LocaleMessages = Record<string, unknown>;

/**
 * 自动加载 ./locales 下所有 json（Vite）
 * 文件名即 locale key：例如 zh-CN.json -> "zh-CN"
 */
const modules = import.meta.glob("./locales/*.json", { eager: true }) as Record<
  string,
  { default: LocaleMessages }
>;

const messages = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const m = path.match(/\.\/locales\/(.*)\.json$/);
    const key = m?.[1] ?? path;
    return [key, mod.default];
  })
) as Record<string, LocaleMessages>;

export const SUPPORT_LOCALES = Object.keys(messages).sort() as const;
export type SupportLocale = (typeof SUPPORT_LOCALES)[number];

function normalizeLocale(input: string | null | undefined): SupportLocale {
  const v = (input ?? "").toLowerCase();
  if (v.startsWith("zh")) return "zh-CN" as SupportLocale;
  if (v.startsWith("en")) return "en-US" as SupportLocale;
  return "zh-CN" as SupportLocale;
}

const locale = normalizeLocale(
  localStorage.getItem("locale") || navigator.language
);

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale,
  fallbackLocale: "en-US",
  messages,
});

/**
 * 从“该语言自己的 messages”里取 selfName
 * - 这能保证菜单里总是显示：中文 / English / 日本語 ...（各语言自称）
 */
export function getLocaleSelfName(loc: SupportLocale): string {
  const msg = i18n.global.getLocaleMessage(loc) as any;
  const name = msg?.locale?.selfName;
  return typeof name === "string" && name.trim() ? name : loc;
}

export function setLocale(next: SupportLocale): void {
  i18n.global.locale.value = next;
  localStorage.setItem("locale", next);
}
