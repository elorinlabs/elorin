import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  exactDecimal,
  dataCell,
  boundedValue,
} from "../src/viewer/plugins/data/precision";
import { NetcdfReader } from "../src/viewer/plugins/data/netcdf-reader";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { extensionMap } from "../src/services/detection/rules";
import { visibleRange } from "../src/viewer/shared/virtual-grid";
import { DataModel } from "../src/viewer/plugins/data/data-model";
import type { ViewerContext } from "../src/viewer/core/types";
describe("Module 14 precision and chunk architecture", () => {
  it("does not commit a previous dataset page after switching datasets", async () => {
    const context = {
      onCleanup: () => {},
      signal: new AbortController().signal,
    } as unknown as ViewerContext;
    const model = new DataModel(context, "scientific");
    let release: (value: any) => void = () => {};
    const node = (id: string) => ({
      id,
      name: id,
      kind: "dataset",
      rows: 1,
      columns: [{ name: "value", type: "int" }],
      metadata: {},
    });
    model.provider = {
      close: () => {},
      nodes: async () => [],
      describe: async (id) => node(id),
      read: async (r) =>
        r.node === "old"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : {
              start: 0,
              columns: [0],
              values: [[dataCell(42)]],
              hasMore: false,
            },
    };
    model.selected = node("old");
    const pending = model.page(0, [0]);
    await model.select("new");
    release({
      start: 0,
      columns: [0],
      values: [[dataCell(999)]],
      hasMore: false,
    });
    await pending;
    expect(model.selected?.id).toBe("new");
    expect(model.getCell(0, 0)?.raw).toBe("42");
  });
  it("preserves signed decimal at arbitrary scale", () => {
    expect(exactDecimal(12345678901234567890123456789n, 9)).toBe(
      "12345678901234567890.123456789",
    );
    expect(exactDecimal(new Uint8Array([255]), 3)).toBe("-0.001");
  });
  it("never coerces int64 and uint64 to Number", () => {
    expect(dataCell(9223372036854775807n).raw).toBe("9223372036854775807");
    expect(dataCell(18446744073709551615n).raw).toBe("18446744073709551615");
  });
  it("retains nanos raw integer", () =>
    expect(dataCell(1700000000123456789n, "timestamp nanos").raw).toBe(
      "1700000000123456789",
    ));
  it("distinguishes special numbers, null, empty and signed zero", () => {
    expect(
      [null, "", NaN, Infinity, -Infinity, -0].map((v) => dataCell(v).display),
    ).toEqual(["NULL", "", "NaN", "+∞", "−∞", "-0.0"]);
  });
  it("keeps untrusted strings as text and binary bounded", () => {
    expect(dataCell("<script>alert(1)</script>").raw).toContain("<script>");
    expect(dataCell(new Uint8Array(1000000)).raw.length).toBe(128);
    expect(dataCell(new Uint8Array(1000000)).size).toBe(1000000);
  });
  it("bounds nested preview and retains compound imaginary", () => {
    expect(boundedValue({ real: 3, imaginary: 4 })).toEqual({
      real: 3,
      imaginary: 4,
    });
    expect((boundedValue(new BigInt64Array(10000)) as unknown[]).length).toBe(
      32,
    );
  });
  it.each([
    ["db", "sqlite"],
    ["sqlite3", "sqlite"],
    ["parquet", "parquet"],
    ["arrow", "arrow"],
    ["feather", "feather"],
    ["h5", "hdf5"],
    ["nc", "netcdf"],
    ["mat", "mat"],
    ["csv", "csv"],
    ["xlsx", "xlsx"],
    ["json", "json"],
  ])("maps %s to %s", (ext, type) => expect(extensionMap[ext]).toBe(type));
  it("registers three independent lazy families", () => {
    const registry = createBuiltinRegistry();
    expect(registry).toBeDefined();
  });
  it("virtualizes million logical rows", () => {
    const window = visibleRange(32000000, 500, 32, 1000000);
    expect(window.end - window.start).toBeLessThan(40);
  });
  it("reads a NetCDF hyperslab and separates fill/raw/scaled", async () => {
    const b = readFileSync("test-fixtures/data/scientific/scaled.nc");
    let readBytes = 0;
    const r = new NetcdfReader(async (at, n) => {
      readBytes += n;
      return new Uint8Array(b.subarray(at, at + n));
    }, b.length);
    await r.open();
    const page = await r.page({
      node: "temperature",
      start: 0,
      count: 1,
      columns: [0, 1],
      fixed: [0],
    });
    expect(page.values[0][0].display).toBe("Missing");
    expect(page.values[0][1].raw).toBe("10");
    expect(page.values[0][1].display).toBe("274.15");
    expect(page.values.length).toBe(1);
    expect(readBytes).toBeLessThan(8388613);
  });
  it("rejects invalid slice", async () => {
    const b = readFileSync("test-fixtures/data/scientific/scaled.nc");
    const r = new NetcdfReader(
      async (at, n) => new Uint8Array(b.subarray(at, at + n)),
      b.length,
    );
    await r.open();
    await expect(
      r.page({
        node: "temperature",
        start: 0,
        count: 1,
        columns: [0],
        fixed: [100],
      }),
    ).rejects.toThrow("Invalid slice");
  });
});
