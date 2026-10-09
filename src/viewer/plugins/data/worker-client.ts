import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import { DATA_LIMITS as L } from "./config";
import { ScientificSession } from './scientific-session';
import { scientificError } from './errors';
let liveDataWorkers = 0;
export class DataWorkerClient {
  private worker: Worker;
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private closed = false;
  readonly source: ScientificSession;
  private queue = Promise.resolve();
  private queued = 0;
  constructor(private context: ViewerContext) {
    if (liveDataWorkers >= 2) throw Error('ResourceLimit: at most two scientific parsing workers');
    this.worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' });
    liveDataWorkers++;
    this.source = new ScientificSession(context);
    context.onCleanup(() => this.close());
    this.worker.onmessage = async ({ data }) => {
      if (data.sliceGate !== undefined) {
        try { await this.source.validate(data.shape, data.request); if (!this.closed) this.worker.postMessage({ sliceGate: data.sliceGate }); }
        catch (e) { if (!this.closed) this.worker.postMessage({ sliceGate: data.sliceGate, error: String(e) }); }
        return;
      }
      if (data.range !== undefined) {
        try {
          const { offset, length } = data;
          if (
            !Number.isSafeInteger(offset) ||
            !Number.isSafeInteger(length) ||
            offset < 0 ||
            length < 0 ||
            length > L.chunkBytes
          )
            throw Error("Safety limit reached: range");
          checkAbort(context.signal);
          const result = new Uint8Array(length);
          for (let at = 0; at < length; at += 1024 * 1024) {
            if (this.closed) throw Error('Cancelled');
            const n = Math.min(1024 * 1024, length - at);
            const b = await this.source.read(offset + at, n);
            checkAbort(context.signal);
            if (b.length !== n) throw Error("Truncated data range");
            result.set(b, at);
          }
          if (!this.closed)
            this.worker.postMessage(
              { range: data.range, buffer: result.buffer },
              [result.buffer],
            );
        } catch (e) {
          if (!this.closed)
            this.worker.postMessage({ range: data.range, error: scientificError(e) });
        }
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      clearTimeout(p.timer);
      data.error ? p.reject(Error(data.error)) : p.resolve(data.value);
    };
    this.worker.onerror = (e) => this.close(Error(e.message));
  }
  call<T>(operation: string, args: unknown = {}): Promise<T> {
    if (this.closed) return Promise.reject(Error("Cancelled"));
    if (this.queued >= 3) return Promise.reject(Error('Cancelled: stale scientific request queue'));
    this.queued++;
    const id = ++this.serial;
    const task = this.queue.then(async () => {
      if (this.closed) throw Error('Cancelled');
      const requestId = `${this.source.id}:${id}`;
      await this.source.begin(requestId);
      try { return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => this.close(Error("Safety limit reached: operation timeout")),
        L.timeoutMs,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, operation, args });
      }); } finally { await this.source.finish(requestId); }
    });
    this.queue = task.then(() => {}, () => {});
    return task.finally(() => { this.queued--; });
  }
  close(error = Error("Cancelled")) {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    liveDataWorkers--;
    this.source.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
}
