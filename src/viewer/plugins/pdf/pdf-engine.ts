import type { TextContent } from "pdfjs-dist/types/src/display/api";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export const PDF_BUDGET = {
  range: 262144,
  canvasPixels: 8_000_000,
  pages: 20000,
  textPages: 24,
  textChars: 250000,
  searchResults: 10000,
  outline: 2000,
};
export interface PdfHit {
  page: number;
  start: number;
  end: number;
  excerpt: string;
}
export function pdfText(items: TextContent["items"]) {
  let text = "";
  const ranges: { start: number; end: number }[] = [];
  for (const item of items) {
    if (!("str" in item) || !item.str) continue;
    const separator =
      !text ||
      /\s$/.test(text) ||
      /^\s/.test(item.str) ||
      (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(text) &&
        /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
          item.str,
        ))
        ? ""
        : " ";
    text += separator;
    const start = text.length;
    text += item.str;
    ranges.push({ start, end: text.length });
  }
  return { text, ranges };
}
export interface PdfAnnotation {
  rect?: number[];
  subtype?: string;
  url?: string;
  dest?: unknown;
  contentsObj?: { str?: string };
  fieldValue?: unknown;
  fieldName?: string;
}
export class PdfEngine {
  document?: pdfjs.PDFDocumentProxy;
  loading?: pdfjs.PDFDocumentLoadingTask;
  error?: string;
  passwordRequired = false;
  incorrectPassword = false;
  encrypted = false;
  copyAllowed = true;
  passwordCallback?: (password: string) => void;
  listeners = new Set<() => void>();
  revision = 0;
  metadata: Record<string, string> = {};
  outline: { title: string; dest: unknown; depth: number }[] = [];
  attachments: string[] = [];
  diagnostics: string[] = [];
  firstSize = { width: 612, height: 792 };
  textCache = new Map<number, TextContent>();
  pageDetails = new Map<
    number,
    {
      width: number;
      height: number;
      rotation: number;
      textItems: number;
      images?: number;
    }
  >();
  thumbnails = new Map<string, ImageBitmap>();
  disposed = false;
  rangeBytes = 0;
  searchGeneration = 0;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.revision;
  changed() {
    if (!this.disposed) {
      this.revision++;
      this.listeners.forEach((fn) => fn());
    }
  }
  constructor(public context: ViewerContext) {
    context.onCleanup(() => this.dispose());
  }
  async open() {
    const size = await this.context.source.getSize(),
      initial = await this.context.source.readRange(
        0,
        Math.min(size, PDF_BUDGET.range),
      );
    checkAbort(this.context.signal);
    const engine = this;
    class Range extends pdfjs.PDFDataRangeTransport {
      constructor() {
        super(size, initial, true);
      }
      requestDataRange(begin: number, end: number) {
        void (async () => {
          if (end - begin > 32 * 1024 * 1024)
            throw Error("PDF range exceeds the decoding budget.");
          const parts: Uint8Array[] = [];
          let count = 0;
          for (let at = begin; at < end; at += 1048576) {
            checkAbort(engine.context.signal);
            const bytes = await engine.context.source.readRange(
              at,
              Math.min(1048576, end - at),
            );
            parts.push(bytes);
            count += bytes.length;
          }
          checkAbort(engine.context.signal);
          const data = new Uint8Array(count);
          let at = 0;
          for (const part of parts) {
            data.set(part, at);
            at += part.length;
          }
          engine.rangeBytes += data.length;
          this.onDataRange(begin, data);
        })().catch(() => {
          if (!engine.disposed) {
            engine.error = "PDF data could not be read.";
            engine.changed();
            void engine.loading?.destroy();
          }
        });
      }
    }
    this.loading = pdfjs.getDocument({
      range: new Range(),
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: PDF_BUDGET.range,
      enableXfa: false,
      cMapUrl: new URL("pdf-assets/cmaps/", document.baseURI).href,
      standardFontDataUrl: new URL(
        "pdf-assets/standard_fonts/",
        document.baseURI,
      ).href,
      wasmUrl: new URL("pdf-assets/wasm/", document.baseURI).href,
      useSystemFonts: true,
      maxImageSize: 32_000_000,
      canvasMaxAreaInBytes: 32_000_000,
      verbosity: 0,
    });
    this.loading.onPassword = (
      callback: (password: string) => void,
      reason: number,
    ) => {
      this.encrypted = true;
      this.passwordRequired = true;
      this.incorrectPassword =
        reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
      this.passwordCallback = callback;
      this.changed();
    };
    void this.loading.promise
      .then(async (document) => {
        if (this.disposed) {
          await this.loading?.destroy();
          return;
        }
        this.document = document;
        this.passwordRequired = false;
        this.passwordCallback = undefined;
        if (document.numPages > PDF_BUDGET.pages)
          throw Error("PDF exceeds the page budget.");
        const page = await document.getPage(1),
          viewport = page.getViewport({ scale: 1 });
        this.firstSize = { width: viewport.width, height: viewport.height };
        const permissions = await document.getPermissions();
        this.encrypted ||= permissions !== null;
        this.copyAllowed =
          !permissions || permissions.has(pdfjs.PermissionFlag.COPY);
        this.changed();
        void this.details();
      })
      .catch(() => {
        if (!this.disposed) {
          this.error =
            "Unable to open PDF. It may be damaged or use unsupported encryption.";
          this.changed();
          void this.loading?.destroy().catch(() => {});
        }
      });
  }
  password(value: string) {
    this.incorrectPassword = false;
    this.passwordCallback?.(value);
  }
  async details() {
    const document = this.document;
    if (!document) return;
    try {
      const metadata = await document.getMetadata();
      for (const [key, value] of Object.entries(metadata.info ?? {}))
        if (typeof value === "string" || typeof value === "boolean")
          this.metadata[key] = String(value).slice(0, 1000);
      const outline = await document.getOutline();
      const visit = (items: NonNullable<typeof outline>, depth = 0) => {
        if (depth > 20) return;
        for (const item of items) {
          if (this.outline.length >= PDF_BUDGET.outline) break;
          this.outline.push({ title: item.title, dest: item.dest, depth });
          visit(item.items, depth + 1);
        }
      };
      if (outline) visit(outline);
      // Attachment contents are deliberately not extracted into JS.
      const attachments = await document.getAttachments();
      if (attachments)
        this.attachments = Array.from(attachments.values())
          .slice(0, 100)
          .map((item) => item.filename);
      this.changed();
    } catch {
      this.diagnostics.push("Some document metadata is unavailable.");
      this.changed();
    }
  }
  async page(number: number) {
    if (!this.document || this.disposed) throw Error("PDF is unavailable");
    return this.document.getPage(number);
  }
  async text(number: number) {
    const cached = this.textCache.get(number);
    if (cached) {
      this.textCache.delete(number);
      this.textCache.set(number, cached);
      return cached;
    }
    const page = await this.page(number),
      reader = page.streamTextContent().getReader();
    const content: TextContent = { items: [], styles: {}, lang: null };
    let chars = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (this.disposed) throw Error("Aborted");
        checkAbort(this.context.signal);
        if (chunk.done) break;
        for (const item of chunk.value.items) {
          if ("str" in item) chars += item.str.length;
          if (chars > PDF_BUDGET.textChars || content.items.length >= 50000)
            throw Error("Page text exceeds the text budget");
          content.items.push(item);
        }
        Object.assign(content.styles, chunk.value.styles);
        content.lang = chunk.value.lang ?? content.lang;
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    this.textCache.set(number, content);
    while (this.textCache.size > PDF_BUDGET.textPages)
      this.textCache.delete(this.textCache.keys().next().value!);
    return content;
  }
  async destination(dest: unknown) {
    let value = dest;
    if (typeof value === "string")
      value = await this.document?.getDestination(value);
    if (!Array.isArray(value) || !value.length) return undefined;
    return typeof value[0] === "number"
      ? value[0] + 1
      : (await this.document!.getPageIndex(value[0])) + 1;
  }
  async search(
    query: string,
    caseSensitive: boolean,
    wholeWord: boolean,
    onProgress: (hits: PdfHit[], pages: number) => void,
  ) {
    const generation = ++this.searchGeneration,
      hits: PdfHit[] = [];
    if (!query || !this.document || !this.copyAllowed) return;
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    for (let page = 1; page <= this.document.numPages; page++) {
      if (this.disposed || generation !== this.searchGeneration) return;
      const content = await this.text(page),
        text = pdfText(content.items).text.slice(0, PDF_BUDGET.textChars),
        haystack = caseSensitive ? text : text.toLocaleLowerCase();
      if (this.disposed || generation !== this.searchGeneration) return;
      for (
        let at = 0;
        (at = haystack.indexOf(needle, at)) >= 0;
        at += Math.max(1, needle.length)
      ) {
        if (
          wholeWord &&
          (/[\p{L}\p{N}_]/u.test(text[at - 1] ?? "") ||
            /[\p{L}\p{N}_]/u.test(text[at + needle.length] ?? ""))
        )
          continue;
        hits.push({
          page,
          start: at,
          end: at + query.length,
          excerpt: text.slice(Math.max(0, at - 35), at + query.length + 35),
        });
        if (hits.length >= PDF_BUDGET.searchResults) break;
      }
      onProgress([...hits], page);
      if (hits.length >= PDF_BUDGET.searchResults) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  cancelSearch() {
    this.searchGeneration++;
  }
  render(
    number: number,
    canvas: HTMLCanvasElement,
    text: HTMLElement | null,
    scale: number,
    rotation: number,
    onReady: (info: {
      width: number;
      height: number;
      text: string;
      ranges: { start: number; end: number }[];
      annotations: PdfAnnotation[];
      viewport: pdfjs.PageViewport;
    }) => void,
  ) {
    let cancelled = false,
      task: pdfjs.RenderTask | undefined,
      layer: pdfjs.TextLayer | undefined,
      page: pdfjs.PDFPageProxy | undefined;
    const promise = (async () => {
      page = await this.page(number);
      if (cancelled) return;
      const viewport = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(PDF_BUDGET.canvasPixels / (viewport.width * viewport.height)),
      );
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const cacheKey = `${number}:${scale}:${viewport.rotation}:${ratio}`;
      const cached = !text ? this.thumbnails.get(cacheKey) : undefined;
      if (cached) {
        this.thumbnails.delete(cacheKey);
        this.thumbnails.set(cacheKey, cached);
        canvas.getContext("2d")?.drawImage(cached, 0, 0);
        onReady({
          width: viewport.width,
          height: viewport.height,
          text: "",
          ranges: [],
          annotations: [],
          viewport,
        });
        return;
      }
      task = page.render({
        canvas,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
        annotationMode: pdfjs.AnnotationMode.ENABLE,
      });
      await task.promise;
      if (cancelled) return;
      if (!text && typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(canvas);
          if (cancelled || this.disposed) {
            bitmap.close();
            return;
          }
          this.thumbnails.get(cacheKey)?.close();
          this.thumbnails.set(cacheKey, bitmap);
          while (this.thumbnails.size > 8) {
            const key = this.thumbnails.keys().next().value!;
            this.thumbnails.get(key)?.close();
            this.thumbnails.delete(key);
          }
        } catch {
          /* The rendered canvas remains usable without bitmap caching. */
        }
      }
      let content: TextContent | undefined;
      if (text && this.copyAllowed) {
        content = await this.text(number);
        if (cancelled) return;
        text.replaceChildren();
        text.style.setProperty("--scale-factor", String(scale));
        text.style.setProperty("--total-scale-factor", String(scale));
        layer = new pdfjs.TextLayer({
          textContentSource: content,
          container: text,
          viewport,
        });
        await layer.render();
      }
      const annotations = text ? await page.getAnnotations() : [];
      if (!cancelled && text) {
        const detail = {
          width: Math.abs(page.view[2] - page.view[0]) * page.userUnit,
          height: Math.abs(page.view[3] - page.view[1]) * page.userUnit,
          rotation: viewport.rotation,
          textItems: content?.items.length ?? 0,
          images: undefined as number | undefined,
        };
        this.pageDetails.set(number, detail);
        while (this.pageDetails.size > 24)
          this.pageDetails.delete(this.pageDetails.keys().next().value!);
        void page
          .getOperatorList()
          .then((operators) => {
            if (cancelled || this.disposed) return;
            detail.images = operators.fnArray.filter((op) =>
              [
                pdfjs.OPS.paintImageXObject,
                pdfjs.OPS.paintInlineImageXObject,
                pdfjs.OPS.paintImageMaskXObject,
              ].includes(op),
            ).length;
            this.changed();
          })
          .catch(() => {});
      }
      if (!cancelled)
        onReady({
          width: viewport.width,
          height: viewport.height,
          ...pdfText(content?.items ?? []),
          annotations,
          viewport,
        });
    })();
    return {
      promise,
      cancel() {
        cancelled = true;
        task?.cancel();
        layer?.cancel();
        canvas.width = 0;
        canvas.height = 0;
        page?.cleanup();
      },
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelSearch();
    this.passwordCallback = undefined;
    this.textCache.clear();
    this.pageDetails.clear();
    this.thumbnails.forEach((bitmap) => bitmap.close());
    this.thumbnails.clear();
    this.listeners.clear();
    void this.loading?.destroy();
    this.document = undefined;
  }
}
export { pdfjs };
export async function loadPdf(context: ViewerContext) {
  const engine = new PdfEngine(context);
  await engine.open();
  return engine;
}
