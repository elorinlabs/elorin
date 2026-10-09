import { describe, it, expect, vi } from "vitest";
import { ViewerRegistry } from "../src/viewer/core/registry";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import type { ViewerPlugin } from "../src/viewer/core/types";
import { descriptor, testPlugin } from "./viewer-helpers";
const erased = (plugin: ReturnType<typeof testPlugin>) =>
  plugin as unknown as ViewerPlugin;
describe("ViewerRegistry", () => {
  it("registers, lists, retrieves, rejects duplicate/empty IDs and unregisters", () => {
    const registry = new ViewerRegistry();
    registry.register(testPlugin());
    expect(registry.has("TestFastViewer")).toBe(true);
    expect(registry.getById("TestFastViewer")?.name).toBe("TestFastViewer");
    expect(registry.list()).toHaveLength(1);
    expect(() => registry.register(testPlugin())).toThrow(/Duplicate/);
    expect(() => registry.register(testPlugin(" "))).toThrow(/empty/);
    expect(registry.unregister("TestFastViewer")).toBe(true);
    expect(registry.unregister("missing")).toBe(false);
    expect(registry.getById("TestFastViewer")).toBeUndefined();
  });
  it("selects the detected type without inspecting bytes or extensions", async () => {
    const registry = new ViewerRegistry();
    registry.register(testPlugin("code", { supportedTypes: ["typescript"] }));
    expect(await registry.resolve(descriptor())).toBeUndefined();
    expect(
      (await registry.resolve({ ...descriptor(), detectedType: "typescript" }))
        ?.id,
    ).toBe("code");
  });
  it("highest priority wins irrespective of registration order; ties sort by ID", async () => {
    const registry = new ViewerRegistry();
    registry.register(testPlugin("z", { priority: 100 }));
    registry.register(testPlugin("a", { priority: 100 }));
    registry.register(testPlugin("low"));
    expect((await registry.resolve(descriptor()))?.id).toBe("a");
    expect(registry.list().map((p) => p.id)).toEqual(["a", "z", "low"]);
  });
  it("honors asynchronous canHandle true and false", async () => {
    const registry = new ViewerRegistry();
    registry.register(
      testPlugin("false", { priority: 200, canHandle: async () => false }),
    );
    registry.register(testPlugin("true", { canHandle: async () => true }));
    expect((await registry.resolve(descriptor()))?.id).toBe("true");
  });
  it("uses text and binary fallbacks only after specific matches", async () => {
    const registry = createBuiltinRegistry();
    registry.register(testPlugin("specific", { priority: -2000 }));
    expect((await registry.resolve(descriptor()))?.id).toBe("specific");
    registry.unregister("specific");
    expect(
      (await registry.resolve({ ...descriptor(), detectedType: "unknown" }))
        ?.id,
    ).toBe("core.text-fallback");
    expect(
      (
        await registry.resolve({
          ...descriptor(),
          isText: false,
          isBinary: true,
        })
      )?.id,
    ).toBe("core.binary-fallback");
  });
  it("returns no viewer and refuses forced text fallback on binary", async () => {
    expect(await new ViewerRegistry().resolve(descriptor())).toBeUndefined();
    expect(
      await createBuiltinRegistry().resolve(
        { ...descriptor(), isText: false },
        { forceId: "core.text-fallback" },
      ),
    ).toBeUndefined();
  });
  it("does not import before needed or import nonmatching/lower priority lazy entries", async () => {
    const registry = new ViewerRegistry();
    const chosen = vi.fn(async () =>
      erased(testPlugin("lazy", { priority: 100 })),
    );
    const skipped = vi.fn(async () => erased(testPlugin("skipped")));
    registry.registerLazy({
      id: "lazy",
      name: "lazy",
      supportedTypes: ["text"],
      priority: 100,
      loadPlugin: chosen,
    });
    registry.registerLazy({
      id: "skipped",
      name: "skipped",
      supportedTypes: ["text"],
      loadPlugin: skipped,
    });
    registry.list();
    registry.getById("lazy");
    expect(chosen).not.toHaveBeenCalled();
    await registry.resolve({ ...descriptor(), detectedType: "pdf" });
    expect(chosen).not.toHaveBeenCalled();
    await Promise.all([
      registry.resolve(descriptor()),
      registry.resolve(descriptor()),
    ]);
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(skipped).not.toHaveBeenCalled();
  });
  it("filters canHandle before import and retries failed lazy imports", async () => {
    const registry = new ViewerRegistry();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk"))
      .mockResolvedValue(erased(testPlugin("lazy")));
    const skip = vi.fn();
    registry.registerLazy({
      id: "skip",
      name: "skip",
      supportedTypes: ["text"],
      priority: 100,
      canHandle: () => false,
      loadPlugin: skip,
    });
    registry.registerLazy({
      id: "lazy",
      name: "lazy",
      supportedTypes: ["text"],
      loadPlugin: load,
    });
    await expect(registry.resolve(descriptor())).rejects.toThrow("chunk");
    expect((await registry.resolve(descriptor()))?.id).toBe("lazy");
    expect(load).toHaveBeenCalledTimes(2);
    expect(skip).not.toHaveBeenCalled();
  });
  it("checks loaded plugin predicates and validates lazy identity", async () => {
    const registry = new ViewerRegistry();
    registry.registerLazy({
      id: "lazy",
      name: "lazy",
      supportedTypes: ["text"],
      loadPlugin: async () =>
        erased(testPlugin("lazy", { canHandle: () => false })),
    });
    expect(await registry.resolve(descriptor())).toBeUndefined();
    registry.registerLazy({
      id: "bad",
      name: "bad",
      supportedTypes: ["text"],
      priority: 100,
      loadPlugin: async () => erased(testPlugin("other")),
    });
    await expect(registry.resolve(descriptor())).rejects.toThrow(/ID/);
  });
  it("aborts resolving and does not return a plugin removed during its import", async () => {
    const registry = new ViewerRegistry();
    let resolve!: (p: ViewerPlugin) => void;
    registry.registerLazy({
      id: "lazy",
      name: "lazy",
      supportedTypes: ["text"],
      loadPlugin: () => new Promise((r) => (resolve = r)),
    });
    const pending = registry.resolve(descriptor());
    registry.unregister("lazy");
    resolve(erased(testPlugin("lazy")));
    expect(await pending).toBeUndefined();
    const controller = new AbortController();
    controller.abort();
    await expect(
      registry.resolve(descriptor(), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });
});
