import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodeTiff } from "../src/viewer/plugins/image/image-tiff";
const fixture = () =>
  new Uint8Array(readFileSync("tests/fixtures/image/first-page.tiff"));
describe("Bounded TIFF decode", () => {
  it("rejects a deflate bomb whose output exceeds declared pixels", () => {
    const original = fixture(),
      compressed = deflateSync(new Uint8Array(100000)),
      bytes = new Uint8Array(original.length + compressed.length);
    bytes.set(original);
    bytes.set(compressed, original.length);
    const v = new DataView(bytes.buffer),
      at = v.getUint32(4, true),
      count = v.getUint16(at, true);
    for (let i = 0; i < count; i++) {
      const p = at + 2 + i * 12,
        tag = v.getUint16(p, true);
      if (tag === 273) v.setUint32(p + 8, original.length, true);
      if (tag === 279) v.setUint32(p + 8, compressed.length, true);
    }
    expect(() => decodeTiff(bytes.buffer)).toThrow("pixel byte budget");
  });
  it("decodes real deflate TIFF first-page pixels", () => {
    const result = decodeTiff(fixture().buffer);
    expect([result.w, result.h]).toEqual([160, 80]);
    expect(Array.from(result.rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });
  it("rejects cyclic next-page directories before UTIF parsing", () => {
    const bytes = fixture(),
      v = new DataView(bytes.buffer),
      at = v.getUint32(4, true),
      count = v.getUint16(at, true);
    v.setUint32(at + 2 + count * 12, at, true);
    expect(() => decodeTiff(bytes.buffer)).toThrow("directory");
  });
  it("removes unsafe nested metadata pointers in the worker copy", () => {
    const bytes = fixture(),
      v = new DataView(bytes.buffer),
      at = v.getUint32(4, true),
      count = v.getUint16(at, true);
    let changed = false;
    for (let i = 0; i < count; i++) {
      const p = at + 2 + i * 12;
      if (v.getUint16(p, true) === 284) {
        v.setUint16(p, 34665, true);
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
    expect(() => decodeTiff(bytes.buffer)).not.toThrow();
  });
  it("rejects source pixel budget overflow before image allocation", () => {
    const bytes = fixture(),
      v = new DataView(bytes.buffer),
      at = v.getUint32(4, true),
      count = v.getUint16(at, true);
    for (let i = 0; i < count; i++) {
      const p = at + 2 + i * 12;
      if ([256, 257].includes(v.getUint16(p, true)))
        v.setUint16(p + 8, 20000, true);
    }
    expect(() => decodeTiff(bytes.buffer)).toThrow("16 MP");
  });
});
