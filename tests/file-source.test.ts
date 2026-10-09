import { describe, it, expect, vi } from "vitest";
import {
  BrowserFileSource,
  TauriFileSource,
  bindFileSource,
  READ_ALL_LIMIT,
  RANGE_LIMIT,
} from "../src/services/fileSource";
import { tauriFileAdapter } from "../src/services/fileLoader";
import { textFallback } from "../src/viewer/plugins/textFallback";
import { input } from "./viewer-helpers";
describe("FileSource", () => {
  it("reads exact ranges, full content and Unicode text without paths", async () => {
    const source = new BrowserFileSource(
      new File(["hello 世界"], "unicode.txt"),
    );
    expect(await source.getSize()).toBe(12);
    expect(Array.from(await source.readRange(1, 3))).toEqual([101, 108, 108]);
    expect(await source.readText()).toBe("hello 世界");
    expect((await source.readAll()).length).toBe(12);
    expect(await source.readRange(100, 3)).toHaveLength(0);
  });
  it("decodes UTF-16 BOM and avoids replacement characters at truncated UTF-8 boundaries", async () => {
    const utf16 = new BrowserFileSource(
      new File([new Uint8Array([255, 254, 45, 78])], "utf16.txt"),
    );
    expect(await utf16.readText({ encoding: "utf-16le" })).toBe("中");
    expect(await utf16.readText({ encoding: "UTF-16 LE" })).toBe("中");
    const bom = new BrowserFileSource(new File([new Uint8Array([239, 187, 191, 65])], "bom.txt"));
    expect(await bom.readText({ encoding: "UTF-8 BOM" })).toBe("A");
    const utf8 = new BrowserFileSource(new File(["A世"], "utf8.txt"));
    expect(await utf8.readText({ maxBytes: 2 })).toBe("A");
  });
  it("rejects invalid/excessive ranges and whole large reads before allocating", async () => {
    const source = new BrowserFileSource(
      new File([new Uint8Array(READ_ALL_LIMIT + 1)], "large.txt"),
    );
    await expect(source.readRange(-1, 1)).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
    await expect(source.readRange(0, RANGE_LIMIT + 1)).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
    await expect(source.readAll()).rejects.toMatchObject({
      code: "OUT_OF_MEMORY",
    });
    await expect(source.readText()).rejects.toMatchObject({
      code: "OUT_OF_MEMORY",
    });
  });
  it("large text refuses synchronous parsing when workers are unavailable", async () => {
    const source = new BrowserFileSource(
      new File(["x".repeat(9 * 1024 * 1024)], "large.txt"),
    );
    const read = vi.spyOn(source, "readRange");
    const c = {
      ...input(),
      source,
      signal: new AbortController().signal,
      onCleanup() {},
    };
    await expect(textFallback.load(c)).rejects.toThrow(/Background workers/);
    expect(read).toHaveBeenCalledExactlyOnceWith(0, 16 * 1024);
  });
  it("guards reads before and after cancellation, and stops chunked reads", async () => {
    const abort = new AbortController();
    const source = new BrowserFileSource(
      new File([new Uint8Array(RANGE_LIMIT + 3)], "large.txt"),
    );
    const read = vi.spyOn(source, "readRange").mockImplementation(async () => {
      abort.abort();
      return new Uint8Array(RANGE_LIMIT);
    });
    const bound = bindFileSource(source, abort.signal);
    await expect(bound.readAll()).rejects.toMatchObject({ code: "ABORTED" });
    expect(read).toHaveBeenCalledOnce();
    await expect(bound.getSize()).rejects.toMatchObject({ code: "ABORTED" });
  });
  it("desktop source reuses the Module 02 adapter", async () => {
    const size = vi.spyOn(tauriFileAdapter, "size").mockResolvedValue(3);
    const read = vi
      .spyOn(tauriFileAdapter, "readRange")
      .mockResolvedValue([97, 98, 99]);
    const source = new TauriFileSource("C:\\sample.txt");
    expect(await source.readText()).toBe("abc");
    expect(size).toHaveBeenCalledWith("C:\\sample.txt");
    expect(read).toHaveBeenCalledWith("C:\\sample.txt", 0, 3);
    size.mockRestore();
    read.mockRestore();
  });
});
