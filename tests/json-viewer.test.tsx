import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { ViewerHost } from "../src/viewer/components/ViewerHost";
import { App } from "../src/app/App";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { BrowserFileSource } from "../src/services/fileSource";
import { resolveSample } from "../src/services/detection/browserDetector";
import * as parser from "../src/viewer/plugins/json/json-parser";
import { loadJson } from "../src/viewer/plugins/json/json-load";
import { JSON_CONFIG } from "../src/viewer/plugins/json/json-config";
import type { ViewerContext } from "../src/viewer/core/types";
const source =
  '{"name":"Prism","active":true,"users":[{"email":"alice@example.test"}],"empty":{},"tags":[],"value":null}';
const data = (text = source, name = "sample.json") => ({
  file: resolveSample(
    name,
    new TextEncoder().encode(text),
    new TextEncoder().encode(text).length,
  ),
  source: new BrowserFileSource(new File([text], name)),
  services: { file: {} },
});
const context = (text = source): ViewerContext => ({
  ...data(text),
  signal: new AbortController().signal,
  onCleanup() {},
});
const pathTo = (path: string) => {
  fireEvent.change(screen.getByLabelText("JSON Pointer"), {
    target: { value: path },
  });
  fireEvent.click(screen.getByRole("button", { name: "Go" }));
};
const actions = () => fireEvent.click(screen.getByText("Node actions"));

