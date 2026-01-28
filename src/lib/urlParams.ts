export function readUrlListParam(name: string): string[] {
  if (typeof window === 'undefined') return [];
  const params = new URLSearchParams(window.location.search);
  const raw = params.getAll(name);
  if (raw.length === 0) return [];

  return raw
    .filter(Boolean)
    .flatMap(entry => entry.split(','))
    .map(part => part.trim())
    .filter(Boolean);
}

export function writeUrlListParam(name: string, urls: string[]): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const retained = Array.from(params.entries()).filter(([key]) => key !== name);

  const normalizeEntry = (entry: string): string => {
    let trimmed = entry.trim();
    if (!trimmed) return '';
    if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
      try {
        trimmed = decodeURIComponent(trimmed);
      }
      catch {}
    }
    return trimmed;
  };

  const nextValues = urls.map(normalizeEntry).filter(Boolean);

  const encodeQueryValue = (value: string): string =>
    encodeURI(value).replace(/[?#&=]/g, ch => encodeURIComponent(ch));

  const encodedEntries: string[] = [];
  for (const [key, value] of retained) {
    const encodedKey = encodeURIComponent(key);
    encodedEntries.push(`${encodedKey}=${encodeQueryValue(value)}`);
  }
  const encodedKey = encodeURIComponent(name);
  for (const value of nextValues) {
    encodedEntries.push(`${encodedKey}=${encodeQueryValue(value)}`);
  }

  const query = encodedEntries.join('&');

  const nextUrl = `${url.origin}${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

export function clearQueryParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const nextUrl = `${url.origin}${url.pathname}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}
