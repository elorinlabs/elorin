import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { loadImage } from "../src/viewer/plugins/image/image-model";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { resolveSample } from "../src/services/detection/browserDetector";
import type { ViewerContext } from "../src/viewer/core/types";
function context(name: string, custom?: Uint8Array) {
  const bytes =
      custom ?? new Uint8Array(readFileSync("tests/fixtures/image/" + name)),
    controller = new AbortController(),
    cleanups: (() => void)[] = [];
  let disposed = false;
  const input: ViewerContext = {
    file: resolveSample(name, bytes, bytes.length),
    signal: controller.signal,
    services: { file: {} },
    source: {
      getSize: async () => bytes.length,
      readRange: async (at, length) => bytes.slice(at, at + length),
      readAll: async () => bytes,
      readText: async () => "",
      readBlob: async () => new NodeBlob([bytes]) as unknown as Blob,
    },
    onCleanup: (fn) => {
      if (disposed) fn();
      else cleanups.push(fn);
    },
  };
  return {
    input,
    cleanups,
    dispose: () => {
      disposed = true;
      controller.abort();
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("Image plugin lifecycle and bounded loading", () => {
  it("uses lazy registry selection for image and preserves structured viewers", async () => {
    const registry = createBuiltinRegistry();
    expect(registry.getById("image")?.loaded).toBe(false);
    const ctx = context("basic.png");
    expect(
      (
        await registry.resolve(ctx.input.file, {
          signal: new AbortController().signal,
        })
      )?.id,
    ).toBe("image");
    expect(registry.getById("image")?.loaded).toBe(true);
  });
  it("retains dimensions and inspection after codec failure", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("bad image")),
    );
    const ctx = context("damaged.png"),
      model = await loadImage(ctx.input);
    expect(model.error).toBe("bad image");
    expect(model.metadata.width).toBe(160);
    expect(model.drawable).toBeUndefined();
    ctx.dispose();
  });
  it("skips decode before allocating giant rasters", async () => {
    const bytes = new Uint8Array(
        readFileSync("tests/fixtures/image/basic.bmp"),
      ),
      v = new DataView(bytes.buffer);
    v.setInt32(18, 20000, true);
    v.setInt32(22, 20000, true);
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const ctx = context("giant.bmp", bytes),
      model = await loadImage(ctx.input);
    expect(model.error).toContain("32 MP");
    expect(model.metadata.width).toBe(20000);
    expect(decode).not.toHaveBeenCalled();
  });
  it("closes a bitmap after normal disposal", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 160, height: 80, close }),
    );
    const ctx = context("basic.png"),
      model = await loadImage(ctx.input);
    expect(model.error).toBeUndefined();
    expect(model.width).toBe(160);
    ctx.dispose();
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes late decode results and does not commit an aborted model", async () => {
    let complete: (value: unknown) => void = () => {};
    const close = vi.fn(),
      decode = vi.fn(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    vi.stubGlobal("createImageBitmap", decode);
    const ctx = context("basic.png"),
      pending = loadImage(ctx.input);
    await vi.waitFor(() => expect(decode).toHaveBeenCalled());
    ctx.dispose();
    complete({ width: 160, height: 80, close });
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("shows HEIC runtime capability fallback with header dimensions", async () => {
    const ctx = context("unsupported.heic"),
      model = await loadImage(ctx.input);
    expect(model.error).toContain("decoder is unavailable");
    expect(model.metadata.width).toBe(160);
  });
});
