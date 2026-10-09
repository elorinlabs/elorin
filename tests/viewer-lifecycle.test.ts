import { Blob as NodeBlob, resolveObjectURL } from "node:buffer";
import { URL as NodeURL } from "node:url";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ViewerController } from "../src/viewer/core/controller";
import { ViewerRegistry } from "../src/viewer/core/registry";
import type { ViewerContext, ViewerState } from "../src/viewer/core/types";
import { input, testPlugin, waitModel } from "./viewer-helpers";
afterEach(() => vi.useRealTimers());
const flush = () =>
  new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
describe("Viewer lifecycle and races", () => {
  it("A 500ms; B 10ms opened after 50ms: final model B, A aborted/disposed", async () => {
    vi.useFakeTimers();
    const registry = new ViewerRegistry();
    const states: ViewerState[] = [];
    const contexts: ViewerContext[] = [];
    const plugin = testPlugin("TestSlowViewer", {
      load: vi.fn((context) => {
        contexts.push(context);
        return waitModel(context, context.file.name === "A.txt" ? 500 : 10);
      }),
    });
    registry.register(plugin);
    const controller = new ViewerController(registry, (state) =>
      states.push(state),
    );
    controller.start(input("A.txt"));
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    controller.start(input("B.txt"));
    await flush();
    expect(contexts[0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).toMatchObject({ status: "ready", model: "B.txt" });
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toMatchObject({ status: "ready", model: "B.txt" });
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
    expect(plugin.dispose).toHaveBeenCalledWith(contexts[0], "A.txt");
    controller.stop();
    controller.stop();
    expect(plugin.dispose).toHaveBeenCalledTimes(2);
  });
  it("rapid A → B → C suppresses old successful models and old errors", async () => {
    vi.useFakeTimers();
    const states: ViewerState[] = [];
    const contexts: ViewerContext[] = [];
    const plugin = testPlugin("TestSlowViewer", {
      load: (context) => {
        contexts.push(context);
        return new Promise((resolve, reject) =>
          setTimeout(
            () =>
              context.file.name === "B.txt"
                ? reject(new Error("old error"))
                : resolve(context.file.name),
            context.file.name === "C.txt" ? 10 : 500,
          ),
        );
      },
    });
    const registry = new ViewerRegistry();
    registry.register(plugin);
    const controller = new ViewerController(registry, (s) => states.push(s));
    for (const name of ["A.txt", "B.txt", "C.txt"]) {
      controller.start(input(name));
      await flush();
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(600);
    expect(states.at(-1)).toMatchObject({ status: "ready", model: "C.txt" });
    expect(states.some((s) => s.status === "error")).toBe(false);
    expect(contexts.slice(0, 2).every((c) => c.signal.aborted)).toBe(true);
    expect(plugin.dispose).toHaveBeenCalledTimes(2);
    controller.stop();
  });
  it("releases URL/listener immediately, and disposes late models exactly once", async () => {
    let complete!: (model: string) => void;
    const cleanup = vi.fn();
    const listener = vi.fn();
    const resource = NodeURL.createObjectURL(new NodeBlob(["test resource"]));
    expect(resolveObjectURL(resource)).toBeDefined();
    const revoke = vi.fn(() => NodeURL.revokeObjectURL(resource));
    const registry = new ViewerRegistry();
    let context!: ViewerContext;
    const plugin = testPlugin("TestDisposeViewer", {
      load: (c) => {
        context = c;
        window.addEventListener("resize", listener);
        c.onCleanup(() => window.removeEventListener("resize", listener));
        c.onCleanup(() => revoke());
        c.onCleanup(cleanup);
        return new Promise((r) => (complete = r));
      },
    });
    registry.register(plugin);
    const controller = new ViewerController(registry, () => {});
    controller.start(input());
    await flush();
    controller.stop();
    window.dispatchEvent(new Event("resize"));
    expect(listener).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledOnce();
    expect(resolveObjectURL(resource)).toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
    const lateCleanup = vi.fn();
    context.onCleanup(lateCleanup);
    expect(lateCleanup).toHaveBeenCalledOnce();
    complete("late model");
    await flush();
    expect(plugin.dispose).toHaveBeenCalledExactlyOnceWith(
      context,
      "late model",
    );
  });
  it("handles failed loads and fresh-controller retry without application refresh", async () => {
    const plugin = testPlugin("TestFastViewer", {
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error("load"))
        .mockResolvedValue("retried"),
    });
    const registry = new ViewerRegistry();
    registry.register(plugin);
    const states: ViewerState[] = [];
    const controller = new ViewerController(registry, (s) => states.push(s));
    controller.start(input());
    await vi.waitFor(()=>expect(states.at(-1)).toMatchObject({
      status: "error",
      error: { code: "LOAD_FAILED" },
    }));
    expect(plugin.dispose).toHaveBeenCalledOnce();
    controller.start(input());
    await vi.waitFor(()=>expect(states.at(-1)).toMatchObject({ status: "ready", model: "retried" }));
    controller.stop();
  });
  it("unknown registry emits unsupported and cancellation during canHandle never loads", async () => {
    const states: ViewerState[] = [];
    const registry = new ViewerRegistry();
    const controller = new ViewerController(registry, (s) => states.push(s));
    controller.start(input());
    await flush();
    expect(states.at(-1)?.status).toBe("unsupported");
    let finish!: (b: boolean) => void;
    const plugin = testPlugin("TestPriorityViewer", {
      canHandle: () => new Promise((r) => (finish = r)),
    });
    registry.register(plugin);
    controller.start(input());
    controller.stop();
    finish(true);
    await flush();
    expect(plugin.load).not.toHaveBeenCalled();
  });
});
