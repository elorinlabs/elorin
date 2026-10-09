import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FileSource } from '../../../services/fileSource';
import { checkAbort } from '../../core/errors';
export const BLOCK_BYTES = 65536;
export const MAX_U64 = (1n << 64n) - 1n;
export const MAX_SELECTION = 65536;
export function decimal(value: string): bigint {
  if (!/^\d{1,20}$/.test(value)) throw Error('Use an unsigned decimal offset.');
  const n = BigInt(value); if (n > MAX_U64) throw Error('Offset exceeds u64.'); return n;
}
export function parseOffset(value: string): bigint {
  if (/^0x[\da-f]{1,16}$/i.test(value)) return BigInt(value);
  return decimal(value);
}
export function validRange(size: bigint, offset: bigint, length: number) {
  if (offset < 0n || offset > size || !Number.isSafeInteger(length) || length < 0 || length > 1048576 || offset + BigInt(length) > MAX_U64) throw Error('Invalid binary range.');
  return Number(BigInt(length) < size - offset ? BigInt(length) : size - offset);
}
export function ascii(byte: number) { return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·'; }
export function hex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '); }
export function searchPattern(text: string, mode: 'hex' | 'text') {
  if (!text.length || text.length > 12288) throw Error('Search needs 1–4096 bytes.');
  let bytes: Uint8Array;
  if (mode === 'hex') {
    if (!/^(?:[\da-f]{2}(?:\s+|$))+$/i.test(text.trim())) throw Error('Enter complete hex pairs, for example DE AD BE EF.');
    bytes = Uint8Array.from(text.trim().split(/\s+/), n => parseInt(n, 16));
  } else bytes = new TextEncoder().encode(text);
  if (!bytes.length || bytes.length > 4096) throw Error('Search needs 1–4096 bytes.');
  return bytes;
}
export type SearchResult = { status: 'need-range' | 'scanning' | 'done' | 'found'; cursor: string; offset?: string; readOffset?: string; readLength?: number };
export interface BinaryBackend {
  open(source: FileSource): Promise<{ id: string; size: string; remote: boolean }>;
  read(id: string, offset: string, length: number): Promise<Uint8Array>;
  close(id: string): Promise<void>;
  start(id: string, pattern: number[], start: string, previous: boolean): Promise<string>;
  step(id: string, token: string, bytes?: number[]): Promise<SearchResult>;
  cancel(id: string, token?: string): Promise<void>;
}
export const nativeBinaryBackend: BinaryBackend = {
  async open(source) {
    const locator = source.nativeResource ?? {};
    if (source.virtualIdentity) await source.getSize(); // Validate the borrowed VFS lease before native routing.
    const remoteSize = source.nativeResource ? undefined : source.getSize64 ? await source.getSize64() : safeSize(await source.getSize()).toString();
    return invoke('binary_open', { locator, remoteSize });
  },
  async read(id, offset, length) { return new Uint8Array(await invoke<ArrayBuffer>('binary_read', { id, offset, length })); },
  close: id => invoke('binary_close', { id }),
  start: (id, pattern, start, previous) => invoke('binary_search_start', { id, pattern, start, previous }),
  step: (id, token, bytes) => invoke('binary_search_step', { id, token, bytes }),
  cancel: (id, token) => invoke('binary_search_cancel', { id, token }),
};
function safeSize(size: number) { if (!Number.isSafeInteger(size) || size < 0) throw Error('Source needs the precise 64-bit range protocol.'); return BigInt(size); }
/** One adapter per Viewer; never owns or disposes the reusable parent/VFS source. */
export class BinaryModel {
  private selected = 0n;
  private selectionListeners = new Set<() => void>();
  selection = () => this.selected;
  subscribe = (listener: () => void) => { this.selectionListeners.add(listener); return () => { this.selectionListeners.delete(listener); }; };
  select(offset: bigint) { validRange(this.size, offset, 0); this.selected = offset; this.selectionListeners.forEach(fn => fn()); }
  private cache = new Map<bigint, Uint8Array>();
  private used = 0;
  private closed = false;
  private searchGeneration = 0;
  private searchToken?: string;
  private revision?: string;
  private activeReads = 0;
  private waiting?: { run(): void; reject(reason: unknown): void };
  private constructor(readonly source: FileSource, readonly size: bigint, readonly signal: AbortSignal, public budget: number, private backend?: BinaryBackend, private id?: string, private remote = true) {}
  static async open(source: FileSource, signal: AbortSignal, budget = 1048576, backend = isTauri() ? nativeBinaryBackend : undefined) {
    if (!Number.isSafeInteger(budget) || budget < BLOCK_BYTES || budget > 8 * 1048576) throw Error('Cache budget must be 64 KiB–8 MiB.');
    checkAbort(signal); const opened = backend ? await backend.open(source) : undefined;
    try {
      checkAbort(signal);
      const size = opened ? decimal(opened.size) : source.getSize64 ? decimal(await source.getSize64()) : safeSize(await source.getSize());
      const model = new BinaryModel(source, size, signal, budget, backend, opened?.id, opened?.remote);
      if ((!backend || opened?.remote) && source.getRevision) model.revision = await source.getRevision();
      checkAbort(signal); signal.addEventListener('abort', model.abort, { once: true }); return model;
    } catch (e) { if (opened) await backend!.close(opened.id); throw e; }
  }
  private abort = () => { this.dispose(); };
  private live(signal?: AbortSignal) { checkAbort(this.signal); checkAbort(signal); if (this.closed) throw Error('Binary source is closed.'); }
  get cacheBytes() { return this.used; }
  get canSearch() { return !!this.backend; }
  setBudget(budget: number) { if (!Number.isSafeInteger(budget) || budget < BLOCK_BYTES || budget > 8 * 1048576) throw Error('Invalid cache budget.'); this.clearCache(); this.budget = budget; }
  clearCache() { this.cache.clear(); this.used = 0; }
  private async sourceRead(offset: bigint, length: number) {
    if (this.backend && !this.remote) return this.backend.read(this.id!, offset.toString(), length);
    if (this.source.readRange64) return this.source.readRange64(offset.toString(), length);
    if (offset + BigInt(length) > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('This source only supports safe-integer offsets; precise range access is unavailable.');
    return this.source.readRange(Number(offset), length);
  }
  /** At most two transport reads and one replaceable waiting request. */
  private transport(offset: bigint, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const run = () => {
        try { this.live(signal); } catch (e) { reject(e); return; }
        this.activeReads++;
        void this.sourceRead(offset, length).then(b => { this.live(signal); resolve(b); }, reject).catch(reject).finally(() => { this.activeReads--; const waiting = this.waiting; this.waiting = undefined; waiting?.run(); });
      };
      if (this.activeReads < 2) run(); else { this.waiting?.reject(new DOMException('Superseded range', 'AbortError')); this.waiting = { run, reject }; }
    });
  }
  async read(offset: bigint, length: number, signal?: AbortSignal) {
    this.live(signal); length = validRange(this.size, offset, length);
    if (this.source.virtualIdentity) { await this.source.getSize(); this.live(signal); }
    if (this.backend && !this.remote) { await this.transport(offset, 0, signal); this.live(signal); }
    if (this.revision !== undefined && await this.source.getRevision!() !== this.revision) { this.clearCache(); throw Error('Source changed; reopen the file.'); }
    this.live(signal);
    const out = new Uint8Array(length);
    for (let done = 0; done < length;) {
      this.live(signal); const at = offset + BigInt(done), base = at / BigInt(BLOCK_BYTES) * BigInt(BLOCK_BYTES), inBlock = Number(at - base);
      let block = this.cache.get(base);
      if (block) { this.cache.delete(base); this.cache.set(base, block); }
      else {
        const n = Number(this.size - base < BigInt(BLOCK_BYTES) ? this.size - base : BigInt(BLOCK_BYTES));
        block = await this.transport(base, n, signal); this.live(signal);
        if (block.length !== n) throw Error('Source ended unexpectedly or became unavailable.');
        while (this.used + n > this.budget) { const oldest = this.cache.keys().next().value!; this.used -= this.cache.get(oldest)!.length; this.cache.delete(oldest); }
        // Simultaneous reads of the same block replace rather than double-account.
        const old = this.cache.get(base); if (old) this.used -= old.length;
        this.cache.set(base, block); this.used += n;
      }
      const n = Math.min(length - done, block.length - inBlock); out.set(block.subarray(inBlock, inBlock + n), done); done += n;
    }
    return out;
  }
  async search(pattern: Uint8Array, start: bigint, previous: boolean, signal: AbortSignal, progress: (cursor: bigint) => void) {
    this.live(signal); validRange(this.size, start, 0); if (!pattern.length || pattern.length > 4096) throw Error('Search needs 1–4096 bytes.');
    if (!this.backend) throw Error('Streaming search requires the Rust desktop backend. Browser mode is read-only preview.');
    const generation = ++this.searchGeneration;
    const token = await this.backend.start(this.id!, Array.from(pattern), start.toString(), previous);
    if (generation !== this.searchGeneration || signal.aborted || this.closed) { await this.backend.cancel(this.id!, token); checkAbort(signal); throw new DOMException('Search replaced', 'AbortError'); }
    this.searchToken = token;
    const cancel = () => { void this.backend!.cancel(this.id!, token); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        this.live(signal); if (generation !== this.searchGeneration) throw new DOMException('Search replaced', 'AbortError');
        let result = await this.backend.step(this.id!, token);
        if (result.status === 'need-range') {
          if (this.source.virtualIdentity) await this.source.getSize();
          if (this.revision !== undefined && await this.source.getRevision!() !== this.revision) throw Error('Source changed during search; reopen the file.');
          this.live(signal);
          if (result.readOffset === undefined || result.readLength === undefined) throw Error('Invalid search transport range.');
          const offset = decimal(result.readOffset), length = validRange(this.size, offset, result.readLength);
          if (length > BLOCK_BYTES + 4095) throw Error('Search transport exceeds its budget.');
          const bytes = await this.transport(offset, length, signal); this.live(signal);
          result = await this.backend.step(this.id!, token, Array.from(bytes));
        }
        this.live(signal); if (generation !== this.searchGeneration) throw new DOMException('Search replaced', 'AbortError');
        progress(decimal(result.cursor));
        if (result.status === 'found') return decimal(result.offset!);
        if (result.status === 'done') return undefined;
        // Cooperative throttle; no autonomous worker or resident scanner.
        await new Promise<void>(resolve => { const timer = setTimeout(done, 8); function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); } signal.addEventListener('abort', done, { once: true }); });
      }
    } finally { signal.removeEventListener('abort', cancel); await this.backend.cancel(this.id!, token); if (this.searchToken === token) this.searchToken = undefined; }
  }
  cancelSearch() { this.searchGeneration++; if (this.backend && this.id && this.searchToken) void this.backend.cancel(this.id, this.searchToken); }
  dispose() { if (this.closed) return; this.closed = true; this.signal.removeEventListener('abort', this.abort); this.cancelSearch(); this.waiting?.reject(new DOMException('Source closed', 'AbortError')); this.waiting = undefined; this.clearCache(); if (this.backend && this.id) void this.backend.close(this.id); }
}
