import type { ViewerContext } from "../../core/types";
import { ViewerError, checkAbort } from "../../core/errors";
import { CSV_CONFIG } from "./csv-config";
import { CsvChunkParser } from "./csv-parser";
import { TabularDocumentModel } from "./csv-model";
import type { CsvDialect } from "./csv-types";
type Batch = {
  rows: string[][];
  errors: string[];
  dialect: CsvDialect;
  preview: string;
  sourceTruncated?: boolean;
  error?: string;
};
export async function loadCsv(context: ViewerContext) {
  const size = await context.source.getSize(),
    revision = await context.source.getRevision?.();
  checkAbort(context.signal);
  const encoding = (context.file.encoding ?? "utf-8")
    .toLowerCase()
    .replace("bom", "")
    .replace(/\s/g, "");
  const model = new TabularDocumentModel(size, encoding),
    tab = context.file.detectedType === "tsv";
  let worker: Worker | undefined,
    pending:
      | { resolve: (batch: Batch) => void; reject: (e: unknown) => void }
      | undefined;
  // The synchronous fallback is only for small files / test environments without workers.
  if (typeof Worker !== "undefined") {
    worker = new Worker(new URL("./csv.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      const p = pending;
      pending = undefined;
      e.data.error
        ? p?.reject(new ViewerError("PARSE_FAILED", e.data.error))
        : p?.resolve(e.data);
    };
    worker.onerror = () => {
      pending?.reject(
        new ViewerError("PARSE_FAILED", "Background CSV parser failed."),
      );
      pending = undefined;
    };
  } else if (size > CSV_CONFIG.chunkBytes)
    throw new ViewerError(
      "UNSUPPORTED_CONTENT",
      "Background CSV parsing is unavailable. Open as Text instead.",
    );
  const stop = () => {
    worker?.terminate();
    pending?.reject(new DOMException("Cancelled", "AbortError"));
    pending = undefined;
  };
  context.onCleanup(stop);
  context.signal.addEventListener("abort", stop, { once: true });
  const parser = worker ? undefined : new CsvChunkParser(tab),
    decoder = worker ? undefined : new TextDecoder(encoding, { fatal: true });
  async function batch(offset: number) {
    checkAbort(context.signal);
    const bytes = await context.source.readRange(
        offset,
        Math.min(CSV_CONFIG.chunkBytes, size - offset),
      ),
      byteCount = bytes.length,
      final = offset + byteCount >= size;
    if (!bytes.length && offset < size)
      throw new ViewerError("PARSE_FAILED", "The file ended unexpectedly.");
    let result: Batch;
    if (worker)
      result = await new Promise((resolve, reject) => {
        pending = { resolve, reject };
        worker!.postMessage({ bytes, final, encoding, tab }, [bytes.buffer]);
      });
    else {
      const text = decoder!.decode(bytes, { stream: !final });
      result = { ...parser!.feed(text, final), preview: text };
    }
    checkAbort(context.signal);
    if (!model.rowSource.count) model.dialect = result.dialect;
    model.preview += result.preview.slice(
      0,
      Math.max(0, CSV_CONFIG.sourceChars - model.preview.length),
    );
    model.append(result.rows);
    result.errors.forEach((e) => model.warn(e));
    model.processedBytes = Math.min(offset + byteCount, size);
    model.sourceTruncated =
      model.processedBytes < size ||
      model.status === "limited" ||
      (result.sourceTruncated ?? size > CSV_CONFIG.sourceChars);
    if (final && model.status === "indexing") model.status = "complete";
    return final;
  }
  try {
    let offset = 0,
      final = false;
    // Load until at least one complete record is available (bounded long-record carry).
    do {
      final = await batch(offset);
      offset = model.processedBytes;
    } while (!final && !model.rowSource.count && model.status === "indexing");
    model.refreshStats(model.dialect.detectedHeader);
    if (!final && model.status === "indexing") {
      void (async () => {
        try {
          while (offset < size && model.status === "indexing") {
            await new Promise((r) => setTimeout(r, 0));
            final = await batch(offset);
            offset = model.processedBytes;
            model.publish();
          }
          if (
            revision !== undefined &&
            revision !== (await context.source.getRevision?.())
          )
            throw new Error("File changed while indexing; select it again.");
          model.refreshStats(
            model.headerOverride ?? model.dialect.detectedHeader,
          );
          model.publish();
        } catch (e) {
          if (!context.signal.aborted) {
            model.status = "error";
            model.warn(e instanceof Error ? e.message : String(e));
            model.publish();
          }
        } finally {
          stop();
          context.signal.removeEventListener("abort", stop);
        }
      })();
    } else {
      if (
        revision !== undefined &&
        revision !== (await context.source.getRevision?.())
      )
        throw new ViewerError(
          "UNSUPPORTED_CONTENT",
          "File changed while reading.",
        );
      stop();
      context.signal.removeEventListener("abort", stop);
    }
    return model;
  } catch (e) {
    stop();
    context.signal.removeEventListener("abort", stop);
    throw e;
  }
}
