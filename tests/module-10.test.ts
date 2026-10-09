import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { detectBrowserFile } from "../src/services/detection/browserDetector";
import {
  loadWorkbook,
  loadSheet,
  coordinate,
  columnName,
} from "../src/viewer/plugins/spreadsheet/spreadsheet-model";
import {
  loadPresentation,
  loadSlide,
} from "../src/viewer/plugins/presentation/presentation-model";
import { SparseAxis } from "../src/viewer/shared/virtual-grid";
import { OfficePackage } from "../src/viewer/plugins/office/OfficePackage";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import type { ViewerContext } from "../src/viewer/core/types";
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal("Worker", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Unexpected network");
    }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:fixture"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanups.splice(0).forEach((f) => f());
  vi.unstubAllGlobals();
});
async function ctx(folder: string, name: string) {
  const bytes = new Uint8Array(
    readFileSync(`tests/fixtures/${folder}/${name}`),
  );
  const file = await detectBrowserFile(
    new NodeFile([bytes], name) as unknown as File,
  );
  return {
    file,
    signal: new AbortController().signal,
    source: {
      getSize: async () => bytes.length,
      readRange: async (o: number, n: number) => bytes.slice(o, o + n),
    },
    services: { file: {} },
    onCleanup: (f: () => void) => cleanups.push(f),
  } as unknown as ViewerContext;
}
const wb = async (name: string) => {
  const c = await ctx("spreadsheets", name);
  return loadWorkbook(c);
};
const ppt = async (name: string) => {
  const c = await ctx("presentations", name);
  return loadPresentation(c);
};
describe("Module 10 routing", () => {
  it.each([
    ["spreadsheets", "basic.xlsx", "xlsx"],
    ["spreadsheets", "macros.xlsm", "xlsm"],
    ["spreadsheets", "basic.ods", "ods"],
    ["spreadsheets", "legacy.xls", "xls"],
    ["presentations", "basic.pptx", "pptx"],
    ["presentations", "macros.pptm", "pptm"],
    ["presentations", "basic.odp", "odp"],
    ["presentations", "legacy.ppt", "ppt"],
  ])("%s %s → %s", async (folder, name, type) => {
    const c = await ctx(folder, name);
    expect(c.file.detectedType).toBe(type);
    expect(c.file.isBinary).toBe(true);
    const plugin = await createBuiltinRegistry().resolve(c.file);
    expect(plugin?.id).toBe(
      folder === "spreadsheets" ? "spreadsheet" : "presentation",
    );
  });
});
describe("Sparse workbook model and safety", () => {
  it("preserves identifiers, sparse cells, raw and formatted values", async () => {
    const m = await wb("basic.xlsx");
    expect(m.error).toBeUndefined();
    expect(m.sheets[0].cells.get("A2")?.raw).toBe("00012345678901234567890");
    expect(m.sheets[0].cells.get("B2")?.display).toBe("42");
  });
  it("uses saved formula results, represents missing cache and never evaluates DDE", async () => {
    const m = await wb("formulas.xlsx"),
      s = m.sheets[0];
    expect(s.cells.get("A1")?.display).toBe("3");
    expect(s.cells.get("B1")?.display).toBe("Result unavailable");
    expect(s.cells.get("C1")?.formula).toContain("cmd|");
    expect(s.cells.get("D1")?.display).toBe("#DIV/0!");
    expect(s.formulas).toBe(4);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("formats numbers with SSF and applies basic stored styles", async () => {
    const s = (await wb("formats.xlsx")).sheets[0];
    expect(s.cells.get("A1")?.display).toBe("1,234.50");
    expect(s.cells.get("B1")?.display).toBe("12.50%");
    expect(s.cells.get("C1")?.display).toBe("000042");
    expect(s.cells.get("D1")?.display).toBe("2024-01-01 12:00:00");
    expect(s.cells.get("G1")?.style.fontWeight).toBe("bold");
  });
  it("honors Excel 1900 leap compatibility and the 1904 epoch", async () => {
    const s = (await wb("dates.xlsx")).sheets[0];
    expect(s.cells.get("A1")?.display).toBe("2/28/00");
    expect(s.cells.get("B1")?.display).toBe("2/29/00");
    expect(s.cells.get("C1")?.display).toBe("3/1/00");
    expect(
      (await wb("dates-1904.xlsx")).sheets[0].cells.get("A1")?.display,
    ).toContain("1904-01-01");
  });
  it("retains a million-row / 16k-column extent using two stored cells", async () => {
    const s = (await wb("sparse.xlsx")).sheets[0];
    expect(s.cells.size).toBe(2);
    expect(s.rows).toBe(1048576);
    expect(s.columns).toBe(16384);
    expect(coordinate("XFD1048576")).toEqual([1048575, 16383]);
    expect(coordinate("XFE1")).toBeUndefined();
  });
  it("keeps hidden / veryHidden state and loads sheets lazily", async () => {
    const m = await wb("hidden.xlsx");
    expect(m.sheets.map((s) => s.state)).toEqual([
      "visible",
      "hidden",
      "veryHidden",
    ]);
    expect(m.sheets[1].loaded).toBe(false);
    expect(m.sheets[0].hiddenRows).toBe(1);
    expect(m.sheets[0].hiddenCols).toBe(1);
    await loadSheet(m, 2, new AbortController().signal);
    expect(m.sheets[2].cells.get("A1")?.display).toBe("Very hidden sheet");
  });
  it("preserves merges, frozen panes, comments, conditional rules and names", async () => {
    expect((await wb("merged.xlsx")).sheets[0].merges[0]).toEqual({
      row: 0,
      column: 0,
      endRow: 3,
      endColumn: 3,
    });
    expect((await wb("freeze-panes.xlsx")).sheets[0].freezeRows).toBe(1);
    expect(
      (await wb("comments.xlsx")).sheets[0].cells.get("A1")?.comment,
    ).toContain("Reviewer");
    expect((await wb("conditional.xlsx")).sheets[0].conditionalFormats).toBe(1);
    expect((await wb("basic.xlsx")).names[0].name).toBe("Example");
  });
  it("detects charts / images / macros / external data without network", async () => {
    const m = await wb("charts.xlsx");
    expect(m.sheets[0].charts).toHaveLength(1);
    expect(m.sheets[0].images).toHaveLength(1);
    expect((await wb("macros.xlsm")).pkg?.macros).toBe(true);
    const ext = await wb("external-links.xlsx");
    expect([ext.externalLinks, ext.connections, ext.pivots]).toEqual([1, 1, 1]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("parses ODS values and gives an honest legacy fallback", async () => {
    const m = await wb("basic.ods");
    expect(m.error).toBeUndefined();
    expect(m.sheets[0].cells.get("B1")?.display).toBe("42");
    expect((await wb("legacy.xls")).limited).toContain("Limited Preview");
  });
  it.each(["malformed.xlsx", "xxe.xlsx", "traversal.xlsx", "zip-bomb.xlsx"])(
    "rejects %s",
    async (name) => {
      expect((await wb(name)).error).toBeTruthy();
    },
  );
  it("bounds parsed sheet cache and supports cancellation", async () => {
    const m = await wb("many-sheets.xlsx");
    for (let i = 1; i < 8; i++)
      await loadSheet(m, i, new AbortController().signal);
    expect(m.cache.size).toBeLessThanOrEqual(3);
    expect(m.sheets[0].loaded).toBe(false);
    const c = new AbortController();
    c.abort();
    await expect(loadSheet(m, 0, c.signal)).rejects.toThrow();
  });
  it("loads 100,000 rows without dense ranges", async () => {
    const m = await wb("large.xlsx");
    expect(m.error).toBeUndefined();
    expect(m.sheets[0].rows).toBe(100000);
    expect(m.sheets[0].cells.get("A100000")?.display).toBe("100000");
  }, 30000);
  it("virtualizes variable / hidden axes without million-item allocations", () => {
    const axis = new SparseAxis(
      1048576,
      28,
      new Map([
        [1, 0],
        [10, 56],
      ]),
    );
    expect(axis.offset(2)).toBe(28);
    expect(axis.at(28)).toBe(2);
    expect(axis.window(20000000, 500).length).toBeLessThan(40);
    expect(columnName(999)).toBe("ALL");
  });
});
describe("Presentation static model", () => {
  it("loads current slide lazily with geometry / runs / Unicode", async () => {
    const m = await ppt("basic.pptx");
    expect(m.error).toBeUndefined();
    expect([m.width, m.height]).toEqual([960, 540]);
    expect(m.slides[0].title).toBe("Prism Presentation");
    expect(m.slides[1].loaded).toBe(false);
    await loadSlide(m, 1, new AbortController().signal);
    expect(m.slides[1].title).toContain("中文");
    expect(m.slides[0].shapes[0].paragraphs[0].runs[0].bold).toBe(true);
  });
  it("keeps embedded image, table and chart placeholder content", async () => {
    expect((await ppt("images.pptx")).slides[0].images).toBe(1);
    expect(
      (await ppt("tables.pptx")).slides[0].shapes.find(
        (s) => s.kind === "table",
      )?.table?.[0],
    ).toEqual(["Product", "42"]);
    expect(
      (await ppt("charts.pptx")).slides[0].shapes.find((s) =>
        s.label?.startsWith("Chart"),
      )?.label,
    ).toContain("Quarterly sales");
  });
  it("extracts notes and safe internal links, blocks program actions", async () => {
    expect((await ppt("notes.pptx")).slides[0].notes).toContain(
      "Private speaker note",
    );
    const m = await ppt("links.pptx"),
      shapes = m.slides[0].shapes;
    expect(shapes[0].paragraphs[0].runs[0].link).toBe(
      "slide:ppt/slides/slide2.xml",
    );
    expect(shapes[2].paragraphs[0].runs[0].link).toBeUndefined();
  });
  it("detects inert animations, media, OLE, macros and blocks remote images", async () => {
    expect((await ppt("animations.pptx")).slides[0].animations).toBe(2);
    expect((await ppt("macros.pptm")).pkg?.macros).toBe(true);
    const media = (await ppt("embedded-media.pptx")).slides[0];
    expect(media.video).toBe(1);
    expect(media.objects).toBe(1);
    expect(
      (await ppt("remote-image.pptx")).slides[0].shapes[0].label,
    ).toContain("blocked");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("caps slide cache at five for 1000 slides", async () => {
    const m = await ppt("many-slides.pptx");
    expect(m.slides.length).toBe(1000);
    for (let i = 1; i < 8; i++)
      await loadSlide(m, i, new AbortController().signal);
    expect(m.cache.size).toBe(5);
    expect(m.slides[0].loaded).toBe(false);
    expect((await loadSlide(m, 999, new AbortController().signal)).title).toBe(
      "Slide 1000",
    );
  });
  it("reads ODP and reports malformed / legacy content", async () => {
    expect(
      (await ppt("basic.odp")).slides[0].shapes[0].paragraphs[0].runs[0].text,
    ).toBe("OpenDocument presentation");
    expect((await ppt("legacy.ppt")).limited).toBeTruthy();
    expect((await ppt("malformed.pptx")).error).toBeTruthy();
  });
  it("releases image URLs and package buffers on cleanup", async () => {
    const m = await ppt("images.pptx"),
      pkg = m.pkg as OfficePackage;
    pkg.image("ppt/media/image1.png");
    expect(URL.createObjectURL).toHaveBeenCalled();
    pkg.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(pkg.entries.size).toBe(0);
  });
});
