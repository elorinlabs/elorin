import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { zipSync, strToU8 } from "fflate";
import {
  safeXml,
  unpackOffice,
  OFFICE_BUDGET,
} from "../src/viewer/plugins/office/package";
import {
  loadOffice,
  parsePackage,
  parseRtf,
} from "../src/viewer/plugins/office/office-model";
import { detectBrowserFile } from "../src/services/detection/browserDetector";
import type { ViewerContext } from "../src/viewer/core/types";
const bytes = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/documents/${name}`));
const cleanups: (() => void)[] = [];
const context = () =>
  ({
    signal: new AbortController().signal,
    onCleanup: (fn: () => void) => {
      cleanups.push(fn);
    },
    services: { file: {} },
  }) as unknown as ViewerContext;
beforeEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.stubGlobal("Worker", undefined);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});
describe("Office detection and security", () => {
  it.each([
    ["basic.docx", "docx"],
    ["basic.odt", "odt"],
    ["basic.rtf", "rtf"],
    ["legacy.doc", "doc"],
    ["basic.pdf", "pdf"],
  ])("detects %s by package or magic", async (name, type) => {
    const file = await detectBrowserFile(
      new NodeFile([bytes(name)], name) as unknown as File,
    );
    expect(file.detectedType).toBe(type);
    expect(file.isText).toBe(type === "rtf");
  });
  it("detects renamed ODT and DOCX by content", async () => {
    for (const name of ["basic.odt", "basic.docx"])
      expect(
        (
          await detectBrowserFile(
            new NodeFile([bytes(name)], "renamed.bin") as unknown as File,
          )
        ).detectedType,
      ).toBe(name.split(".")[1]);
  });
  it.each(["../evil", "/evil", "C:evil", "a\\evil"])(
    "rejects unsafe package name %s",
    (name) =>
      expect(() => unpackOffice(zipSync({ [name]: strToU8("text") }))).toThrow(
        /Unsafe/,
      ),
  );
  it("rejects CRC corruption", () => {
    const archive = zipSync({ "text.txt": strToU8("text") }, { level: 0 });
    archive[38] ^= 1;
    expect(() => unpackOffice(archive)).toThrow(/checksum/);
  });
  it("rejects forged decompressed sizes before inflating", () => {
    const archive = zipSync({ "text.txt": strToU8("text") });
    const view = new DataView(archive.buffer);
    const central = archive.findIndex(
      (_, i) =>
        archive[i] === 80 &&
        archive[i + 1] === 75 &&
        archive[i + 2] === 1 &&
        archive[i + 3] === 2,
    );
    view.setUint32(central + 24, OFFICE_BUDGET.entry + 1, true);
    expect(() => unpackOffice(archive)).toThrow(/oversized/);
  });
  it("rejects dishonest small decompressed size", () => {
    const archive = zipSync({ "text.txt": strToU8("a".repeat(5000)) });
    const view = new DataView(archive.buffer),
      central = archive.findIndex(
        (_, i) =>
          archive[i] === 80 &&
          archive[i + 1] === 75 &&
          archive[i + 2] === 1 &&
          archive[i + 3] === 2,
      );
    view.setUint32(central + 24, 4, true);
    expect(() => unpackOffice(archive)).toThrow(/budget/);
  });
  it.each([
    '<!DOCTYPE x SYSTEM "file:///secret"><x/>',
    '<!DOCTYPE x [<!ENTITY y "secret">]><x>&y;</x>',
    "<a><b></a>",
    "<a>".repeat(70) + "</a>".repeat(70),
  ])("rejects unsafe or malformed XML", (source) =>
    expect(() => safeXml(strToU8(source))).toThrow(),
  );
});
describe("Office reading model", () => {
  it("preserves DOCX paragraphs, headings, inline styles, lists, tables, page breaks and embedded images", () => {
    const model = parsePackage(
      unpackOffice(bytes("basic.docx")),
      "docx",
      context(),
    );
    expect(
      model.blocks.some(
        (block) => block.kind === "heading" && block.level === 1,
      ),
    ).toBe(true);
    expect(model.blocks.some((block) => block.list === "•")).toBe(true);
    const runs = model.blocks.flatMap((block) => block.runs);
    expect(runs.some((run) => run.bold && run.text === "Bold")).toBe(true);
    expect(runs.some((run) => run.italic)).toBe(true);
    expect(runs.some((run) => run.underline)).toBe(true);
    expect(runs.some((run) => run.image === "blob:test")).toBe(true);
    expect(
      model.blocks.find((block) => block.kind === "table")?.rows,
    ).toHaveLength(3);
    expect(model.blocks.some((block) => block.pageBreak)).toBe(true);
    expect(model.metadata.creator).toBe("Prism QA");
    expect(cleanups).toHaveLength(1);
  });
  it("retains external hyperlink targets without fetching them", () => {
    const model = parsePackage(
      unpackOffice(bytes("links.docx")),
      "docx",
      context(),
    );
    expect(
      model.blocks
        .flatMap((block) => block.runs)
        .find((run) => run.text === "External link")?.link,
    ).toBe("https://example.com");
  });
  it("shows insertions and omits deletions", () => {
    const entries = unpackOffice(bytes("basic.docx"));
    entries.set(
      "word/document.xml",
      strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:ins><w:r><w:t>Inserted</w:t></w:r></w:ins><w:del><w:r><w:t>Deleted</w:t></w:r></w:del></w:p></w:body></w:document>',
      ),
    );
    const model = parsePackage(entries, "docx", context());
    expect(model.blocks[0].runs.map((run) => run.text).join("")).toBe(
      "Inserted",
    );
    expect(model.warnings.join()).toMatch(/Tracked changes/);
  });
  it("preserves ODT heading, table and list", () => {
    const model = parsePackage(
      unpackOffice(bytes("basic.odt")),
      "odt",
      context(),
    );
    expect(model.blocks[0].kind).toBe("heading");
    expect(model.blocks.some((block) => block.list)).toBe(true);
    expect(
      model.blocks.find((block) => block.kind === "table")?.rows?.[0],
    ).toHaveLength(2);
  });
  it("RTF Unicode, styles and escaped braces", () => {
    const model = parseRtf(
      "{\\rtf1\\uc1 \\u20013?\\u25991? {\\b Bold} \\{brace\\}}",
    );
    expect(model.blocks[0].runs.map((run) => run.text).join("")).toBe(
      "中文 Bold {brace}",
    );
    expect(
      model.blocks[0].runs.some((run) => run.bold && run.text === "Bold"),
    ).toBe(true);
  });
  it("RTF tables, colors and alignment", () => {
    const model = parseRtf(
      "{\\rtf1{\\colortbl;\\red255\\green0\\blue0;}\\qc\\cf1 Red\\par\\trowd A\\cell B\\cell\\row}",
    );
    expect(model.blocks[0].align).toBe("center");
    expect(model.blocks[0].runs[0].color).toBe("#ff0000");
    expect(model.blocks[1].rows?.[0]).toHaveLength(2);
  });
  it("coalesces plain RTF text to bounded formatting runs", () =>
    expect(
      parseRtf("{\\rtf1 " + "a".repeat(100000) + "}").blocks[0].runs,
    ).toHaveLength(1));
  it("ignores RTF objects and destinations while showing placeholders", () => {
    const model = parseRtf(
      "{\\rtf1 Visible {\\object secret} {\\*\\evil hidden} End}",
    );
    expect(
      model.blocks
        .flatMap((block) => block.runs)
        .map((run) => run.text)
        .join(""),
    ).not.toMatch(/secret|hidden/);
    expect(model.warnings).toHaveLength(2);
  });
  it.each([
    "{\\rtf1 broken",
    "{\\rtf1 \\bin999 x}",
    "{\\rtf1 " + "{".repeat(70) + "}".repeat(71),
  ])("rejects damaged RTF", (source) =>
    expect(() => parseRtf(source)).toThrow(),
  );
  it("bounded FileSource load never uses readAll and returns a recoverable error", async () => {
    const data = bytes("malformed.docx"),
      ctx = context();
    ctx.file = { detectedType: "docx" } as ViewerContext["file"];
    ctx.source = {
      getSize: async () => data.length,
      readRange: async (start, length) => data.slice(start, start + length),
      readAll: vi.fn(),
      readText: vi.fn(),
    };
    const model = await loadOffice(ctx);
    expect(model.error).toMatch(/declarations/);
    expect(ctx.source.readAll).not.toHaveBeenCalled();
  });
  it("releases previously allocated images when a later XML part fails", async () => {
    const entries = unpackOffice(bytes("basic.docx"));
    entries.set(
      "word/footnotes.xml",
      strToU8('<!DOCTYPE x SYSTEM "file:///secret"><x/>'),
    );
    const data = zipSync(Object.fromEntries(entries)),
      ctx = context();
    ctx.file = { detectedType: "docx" } as ViewerContext["file"];
    ctx.source = {
      getSize: async () => data.length,
      readRange: async (start, length) => data.slice(start, start + length),
      readAll: vi.fn(),
      readText: vi.fn(),
    };
    const model = await loadOffice(ctx);
    expect(model.error).toMatch(/declarations/);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    cleanups.splice(0).forEach((release) => release());
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
