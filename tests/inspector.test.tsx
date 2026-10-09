import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { App } from "../src/app/App";
import { resolveSample } from "../src/services/detection/browserDetector";
import { FileLoadError, type FileLoader } from "../src/services/fileLoader";
import type { FileSelectionService } from "../src/services/fileSelection";
const descriptor = () => ({
  ...resolveSample(
    "fake.jpg",
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    8,
  ),
  path: "C:\\QA\\fake.jpg",
  mode: "tauri" as const,
});
function setup(mode: "tauri" | "browser" = "tauri") {
  const service: FileSelectionService = {
    select: vi
      .fn()
      .mockResolvedValue({
        path: "C:\\QA\\fake.jpg",
        filename: "fake.jpg",
        kind: "file",
      }),
    listenDrop: vi.fn().mockResolvedValue(() => {}),
  };
  const loader: FileLoader = {
    loadPath: vi.fn().mockResolvedValue(descriptor()),
    loadBrowserFile: vi
      .fn()
      .mockResolvedValue({ ...descriptor(), mode: "browser", path: null }),
  };
  render(
    <App
      mode={mode}
      selectionService={service}
      loader={loader}
      recentService={{ list: async () => [] }}
    />,
  );
  return { service, loader };
}
describe("Inspector pipeline", () => {
  it("selects file → loader → descriptor and mismatch warning", async () => {
    const { loader } = setup();
    fireEvent.click(within(screen.getByLabelText("Drag and drop files here")).getByRole("button", { name: "Open File" }));
    expect(
      await screen.findByRole("region", { name: "File Inspector" }),
    ).toBeInTheDocument();
    expect(loader.loadPath).toHaveBeenCalledWith("C:\\QA\\fake.jpg");
    expect(within(screen.getByRole("region", { name: "File Inspector" })).getByText("PNG")).toBeInTheDocument();
    expect(screen.getByText("jpg")).toBeInTheDocument();
    expect(screen.getByText("EXTENSION_MISMATCH")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "fake.jpg" }),
    ).not.toBeInTheDocument();
  });
  it("uses same loader for drop and handles errors", async () => {
    const { service, loader } = setup();
    vi.mocked(loader.loadPath).mockRejectedValue(
      new FileLoadError("NOT_A_FILE", "Folders are not inspected."),
    );
    await waitFor(() => expect(service.listenDrop).toHaveBeenCalled());
    await act(async () =>
      vi.mocked(service.listenDrop).mock.calls[0][0](["C:\\QA\\folder"]),
    );
    expect(loader.loadPath).toHaveBeenCalledWith("C:\\QA\\folder");
    expect(screen.getByRole("alert")).toHaveTextContent("NOT_A_FILE");
  });
  it("does not recursively inspect selected folders", async () => {
    const { service, loader } = setup();
    vi.mocked(service.select).mockResolvedValue({
      path: "C:\\QA",
      filename: "QA",
      kind: "folder",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Folder" }));
    expect(await screen.findByText("Selected Folder")).toBeInTheDocument();
    expect(loader.loadPath).not.toHaveBeenCalled();
  });
  it("browser input uses File without inventing path", async () => {
    const { loader } = setup("browser");
    const file = new File(["hello"], "sample.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose browser file"), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText("Unavailable in Browser Preview"),
    ).toBeInTheDocument();
    expect(loader.loadBrowserFile).toHaveBeenCalledWith(file);
    expect(loader.loadPath).not.toHaveBeenCalled();
  });
  it("ignores outdated in-flight results after a newer drop", async () => {
    const { service, loader } = setup();
    let resolve!: (d: ReturnType<typeof descriptor>) => void;
    vi.mocked(loader.loadPath)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce({ ...descriptor(), name: "new.png" });
    await waitFor(() => expect(service.listenDrop).toHaveBeenCalled());
    act(() => vi.mocked(service.listenDrop).mock.calls[0][0](["old.jpg"]));
    await act(async () =>
      vi.mocked(service.listenDrop).mock.calls[0][0](["new.png"]),
    );
    await act(async () => resolve({ ...descriptor(), name: "old.jpg" }));
    expect(
      screen.getByRole("heading", { name: "new.png" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "old.jpg" }),
    ).not.toBeInTheDocument();
  });
});
