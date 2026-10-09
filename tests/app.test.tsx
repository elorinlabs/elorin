import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { App } from "../src/app/App";
import { FileLoadError } from "../src/services/fileLoader";
import { createRecentFilesFixture } from "../src/fixtures/recentFiles";
import {
  selectionFromPath,
  type FileSelectionService,
} from "../src/services/fileSelection";
function setup() {
  const select = vi
    .fn<FileSelectionService["select"]>()
    .mockResolvedValue(null);
  const listenDrop = vi
    .fn<FileSelectionService["listenDrop"]>()
    .mockResolvedValue(vi.fn());
  render(
    <App
      mode="tauri"
      loader={{
        loadPath: async () => {
          throw new FileLoadError(
            "READ_FAILED",
            "Fixture adapter does not read files.",
          );
        },
        loadBrowserFile: async () => {
          throw new Error("Not used");
        },
      }}
      selectionService={{ select, listenDrop }}
      recentService={{ list: async () => createRecentFilesFixture() }}
    />,
  );
  return { select, listenDrop, user: userEvent.setup() };
}
describe("Application Shell", () => {
  it("renders shell, home, category entries and recent fixtures", async () => {
    setup();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /A unified file viewer.*for a simpler, more focused workflow/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("WELCOME TO ELORIN")).toBeInTheDocument();
    for (const name of [
      "Design Guidelines.pdf",
      "project.ts",
      "Landscape.jpg",
      "Sales Data.xlsx",
    ])
      expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Supported File Types" })).toBeInTheDocument();
  });
  it("navigates sidebar and updates active state", async () => {
    const { user } = setup();
    await user.click(within(screen.getByLabelText("Sidebar")).getByRole("button", { name: "Text & Code" }));
    expect(screen.getByRole("heading", { name: "Text & Code" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Sidebar")).getByRole("button", { name: "Text & Code" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: "Home" }));
    expect(
      screen.getByRole("heading", { name: /A unified file viewer.*for a simpler, more focused workflow/ }),
    ).toBeInTheDocument();
  });
  it.each(["ctrlKey", "metaKey"])(
    "%s + K focuses search and Escape blurs",
    (key) => {
      setup();
      fireEvent.keyDown(window, { key: "k", [key]: true });
      expect(
        screen.getByRole("textbox", { name: "Global search" }),
      ).toHaveFocus();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("textbox")).not.toHaveFocus();
    },
  );
  it.each([
    ["Open File", "file"],
    ["Open Folder", "folder"],
  ] as const)("%s calls native selection boundary", async (label, kind) => {
    const { select, user } = setup();
    select.mockResolvedValue(
      selectionFromPath("C:\\Projects\\README.md", kind),
    );
    await user.click(label === "Open File" ? within(screen.getByLabelText("Drag and drop files here")).getByRole("button", { name: label }) : screen.getByRole("button", { name: label }));
    expect(select).toHaveBeenCalledWith(kind);
    expect(
      await screen.findByText("C:\\Projects\\README.md"),
    ).toBeInTheDocument();
  });
  it("handles cancellation and selection errors", async () => {
    const { select, user } = setup();
    await user.click(within(screen.getByLabelText("Drag and drop files here")).getByRole("button", { name: "Open File" }));
    expect(screen.queryByText("Selected File")).not.toBeInTheDocument();
    select.mockRejectedValue(new Error("Selection failed"));
    await user.click(screen.getByRole("button", { name: "Open Folder" }));
    expect(await screen.findByText("Selection failed")).toBeInTheDocument();
  });
  it("toggles collapsed sidebar", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByLabelText("Sidebar")).toHaveClass("collapsed");
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByLabelText("Sidebar")).not.toHaveClass("collapsed");
  });
  it("receives dropped paths without reading contents", async () => {
    const { listenDrop } = setup();
    await waitFor(() => expect(listenDrop).toHaveBeenCalled());
    const [onDrop] = listenDrop.mock.calls[0];
    const { act } = await import("@testing-library/react");
    act(() => onDrop(["D:\\Data\\example.csv", "/tmp/notes.txt"]));
    expect(screen.getByText("Dropped Paths")).toBeInTheDocument();
    expect(screen.getByText("D:\\Data\\example.csv")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });
  it("releases asynchronously registered drop listener on unmount", async () => {
    let resolve!: (stop: () => void) => void;
    const stop = vi.fn();
    const service: FileSelectionService = {
      select: async () => null,
      listenDrop: () =>
        new Promise((r) => {
          resolve = r;
        }),
    };
    const { unmount } = render(
      <App
        selectionService={service}
        recentService={{ list: async () => [] }}
      />,
    );
    unmount();
    resolve(stop);
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
  it("extracts filenames across Windows and macOS paths", () => {
    expect(
      selectionFromPath("C:\\Users\\user\\Downloads\\", "folder").filename,
    ).toBe("Downloads");
    expect(selectionFromPath("/Users/user/notes.md", "file").filename).toBe(
      "notes.md",
    );
  });
});
