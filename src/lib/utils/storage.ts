/**
 * Load a numeric value from localStorage with a fallback.
 * 从 localStorage 读取数值，失败则回退到默认值。
 */
export function loadNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Save a numeric value to localStorage.
 * 将数值保存到 localStorage。
 */
export function saveNumber(key: string, value: number): void {
  localStorage.setItem(key, String(value));
}
