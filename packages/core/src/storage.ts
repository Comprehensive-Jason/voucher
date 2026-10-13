// Per-device conveniences kept in the browser's storage. Storage can be
// missing or throw (private modes, cleared data), so every access is guarded
// and the app works without it. Each app keeps its keys under its own
// prefix ("voucher:", say), so an app's saved keys never change name.
export function storage(app: string) {
  return {
    remembered(key: string): string | null {
      try { return localStorage.getItem(`${app}:${key}`); } catch { return null; }
    },
    remember(key: string, value: string): void {
      try { localStorage.setItem(`${app}:${key}`, value); } catch { /* nothing to do */ }
    },
  };
}
