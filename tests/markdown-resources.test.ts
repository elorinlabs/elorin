import { describe, it, expect, vi } from "vitest";
import { MarkdownResourceResolver } from "../src/viewer/plugins/markdown/markdown-resources";
import { BrowserFileSource } from "../src/services/fileSource";
import { descriptor } from "./viewer-helpers";
import type { ViewerContext } from "../src/viewer/core/types";
function setup() {
  const abort = new AbortController();
  const cleanup: (() => void)[] = [];
  const readRelated = vi.fn(async () => ({
    file: { ...descriptor(), detectedType: "png" as const, size: 8 },
    source: new BrowserFileSource(
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        "image.png",
      ),
    ),
  }));
  const context: ViewerContext = {
    file: descriptor(),
    source: new BrowserFileSource(new File([], "doc.md")),
    services: { file: { readRelated } },
    signal: abort.signal,
    onCleanup: (task) => {
      cleanup.push(task);
    },
  };
  return {
    resolver: new MarkdownResourceResolver(context),
    readRelated,
    abort,
    cleanup,
  };
}
describe("Markdown resources", () => {
  it("resolves relative raster resources through FileSource, caches and revokes URLs", async () => {
    const create = vi.fn(() => "blob:image"),
      revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const s = setup();
    expect(await s.resolver.image("./image.png")).toBe("blob:image");
    expect(await s.resolver.image("./image.png")).toBe("blob:image");
    expect(s.readRelated).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    s.cleanup.forEach((fn) => fn());
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:image");
    vi.unstubAllGlobals();
  });
  it("rejects traversal, remote and vector images before creating object URLs", async () => {
    const s = setup();
    await expect(s.resolver.image("../private.png")).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
    await expect(
      s.resolver.image("https://example.com/a.png"),
    ).rejects.toThrow();
    expect(s.readRelated).not.toHaveBeenCalled();
    s.readRelated.mockResolvedValueOnce({
      file: { ...descriptor(), detectedType: "svg" as "png", size: 4 },
      source: new BrowserFileSource(new File(["svg"], "image.svg")),
    });
    await expect(s.resolver.image("./image.svg")).rejects.toThrow();
  });
  it("late image reads are aborted and never allocate URLs after cleanup", async () => {
    const s = setup();
    let finish!: (v: Awaited<ReturnType<typeof s.readRelated>>) => void;
    const related = await s.readRelated();
    s.readRelated.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const pending = s.resolver.image("./image.png");
    s.abort.abort();
    s.cleanup.forEach((fn) => fn());
    finish(related);
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });
});
