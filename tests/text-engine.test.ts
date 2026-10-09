import { describe, expect, it } from "vitest";
import {
  indexText,
  readTextLines,
  searchText,
  type TextStats,
  type TextMatch,
} from "../src/viewer/plugins/text/text-engine";
import { TEXT_CONFIG } from "../src/viewer/plugins/text/text-config";
import {
  detectTextProfile,
  recognizeLog,
} from "../src/viewer/plugins/text/text-profile";
import { descriptor } from "./viewer-helpers";
const bytesOf = (text: string) => new TextEncoder().encode(text);
const reader = (bytes: Uint8Array) => async (offset: number, length: number) =>
  bytes.slice(offset, offset + length);
async function index(text: string) {
  const bytes = bytesOf(text);
  let stats!: TextStats;
  const checkpoints: number[] = [];
  await indexText(reader(bytes), bytes.length, "utf-8", (value) => {
    stats = value;
    checkpoints.push(...value.checkpoints);
  });
  return { stats, checkpoints, bytes };
}
async function search(text: string, query: string, options = {}) {
  const bytes = bytesOf(text);
  const matches: TextMatch[] = [];
  let count = 0,
    limited = false;
  await searchText(
    reader(bytes),
    bytes.length,
    "utf-8",
    { query, regex: false, caseSensitive: false, wholeWord: false, ...options },
    (batch) => {
      matches.push(...batch.matches);
      count = batch.count;
      limited = batch.limited;
    },
  );
  return { matches, count, limited };
}
describe("Text byte engine", () => {
  it.each([
    ["", 1, {}],
    ["a", 1, {}],
    ["a\n", 2, { LF: 1 }],
    ["a\r\nb", 2, { CRLF: 1 }],
    ["a\rb", 2, { CR: 1 }],
    ["a\r\nb\nc\r", 4, { LF: 1, CRLF: 1, CR: 1 }],
  ])("indexes endings for %j", async (text, lines, endings) => {
    const { stats } = await index(text as string);
    expect(stats.lines).toBe(lines);
    expect(stats.endings).toMatchObject(endings);
    expect(stats.complete).toBe(true);
  });
  it("preserves Unicode, BOM and exact byte positions with sparse checkpoints", async () => {
    const text =
      "\ufeff" +
      Array.from({ length: 1200 }, (_, i) => `行 ${i} 🌈`).join("\r\n");
    const { stats, bytes, checkpoints } = await index(text);
    expect(stats.lines).toBe(1200);
    expect(stats.characters).toBe(text.length - 1);
    expect(checkpoints).toHaveLength(5);
    expect(checkpoints[0]).toBe(3);
    const lines = await readTextLines(
      reader(bytes),
      bytes.length,
      "utf-8",
      checkpoints[3],
      769,
      801,
      3,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "行 800 🌈",
      "行 801 🌈",
      "行 802 🌈",
    ]);
  });
  it("handles CRLF and Unicode at chunk boundaries", async () => {
    const text = "a".repeat(TEXT_CONFIG.chunkBytes - 1) + "\r\n世界\nlast";
    const { stats, bytes } = await index(text);
    expect(stats.lines).toBe(3);
    expect(stats.endings).toEqual({ CRLF: 1, LF: 1, CR: 0 });
    expect(
      (
        await readTextLines(reader(bytes), bytes.length, "utf-8", 0, 1, 2, 2)
      ).map((line) => line.text),
    ).toEqual(["世界", "last"]);
  });
  it("preserves interior BOM characters while removing the file BOM", async () => {
    const { bytes } = await index("\ufefffirst\n\ufeffsecond");
    const lines = await readTextLines(
      reader(bytes),
      bytes.length,
      "utf-8",
      0,
      1,
      1,
      2,
    );
    expect(lines.map((line) => line.text)).toEqual(["first", "\ufeffsecond"]);
  });
  it("bounds a 5 MiB single-line preview", async () => {
    const { stats, bytes } = await index("x".repeat(5 * 1024 * 1024));
    const lines = await readTextLines(
      reader(bytes),
      bytes.length,
      "utf-8",
      0,
      1,
      1,
      1,
    );
    expect(stats.lines).toBe(1);
    expect(stats.longestLine).toBe(bytes.length);
    expect(lines[0].text).toHaveLength(TEXT_CONFIG.previewChars);
    expect(lines[0].truncated).toBe(true);
  });
  it("validates malformed UTF-8 and supports UTF-16", async () => {
    const bytes = new Uint8Array([255, 254, 45, 78, 13, 0, 10, 0, 65, 0]);
    let stats!: TextStats;
    await indexText(
      reader(bytes),
      bytes.length,
      "UTF-16 LE",
      (value) => (stats = value),
    );
    expect(stats.lines).toBe(2);
    expect(stats.endings.CRLF).toBe(1);
    expect(
      (
        await readTextLines(reader(bytes), bytes.length, "utf-16le", 2, 1, 1, 2)
      ).map((line) => line.text),
    ).toEqual(["中", "A"]);
    const bad = new Uint8Array([97, 255]);
    await indexText(reader(bad), 2, "utf-8", (value) => (stats = value));
    expect(stats.malformed).toBe(true);
  });
  it("searches literal, case and Unicode whole word without mutating offsets", async () => {
    expect(
      (await search("ERROR error terror\n世界 世界观", "error")).count,
    ).toBe(3);
    expect(
      (
        await search("ERROR error terror", "error", {
          caseSensitive: true,
          wholeWord: true,
        })
      ).count,
    ).toBe(1);
    expect(
      (await search("世界 世界观", "世界", { wholeWord: true })).matches,
    ).toEqual([{ line: 1, column: 0, length: 2 }]);
  });
  it("literal matches span chunks and newlines including long lines", async () => {
    const text = "x".repeat(TEXT_CONFIG.chunkBytes - 3) + "needle\r\nneedle";
    expect((await search(text, "needle")).matches).toEqual([
      { line: 1, column: TEXT_CONFIG.chunkBytes - 3, length: 6 },
      { line: 2, column: 0, length: 6 },
    ]);
    expect((await search(text, "needle\r\nneedle")).count).toBe(1);
    expect(
      (await search("a".repeat(TEXT_CONFIG.chunkBytes + 100), "aaa")).count,
    ).toBe(Math.floor((TEXT_CONFIG.chunkBytes + 100) / 3));
  });
  it("caps retained locations while counting all matches", async () => {
    const result = await search("error\n".repeat(10000), "error");
    expect(result.count).toBe(10000);
    expect(result.matches).toHaveLength(TEXT_CONFIG.searchResults);
  });
  it("regex has explicit per-line semantics, invalid pattern errors and long-line limits", async () => {
    expect((await search("", "^$", { regex: true })).count).toBe(1);
    expect((await search("text\n", "^$", { regex: true })).matches).toEqual([
      { line: 2, column: 0, length: 0 },
    ]);
    expect(
      (await search("a1\r\na2\na3", "^a\\d$", { regex: true })).count,
    ).toBe(3);
    expect(
      (await search("a".repeat(100000) + "\nok", "ok", { regex: true }))
        .limited,
    ).toBe(true);
    await expect(search("text", "[", { regex: true })).rejects.toThrow();
  });
  it("cancellation stops subsequent range reads", async () => {
    let reads = 0;
    const bytes = bytesOf("x".repeat(TEXT_CONFIG.chunkBytes * 3));
    await expect(
      indexText(
        async (offset, length) => {
          if (++reads > 1) throw new DOMException("Cancelled", "AbortError");
          return bytes.slice(offset, offset + length);
        },
        bytes.length,
        "utf-8",
        () => {},
      ),
    ).rejects.toHaveProperty("name", "AbortError");
    expect(reads).toBe(2);
  });
});
describe("Text profiles", () => {
  it.each([
    ["notes.txt", "Plain", undefined],
    ["main.ts", "Code", "typescript"],
    ["main.tsx", "Code", "typescript"],
    ["main.py", "Code", "python"],
    ["main.rs", "Code", "rust"],
    ["main.go", "Code", "go"],
    ["main.cpp", "Code", "cpp"],
    ["main.sh", "Code", "bash"],
    ["Dockerfile", "Code", "dockerfile"],
    ["Makefile", "Code", "makefile"],
    [".env", "Config", "ini"],
    [".editorconfig", "Config", "ini"],
    ["server.log", "Log", undefined],
    ["settings.custom", "Plain", undefined],
  ])("detects %s", (name, profile, language) => {
    expect(detectTextProfile(descriptor(name), "hello")).toEqual({
      profile,
      ...(language ? { language } : {}),
    });
  });
  it("uses shebang and conservatively recognizes text logs", () => {
    expect(
      detectTextProfile(
        descriptor("script"),
        "#!/usr/bin/env python3\nprint(1)",
      ).language,
    ).toBe("python");
    expect(
      detectTextProfile(
        descriptor("server.txt"),
        "2026-10-08T00:00:00Z INFO Start\n2026-10-08 00:00:01 ERROR Stop",
      ).profile,
    ).toBe("Log");
    expect(detectTextProfile(descriptor(), "some ERROR in prose").profile).toBe(
      "Plain",
    );
    expect(recognizeLog("2026-10-08 00:00:00 WARN slow")).toMatchObject({
      level: "WARN",
      timestamp: "2026-10-08 00:00:00",
    });
  });
});
