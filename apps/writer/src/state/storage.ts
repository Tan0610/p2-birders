/**
 * Browser storage for conveniences only: the form draft, the chosen upload
 * route, and references of sightings this device filed. None of it is needed
 * to read the journal; the reader never sees it. Every access is guarded
 * because storage can be blocked (private windows, strict settings).
 */

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app keeps working, it just forgets on reload.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const KEYS = {
  draft: 'deccan-birders:draft:v1',
  route: 'deccan-birders:route:v1',
  filed: 'deccan-birders:filed:v1',
  pending: 'deccan-birders:pending:v1',
  lastIndex: 'deccan-birders:last-published-index:v1',
} as const;
