import type { ViewerContext } from "../../core/types";
import { ViewerError, checkAbort } from "../../core/errors";
import { JSON_CONFIG } from "./json-config";
import { emptyModel, parseJsonDocument } from "./json-parser";
import {parseJsonLines} from './json-lines';
import type { JsonDocumentModel } from "./json-model";
export async function loadJson(
  context: ViewerContext,
): Promise<JsonDocumentModel> {
  checkAbort(context.signal);
  const size = await context.source.getSize();
  const revision = await context.source.getRevision?.();
  const limited = size > JSON_CONFIG.maxBytes;
  const source = await context.source.readText({
    encoding: context.file.encoding ?? "utf-8",
    fatal: true,
    ...(limited ? { maxBytes: JSON_CONFIG.previewBytes } : {}),
  });
  checkAbort(context.signal);
  if (
    revision !== undefined &&
    revision !== (await context.source.getRevision?.())
  )
    throw new ViewerError(
      "UNSUPPORTED_CONTENT",
      "This file changed while reading. Select it again.",
    );
  checkAbort(context.signal);
  const jsonLines=['jsonl','ndjson'].includes(context.file.extension??'');
  if (limited) {
    const model = emptyModel(source, "limited");
    model.truncated = true;
    model.diagnostics.push({
      kind: "warning",
      message:
        "Large JSON preview: structured parsing is disabled above 8 MiB. Source shows the first 256 KiB of decoded input.",
    });
    return model;
  }
  if (size < JSON_CONFIG.workerBytes) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkAbort(context.signal);
    return jsonLines?parseJsonLines(source):parseJsonDocument(source);
  }
  if (typeof Worker === "undefined")
    throw new ViewerError(
      "UNSUPPORTED_CONTENT",
      "Background JSON parsing is unavailable. Open as Text instead.",
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./json.worker.ts", import.meta.url), {
      type: "module",
    });
    const stop = () => worker.terminate();
    context.onCleanup(stop);
    const abort = () => {
      stop();
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    context.signal.addEventListener("abort", abort, { once: true });
    const finish = () => {
      stop();
      context.signal.removeEventListener("abort", abort);
    };
    worker.onmessage = (
      event: MessageEvent<{ model?: JsonDocumentModel; error?: string }>,
    ) => {
      finish();
      if (context.signal.aborted)
        reject(new DOMException("Operation cancelled", "AbortError"));
      else if (event.data.model) resolve(event.data.model);
      else
        reject(
          new ViewerError(
            "PARSE_FAILED",
            event.data.error ?? "Unable to parse JSON.",
          ),
        );
    };
    worker.onerror = () => {
      finish();
      reject(
        new ViewerError(
          "PARSE_FAILED",
          "Background JSON parsing failed. Open as Text instead.",
        ),
      );
    };
    worker.postMessage(jsonLines?{source,jsonLines}:source);
  });
}
