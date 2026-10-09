import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import {
  extensionOf,
  extensionMap,
  SAMPLE_LIMIT,
  TAIL_LIMIT,
} from "../src/services/detection/rules";
import {
  resolveSample,
  detectBrowserFile,
  decodeText,
  magicType,
  contentType,
  inspectZip,
} from "../src/services/detection/browserDetector";
import type { DetectedFileType } from "../src/types/files";
const bytes = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/files/${name}`));
const file = (name: string, type = "") =>
  new NodeFile([bytes(name)], name, {
    type,
    lastModified: 123456,
  }) as unknown as File;
describe("File detection rules", () => {
  it.each([
    ["README.MD", "md"],
    ["bundle.test.TS", "ts"],
    ["Dockerfile", null],
    [".env", null],
    [".gitignore", null],
    ["name.", null],
    [".config.json", "json"],
  ])("extension %s", (name, extension) =>
    expect(extensionOf(name!)).toBe(extension),
  );
  it("maps aliases and preserves extension separately", () => {
    expect(extensionMap.mdown).toBe("markdown");
    expect(extensionMap.mjs).toBe("javascript");
    const result = resolveSample(
      "photo.JPG",
      bytes("sample.png"),
      bytes("sample.png").length,
    );
    expect(result.extension).toBe("jpg");
    expect(result.detectedType).toBe("png");
    expect(result.warnings).toContainEqual({
      code: "EXTENSION_MISMATCH",
      expected: "jpeg",
      detected: "png",
    });
  });
  it.each([
    ["sample.png", "png"],
    ["sample.jpg", "jpeg"],
    ["sample.gif", "gif"],
    ["sample.webp", "webp"],
    ["sample.pdf", "pdf"],
    ["sample.zip", "zip"],
    ["sample.sqlite", "sqlite"],
  ] as const)("magic %s", (name, type) =>
    expect(magicType(bytes(name))).toBe(type),
  );
  it("distinguishes RIFF WAVE from WEBP", () =>
    expect(magicType(new TextEncoder().encode("RIFF0000WAVE"))).toBe("wav"));
  it("reports corruption without claiming validity", () => {
    const result = resolveSample("corrupt.png", bytes("corrupt.png"), 8);
    expect(result.detectedType).toBe("png");
    expect(result.warnings).toContainEqual({ code: "CORRUPTED_SIGNATURE" });
  });
  it.each([
    ["sample.txt", "UTF-8"],
    ["utf8-bom.txt", "UTF-8 BOM"],
    ["utf16-le.txt", "UTF-16 LE"],
    ["utf16-be.txt", "UTF-16 BE"],
  ])("encoding %s", (name, encoding) => {
    const result = decodeText(bytes(name), true);
    expect(result.text).not.toBeNull();
    expect(result.encoding).toBe(encoding);
  });
  it("handles split UTF8 and UTF16 code points", () => {
    expect(decodeText(new Uint8Array([65, 228, 189]), false).text).toBe("A");
    expect(decodeText(new Uint8Array([65, 228, 189]), true).text).toBeNull();
    expect(decodeText(new Uint8Array([255, 254, 65]), true).text).toBeNull();
  });
  it("rejects control-heavy binary and accepts empty text", () => {
    expect(resolveSample("x.bin", bytes("unknown.bin"), 64).isBinary).toBe(
      true,
    );
    expect(resolveSample("empty-file", new Uint8Array(), 0).detectedType).toBe(
      "text",
    );
    expect(decodeText(new Uint8Array([1, 2, 3, 4]), true).text).toBeNull();
  });
  it("parses JSON and never treats a brace as evidence by itself", () => {
    expect(contentType('{"a":1}', true)).toBe("json");
    expect(contentType("{not json}", true)).toBeNull();
    expect(
      resolveSample("notes.txt", new TextEncoder().encode("{not json}"), 10)
        .detectedType,
    ).toBe("text");
    expect(contentType("[1,2]", false)).toBeNull();
    const result = resolveSample(
      "invalid.json",
      bytes("invalid.json"),
      bytes("invalid.json").length,
    );
    expect(result.confidence).toBe(0.5);
    expect(result.warnings).toContainEqual({ code: "CONTENT_UNVERIFIED" });
  });
  it("parses SVG before XML, rejects malformed XML and DTD", () => {
    expect(
      contentType(new TextDecoder().decode(bytes("sample.svg")), true),
    ).toBe("svg");
    expect(contentType("<root><item/></root>", true)).toBe("xml");
    expect(contentType("<a><b></a>", true)).toBeNull();
    expect(contentType("<a/><b/>", true)).toBeNull();
    expect(contentType("<!DOCTYPE svg><svg/>", true)).toBeNull();
  });
  it("keeps YAML/TOML and delimited prose conservative", () => {
    const b = new TextEncoder().encode("a,b\nc,d\n");
    expect(resolveSample("notes", b, b.length).detectedType).toBe("text");
    const yaml = new TextEncoder().encode("name: Prism");
    expect(resolveSample("notes", yaml, yaml.length).detectedType).toBe("text");
    expect(resolveSample("x.csv", b, b.length).confidence).toBe(0.78);
    const invalid = new TextEncoder().encode("a,b\nx,y,z\n");
    expect(resolveSample("x.csv", invalid, invalid.length).confidence).toBe(
      0.5,
    );
  });
  it("uses MIME below strong content and above extension", () => {
    const b = new TextEncoder().encode("plain text");
    const result = resolveSample("notes.md", b, b.length, "application/json");
    expect(result.detectedType).toBe("json");
    expect(result.detectionSource).toContain("mime");
    expect(result.warnings).toContainEqual({ code: "CONTENT_UNVERIFIED" });
    expect(
      resolveSample(
        "sample.txt",
        bytes("sample.png"),
        bytes("sample.png").length,
        "application/json",
      ).detectedType,
    ).toBe("png");
  });
  it("does not trust an image MIME without magic", () => {
    const b = new TextEncoder().encode("not an image");
    expect(
      resolveSample("photo.jpg", b, b.length, "image/jpeg").detectedType,
    ).toBe("text");
  });
  it.each([
    "Dockerfile",
    "Makefile",
    "LICENSE",
    "README",
    ".gitignore",
    ".env",
  ])("basename %s", (name) => {
    const b = new TextEncoder().encode("plain text\n");
    const result = resolveSample(name, b, b.length);
    expect(result.extension).toBeNull();
    expect(result.languageHint).toBeTruthy();
  });
  it("recognizes shebang hint", () => {
    const b = bytes("shebang");
    expect(resolveSample("script", b, b.length).languageHint).toBe("python");
  });
});
describe("Browser FileLoader integration", () => {
  it.each([
    ["sample.md", "markdown"],
    ["sample.json", "json"],
    ["sample.ts", "typescript"],
    ["sample.png", "png"],
    ["sample.pdf", "pdf"],
    ["sample.zip", "zip"],
    ["sample.xlsx", "xlsx"],
    ["sample.sqlite", "sqlite"],
    ["unknown.bin", "unknown"],
    ["fake.jpg", "png"],
  ] as [string, DetectedFileType][])("%s → %s", async (name, type) => {
    const result = await detectBrowserFile(file(name));
    expect(result.detectedType).toBe(type);
    expect(result.mode).toBe("browser");
    expect(result.path).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.modifiedAt).toBe(123456);
    expect(result.bytesRead).toBeLessThanOrEqual(SAMPLE_LIMIT + 65557 + 262144);
    if (type === "xlsx")
      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({ code: "EXTENSION_MISMATCH" }),
      );
  });
  it.each([
    10 * 1024 * 1024,
    100 * 1024 * 1024,
    1024 * 1024 * 1024,
    20 * 1024 * 1024 * 1024,
  ])("bounded slice reads at size %i", async (size) => {
    let read = 0;
    const mock = {
      name: "large.pdf",
      size,
      type: "application/pdf",
      lastModified: 0,
      slice(start: number, end: number) {
        return {
          async arrayBuffer() {
            const b = new Uint8Array(end - start);
            read += b.length;
            if (start === 0) b.set(new TextEncoder().encode("%PDF-1.7\n"));
            return b.buffer;
          },
        };
      },
    } as unknown as File;
    expect((await detectBrowserFile(mock)).detectedType).toBe("pdf");
    expect(read).toBe(SAMPLE_LIMIT);
  });
  it("limits hostile ZIP directory reads", async () => {
    let count = 0;
    const tail = new Uint8Array(22);
    tail.set([80, 75, 5, 6]);
    new DataView(tail.buffer).setUint16(10, 3000, true);
    const result = resolveSample("zip", new Uint8Array([80, 75, 3, 4]), 22);
    await inspectZip(
      {
        size: 22,
        async read() {
          count++;
          return tail;
        },
      },
      result,
    );
    expect(count).toBe(1);
    expect(result.warnings).toContainEqual({
      code: "ARCHIVE_INSPECTION_LIMIT",
    });
  });
  it("bounds missing directory reads for large ZIP", async () => {
    let read = 0;
    const result = resolveSample(
      "large.zip",
      new Uint8Array([80, 75, 3, 4]),
      20 * 1024 * 1024 * 1024,
    );
    await inspectZip(
      {
        size: result.size,
        async read(_start, length) {
          read += length;
          return new Uint8Array(length);
        },
      },
      result,
    );
    expect(read).toBe(TAIL_LIMIT);
    expect(result.warnings).toContainEqual({ code: "CORRUPTED_SIGNATURE" });
  });
});
