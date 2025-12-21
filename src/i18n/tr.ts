// src/i18n/tr.ts
import { i18n } from "./index";

/**
 * 在非 Vue 组件环境中使用 i18n。
 *
 * Use i18n outside Vue components.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const out = i18n.global.t(key, params as any);
  return typeof out === "string" ? out : String(out);
}
