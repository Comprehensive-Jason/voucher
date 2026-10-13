// Per-device conveniences kept in the browser's storage. Storage can be
// missing or throw (private modes, cleared data), so every access is guarded
// and the app works without it.
export function remembered(key: string): string | null {
  try { return localStorage.getItem(`voucher:${key}`); } catch { return null; }
}

export function remember(key: string, value: string): void {
  try { localStorage.setItem(`voucher:${key}`, value); } catch { /* nothing to do */ }
}
