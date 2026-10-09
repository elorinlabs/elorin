import type { DataPage } from './types';
export function pageMemory(page: DataPage) {
  return 512 + page.values.reduce((n, row) => n + 64 + row.reduce((s, c) => s + 256 + 2 * (c.raw.length + c.display.length + JSON.stringify(c.details ?? '').length), 0), 0);
}
/** Global accounted budget. Each owner also enforces its independent page limit. */
export class CacheBudget {
  private entries = new Map<object, { bytes: number; evict: () => void }>();
  constructor(readonly limit = 32 * 1024 * 1024) {}
  get bytes() { return [...this.entries.values()].reduce((n, e) => n + e.bytes, 0); }
  add(key: object, bytes: number, evict: () => void) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.limit) throw Error('ResourceLimit: page cache budget');
    this.entries.delete(key);
    while (this.bytes + bytes > this.limit) {
      const oldest = this.entries.keys().next().value!;
      const entry = this.entries.get(oldest)!;
      this.entries.delete(oldest); entry.evict();
    }
    this.entries.set(key, { bytes, evict });
  }
  remove(key: object) { this.entries.delete(key); }
}
export const scientificCache = new CacheBudget();
