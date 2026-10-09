import { File as NodeFile } from "node:buffer";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { App } from "../src/app/App";
import { ViewerShell } from "../src/viewer/components/ViewerShell";
import { ViewerHost } from "../src/viewer/components/ViewerHost";
import { ViewerRegistry } from "../src/viewer/core/registry";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { input, testPlugin, source, descriptor } from "./viewer-helpers";
import { ViewerSessionStore } from "../src/viewer/core/session";
const selectionService = {
  select: vi.fn(),
  listenDrop: vi.fn(async () => () => {}),
};
describe("ViewerHost integration", () => {
  it("optional panels preserve the same content DOM node", () => {
    const content = <div>Retained content</div>;
    const view = render(<ViewerShell content={content} />);
    const original = screen.getByText("Retained content");
    view.rerender(<ViewerShell content={content} leftPanel="Outline" />);
    expect(screen.getByText("Retained content")).toBe(original);
    view.rerender(<ViewerShell content={content} rightPanel="Inspect" />);
    expect(screen.getByText("Retained content")).toBe(original);
    view.rerender(<ViewerShell content={content} />);
    expect(screen.getByText("Retained content")).toBe(original);
  });
  it("Open .txt → real FileLoader → descriptor → text fallback; wrap toggle", async () => {
    render(
      <App
        mode="browser"
        selectionService={selectionService}
        recentService={{ list: async () => [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: {
        files: [
          new NodeFile(["hello 世界"], "unicode.txt", {
            type: "text/plain",
          }) as unknown as File,
        ],
      },
    });
    expect(await screen.findByLabelText("Read-only text")).toHaveTextContent(
      "hello 世界",
    );
    expect(screen.getByLabelText("Read-only text")).toHaveClass("wrap-lines");
    fireEvent.click(screen.getByLabelText("Wrap lines"));
    expect(screen.getByLabelText("Read-only text")).not.toHaveClass(
      "wrap-lines",
    );
    expect(
      screen.getByRole("region", { name: "File Inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Browser file · Local path unavailable"),
    ).toBeInTheDocument();
  });
  it("opening another file preserves previous tabs and per-file wrapping", async () => {
    const active=()=>within(document.querySelector('.tab-surface:not([hidden])')! as HTMLElement);
    render(
      <App
        mode="browser"
        selectionService={selectionService}
        recentService={{ list: async () => [] }}
      />,
    );
    const choose = (name: string) =>
      fireEvent.change(screen.getByLabelText("Choose browser file"), {
        target: { files: [new NodeFile([name], name) as unknown as File] },
      });
    choose("A.txt");
    await screen.findByLabelText("Wrap lines");
    fireEvent.click(screen.getByLabelText("Wrap lines"));
    choose("B.txt");
    await waitFor(() =>
      expect(active().getByLabelText("Read-only text")).toHaveTextContent(
        "B.txt",
      ),
    );
    expect(active().getByLabelText("Wrap lines")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "A.txt" }));
    await waitFor(() =>
      expect(active().getByLabelText("Read-only text")).toHaveTextContent(
        "A.txt",
      ),
    );
    expect(active().getByLabelText("Wrap lines")).not.toBeChecked();
  });
  it("unknown binary uses hex viewer and disabled browser external actions", async () => {
    render(
      <App
        mode="browser"
        selectionService={selectionService}
        recentService={{ list: async () => [] }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: {
        files: [
          new NodeFile(
            [new Uint8Array([0, 1, 2, 0, 255])],
            "unknown.bin",
          ) as unknown as File,
        ],
      },
    });
    expect(await screen.findByRole("region", { name: "Hex Viewer" })).toBeInTheDocument();
    expect(screen.getByRole("grid", {name: "Binary bytes"})).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open externally" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reveal in folder" }),
    ).toBeDisabled();
  });
  it("load error shows details, Retry reloads, fallback uses text only for text files", async () => {
    const registry = createBuiltinRegistry();
    const plugin = testPlugin("TestFastViewer", {
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValue("retried"),
    });
    registry.register(plugin);
    render(<ViewerHost {...input()} registry={registry} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file viewer encountered an error.",
    );
    expect(screen.getByText("Show details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Model: retried")).toBeInTheDocument();
    expect(plugin.load).toHaveBeenCalledTimes(2);
  });
  it("render crash is isolated; Open as Text recovers without refreshing", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = createBuiltinRegistry();
    const plugin = testPlugin("TestCrashViewer", {
      render: () => {
        throw new Error("render crash");
      },
    });
    registry.register(plugin);
    render(<ViewerHost {...input()} registry={registry} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file viewer encountered an error.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open as Text" }));
    expect(await screen.findByLabelText("Read-only text")).toHaveTextContent(
      "hello 世界",
    );
    expect(plugin.dispose).toHaveBeenCalledOnce();
    logging.mockRestore();
  });
  it("binary failures do not offer Open as Text", async () => {
    const registry = new ViewerRegistry();
    registry.register(
      testPlugin("binary", {
        supportedTypes: ["binary"],
        load: async () => {
          throw new Error("load");
        },
      }),
    );
    render(
      <ViewerHost
        {...input()}
        file={{
          ...descriptor(),
          detectedType: "binary",
          isText: false,
          isBinary: true,
        }}
        registry={registry}
      />,
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Open as Text" }),
    ).not.toBeInTheDocument();
  });
  it("modes, scroll and wrap metadata restore independently on A → B → A", async () => {
    const registry = createBuiltinRegistry();
    const a = input("A.txt"),
      b = input("B.txt");
    const view = render(<ViewerHost {...a} registry={registry} />);
    await screen.findByLabelText("Wrap lines");
    fireEvent.click(screen.getByLabelText("Wrap lines"));
    const scroll = view.container.querySelector(".viewer-scroll")!;
    fireEvent.scroll(scroll, { target: { scrollTop: 140 } });
    view.rerender(<ViewerHost {...b} registry={registry} />);
    await screen.findByLabelText("Wrap lines");
    expect(screen.getByLabelText("Wrap lines")).toBeChecked();
    view.rerender(<ViewerHost {...a} registry={registry} />);
    await screen.findByLabelText("Wrap lines");
    expect(screen.getByLabelText("Wrap lines")).not.toBeChecked();
    expect(scroll.scrollTop).toBe(140);
    const store = new ViewerSessionStore();
    store.update(a.source, "mode-plugin", {
      mode: "split",
      metadata: { nodes: [1] },
    });
    expect(store.get(b.source, "mode-plugin").mode).toBeUndefined();
    expect(store.get(a.source, "mode-plugin").mode).toBe("split");
  });
  it("capabilities drive controls, plugin-defined modes and all optional slots", async () => {
    const registry = new ViewerRegistry();
    registry.register(
      testPlugin("TestPriorityViewer", {
        capabilities: { inspect: true, search: true, source: false },
        inspect: async () => ({ count: 3 }),
        renderInspection: (value) => (
          <div>Custom inspection: {(value as { count: number }).count}</div>
        ),
        modes: [
          { id: "first", label: "First" },
          { id: "second", label: "Second" },
        ],
        render: (props) => <p>{`Mode ${props.mode}`}</p>,
        slots: () => ({
          header: "Plugin header",
          toolbar: "Plugin toolbar",
          leftPanel: "Plugin outline",
          statusBar: "Plugin status",
        }),
      }),
    );
    render(<ViewerHost {...input()} registry={registry} />);
    await screen.findByText("Mode first");
    expect(
      screen.queryByRole("button", { name: "Source" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(screen.getByText("Mode second")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(
      await screen.findByRole("region", { name: "Viewer inspection" }),
    ).toHaveTextContent("Custom inspection: 3");
    expect(screen.getByText("Plugin toolbar")).toBeInTheDocument();
    expect(screen.getByText("Plugin outline")).toBeInTheDocument();
    expect(screen.getByText("Plugin status")).toBeInTheDocument();
  });
  it("unregistering a ready viewer disposes it and switches to fallback", async () => {
    const registry = createBuiltinRegistry();
    const plugin = testPlugin("TestDisposeViewer");
    registry.register(plugin);
    render(<ViewerHost {...input()} registry={registry} />);
    await screen.findByText("Model: sample.txt");
    act(() => {
      registry.unregister(plugin.id);
    });
    await screen.findByLabelText("Read-only text");
    expect(plugin.dispose).toHaveBeenCalledOnce();
  });
  it("same-name replacement files do not retain the previous render crash", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = new ViewerRegistry();
    registry.register(
      testPlugin("TestCrashViewer", {
        render: ({ model }) => {
          if (model === "bad") throw new Error("crash");
          return <p>Recovered file</p>;
        },
        load: (c) => c.source.readText(),
      }),
    );
    const view = render(
      <ViewerHost
        file={descriptor()}
        source={source("bad")}
        registry={registry}
      />,
    );
    await screen.findByRole("alert");
    view.rerender(
      <ViewerHost
        file={descriptor()}
        source={source("good")}
        registry={registry}
      />,
    );
    expect(await screen.findByText("Recovered file")).toBeInTheDocument();
    logging.mockRestore();
  });
  it("desktop actions are injected through services and only run on clicks", async () => {
    const actions = {
      openExternal: vi.fn(async () => {}),
      reveal: vi.fn(async () => {}),
    };
    render(
      <ViewerHost
        {...input()}
        file={{ ...descriptor(), isText: false, isBinary: true }}
        services={{ file: actions }}
      />,
    );
    await screen.findByRole("region", { name: "Hex Viewer" });
    expect(actions.openExternal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open externally" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reveal in folder" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reveal in folder" }));
    expect(actions.reveal).toHaveBeenCalledOnce();
  });
});
