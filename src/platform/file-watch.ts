import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { physicalIdentity } from '../workspace/workspace';
type Entry = { path: string; callbacks: Set<(kind: string) => void>; timer?: ReturnType<typeof setTimeout>; registered: Promise<void> };
/** One reference-counted service owns native subscriptions and fallback checks. */
class FileWatchService {
  private entries = new Map<string, Entry>();
  private stop?: () => void;
  private starting?: Promise<void>;
  private start() { return this.starting ??= listen<{ paths: string[]; kind: string }>('elorin://file-change', ({ payload }) => { for (const [id, entry] of this.entries) if (!payload.paths.length || payload.paths.some(p => physicalIdentity(p) === id)) { clearTimeout(entry.timer); entry.timer = setTimeout(() => entry.callbacks.forEach(fn => fn(payload.kind)), 200); } }).then(stop => { this.stop = stop; if (!this.entries.size) { stop(); this.starting = undefined; } }); }
  subscribe(path: string, callback: (kind: string) => void) {
    if (!isTauri()) return () => {};
    const id = physicalIdentity(path); let entry = this.entries.get(id);
    if (!entry) { entry = { path, callbacks: new Set(), registered: Promise.resolve() }; this.entries.set(id, entry); entry.registered = this.start().then(() => invoke<void>('file_watch', { path, add: true })).catch(() => callback('Unavailable')); }
    entry.callbacks.add(callback); const owned = entry;
    return () => { owned.callbacks.delete(callback); if (!owned.callbacks.size && this.entries.get(id) === owned) { clearTimeout(owned.timer); this.entries.delete(id); void owned.registered.then(() => invoke('file_watch', { path: owned.path, add: false })).catch(() => {}); if (!this.entries.size) { this.stop?.(); this.stop = undefined; this.starting = undefined; } } };
  }
}
export const fileWatchService = new FileWatchService();
