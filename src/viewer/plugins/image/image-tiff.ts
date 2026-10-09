import * as UTIF from "utif";
import { Inflate } from "pako";
import { IMAGE_CONFIG } from "./image-config";

export function decodeTiff(buffer: ArrayBuffer) {
  const header = new DataView(buffer),
    little = header.getUint8(0) === 73;
  if (header.byteLength < 8 || header.getUint16(2, little) !== 42)
    throw new Error("Unsupported TIFF header.");
  let at = header.getUint32(4, little),
    tagsBytes = 0;
  const visited = new Set<number>();
  while (at) {
    if (visited.has(at) || visited.size >= 256 || at + 2 > header.byteLength)
      throw new Error("Invalid TIFF directory.");
    visited.add(at);
    const count = header.getUint16(at, little);
    if (count > 4096 || at + 2 + count * 12 + 4 > header.byteLength)
      throw new Error("TIFF directory exceeds its metadata budget.");
    for (let i = 0; i < count; i++) {
      const p = at + 2 + i * 12,
        tag = header.getUint16(p, little),
        type = header.getUint16(p + 2, little),
        n = header.getUint32(p + 4, little),
        length = n * ([0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 8);
      tagsBytes += length;
      if (length > 1048576 || tagsBytes > 8388608)
        throw new Error("TIFF tag values exceed their metadata budget.");
      if (
        length > 4 &&
        header.getUint32(p + 8, little) + length > header.byteLength
      )
        throw new Error("Truncated TIFF tag values.");
      // Decoder-local copy only. These metadata pointers are not needed for raster pixels,
      // and UTIF follows them recursively without a directory/depth budget.
      if ([330, 34665, 50740, 37500].includes(tag))
        header.setUint16(p, 65000, little);
    }
    at = header.getUint32(at + 2 + count * 12, little);
  }
  const page = UTIF.decode(buffer)[0],
    tags = page as unknown as Record<string, number[]>;
  const w = Number(tags?.t256?.[0]),
    h = Number(tags?.t257?.[0]),
    samples = tags.t277?.[0] ?? 1,
    depth = Math.max(...(tags.t258 ?? [1])),
    compression = tags.t259?.[0] ?? 1;
  if (
    !Number.isSafeInteger(w * h) ||
    w <= 0 ||
    h <= 0 ||
    w * h > IMAGE_CONFIG.tiffPixels ||
    samples < 1 ||
    samples > 4 ||
    depth < 1 ||
    depth > 16
  )
    throw new Error("TIFF exceeds the 16 MP / 16-bit decode budget.");
  if ([6, 7].includes(compression))
    throw new Error(
      "Embedded JPEG TIFF requires a bounded nested decoder; pixel decoding was skipped.",
    );
  if (![1, 3, 4, 5, 8, 32773, 32809, 32946].includes(compression))
    throw new Error(
      "This TIFF compression is unavailable in the bounded decoder.",
    );
  const photo = tags.t262?.[0],
    extra = tags.t338?.[0];
  const supported =
    (photo === 0 && [1, 4, 8].includes(depth) && samples === 1) ||
    (photo === 1 && [1, 2, 8, 16].includes(depth) && samples === 1) ||
    (photo === 2 &&
      [8, 16].includes(depth) &&
      [3, 4].includes(samples) &&
      (samples === 3 || [1, 2].includes(extra))) ||
    (photo === 3 &&
      depth === 8 &&
      samples === 1 &&
      tags.t320?.length === 768) ||
    (photo === 5 && depth === 8 && samples === 4);
  if (
    !supported ||
    tags.t284?.[0] === 2 ||
    (tags.t339?.[0] ?? 1) !== 1 ||
    (tags.t258 ?? [depth]).some((value) => value !== depth)
  )
    throw new Error(
      "This TIFF color/sample layout is unavailable in the bounded decoder.",
    );
  const maxBytes = IMAGE_CONFIG.tiffPixels * 8;
  if (
    tags.t322 &&
    tags.t323 &&
    tags.t322[0] * tags.t323[0] * samples * Math.ceil(depth / 8) > maxBytes
  )
    throw new Error("TIFF tile exceeds its decoded byte budget.");
  if ([8, 32946].includes(compression)) {
    const offsets = tags.t273 ?? tags.t324,
      counts = tags.t279 ?? tags.t325;
    if (
      !offsets ||
      !counts ||
      offsets.length !== counts.length ||
      offsets.length > 4096
    )
      throw new Error("Invalid TIFF strip table.");
    const tileWidth = tags.t322?.[0],
      tileHeight = tags.t323?.[0];
    const decodedBudget =
      tileWidth && tileHeight
        ? Math.min(
            maxBytes,
            Math.ceil(w / tileWidth) *
              Math.ceil(h / tileHeight) *
              tileWidth *
              tileHeight *
              samples *
              Math.ceil(depth / 8),
          )
        : Math.ceil((w * samples * depth) / 8) * h;
    let expanded = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] + counts[i] > buffer.byteLength)
        throw new Error("Truncated TIFF strip.");
      const inflate = new Inflate();
      inflate.onData = (chunk) => {
        expanded += chunk.length;
        if (expanded > decodedBudget)
          throw new Error(
            "TIFF decompression exceeds its declared pixel byte budget.",
          );
      };
      const compressed = new Uint8Array(buffer, offsets[i], counts[i]);
      for (let pos = 0; pos < compressed.length; pos += 16384) {
        inflate.push(
          compressed.subarray(pos, Math.min(pos + 16384, compressed.length)),
          pos + 16384 >= compressed.length,
        );
        if (inflate.err) throw new Error("Invalid TIFF compressed strip.");
      }
    }
  }
  if (compression === 32946) tags.t259 = [8];
  UTIF.decodeImage(buffer, page);
  const rgba = new Uint8ClampedArray(UTIF.toRGBA8(page));
  if (photo === 2 && samples === 4 && extra === 1)
    for (let i = 0; i < rgba.length; i += 4)
      for (let channel = 0; channel < 3; channel++)
        rgba[i + channel] = rgba[i + 3]
          ? Math.min(255, Math.round((rgba[i + channel] * 255) / rgba[i + 3]))
          : 0;
  return { rgba, w, h, depth, alpha: photo === 2 && samples === 4 };
}
