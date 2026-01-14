export function readUrlListParam(name: string): string[] {
  if (typeof window === 'undefined') return [];
  const params = new URLSearchParams(window.location.search);
  const raw = params.getAll(name);
  if (raw.length === 0) return [];

  const urls: string[] = [];
  for (const entry of raw) {
    if (!entry) continue;
    for (const part of entry.split(',')) {
      const cleaned = part.trim();
      if (cleaned) urls.push(cleaned);
    }
  }

  return urls;
}

export function writeUrlListParam(name: string, urls: string[]): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  params.delete(name);

  let query = params.toString();
  for (const entry of urls) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const encoded = encodeURIComponent(trimmed)
      .replace(/%3A/gi, ':')
      .replace(/%2F/gi, '/');
    query += (query ? '&' : '') + `${name}=${encoded}`;
  }

  const nextUrl = `${url.origin}${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

export function clearQueryParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const nextUrl = `${url.origin}${url.pathname}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}
