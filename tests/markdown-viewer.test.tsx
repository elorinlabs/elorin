import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { App } from "../src/app/App";
import { ViewerHost } from "../src/viewer/components/ViewerHost";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { markdownViewerPlugin } from "../src/viewer/plugins/markdown/markdown.plugin";
import { parseMarkdown } from "../src/viewer/plugins/markdown/markdown-parser";
import * as parser from "../src/viewer/plugins/markdown/markdown-parser";
import { BrowserFileSource } from "../src/services/fileSource";
import { descriptor, input } from "./viewer-helpers";
import type { ViewerContext } from "../src/viewer/core/types";
const content =
  "# Prism\n\nA **calm** document.\n\n## 安装\n\n[Anchor](#安装) and [External](https://example.com).\n\n| Name | Status |\n|---|---|\n| Prism | Active |\n\n- [x] Done\n- [ ] Pending\n\n```ts\nconst prism = true;\n```\n";
const setup = (text = content) => ({
  file: { ...descriptor("README.md"), detectedType: "markdown" as const },
  source: new BrowserFileSource(new File([text], "README.md")),
  services: { file: {} },
});
const context = (text = content): ViewerContext => ({
  ...setup(text),
  signal: new AbortController().signal,
  onCleanup() {},
});
describe("Markdown Viewer Plugin", () => {
  it("registers lazily, selects descriptors independent of names and rejects nonmarkdown", async () => {
    const registry = createBuiltinRegistry();
    expect(registry.getById("markdown")?.loaded).toBe(false);
    expect(
      (
        await registry.resolve({
          ...descriptor("document.data"),
          detectedType: "markdown",
        })
      )?.id,
    ).toBe("markdown");
    expect((await registry.resolve(descriptor("ordinary.txt")))?.id).toBe(
      "core.text-fallback",
    );
    expect(
      markdownViewerPlugin.canHandle!({
        ...descriptor(),
        detectedType: "markdown",
        isText: false,
      }),
    ).toBe(false);
  });
  it("renders through real App input/detection/registry/host rather than an App extension switch", async () => {
    render(
      <App
        mode="browser"
        selectionService={{ select: vi.fn(), listenDrop: async () => () => {} }}
        recentService={{ list: async () => [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: {
        files: [new NodeFile([content], "README.mkdn") as unknown as File],
      },
    });
    expect(
      await screen.findByRole("heading", { name: "Prism", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("Read/Source/Split/Inspect do not reread or reparse; Source preserves text and line numbers", async () => {
    const data = setup();
    const read = vi.spyOn(data.source, "readRange");
    const parse = vi.spyOn(parser, "parseMarkdown");
    const view = render(<ViewerHost {...data} />);
    await screen.findByRole("heading", { name: "Prism", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only Markdown source").textContent).toBe(
      content,
    );
    expect(
      view.container
        .querySelector(".markdown-line-numbers")
        ?.textContent?.split("\n")[0],
    ).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByLabelText("Markdown document")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown source")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(
      await screen.findByRole("region", { name: "Markdown inspection" }),
    ).toHaveTextContent("Reading time");
    expect(screen.getByText("Code blocks")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });
  it("outline is optional, keyboard-accessible and navigates semantic headings", async () => {
    render(<ViewerHost {...setup()} />);
    await screen.findByRole("heading", { name: "Prism" });
    expect(
      screen.queryByRole("navigation", { name: "Document outline" }),
    ).not.toBeInTheDocument();
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    fireEvent.click(screen.getByText("More"));
    fireEvent.click(screen.getByRole("button", { name: "Outline" }));
    fireEvent.click(screen.getByRole("link", { name: "安装" }));
    expect(scroll).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "安装" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "安装" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });
  it("reattaches outline observation after returning from Source to Read", async () => {
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    try {
      render(<ViewerHost {...setup()} />);
      await screen.findByRole("heading", { name: "Prism" });
      fireEvent.click(screen.getByText("More"));
      fireEvent.click(screen.getByRole("button", { name: "Outline" }));
      const original = screen.getByRole("heading", { name: "Prism" });
      expect(observe).toHaveBeenCalledWith(original);
      fireEvent.click(screen.getByRole("button", { name: "Source" }));
      expect(disconnect).toHaveBeenCalled();
      observe.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Read" }));
      const restored = screen.getByRole("heading", { name: "Prism" });
      expect(restored).not.toBe(original);
      expect(observe).toHaveBeenCalledWith(restored);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("renders GFM checkbox states read-only and copies pure code with local feedback", async () => {
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(<ViewerHost {...setup()} />);
    await screen.findByRole("heading", { name: "Prism" });
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(
      screen
        .getAllByRole("checkbox")
        .every((input) => input.hasAttribute("disabled")),
    ).toBe(true);
    expect(screen.getByText("ts", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
    expect(copy).toHaveBeenCalledWith("const prism = true;");
  });
  it("empty Markdown is a normal reading state", async () => {
    render(<ViewerHost {...setup("")} />);
    expect(
      await screen.findByText("Empty Markdown document"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("malicious Markdown never renders executable elements or dangerous links", async () => {
    const view = render(
      <ViewerHost
        {...setup(
          '# Unsafe\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))\n\n[y](data:text/html,evil)',
        )}
      />,
    );
    await screen.findByRole("heading", { name: "Unsafe" });
    expect(
      view.container.querySelector(
        "script,iframe,img[onerror],a[href^='javascript:'],a[href^='data:']",
      ),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "x" })).not.toBeInTheDocument();
  });
  it("routes safe external URLs through services and related links through the generic action", async () => {
    const openUrl = vi.fn(async () => {}),
      openRelated = vi.fn(async () => {});
    render(
      <ViewerHost
        {...setup(
          "# Links\n\n[External](https://example.com)\n\n[Config](./config.json)\n\n[Traversal](../secret.txt)",
        )}
        services={{ file: { openUrl, openRelated } }}
      />,
    );
    await screen.findByRole("heading", { name: "Links" });
    fireEvent.click(screen.getByRole("link", { name: "External" }));
    expect(openUrl).toHaveBeenCalledWith("https://example.com/");
    fireEvent.click(screen.getByRole("link", { name: "Config" }));
    expect(openRelated).toHaveBeenCalledWith("./config.json");
    expect(
      screen.queryByRole("link", { name: "Traversal" }),
    ).not.toBeInTheDocument();
  });
  it("browser relative files/images degrade gracefully and remote images do not fetch automatically", async () => {
    render(
      <ViewerHost
        {...setup(
          "# Resources\n\n[Related](./missing.md)\n\n![local](./missing.png)\n\n![remote](https://example.com/image.png)",
        )}
      />,
    );
    await screen.findByRole("heading", { name: "Resources" });
    fireEvent.click(screen.getByRole("link", { name: "Related" }));
    expect(
      await screen.findByText(
        "Related files are available in Tauri Full Mode.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText("Image unavailable")).toHaveLength(2),
    );
    expect(document.querySelector("img[src^='https:']")).toBeNull();
  });
  it("preserves independent reading/source scroll positions through view and inspect switches", async () => {
    const view = render(<ViewerHost {...setup()} />);
    await screen.findByRole("heading", { name: "Prism" });
    const reading = view.container.querySelector(".markdown-reader-pane")!;
    fireEvent.scroll(reading, { target: { scrollTop: 200 } });
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    fireEvent.scroll(view.container.querySelector(".markdown-source-pane")!, {
      target: { scrollTop: 120 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(
      view.container.querySelector(".markdown-reader-pane")?.scrollTop,
    ).toBe(200);
    expect(
      view.container.querySelector(".markdown-source-pane")?.scrollTop,
    ).toBe(120);
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    await screen.findByRole("region", { name: "Markdown inspection" });
    expect(
      view.container.querySelector(".markdown-reader-pane")?.scrollTop,
    ).toBe(200);
  });
  it("invalid encoding, oversized content and changed revisions enter existing errors", async () => {
    const bad = context();
    bad.source = new BrowserFileSource(
      new File([new Uint8Array([255, 255])], "invalid.md"),
    );
    await expect(markdownViewerPlugin.load(bad)).rejects.toThrow();
    const big = context();
    vi.spyOn(big.source, "getSize").mockResolvedValue(3 * 1024 * 1024);
    await expect(markdownViewerPlugin.load(big)).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
    const changed = context();
    changed.source.getRevision = vi
      .fn()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");
    await expect(markdownViewerPlugin.load(changed)).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT",
    });
  });
  it("aborted loads do not parse and rejected reads preserve permission failures", async () => {
    const cancelled = context();
    const abort = new AbortController();
    abort.abort();
    cancelled.signal = abort.signal;
    await expect(markdownViewerPlugin.load(cancelled)).rejects.toMatchObject({
      code: "ABORTED",
    });
    const denied = context();
    vi.spyOn(denied.source, "readText").mockRejectedValue({
      code: "PERMISSION_DENIED",
    });
    await expect(markdownViewerPlugin.load(denied)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
  it("theme selection changes shell tokens without reloading or re-reading the document", async () => {
    const view = render(
      <App
        mode="browser"
        selectionService={{ select: vi.fn(), listenDrop: async () => () => {} }}
        recentService={{ list: async () => [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: {
        files: [new NodeFile([content], "README.md") as unknown as File],
      },
    });
    await screen.findByRole("heading", { name: "Prism" });
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "dark" },
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("heading", { name: "Prism" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Theme"), {
      target: { value: "light" },
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    localStorage.removeItem("prism-theme");
    view.unmount();
  });
});
