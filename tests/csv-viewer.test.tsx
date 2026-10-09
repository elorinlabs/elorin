import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ViewerHost } from "../src/viewer/components/ViewerHost";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { BrowserFileSource } from "../src/services/fileSource";
import { resolveSample } from "../src/services/detection/browserDetector";
import { loadCsv } from "../src/viewer/plugins/csv/csv-load";
import { CsvChunkParser } from "../src/viewer/plugins/csv/csv-parser";
import { CsvGrid } from "../src/viewer/plugins/csv/CsvGrid";
import { TabularDocumentModel } from "../src/viewer/plugins/csv/csv-model";
import type { ViewerContext } from "../src/viewer/core/types";
const basic =
  "id,name,city,active,revenue\n1,Alice,Tokyo,true,1284.42\n2,Bob,Osaka,false,892.10\n3,Carol,Kyoto,true,4218.00\n";
const input = (text = basic, name = "basic.csv") => ({
  file: resolveSample(
    name,
    new TextEncoder().encode(text),
    new TextEncoder().encode(text).length,
  ),
  source: new BrowserFileSource(new File([text], name)),
  services: { file: {} },
});
const context = (text = basic): ViewerContext => ({
  ...input(text),
  signal: new AbortController().signal,
  onCleanup() {},
});
async function open(text = basic, name = "basic.csv") {
  const data = input(text, name);
  render(<ViewerHost {...data} />);
  await screen.findByRole("grid");
  return data;
}
async function inspect() {
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  return screen.findByLabelText("CSV inspection");
}
describe("CSV registry and surfaces", () => {
  it("clearing an in-flight filter and superseding search removes stale progress/results", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByLabelText("Filter value"), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear view" }));
    await waitFor(() =>
      expect(screen.queryByText(/Updating view/)).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("gridcell", { name: "Bob" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search CSV"), {
      target: { value: "Tokyo" },
    });
    fireEvent.change(screen.getByLabelText("Search CSV"), {
      target: { value: "Osaka" },
    });
    await screen.findByText("1 matches");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent(
      "Osaka",
    );
  });
  it("search Next advances across different columns without resetting results", async () => {
    await open("id,name,city\n1,Tokyo,Osaka\n2,Bob,Tokyo");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search CSV"), {
      target: { value: "Tokyo" },
    });
    await screen.findByText("2 matches");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("gridcell", { selected: true })).toHaveAttribute(
      "aria-colindex",
      "3",
    );
    await new Promise((r) => setTimeout(r, 260));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("gridcell", { selected: true })).toHaveAttribute(
      "aria-colindex",
      "4",
    );
  });
  it.each(["csv", "tsv", "tab"])("lazy registry supports %s", async (ext) => {
    const r = createBuiltinRegistry();
    expect(r.getById("csv")?.loaded).toBe(false);
    expect(
      (await r.resolve(input("id\tname\n1\tAlice", `test.${ext}`).file))?.id,
    ).toBe("csv");
    expect((await r.resolve(input("plain", "sample.txt").file))?.id).toBe(
      "core.text-fallback",
    );
  });
  it("reads once, defaults Table; Source preserves original and Split shares model", async () => {
    const data = input(),
      read = vi.spyOn(data.source, "readRange");
    render(<ViewerHost {...data} />);
    await screen.findByRole("grid");
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only CSV source").textContent).toBe(
      basic,
    );
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByLabelText("Read-only CSV source")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("cell/row/column selection drives shared Inspector and raw values", async () => {
    await open();
    const panel = await inspect();
    fireEvent.click(screen.getByRole("gridcell", { name: "Alice" }));
    expect(panel).toHaveTextContent("CELL");
    expect(panel).toHaveTextContent("Alice");
    fireEvent.click(screen.getByRole("rowheader", { name: "2" }));
    expect(panel).toHaveTextContent("ROW");
    expect(panel).toHaveTextContent("Bob");
    fireEvent.click(screen.getByRole("button", { name: /revenue/ }));
    expect(panel).toHaveTextContent("COLUMN");
    expect(panel).toHaveTextContent("Number");
    expect(panel).toHaveTextContent("892.1");
    fireEvent.click(screen.getByRole("button", { name: "Dataset" }));
    expect(panel).toHaveTextContent("TABULAR DATA");
  });
  it("headerless data and header override preserve all fields and stable IDs", async () => {
    await open("Alice,28,Tokyo\nBob,31,Osaka\n", "headerless.csv");
    expect(screen.getByLabelText("First row is header")).not.toBeChecked();
    expect(screen.getByRole("gridcell", { name: "Alice" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("First row is header"));
    expect(
      screen.queryByRole("gridcell", { name: "Alice" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alice/ })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("First row is header"));
    expect(screen.getByRole("gridcell", { name: "Alice" })).toBeInTheDocument();
  });
  it("duplicate names and ragged columns do not overwrite data", async () => {
    await open("name,name,age\nAlice,A,28\nBob,B\nC,D,3,extra");
    expect(screen.getAllByRole("button", { name: /^name/ })).toHaveLength(2);
    expect(screen.getByRole("gridcell", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "extra" })).toBeInTheDocument();
    expect(screen.getByText(/Duplicate column names/)).toBeInTheDocument();
  });
  it("keyboard navigation uses one grid tab stop and resizes columns by keyboard", async () => {
    await open();
    const grid = screen.getByRole("grid");
    grid.focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent(
      "Alice",
    );
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent(
      "Bob",
    );
    fireEvent.keyDown(grid, { key: "End" });
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent(
      "892.10",
    );
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.getByLabelText("Cell preview")).toHaveTextContent("892.10");
    const separator = screen.getByRole("separator", {
        name: "Resize column 1",
      }),
      parent = separator.parentElement!,
      old = parent.style.width;
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(parent.style.width).not.toBe(old);
    expect(
      within(grid)
        .getAllByRole("gridcell")
        .every((cell) => cell.tabIndex !== 0),
    ).toBe(true);
  });
  it("search all/current columns, Unicode and result navigation", async () => {
    await open("id,name,city\n1,中文,Tokyo\n2,Bob,Osaka");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search CSV"), {
      target: { value: "中文" },
    });
    await screen.findByText("1 matches");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent(
      "中文",
    );
    fireEvent.change(screen.getByLabelText("Search columns"), {
      target: { value: "current" },
    });
    fireEvent.change(screen.getByLabelText("Search CSV"), {
      target: { value: "Tokyo" },
    });
    await screen.findByText("0 matches");
  });
  it("filters and stable sort are presentation only; row numbers retain original indices", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByLabelText("Filter column"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Filter value"), {
      target: { value: "Tokyo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("gridcell", { name: "Bob" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("rowheader", { name: "1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear view" }));
    await screen.findByRole("gridcell", { name: "Bob" });
    fireEvent.click(screen.getByRole("button", { name: /revenue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
    await waitFor(() =>
      expect(screen.getAllByRole("rowheader")[0]).toHaveTextContent("2"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only CSV source").textContent).toBe(
      basic,
    );
  });
  it("copies raw cells and correctly quotes CSV rows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await open('id,value\n1,"Hello, ""World"""\n');
    fireEvent.click(screen.getByRole("gridcell", { name: 'Hello, "World"' }));
    fireEvent.click(screen.getByRole("button", { name: "Copy value" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Hello, "World"'),
    );
    fireEvent.click(screen.getByRole("rowheader", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy row" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('1,"Hello, ""World"""'),
    );
  });
  it("renders hostile HTML/formula/URL as plain text, and preserves numeric IDs", async () => {
    await open(
      "id,value\n00123,<script>globalThis.pwned=true</script>\n9223372036854775807,=SUM(A1:A10)\n3,javascript:alert(1)",
    );
    expect(screen.getByRole("gridcell", { name: "00123" })).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: "9223372036854775807" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("grid").querySelector("script,a,img")).toBeNull();
    expect((globalThis as any).pwned).toBeUndefined();
  });
  it.each(["", "name,age,city\n"])(
    "empty / header-only document %s",
    async (text) => {
      await open(text);
      expect(
        screen.getByText(text ? "No data rows" : "Empty tabular document"),
      ).toBeInTheDocument();
    },
  );
  it("malformed input keeps partial rows and original Source", async () => {
    const text = 'id,value\n1,ok\n2,"broken';
    await open(text);
    expect(screen.getByRole("gridcell", { name: "ok" })).toBeInTheDocument();
    expect(screen.getByText(/Quoted field unterminated/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("Read-only CSV source").textContent).toBe(
      text,
    );
  });
});
describe("CSV window and loading lifecycle", () => {
  it("virtualizes rows AND 10,000 columns without accumulating DOM", () => {
    const model = new TabularDocumentModel(1, "utf-8");
    model.append([
      Array.from({ length: 10000 }, (_, i) => `column${i}`),
      ...Array.from({ length: 3 }, () =>
        Array.from({ length: 10000 }, (_, i) => String(i)),
      ),
    ]);
    model.refreshStats(true);
    const select = vi.fn();
    render(
      <CsvGrid
        model={model}
        header
        rows={undefined}
        selection={{ kind: "none" }}
        select={select}
        widths={{}}
        resize={() => {}}
        scroll={{ top: 0, left: 0 }}
        saveScroll={() => {}}
        navigation={0}
        inspect={() => {}}
      />,
    );
    const grid = screen.getByRole("grid");
    expect(screen.getAllByRole("columnheader").length).toBeLessThan(20);
    expect(screen.getAllByRole("gridcell").length).toBeLessThan(60);
    fireEvent.scroll(grid, { target: { scrollLeft: 900000 } });
    expect(screen.getAllByRole("columnheader").length).toBeLessThan(20);
  });
  it("preserves Source BOM decoding and surfaces decoding/read errors", async () => {
    expect((await loadCsv(context("\uFEFF" + basic))).rowSource.get(0)).toEqual(
      ["id", "name", "city", "active", "revenue"],
    );
    const c = context();
    c.source.readRange = vi
      .fn()
      .mockRejectedValue(new Error("Permission denied"));
    await expect(loadCsv(c)).rejects.toThrow("Permission denied");
    const d = context();
    d.source.readRange = async () => new Uint8Array([255]);
    await expect(loadCsv(d)).rejects.toThrow();
  });
  it("progressive batches become ready before all ranges, and terminate on cancellation", async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage?: (e: MessageEvent) => void;
      onerror?: () => void;
      terminate = vi.fn();
      parser = new CsvChunkParser();
      decoder = new TextDecoder();
      constructor() {
        FakeWorker.instances.push(this);
      }
      postMessage(d: any) {
        setTimeout(() => {
          const text = this.decoder.decode(d.bytes, { stream: !d.final });
          this.onmessage?.({
            data: { ...this.parser.feed(text, d.final), preview: text },
          } as MessageEvent);
        }, 5);
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    try {
      const text =
          "id,value\n" +
          Array.from({ length: 70000 }, (_, i) => `${i},value${i}\n`).join(""),
        c = context(text),
        controller = new AbortController();
      c.signal = controller.signal;
      const read = vi.spyOn(c.source, "readRange");
      const m = await loadCsv(c);
      expect(m.status).toBe("indexing");
      expect(m.rowSource.count).toBeGreaterThan(0);
      expect(read.mock.calls.length).toBeLessThan(
        Math.ceil(text.length / 262144),
      );
      controller.abort();
      await new Promise((r) => setTimeout(r, 20));
      expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
      const count = m.rowSource.count;
      await new Promise((r) => setTimeout(r, 20));
      expect(m.rowSource.count).toBe(count);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
