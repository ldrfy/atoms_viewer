import { createI18n } from "vue-i18n";
import type { LocaleMessages, VueMessageType } from "vue-i18n";

type MessageSchema = LocaleMessages<VueMessageType>;

/**
 * 明确支持的 locale（新增语言就在这里加）
 */
export const SUPPORT_LOCALES = ["zh-CN", "en-US"] as const;
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

function normalizeLocale(input: string | null | undefined): SupportLocale {
  const v = (input ?? "").toLowerCase();
  if (v.startsWith("zh")) return "zh-CN";
  if (v.startsWith("en")) return "en-US";
  return "zh-CN";
}

const locale = normalizeLocale(
  localStorage.getItem("locale") ?? navigator.language
);

export const i18n = createI18n({
  legacy: false as const, // 关键：锁死为 composition 模式，避免 TS 推断成 legacy
  globalInjection: true,
  locale,
  fallbackLocale: "en-US",
  messages,
});

/**
 * 从“该语言自己的 messages”里取 selfName
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
