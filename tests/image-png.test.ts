import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { pngPreview } from "../src/viewer/plugins/image/image-png";
function png(filter: number, width = 3, height = 2) {
  const chunks: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  ];
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of bytes) {
      c ^= byte;
      for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length),
      v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    chunks.push(out);
  };
  const header = new Uint8Array(13),
    hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header[8] = 8;
  header[9] = 2;
  chunk("IHDR", header);
  const raw = new Uint8Array(height * (1 + width * 3)),
    rows = Array.from({ length: height }, (_, y) =>
      Uint8Array.from({ length: width * 3 }, (_, x) => (x * 33 + y * 41) % 256),
    );
  for (let y = 0; y < height; y++) {
    const at = y * (1 + width * 3);
    raw[at] = filter;
    for (let x = 0; x < width * 3; x++) {
      const a = x >= 3 ? rows[y][x - 3] : 0,
        b = y ? rows[y - 1][x] : 0,
        c = y && x >= 3 ? rows[y - 1][x - 3] : 0,
        p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c),
        predict =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? Math.floor((a + b) / 2)
                  : pa <= pb && pa <= pc
                    ? a
                    : pb <= pc
                      ? b
                      : c;
      raw[at + 1 + x] = (rows[y][x] - predict) & 255;
    }
  }
  chunk("IDAT", deflateSync(raw));
  chunk("IEND", new Uint8Array());
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { bytes, rows };
}
describe("Streaming PNG pixels", () => {
  it.each([0, 1, 2, 3, 4])(
    "reconstructs PNG filter %s across scanlines",
    (filter) => {
      const { bytes, rows } = png(filter),
        result = pngPreview(bytes.buffer);
      expect(result.w).toBe(3);
      expect(result.h).toBe(2);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 3; x++)
          expect(
            Array.from(result.rgba.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4)),
          ).toEqual([...rows[y].slice(x * 3, x * 3 + 3), 255]);
    },
  );
  it("checks PNG chunk integrity before decoding", () => {
    const { bytes } = png(0);
    bytes[29] ^= 1;
    expect(() => pngPreview(bytes.buffer)).toThrow("checksum");
  });
  it("rejects truncated compressed pixels", () => {
    const { bytes } = png(0);
    expect(() => pngPreview(bytes.slice(0, -20).buffer)).toThrow();
  });
  it("never allocates a source-sized bitmap when reducing pixels", () => {
    const { bytes } = png(0, 3000, 2000),
      result = pngPreview(bytes.buffer);
    expect(result.w).toBe(1500);
    expect(result.h).toBe(1000);
    expect(result.rgba.length).toBe(1500 * 1000 * 4);
  });
});
