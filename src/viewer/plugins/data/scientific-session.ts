import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { ViewerContext } from '../../core/types';
import { checkAbort } from '../../core/errors';
import { validateSlice, type SliceRequest } from './slice';

/** Owns only its binary session; archive/FileSource ownership remains with the viewer. */
export class ScientificSession {
  private opened?: { id: string; size: string; remote: boolean };
  private opening?: Promise<void>;
  private closed = false;
  readonly id = crypto.randomUUID();
  constructor(private context: ViewerContext) { context.onCleanup(() => this.close()); }
  async open() {
    if (!this.opening) this.opening = (async () => {
      if (this.context.file.mode !== 'tauri') return;
      const source = this.context.source;
      const opened = await invoke<{ id: string; size: string; remote: boolean }>('scientific_open', {
        locator: source.nativeResource ?? {},
        remoteSize: source.nativeResource ? undefined : String(await source.getSize()),
      });
      if (this.closed || this.context.signal.aborted) {
        await invoke('scientific_close', { id: opened.id });
        throw Error('Cancelled');
      }
      this.opened = opened;
    })();
    await this.opening;
    this.check();
  }
  private check() { checkAbort(this.context.signal); if (this.closed) throw Error('Cancelled'); }
  async read(offset: number, length: number) {
    this.check();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > 1048576 || !Number.isSafeInteger(offset + length)) throw Error('INVALID_OFFSET');
    await this.open();
    const result = this.opened && !this.opened.remote
      ? new Uint8Array(await invoke<ArrayBuffer>('scientific_read', { id: this.opened.id, offset: String(offset), length }))
      : await this.context.source.readRange(offset, length);
    this.check();
    return result;
  }
  async url() {
    await this.open();
    return this.opened && !this.opened.remote ? convertFileSrc(this.opened.id, 'prism-science') : undefined;
  }
  async begin(requestId: string) {
    await this.open();
    if (this.opened) await invoke('scientific_begin', { id: this.opened.id, requestId, decodedBytes: '33554432' });
    this.check();
  }
  async finish(requestId: string) {
    if (this.opened) await invoke('scientific_finish', { id: this.opened.id, requestId });
  }
  async validate(shape: string[], request: SliceRequest) {
    validateSlice(shape, request);
    await this.open();
    if (this.opened) await invoke('scientific_validate_slice', { id: this.opened.id, shape, request });
    this.check();
  }
  close() {
    this.closed = true;
    if (this.opened) {
      const id = this.opened.id; this.opened = undefined;
      void invoke('scientific_close', { id }).catch(() => {});
    }
  }
}
