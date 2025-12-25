import { createI18n } from "vue-i18n";
import type { LocaleMessages, VueMessageType } from "vue-i18n";
type MessageSchema = LocaleMessages<VueMessageType>;

/**
 * 明确支持的 locale（新增语言就在这里加）
 */
export const SUPPORT_LOCALES = ["system", "zh-CN", "en-US"] as const;
function getBrowserLocale(): SupportLocale {
  const lang =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    "en";

  if (lang.toLowerCase().startsWith("zh")) return "zh-CN";
  if (lang.toLowerCase().startsWith("en")) return "en-US";
  return "en-US";
}

export type SupportLocale = (typeof SUPPORT_LOCALES)[number];

/**
 * 自动加载 ./locales 下所有 json（Vite）
 * 文件名即 locale key：例如 zh-CN.json -> "zh-CN"
 */
const modules = import.meta.glob("./locales/*.json", { eager: true }) as Record<
  string,
  { default: MessageSchema }
>;

/**
 * 只从 modules 中取出 SUPPORT_LOCALES 里声明的语言，保证 messages 类型稳定
 */
const messages = SUPPORT_LOCALES.reduce((acc, loc) => {
  const path = `./locales/${loc}.json`;
  const mod = modules[path];
  acc[loc] = (mod?.default ?? {}) as MessageSchema;
  return acc;
}, {} as Record<SupportLocale, MessageSchema>);

/** system → 实际 locale */
function resolveLocale(loc: SupportLocale): SupportLocale {
  return loc === "system" ? getBrowserLocale() : loc;
}

const userLocale = getLocale();

export const i18n = createI18n({
  legacy: false as const,
  globalInjection: true,
  locale: resolveLocale(userLocale),
  fallbackLocale: "en-US",
  messages,
});

/**
 * 从“该语言自己的 messages”里取 selfName
 */
export function getLocaleSelfName(loc: SupportLocale): string {
  // 关键：显式依赖当前 UI 语言，保证响应式
  if (loc === "system") {
    return t("viewer.locale.system");
  }

  const msg = i18n.global.getLocaleMessage(loc) as any;
  const name = msg?.locale?.selfName;
  return typeof name === "string" && name.trim() ? name : loc;
}

export function setLocale(next: SupportLocale): void {
  localStorage.setItem("locale", next);

  i18n.global.locale.value = resolveLocale(next);
}

export function getLocale(): SupportLocale {
  return (localStorage.getItem("locale") as SupportLocale) ?? "system";
}

/**
 * 在非 Vue 组件环境中使用 i18n。
 *
 * Use i18n outside Vue components.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const out = i18n.global.t(key, params as any);
  return typeof out === "string" ? out : String(out);
}
