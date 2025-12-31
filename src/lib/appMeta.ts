// src/appMeta.ts
import pkg from "../../package.json";

type AnyPkg = Record<string, any>;

const p = pkg as AnyPkg;

export const APP_DISPLAY_NAME: string = String(p.displayName);
export const APP_VERSION: string = String(p.version ?? "0.0.0");
export const APP_GITHUB_URL: string = String(p.urls?.github ?? "");
export const APP_SAMPLES_URL: string = String(p.urls?.samples ?? "");

// author 可能是 string 或 { name, email }
export const APP_AUTHOR: string = (() => {
  const a = p.author;
  if (!a) return "";
  if (typeof a === "string") return a;
  if (typeof a === "object" && a.name) return String(a.name);
  return "";
})();