describe("JSON Plugin integration", () => {
  it("registers lazily and uses detection, GeoJSON and normalized MIME without claiming unrelated types", async () => {
    const registry = createBuiltinRegistry();
    expect(registry.getById("json")?.loaded).toBe(false);
    expect((await registry.resolve(data("{}", "data").file))?.id).toBe("json");
    expect(
      (await registry.resolve(data("{}", "sample.geojson").file))?.id,
    ).toBe("json");
    expect((await registry.resolve(data("plain", "sample.txt").file))?.id).toBe(
      "core.text-fallback",
    );
    expect(
      (
        await registry.resolve({
          ...data().file,
          isText: false,
          isBinary: true,
        })
      )?.id,
    ).toBe("core.binary-fallback");
  });
  it("runs the real browser App input → loader → registry → tree pipeline", async () => {
    render(
      <App
        mode="browser"
        selectionService={{ select: vi.fn(), listenDrop: async () => () => {} }}
        recentService={{ list: async () => [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: {
        files: [new NodeFile([source], "sample.geojson") as unknown as File],
      },
    });
    expect(
      await screen.findByRole("tree", { name: "JSON structure" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("modes and inspection reuse one read and parse; raw Source stays exact", async () => {
    const input = data();
    const read = vi.spyOn(input.source, "readRange"),
      parse = vi.spyOn(parser, "parseJsonDocument");
    render(<ViewerHost {...input} />);
    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only JSON source").textContent).toBe(
      source,
    );
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("tree")).toBeInTheDocument();
    expect(screen.getByLabelText("JSON source")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(await screen.findByLabelText("JSON inspection")).toHaveTextContent(
      "Root type",
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });
  it("selection drives inspection, path navigation expands ancestors and invalid path gives feedback", async () => {
    render(<ViewerHost {...data()} />);
    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    await screen.findByLabelText("JSON inspection");
    pathTo("/users/0/email");
    const selected = screen.getByRole("treeitem", { selected: true });
    expect(selected).toHaveTextContent("alice@example.test");
    expect(screen.getByLabelText("JSON inspection")).toHaveTextContent(
      "SELECTED STRING",
    );
    expect(screen.getByLabelText("JSON inspection")).toHaveTextContent(
      "/users/0/email",
    );
    pathTo("/users/999");
    expect(screen.getByRole("status")).toHaveTextContent("Path not found");
  });
  it("uses one focusable tree and supports arrow navigation, collapse, parent, toggle and clipboard shortcut", async () => {
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(<ViewerHost {...data()} />);
    const tree = await screen.findByRole("tree");
    expect(
      screen
        .getAllByRole("treeitem")
        .every((item) => !item.hasAttribute("tabindex")),
    ).toBe(true);
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "Prism",
    );
    fireEvent.keyDown(tree, { key: "c", ctrlKey: true });
    await waitFor(() => expect(copy).toHaveBeenCalledWith("Prism"));
    pathTo("/users");
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(screen.getByRole("treeitem", { selected: true })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(screen.getByRole("treeitem", { selected: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "Object",
    );
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "users",
    );
  });
  it("copies decoded value, exact JSON, key, friendly path and canonical pointer distinctly", async () => {
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(<ViewerHost {...data()} />);
    await screen.findByRole("tree");
    pathTo("/name");
    actions();
    for (const [action, text] of [
      ["Copy value", "Prism"],
      ["Copy JSON", '"Prism"'],
      ["Copy key", "name"],
      ["Copy path", "$.name"],
      ["Copy JSON Pointer", "/name"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: action }));
      await waitFor(() => expect(copy).toHaveBeenLastCalledWith(text));
    }
    pathTo("/users");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    await waitFor(() =>
      expect(copy).toHaveBeenLastCalledWith('[{"email":"alice@example.test"}]'),
    );
  });
  it("invalid JSON keeps Source available and error location is usable", async () => {
    const text = '{\n"a":1,\n}';
    render(<ViewerHost {...data(text)} />);
    await screen.findByRole("heading", { name: "Invalid JSON" });
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Read-only JSON source").textContent).toBe(
      text,
    );
    fireEvent.click(screen.getByRole("button", { name: "Jump to error" }));
    expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("JSON source")).toHaveFocus();
  });
  it.each(["42", '"棱镜🪩"', "null", "{}", "[]"])(
    "renders root %s",
    async (text) => {
      render(<ViewerHost {...data(text)} />);
      await screen.findByRole("tree");
      expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    },
  );
  it("uses FileSource decoding for UTF-8 BOM", async () => {
    const input = data('\uFEFF{"name":"棱镜"}');
    render(<ViewerHost {...input} />);
    expect(await screen.findByRole("tree")).toHaveTextContent("棱镜");
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only JSON source").textContent).toBe(
      '{"name":"棱镜"}',
    );
  });
  it("bounds long keys in the tree and path display without losing exact key copying", async () => {
    const key = "K".repeat(30000),
      copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(<ViewerHost {...data(JSON.stringify({ [key]: 1 }))} />);
    await screen.findByRole("tree");
    const row = screen.getAllByRole("treeitem")[1];
    expect(row.textContent!.length).toBeLessThan(300);
    fireEvent.click(row);
    actions();
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(key));
  });
  it("empty source is not an error", async () => {
    render(<ViewerHost {...data("")} />);
    await screen.findByRole("heading", { name: "Empty JSON document" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("never turns malicious strings or proto keys into executable content", async () => {
    const text =
      '{"html":"<script>alert(1)</script>","url":"javascript:alert(1)","__proto__":{"polluted":true}}';
    const view = render(<ViewerHost {...data(text)} />);
    await screen.findByRole("tree");
    expect(screen.getByRole("tree")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(view.container.querySelector("script,img,iframe,a")).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it("caps DOM rows, disables Expand all and navigates to virtualized offscreen nodes", async () => {
    const text = JSON.stringify(Array.from({ length: 7000 }, (_, i) => i));
    render(<ViewerHost {...data(text)} />);
    const tree = await screen.findByRole("tree");
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(60);
    actions();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeDisabled();
    pathTo("/6999");
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "6999",
    );
    expect(tree).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("treeitem", { selected: true }).id,
    );
  });
  it("truncates long strings and offers bounded full-value detail in Inspect", async () => {
    render(
      <ViewerHost
        {...data(JSON.stringify({ description: "X".repeat(30000) }))}
      />,
    );
    await screen.findByRole("tree");
    pathTo("/description");
    expect(
      screen.getByRole("treeitem", { selected: true }).textContent!.length,
    ).toBeLessThan(300);
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    const inspect = await screen.findByLabelText("JSON inspection");
    fireEvent.click(
      within(inspect).getByRole("button", { name: "Show full value" }),
    );
    expect(inspect.querySelector("pre")!.textContent!.length).toBe(16384);
  });
  it("searches keys/values and clicking a result selects the node", async () => {
    render(<ViewerHost {...data()} />);
    await screen.findByRole("tree");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search JSON"), {
      target: { value: "email" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "/users/0/email" }),
    );
    expect(screen.getByRole("treeitem", { selected: true })).toHaveTextContent(
      "alice@example.test",
    );
    fireEvent.change(screen.getByLabelText("Search scope"), {
      target: { value: "values" },
    });
    fireEvent.change(screen.getByLabelText("Search JSON"), {
      target: { value: "Prism" },
    });
    expect(
      await screen.findByRole("button", { name: "/name" }),
    ).toBeInTheDocument();
  });
  it("preserves Source and Tree scroll independently across modes", async () => {
    const text = JSON.stringify(
      Array.from({ length: 100 }, (_, i) => ({ id: i })),
      null,
      2,
    );
    render(<ViewerHost {...data(text)} />);
    const tree = await screen.findByRole("tree");
    fireEvent.scroll(tree, { target: { scrollTop: 180 } });
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    fireEvent.scroll(screen.getByLabelText("JSON source"), {
      target: { scrollTop: 220 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByRole("tree").scrollTop).toBe(180);
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("JSON source").scrollTop).toBe(220);
  });
});

describe("JSON loading lifecycle", () => {
  it("does not parse JSONL, and huge files get bounded Source preview", async () => {
    const jsonl = {
      ...context('{"a":1}\n{"a":2}'),
      file: data("", "a.jsonl").file,
    };
    expect((await loadJson(jsonl)).status).toBe("jsonl");
    const huge = context();
    huge.source.getSize = async () => JSON_CONFIG.maxBytes + 1;
    const read = vi.spyOn(huge.source, "readText");
    expect(await loadJson(huge)).toMatchObject({
      status: "limited",
      truncated: true,
      nodes: [],
    });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ maxBytes: JSON_CONFIG.previewBytes }),
    );
  });
  it("honors invalid encoding, read permissions, revision change and pre-read cancellation", async () => {
    const denied = context();
    denied.source.readText = async () => {
      throw new Error("Permission denied");
    };
    await expect(loadJson(denied)).rejects.toThrow("Permission");
    const invalid = context();
    invalid.source = new BrowserFileSource(
      new File([new Uint8Array([255])], "bad.json"),
    );
    await expect(loadJson(invalid)).rejects.toThrow();
    const changed = context();
    let revision = 0;
    changed.source.getRevision = async () => String(revision++);
    await expect(loadJson(changed)).rejects.toThrow("changed while reading");
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadJson({ ...context(), signal: controller.signal }),
    ).rejects.toHaveProperty("code", "ABORTED");
  });
  it("terminates a large-file worker on cancellation and ignores late results", async () => {
    const terminate = vi.fn(),
      postMessage = vi.fn();
    let worker: { onmessage?: (event: { data: unknown }) => void };
    vi.stubGlobal(
      "Worker",
      class {
        onmessage?: (event: { data: unknown }) => void;
        onerror?: () => void;
        terminate = terminate;
        postMessage = postMessage;
        constructor() {
          worker = this;
        }
      },
    );
    try {
      const ctx = context(),
        controller = new AbortController();
      ctx.signal = controller.signal;
      ctx.source.getSize = async () => JSON_CONFIG.workerBytes;
      const promise = loadJson(ctx);
      await waitFor(() => expect(postMessage).toHaveBeenCalled());
      controller.abort();
      await expect(promise).rejects.toHaveProperty("name", "AbortError");
      expect(terminate).toHaveBeenCalled();
      worker!.onmessage?.({ data: { model: parser.parseJsonDocument("{}") } });
      expect(terminate).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
