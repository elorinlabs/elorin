import { describe, it, expect } from "vitest";
import {
  CsvChunkParser,
  detectDialect,
  detectHeader,
} from "../src/viewer/plugins/csv/csv-parser";
import {
  TabularDocumentModel,
  ChunkedRows,
} from "../src/viewer/plugins/csv/csv-model";
import {
  columnType,
  inferValue,
  safeNumber,
  sampleStats,
} from "../src/viewer/plugins/csv/csv-stats";
import {
  copyRow,
  matchesFilter,
  numericCompare,
  projectRows,
  searchRows,
} from "../src/viewer/plugins/csv/csv-query";
const parse = (text: string, tab = false) =>
  new CsvChunkParser(tab).feed(text, true);
describe("CSV parser boundary", () => {
  it("does not confuse CRLF inside quotes with LF record endings", () => {
    const parsed = parse('id,value\n1,"Hello\r\nWorld"\n2,done\n');
    expect(parsed.dialect.newline).toBe("\n");
    expect(parsed.rows).toEqual([
      ["id", "value"],
      ["1", "Hello\r\nWorld"],
      ["2", "done"],
    ]);
  });
  it.each([",", ";", "\t", "|"])("detects delimiter %s", (delimiter) => {
    const p = parse(`id${delimiter}name\n1${delimiter}Alice\n`);
    expect(p.dialect.delimiter).toBe(delimiter);
    expect(p.rows).toEqual([
      ["id", "name"],
      ["1", "Alice"],
    ]);
  });
  it("handles escaped quotes, quoted separators, empty and trailing fields", () => {
    expect(parse('a,b,c,d\n1,"x,y","He said ""hello""",\n').rows[1]).toEqual([
      "1",
      "x,y",
      'He said "hello"',
      "",
    ]);
  });
  it.each(["\n", "\r\n"])("handles multiline with %s", (newline) => {
    const p = parse(`id,value${newline}1,"Hello${newline}World"${newline}`);
    expect(p.rows).toEqual([
      ["id", "value"],
      ["1", `Hello${newline}World`],
    ]);
    expect(p.dialect.newline).toBe(newline);
  });
  it("uses cursor carry across every split of multiline/escaped records", () => {
    const source = 'id,value\r\n1,"Hello\r\nWorld"\r\n2,"a""b"\r\n3,x\r\n';
    for (let i = 10; i < source.length; i++) {
      const parser = new CsvChunkParser();
      const a = parser.feed(source.slice(0, i));
      const b = parser.feed(source.slice(i), true);
      expect([...a.rows, ...b.rows], String(i)).toEqual(parse(source).rows);
    }
  });
  it("preserves BOM decoding and one-column data, empty/header-only datasets", () => {
    expect(parse("\uFEFFid,name\n1,A").rows[0]).toEqual(["id", "name"]);
    expect(parse("Alice\nBob\n").rows).toEqual([["Alice"], ["Bob"]]);
    expect(parse("").rows).toEqual([]);
    expect(detectHeader(parse("name,age,city\n").rows).detectedHeader).toBe(
      true,
    );
  });
  it("header heuristic does not consume Alice,28,Tokyo", () => {
    expect(
      detectHeader(parse("Alice,28,Tokyo\nBob,31,Osaka").rows).detectedHeader,
    ).toBe(false);
    expect(
      detectHeader(parse("id,name,city\n1,Alice,Tokyo").rows).detectedHeader,
    ).toBe(true);
  });
  it("retains duplicate column identities and ragged fields", () => {
    const m = new TabularDocumentModel(99, "utf-8");
    m.append(parse("name,name,age\nAlice,A,28\nBob,B\nC,D,3,extra").rows);
    m.refreshStats(true);
    expect(m.columns.map((c) => c.id)).toEqual([
      "col:0",
      "col:1",
      "col:2",
      "col:3",
    ]);
    expect(m.columns.map((c) => c.name)).toEqual([
      "name",
      "name",
      "age",
      "Column 4",
    ]);
    expect(m.rowSource.get(2)).toEqual(["Bob", "B"]);
    expect(m.ragged).toBe(2);
    expect(m.diagnostics.join()).toMatch(/Duplicate/);
  });
  it("retains partial results and diagnostics for unclosed quote", () => {
    const p = parse('id,value\n1,ok\n2,"oops');
    expect(p.rows[1]).toEqual(["1", "ok"]);
    expect(p.errors.join()).toMatch(/quote/i);
  });
  it("bounds record carry instead of retaining arbitrary strings", () => {
    expect(() =>
      new CsvChunkParser().feed('id,value\n1,"' + "x".repeat(1100000)),
    ).toThrow(/budget/);
  });
  it("supports chunk row access without contiguous storage", () => {
    const s = new ChunkedRows();
    s.append([["a"], ["b"]]);
    s.append([["c"]]);
    expect(s.count).toBe(3);
    expect(s.get(2)).toEqual(["c"]);
    expect(s.get(3)).toBeUndefined();
  });
});
describe("CSV inference and cached stats", () => {
  it.each([
    ["word", "String"],
    ["12", "Integer"],
    ["1.25", "Number"],
    ["TRUE", "Boolean"],
    ["2026-10-08", "Date"],
    ["2026-10-08T04:00:00Z", "DateTime"],
    ["00123", "String"],
    ["01/02/03", "String"],
    ["", "Empty"],
    ["2026-99-99", "String"],
  ])("infers %s conservatively", (value, type) =>
    expect(inferValue(value)).toBe(type),
  );
  it("preserves unsafe numeric tokens and excludes approximate aggregates", () => {
    expect(safeNumber("9223372036854775807")).toBeUndefined();
    expect(safeNumber("0.123456789012345678901")).toBeUndefined();
    expect(safeNumber("00123")).toBeUndefined();
    expect(safeNumber("1.25")).toBe(1.25);
  });
  it("calculates missing, min/max/mean, lengths and mixed numeric confidence", () => {
    const stats = sampleStats(
      [
        ["1", "ab"],
        ["2", ""],
        ["3", "abcd"],
        ["N/A", "x"],
        ["5", "NULL"],
      ],
      2,
    );
    expect(stats[0]).toMatchObject({
      count: 5,
      numeric: 4,
      min: 1,
      max: 5,
      mean: 2.75,
      missing: 0,
    });
    expect(columnType(stats[0])).toEqual({ type: "Integer", confidence: 0.8 });
    expect(stats[1]).toMatchObject({
      missing: 1,
      shortest: 1,
      longest: 4,
      averageLength: 2.75,
    });
  });
});
describe("CSV projections", () => {
  const store = () => {
    const s = new ChunkedRows();
    s.append([
      ["Alice", "10", "Tokyo"],
      ["Bob", "2", "Osaka"],
      ["中文", "2", "Tokyo"],
      ["Carol", "", ""],
    ]);
    return s;
  };
  it.each([
    ["contains", "Tokyo", "tok", true],
    ["equals", "Tokyo", "tok", false],
    ["empty", "", "", true],
    ["not-empty", "NULL", "", true],
    [">", "10", "2", true],
    [">=", "2", "2", true],
    ["<", "2", "10", true],
    ["<=", "2", "2", true],
    ["=", "2.0", "2", true],
  ])("filter %s", (op, raw, value, expected) =>
    expect(matchesFilter(raw, { column: 0, op: op as any, value })).toBe(
      expected,
    ),
  );
  it("compares large integer and decimal values exactly", () => {
    expect(
      numericCompare("9223372036854775807", "9223372036854775806"),
    ).toBeGreaterThan(0);
    expect(
      numericCompare("0.123456789012345678902", "0.123456789012345678901"),
    ).toBeGreaterThan(0);
    expect(numericCompare("-1e3", "-2")).toBeLessThan(0);
  });
  it("filters retain original row indices; numeric sort is stable", async () => {
    expect(
      await projectRows(
        store(),
        0,
        { column: 2, op: "equals", value: "Tokyo" },
        undefined,
        "String",
        new AbortController().signal,
      ),
    ).toEqual([0, 2]);
    expect(
      await projectRows(
        store(),
        0,
        undefined,
        { column: 1, direction: "asc" },
        "Integer",
        new AbortController().signal,
      ),
    ).toEqual([3, 1, 2, 0]);
  });
  it("searches all/current columns and Unicode, with a result cap", async () => {
    expect(
      (
        await searchRows(
          store(),
          0,
          "Tokyo",
          undefined,
          new AbortController().signal,
        )
      ).results,
    ).toEqual([
      { row: 0, column: 2 },
      { row: 2, column: 2 },
    ]);
    expect(
      (await searchRows(store(), 0, "中文", 0, new AbortController().signal))
        .results,
    ).toEqual([{ row: 2, column: 0 }]);
    const s = new ChunkedRows();
    s.append(Array.from({ length: 1000 }, () => ["x"]));
    const result = await searchRows(
      s,
      0,
      "x",
      undefined,
      new AbortController().signal,
    );
    expect(result.results).toHaveLength(500);
    expect(result.limited).toBe(true);
  });
  it("cancels searches and projections", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      searchRows(store(), 0, "x", undefined, c.signal),
    ).rejects.toHaveProperty("name", "AbortError");
    await expect(
      projectRows(store(), 0, undefined, undefined, "String", c.signal),
    ).rejects.toHaveProperty("name", "AbortError");
  });
  it("copies valid CSV rows with quote/delimiter fidelity", () => {
    expect(
      parse(copyRow(["x,y", 'a"b', "Hello\nWorld", ""], ",", "\n")).rows[0],
    ).toEqual(["x,y", 'a"b', "Hello\nWorld", ""]);
  });
});
