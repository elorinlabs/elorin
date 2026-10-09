import { describe, it, expect, vi } from "vitest";
import type { ViewerContext } from "../src/viewer/core/types";
const fake = vi.hoisted(() => ({
  options: undefined as any,
  loading: {
    promise: new Promise(() => {}),
    destroy: vi.fn(async () => {}),
    onPassword: undefined as any,
  },
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: (options: any) => {
    fake.options = options;
    return fake.loading;
  },
  PDFDataRangeTransport: class {
    constructor(
      public length: number,
      public initial: Uint8Array,
    ) {}
    onDataRange = vi.fn();
  },
  PermissionFlag: { COPY: 16 },
  PasswordResponses: { INCORRECT_PASSWORD: 2 },
  AnnotationMode: { ENABLE: 1 },
}));
import {
  PdfEngine,
  PDF_BUDGET,
  pdfText,
} from "../src/viewer/plugins/pdf/pdf-engine";
function context() {
  const data = new Uint8Array(1000000),
    cleanup = vi.fn();
  return {
    signal: new AbortController().signal,
    onCleanup: cleanup,
    source: {
      getSize: async () => data.length,
      readRange: vi.fn(async (start: number, length: number) =>
        data.slice(start, start + length),
      ),
      readAll: vi.fn(),
    },
    services: { file: {} },
    file: {},
  } as unknown as ViewerContext;
}
describe("PDF engine contracts", () => {
  it('cancels streamed text extraction at the character budget without caching partial text',async()=>{const engine=new PdfEngine(context()),cancel=vi.fn();vi.spyOn(engine,'page').mockResolvedValue({streamTextContent:()=>new ReadableStream({start(controller){controller.enqueue({items:[{str:'a'.repeat(200000)}],styles:{}});controller.enqueue({items:[{str:'b'.repeat(100000)}],styles:{}});},cancel})} as never);await expect(engine.text(1)).rejects.toThrow(/budget/);expect(cancel).toHaveBeenCalledTimes(1);expect(engine.textCache.size).toBe(0);engine.dispose();});
  it("keeps CJK characters contiguous and returns precise span offsets", () => {
    const result = pdfText([
      { str: "中文" },
      { str: "文档" },
      { str: "Needle" },
      { str: " result" },
    ] as never);
    expect(result.text).toBe("中文文档 Needle result");
    expect(result.ranges[2]).toEqual({ start: 5, end: 11 });
  });
  it("opens with initial ranges, disables streaming/autofetch/XFA and keeps assets local", async () => {
    const ctx = context(),
      engine = new PdfEngine(ctx);
    await engine.open();
    expect(ctx.source.readRange).toHaveBeenCalledWith(0, PDF_BUDGET.range);
    expect(ctx.source.readAll).not.toHaveBeenCalled();
    expect(fake.options).toMatchObject({
      disableAutoFetch: true,
      disableStream: true,
      enableXfa: false,
    });
    expect(fake.options.cMapUrl).toMatch(/localhost.*pdf-assets/);
    engine.dispose();
  });
  it("passwords are session-only callback inputs and wrong passwords update UI state", async () => {
    const engine = new PdfEngine(context());
    await engine.open();
    const callback = vi.fn();
    fake.loading.onPassword(callback, 2);
    expect(engine.incorrectPassword).toBe(true);
    engine.password("secret");
    expect(callback).toHaveBeenCalledWith("secret");
    expect(JSON.stringify(engine.metadata)).not.toContain("secret");
    engine.dispose();
    expect(engine.passwordCallback).toBeUndefined();
  });
  it("literal, case-sensitive and whole word search respect permissions", async () => {
    const engine = new PdfEngine(context());
    engine.document = { numPages: 2 } as never;
    vi.spyOn(engine, "text").mockResolvedValue({
      items: [{ str: "Needle needles 中文 Needle" }],
    } as never);
    const values: any[] = [];
    await engine.search("Needle", true, true, (hits, pages) =>
      values.push({ hits, pages }),
    );
    expect(values.at(-1).hits).toHaveLength(4);
    expect(values.at(-1).pages).toBe(2);
    engine.copyAllowed = false;
    const callback = vi.fn();
    await engine.search("Needle", false, false, callback);
    expect(callback).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("cancelled extraction never commits stale search results", async () => {
    const engine = new PdfEngine(context());
    engine.document = { numPages: 1 } as never;
    let resolve!: (content: any) => void;
    vi.spyOn(engine, "text").mockReturnValue(new Promise((r) => (resolve = r)));
    const callback = vi.fn(),
      pending = engine.search("old", false, false, callback);
    engine.cancelSearch();
    resolve({ items: [{ str: "old" }] });
    await pending;
    expect(callback).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("bounds page text LRU and destroys loading task once", async () => {
    const engine = new PdfEngine(context());
    vi.spyOn(engine, "page").mockResolvedValue({
      streamTextContent: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ items: [], styles: {} });
            controller.close();
          },
        }),
    } as never);
    for (let page = 1; page <= 30; page++) await engine.text(page);
    expect(engine.textCache.size).toBe(24);
    expect(engine.textCache.has(1)).toBe(false);
    fake.loading.destroy.mockClear();
    engine.loading = fake.loading as never;
    engine.dispose();
    engine.dispose();
    expect(fake.loading.destroy).toHaveBeenCalledTimes(1);
  });
});
