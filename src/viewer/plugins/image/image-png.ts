import { Inflate } from "pako";

import { IMAGE_CONFIG } from "./image-config";

// Only two source scanlines are retained, regardless of PNG height.
export function pngPreview(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer),
    v = new DataView(buffer);
  const width = v.getUint32(16),
    height = v.getUint32(20),
    depth = bytes[24],
    type = bytes[25];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[
    type
  ];
  if (depth !== 8 || bytes[28] !== 0 || !channels)
    throw new Error(
      "Reduced PNG preview supports non-interlaced 8-bit images only.",
    );
  if (
    !width ||
    !height ||
    width > IMAGE_CONFIG.maxDimension ||
    width * height > IMAGE_CONFIG.sourcePixels
  )
    throw new Error("PNG exceeds the source dimension budget.");
  const step = Math.max(
    1,
    Math.ceil(
      Math.max(
        width / IMAGE_CONFIG.previewDimension,
        height / IMAGE_CONFIG.previewDimension,
        Math.sqrt((width * height) / IMAGE_CONFIG.previewPixels),
      ),
    ),
  );
  const w = Math.ceil(width / step),
    h = Math.ceil(height / step),
    rgba = new Uint8ClampedArray(w * h * 4),
    rowBytes = width * channels;
  let previous = new Uint8Array(rowBytes),
    row = new Uint8Array(rowBytes),
    column = -1,
    y = 0,
    filter = 0,
    palette = new Uint8Array(),
    alpha = new Uint8Array();
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const inflate = new Inflate();
  inflate.onData = (chunk: Uint8Array) => {
    let position = 0;
    while (position < chunk.length) {
      if (y >= height) throw new Error("PNG contains excess pixel data.");
      if (column === -1) {
        filter = chunk[position++];
        if (filter > 4) throw new Error("Invalid PNG filter.");
        column = 0;
        continue;
      }
      if (filter === 0) {
        const count = Math.min(rowBytes - column, chunk.length - position);
        row.set(chunk.subarray(position, position + count), column);
        position += count;
        column += count;
      } else {
        const byte = chunk[position++],
          a = column >= channels ? row[column - channels] : 0,
          b = previous[column],
          c = column >= channels ? previous[column - channels] : 0;
        row[column] =
          (byte +
            (filter === 0
              ? 0
              : filter === 1
                ? a
                : filter === 2
                  ? b
                  : filter === 3
                    ? Math.floor((a + b) / 2)
                    : paeth(a, b, c))) &
          255;
        column++;
      }
      if (column === rowBytes) {
        if (y % step === 0)
          for (let x = 0; x < width; x += step) {
            const i = x * channels,
              o = ((y / step) * w + Math.floor(x / step)) * 4;
            if (type === 3) {
              const index = row[i];
              if (index * 3 + 2 >= palette.length)
                throw new Error("Invalid PNG palette.");
              rgba[o] = palette[index * 3];
              rgba[o + 1] = palette[index * 3 + 1];
              rgba[o + 2] = palette[index * 3 + 2];
              rgba[o + 3] = alpha[index] ?? 255;
            } else {
              rgba[o] = row[i];
              rgba[o + 1] = type === 0 || type === 4 ? row[i] : row[i + 1];
              rgba[o + 2] = type === 0 || type === 4 ? row[i] : row[i + 2];
              rgba[o + 3] =
                type === 4 ? row[i + 1] : type === 6 ? row[i + 3] : 255;
            }
          }
        const temp = previous;
        previous = row;
        row = temp;
        column = -1;
        y++;
      }
    }
  };
  let ended = false;
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    let value = n;
    for (let i = 0; i < 8; i++)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  for (let at = 8; at + 12 <= bytes.length;) {
    const n = v.getUint32(at),
      kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (n > bytes.length - at - 12) throw new Error("Truncated PNG chunk.");
    let crc = 0xffffffff;
    for (let i = at + 4; i < at + 8 + n; i++)
      crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if ((crc ^ 0xffffffff) >>> 0 !== v.getUint32(at + 8 + n))
      throw new Error("PNG chunk checksum is invalid.");
    if (kind === "PLTE") palette = bytes.slice(at + 8, at + 8 + n);
    if (kind === "tRNS") {
      if (type !== 3)
        throw new Error(
          "Reduced PNG with color-key transparency is not supported.",
        );
      alpha = bytes.slice(at + 8, at + 8 + n);
    }
    if (kind === "IDAT")
      for (let pos = at + 8; pos < at + 8 + n; pos += 16384) {
        inflate.push(
          bytes.subarray(pos, Math.min(pos + 16384, at + 8 + n)),
          false,
        );
        if (inflate.err) throw new Error(inflate.msg);
      }
    if (kind === "IEND") {
      ended = true;
      break;
    }
    at += n + 12;
  }
  inflate.push(new Uint8Array(), true);
  if (inflate.err || !ended || y !== height || column !== -1)
    throw new Error("Incomplete PNG pixels.");
  return { rgba, w, h };
}
