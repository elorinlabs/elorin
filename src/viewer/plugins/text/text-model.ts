import { useSyncExternalStore } from "react";
import type { ViewerContext } from "../../core/types";
import { TEXT_CONFIG, textSizeClass } from "./text-config";
import { detectTextProfile, type TextProfile } from "./text-profile";
import { SOURCE_BUDGET, type SourceAnalysis } from './source-analysis';
import {
  indexText,
  normalizedEncoding,
  readTextLines,
  searchText,
  type TextStats,
  type TextLineData,
  type SearchOptions,
  type SearchBatch,
} from "./text-engine";
export class TextDocumentModel {
  profile: TextProfile;
  language?: string;
  readonly sizeClass: ReturnType<typeof textSizeClass>;
  stats: TextStats = {
    lines: 1,
    characters: 0,
    longestLine: 0,
    blank: 0,
    endings: { LF: 0, CRLF: 0, CR: 0 },
    processed: 0,
    malformed: false,
    checkpoints: [],
    complete: false,
  };
  checkpoints: number[] = [];
  status: "indexing" | "complete" | "cancelled" | "error" = "indexing";
  diagnostics: string[] = [];
  preview: TextLineData[] = [];
  logLevels: Record<string, number> = {};
  timestamps = false;
  analysis?: SourceAnalysis;
  analysisStatus = 'Plain source · analysis pending';
  private analysisTask?: AbortController;
  private active = true;
  private indexCancelledByUser = false;
  private listeners = new Set<() => void>();
  private version = 0;
  private tasks = new Set<AbortController>();
  private workerStops = new Set<() => void>();
  private disposed = false;
  private indexing?: AbortController;
  private longLines: { number: number; offset: number; end: number }[] = [];
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  changed() {
    if (!this.disposed) {
      this.version++;
      this.listeners.forEach((fn) => fn());
    }
  }
  constructor(
    readonly context: ViewerContext,
    readonly size: number,
    readonly encoding: string,
    sample: string,
  ) {
    const detected = detectTextProfile(context.file, sample);
    this.profile = detected.profile;
    this.language = detected.language;
    this.sizeClass = textSizeClass(size);
    if (this.profile === "Log") {
      for (const match of sample.matchAll(
        /\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b/g,
      ))
        this.logLevels[match[1]] = (this.logLevels[match[1]] ?? 0) + 1;
      this.timestamps = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(sample);
    }
  }
  get highlightStrategy() {
    return this.analysis?.tokens.length ? 'Bounded document · multiline state preserved' : 'Plain source · document analysis unavailable';
  }
  setLanguage(language?: string) { this.language=language; this.analysis=undefined; this.analysisTask?.abort(); this.changed(); if(this.active) void this.analyze(); }
  setActive(active: boolean) {
    if(this.active===active || this.disposed)return;this.active=active;
    if(!active){this.indexing?.abort();this.analysisTask?.abort();this.workerStops.forEach(stop=>stop());this.analysis=undefined;this.analysisStatus='Paused · plain source';this.changed();}
    else {if(!this.stats.complete && !this.indexCancelledByUser){this.checkpoints=[];this.longLines=[];this.startIndex();}void this.analyze();}
  }
  async analyze() {
    this.analysisTask?.abort();this.analysis=undefined;
    if(!this.active || this.disposed)return;
    if(!this.language || this.size>SOURCE_BUDGET.bytes || typeof Worker==='undefined'){this.analysisStatus='Plain source · parser/highlighting unavailable or file exceeds 512 KiB budget';this.changed();return;}
    const task=this.analysisTask=new AbortController();
    this.analysisStatus='Analyzing bounded source…';this.changed();
    try {
      const bytes=await this.context.source.readRange(0,this.size);
      if(task.signal.aborted || this.disposed)return;
      const text=new TextDecoder(normalizedEncoding(this.encoding),{fatal:true}).decode(bytes);
      const value=await new Promise<SourceAnalysis>((resolve,reject)=>{
        const worker=new Worker(new URL('./source.worker.ts',import.meta.url),{type:'module'});
        let done=false;
        const finish=(error?:Error,value?:SourceAnalysis)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();this.workerStops.delete(abort);task.signal.removeEventListener('abort',abort);error?reject(error):resolve(value!);};
        const abort=()=>finish(new DOMException('Cancelled','AbortError'));
        const timer=setTimeout(()=>finish(Error('Source analysis timed out; plain source retained')),SOURCE_BUDGET.timeout);
        this.workerStops.add(abort);task.signal.addEventListener('abort',abort,{once:true});
        worker.onerror=()=>finish(Error('Source analysis worker failed'));
        worker.onmessage=({data})=>data.error?finish(Error(data.error)):finish(undefined,data.value);
        worker.postMessage({text,language:this.language,filename:this.context.file.name});
      });
      if(task.signal.aborted || this.disposed)return;
      this.analysis=value;this.analysisStatus=value.diagnostic ?? (value.parser ?? 'Syntax highlighting · no symbol/config parser for this language');this.changed();
    } catch(error){if(!task.signal.aborted && !this.disposed){this.analysisStatus=(error as Error).message;this.changed();}}
  }
  get lineEndings() {
    const names = Object.entries(this.stats.endings)
      .filter(([, n]) => n > 0)
      .map(([name]) => name);
    return names.length > 1 ? "Mixed" : (names[0] ?? "None");
  }
  async run<T>(
    kind: "index" | "search" | "lines",
    data: Record<string, unknown>,
    signal: AbortSignal,
    progress?: (value: any) => void,
  ): Promise<T> {
    if (this.disposed || signal.aborted)
      throw new DOMException("Cancelled", "AbortError");
    const common = { kind, size: this.size, encoding: this.encoding, ...data };
    const read = async (offset: number, length: number) => {
      if (signal.aborted || this.disposed)
        throw new DOMException("Cancelled", "AbortError");
      const bytes = await this.context.source.readRange(offset, length);
      if (signal.aborted || this.disposed)
        throw new DOMException("Cancelled", "AbortError");
      return bytes;
    };
    if (typeof Worker === "undefined") {
      if (
        this.size > TEXT_CONFIG.smallBytes ||
        (kind === "search" && (data.options as SearchOptions).regex)
      )
        throw new Error(
          "Background workers are required for large files and regex search.",
        );
      if (kind === "index") {
        await indexText(read, this.size, this.encoding, progress!);
        return undefined as T;
      }
      if (kind === "search") {
        await searchText(
          read,
          this.size,
          this.encoding,
          data.options as SearchOptions,
          progress!,
        );
        return undefined as T;
      }
      return (await readTextLines(
        read,
        this.size,
        this.encoding,
        data.offset as number,
        data.baseLine as number,
        data.first as number,
        data.count as number,
        true,
      )) as T;
    }
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(new URL("./text.worker.ts", import.meta.url), {
        type: "module",
      });
      let timer: ReturnType<typeof setTimeout>,
        done = false;
      const finish = (error?: Error, value?: T) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        this.workerStops.delete(abort);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve(value as T);
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      this.workerStops.add(abort);
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            finish(
              new Error(
                "Background operation timed out. Try a simpler search pattern.",
              ),
            ),
          TEXT_CONFIG.workerTimeoutMs,
        );
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () =>
        finish(new Error("The background text worker failed."));
      worker.onmessage = async ({ data: message }) => {
        if (done) return;
        if (message.kind === "read") {
          // Disk reads can take longer than a compute budget; timeout starts after delivery.
          clearTimeout(timer);
          try {
            const bytes = await read(message.offset, message.length);
            if (!done) {
              worker.postMessage({ kind: "bytes", id: message.id, bytes }, [
                bytes.buffer,
              ]);
              arm();
            }
          } catch (error) {
            finish(error as Error);
          }
        } else if (message.kind === "progress") {
          progress?.(message.value);
          arm();
        } else if (message.kind === "error") finish(new Error(message.error));
        else if (message.kind === "result") finish(undefined, message.value);
      };
      worker.postMessage(common);
      arm();
    });
  }
  startIndex() {
    if (this.disposed || !this.active || (this.indexing && !this.indexing.signal.aborted)) return;
    const task = (this.indexing = new AbortController());
    this.tasks.add(task);
    this.status = "indexing";
    void this.run("index", {}, task.signal, (stats: TextStats) => {
      if(task.signal.aborted || this.indexing!==task)return;
      this.checkpoints.push(...stats.checkpoints);
      this.longLines.push(...(stats.longLines ?? []));
      this.stats = { ...stats, checkpoints: [], longLines: [] };
      if (stats.complete) this.status = "complete";
      if(stats.limited){this.status='cancelled';this.indexCancelledByUser=true;this.diagnostics.push('Line index memory budget reached; totals describe the indexed prefix only. Full-file search remains available.');}
      this.changed();
    })
      .catch((error) => {
        if (this.disposed || this.indexing!==task) return;
        this.status = task.signal.aborted ? "cancelled" : "error";
        if (!task.signal.aborted) this.diagnostics.push(error.message);
        this.changed();
      })
      .finally(() => this.tasks.delete(task));
  }
  cancelIndex() {
    this.indexCancelledByUser = true;
    this.indexing?.abort();
  }
  async lines(first: number, count: number, signal: AbortSignal) {
    if (signal.aborted || this.disposed)
      throw new DOMException("Cancelled", "AbortError");
    const known = this.longLines.find((line) => line.number === first);
    if (known) {
      const bytes = await this.context.source.readRange(
        known.offset,
        Math.min(TEXT_CONFIG.previewChars * 4, known.end - known.offset),
      );
      const text = new TextDecoder(normalizedEncoding(this.encoding), {
        ignoreBOM: true,
      })
        .decode(bytes, { stream: true })
        .slice(0, TEXT_CONFIG.previewChars);
      const following: TextLineData[] =
        count > 1 && first < this.stats.lines
          ? await this.lines(first + 1, count - 1, signal)
          : [];
      return [{ ...known, text, truncated: true }, ...following];
    }
    const index = Math.min(
      Math.floor((first - 1) / TEXT_CONFIG.checkpointLines),
      this.checkpoints.length - 1,
    );
    let offset = this.checkpoints[Math.max(0, index)] ?? 0,
      baseLine = Math.max(0, index) * TEXT_CONFIG.checkpointLines + 1;
    const preceding = this.longLines
      .filter((line) => line.number >= baseLine && line.number < first)
      .at(-1);
    if (preceding) {
      const stride = normalizedEncoding(this.encoding).startsWith("utf-16")
        ? 2
        : 1;
      const ending = new TextDecoder(normalizedEncoding(this.encoding)).decode(
        await this.context.source.readRange(preceding.end, stride * 2),
      );
      offset =
        preceding.end + (ending.startsWith("\r\n") ? stride * 2 : stride);
      baseLine = preceding.number + 1;
    }
    const result = await this.run<TextLineData[]>(
      "lines",
      { offset, baseLine, first, count },
      signal,
    );
    for (const line of result) {
      const exact = this.longLines.find(
        (known) => known.number === line.number,
      );
      if (exact) {
        line.end = exact.end;
        line.endUnknown = false;
      }
    }
    return result;
  }
  search(
    options: SearchOptions,
    signal: AbortSignal,
    emit: (batch: SearchBatch) => void,
  ) {
    return this.run<void>("search", { options }, signal, emit);
  }
  async linePage(line: TextLineData, page: number) {
    const offset = line.offset + page * TEXT_CONFIG.linePageBytes,
      length = Math.max(
        0,
        Math.min(TEXT_CONFIG.linePageBytes, line.end - offset),
      );
    const encoding = normalizedEncoding(this.encoding);
    const extra =
      encoding === "utf-8" ? 3 : encoding.startsWith("utf-16") ? 2 : 0;
    const bytes = await this.context.source.readRange(
      offset,
      Math.min(length + extra, line.end - offset),
    );
    // Pages have a small overlap for UTF-8 boundary alignment.
    let start = 0;
    if (encoding === "utf-8" && page)
      while (start < 4 && (bytes[start] & 192) === 128) start++;
    let end = length;
    if (encoding === "utf-8")
      while (end < bytes.length && (bytes[end] & 192) === 128) end++;
    if (encoding.startsWith("utf-16")) {
      const little = encoding === "utf-16le",
        unit = (at: number) =>
          little
            ? bytes[at] | (bytes[at + 1] << 8)
            : (bytes[at] << 8) | bytes[at + 1];
      if (page && unit(0) >= 0xdc00 && unit(0) <= 0xdfff) start = 2;
      if (unit(end - 2) >= 0xd800 && unit(end - 2) <= 0xdbff)
        end = Math.min(bytes.length, end + 2);
    }
    return new TextDecoder(encoding, { ignoreBOM: true }).decode(
      bytes.subarray(start, end),
    );
  }
  async copyLine(line: TextLineData) {
    if (line.endUnknown)
      throw new Error(
        "Wait for indexing to finish before copying this very long line.",
      );
    if (line.end - line.offset > TEXT_CONFIG.copyBytes)
      throw new Error(
        "Copy line is limited to 1 MiB. Select a preview page to copy part of this line.",
      );
    const bytes = await this.context.source.readRange(
      line.offset,
      line.end - line.offset,
    );
    const {writeClipboard}=await import('../../../document/clipboard');
    await writeClipboard(
      new TextDecoder(normalizedEncoding(this.encoding), {
        ignoreBOM: true,
      }).decode(bytes),
    );
  }
  dispose() {
    this.disposed = true;
    this.workerStops.forEach((stop) => stop());
    this.workerStops.clear();
    this.tasks.forEach((task) => task.abort());
    this.tasks.clear();
    this.analysisTask?.abort();this.analysis=undefined;this.preview=[];this.checkpoints=[];this.longLines=[];
    this.listeners.clear();
  }
  async copyLines(first:TextLineData,last:TextLineData) {
    const start=Math.min(first.offset,last.offset),end=Math.max(first.end,last.end);
    if(first.endUnknown || last.endUnknown || end-start>TEXT_CONFIG.copyBytes)throw Error('Copy selection requires known offsets and is limited to 1 MiB.');
    const bytes=await this.context.source.readRange(start,end-start);
    const {writeClipboard}=await import('../../../document/clipboard');
    await writeClipboard(new TextDecoder(normalizedEncoding(this.encoding),{ignoreBOM:true}).decode(bytes));
  }
}
export function useTextModel(model: TextDocumentModel) {
  useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
}
export async function loadText(context: ViewerContext) {
  if (!context.file.isText || context.file.isBinary)
    throw new Error("Binary content cannot be displayed as text.");
  const size = await context.source.getSize(),
    encoding = context.file.encoding ?? "utf-8";
  const sample = await context.source.readText({
    encoding,
    maxBytes: Math.min(size, 16 * 1024),
  });
  const model = new TextDocumentModel(context, size, encoding, sample);
  context.onCleanup(() => model.dispose());
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
    model.dispose();
  };
  context.signal.addEventListener("abort", abort, { once: true });
  context.onCleanup(() => {
    controller.abort();
    context.signal.removeEventListener("abort", abort);
  });
  model.preview = await model.lines(
    1,
    TEXT_CONFIG.viewportRows + TEXT_CONFIG.overscan,
    controller.signal,
  );
  model.startIndex();
  void model.analyze();
  return model;
}
