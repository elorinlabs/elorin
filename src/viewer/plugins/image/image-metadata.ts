import { IMAGE_CONFIG } from "./image-config";
import { psdHeader } from './image-psd';
export interface ImageMetadata {
  derivedGrid?: boolean;
  format: string;
  width?: number;
  height?: number;
  orientation: number;
  alpha?: boolean;
  bitDepth?: number;
  colorProfile?: string;
  colorSpace?: string;
  frames?: number;
  loop?: number;
  pages?: number;
  variants?: {
    width: number;
    height: number;
    offset: number;
    length: number;
  }[];
  viewBox?: string;
  elements?: number;
  paths?: number;
  textNodes?: number;
  photo: Record<string, string>;
  gps?: { latitude?: number; longitude?: number; altitude?: number };
}
export function validDimensions(
  width: number | undefined,
  height: number | undefined,
) {
  return (
    !!width &&
    !!height &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= IMAGE_CONFIG.maxDimension &&
    height <= IMAGE_CONFIG.maxDimension &&
    width * height <= IMAGE_CONFIG.sourcePixels
  );
}
export const orientedDimensions = (metadata: ImageMetadata) =>
  metadata.orientation >= 5 && metadata.orientation <= 8
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
export function readImageHeader(
  bytes: Uint8Array,
  format: string,
): ImageMetadata {
  if(format==='psd'){const header=psdHeader(bytes);return {format,orientation:1,width:header.w,height:header.h,bitDepth:header.depth,colorSpace:header.mode===3?'RGB':'Grayscale',alpha:false,photo:{}};}
  const m: ImageMetadata = { format, orientation: 1, photo: {} },
    v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) =>
    new TextDecoder("latin1").decode(bytes.subarray(at, at + length));
  if (format === "png" && bytes.length >= 33) {
    m.width = v.getUint32(16);
    m.height = v.getUint32(20);
    m.bitDepth = bytes[24];
    m.alpha = [4, 6].includes(bytes[25]);
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = v.getUint32(at),
        type = text(at + 4, 4),
        end = at + 12 + length;
      if (end > bytes.length) break;
      if (type === "sRGB") m.colorProfile = "sRGB";
      if (type === "iCCP") m.colorProfile = "Embedded ICC profile";
      if (type === "tRNS") m.alpha = true;
      if (type === "acTL" && length >= 8) {
        m.frames = v.getUint32(at + 8);
        m.loop = v.getUint32(at + 12);
      }
      at = end;
    }
  } else if (format === "jpeg") {
    for (let at = 2; at + 4 < bytes.length;) {
      if (bytes[at] !== 255) break;
      const marker = bytes[at + 1];
      if (marker === 218 || marker === 217) break;
      if (marker === 255) {
        at++;
        continue;
      }
      const length = v.getUint16(at + 2);
      if (length < 2 || at + 2 + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      ) {
        m.bitDepth = bytes[at + 4];
        m.height = v.getUint16(at + 5);
        m.width = v.getUint16(at + 7);
        m.colorSpace =
          bytes[at + 9] === 4
            ? "CMYK"
            : bytes[at + 9] === 1
              ? "Grayscale"
              : "RGB";
        m.alpha = false;
      }
      if (marker === 226 && text(at + 4, 11) === "ICC_PROFILE")
        m.colorProfile = "Embedded ICC profile";
      at += 2 + length;
    }
  } else if (format === "gif" && bytes.length >= 13) {
    m.width = v.getUint16(6, true);
    m.height = v.getUint16(8, true);
    m.bitDepth = 8;
    m.alpha = undefined;
  } else if (format === "bmp" && bytes.length >= 30) {
    const dib = v.getUint32(14, true);
    m.width =
      dib === 12 ? v.getUint16(18, true) : Math.abs(v.getInt32(18, true));
    m.height =
      dib === 12 ? v.getUint16(20, true) : Math.abs(v.getInt32(22, true));
    m.bitDepth = dib === 12 ? v.getUint16(24, true) : v.getUint16(28, true);
    m.alpha = m.bitDepth === 32;
  } else if (format === "ico" && bytes.length >= 6) {
    const count = Math.min(v.getUint16(4, true), 256);
    m.variants = [];
    for (let i = 0; i < count && 6 + i * 16 + 16 <= bytes.length; i++) {
      const at = 6 + i * 16;
      m.variants.push({
        width: bytes[at] || 256,
        height: bytes[at + 1] || 256,
        length: v.getUint32(at + 8, true),
        offset: v.getUint32(at + 12, true),
      });
    }
    const best = m.variants
      .slice()
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (best) {
      m.width = best.width;
      m.height = best.height;
    }
  } else if (format === "webp" && bytes.length >= 30) {
    const type = text(12, 4);
    if (type === "VP8X") {
      m.width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      m.height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      m.alpha = !!(bytes[20] & 16);
      if (bytes[20] & 2) m.frames = 2;
      if (bytes[20] & 32) m.colorProfile = "Embedded ICC profile";
    } else if (type === "VP8 " && bytes.length >= 30) {
      m.width = v.getUint16(26, true) & 16383;
      m.height = v.getUint16(28, true) & 16383;
      m.alpha = false;
    } else if (type === "VP8L" && bytes.length >= 25) {
      const bits = v.getUint32(21, true);
      m.width = (bits & 16383) + 1;
      m.height = ((bits >>> 14) & 16383) + 1;
      m.alpha = !!(bits & (1 << 28));
    }
  } else if (format === "tiff" && bytes.length >= 8) {
    const little = bytes[0] === 73;
    let at = v.getUint32(4, little),
      visited = new Set<number>(),
      pages = 0;
    while (at && at + 2 <= bytes.length && !visited.has(at) && pages < 256) {
      visited.add(at);
      const count = v.getUint16(at, little);
      if (count > 4096 || at + 2 + count * 12 + 4 > bytes.length) break;
      if (!pages)
        for (let i = 0; i < count; i++) {
          const p = at + 2 + i * 12,
            tag = v.getUint16(p, little),
            type = v.getUint16(p + 2, little),
            n = v.getUint32(p + 4, little);
          const value =
            type === 3 && n === 1
              ? v.getUint16(p + 8, little)
              : v.getUint32(p + 8, little);
          if (tag === 256) m.width = value;
          if (tag === 257) m.height = value;
          if (tag === 274 && value >= 1 && value <= 8) m.orientation = value;
          if (tag === 258 && n === 1) m.bitDepth = value;
          if (tag === 34675) m.colorProfile = "Embedded ICC profile";
        }
      pages++;
      at = v.getUint32(at + 2 + count * 12, little);
    }
    if (pages) m.pages = pages;
  } else if (["avif", "heic", "heif"].includes(format)) {
    // Grid items can have much larger derived dimensions than their tile ispe boxes.
    // Keep them metadata-only until a bounded derived-image codec is available.
    m.derivedGrid = text(0, bytes.length).includes("\0grid");
    let nodes = 0;
    const walk = (begin: number, end: number, depth: number) => {
      if (depth > 10) return;
      for (let at = begin; at + 8 <= end && ++nodes < 10000;) {
        const size = v.getUint32(at),
          type = text(at + 4, 4);
        if (size < 8 || at + size > end) break;
        if (type === "ispe" && size >= 20) {
          const width = v.getUint32(at + 12),
            height = v.getUint32(at + 16);
          if (!m.width || width * height > m.width * (m.height || 0)) {
            m.width = width;
            m.height = height;
          }
        }
        if (
          [
            "meta",
            "iprp",
            "ipco",
            "moov",
            "trak",
            "mdia",
            "minf",
            "stbl",
          ].includes(type)
        )
          walk(at + (type === "meta" ? 12 : 8), at + size, depth + 1);
        at += size;
      }
    };
    walk(0, bytes.length, 0);
  }
  return m;
}
export async function enrichMetadata(
  m: ImageMetadata,
  bytes: Uint8Array,
  diagnostics: string[],
) {
  if (!["jpeg", "tiff", "png", "heic", "heif", "avif"].includes(m.format))
    return;
  try {
    const { default: exifr } = await import("exifr");
    const data = await exifr.parse(bytes, {
      translateValues: false,
      pick: [
        "Make",
        "Model",
        "LensModel",
        "FocalLength",
        "FNumber",
        "ExposureTime",
        "ISO",
        "DateTimeOriginal",
        "Orientation",
        "Software",
        "ColorSpace",
        "GPSLatitude",
        "GPSLongitude",
        "GPSLatitudeRef",
        "GPSLongitudeRef",
        "GPSAltitude",
      ],
    });
    if (!data) return;
    if (Number(data.Orientation) >= 1 && Number(data.Orientation) <= 8)
      m.orientation = Number(data.Orientation);
    const labels: Record<string, string> = {
      Make: "Make",
      Model: "Camera",
      LensModel: "Lens",
      FocalLength: "Focal length",
      FNumber: "Aperture",
      ExposureTime: "Shutter",
      ISO: "ISO",
      DateTimeOriginal: "Captured",
      Software: "Software",
    };
    for (const [key, label] of Object.entries(labels))
      if (data[key] !== undefined)
        m.photo[label] = String(data[key]).slice(0, IMAGE_CONFIG.metadataChars);
    const coordinate = (value: unknown, ref: unknown) => {
      if (typeof value === "number") return value;
      if (Array.isArray(value) && value.length === 3) {
        const n =
          Number(value[0]) + Number(value[1]) / 60 + Number(value[2]) / 3600;
        return Number.isFinite(n)
          ? n * (["S", "W"].includes(String(ref)) ? -1 : 1)
          : undefined;
      }
      return undefined;
    };
    if (data.latitude !== undefined || data.GPSLatitude !== undefined)
      m.gps = {
        latitude:
          data.latitude ?? coordinate(data.GPSLatitude, data.GPSLatitudeRef),
        longitude:
          data.longitude ?? coordinate(data.GPSLongitude, data.GPSLongitudeRef),
        altitude: data.GPSAltitude,
      };
    if (data.ColorSpace === 1) m.colorSpace = "sRGB";
  } catch {
    diagnostics.push(
      "Some metadata could not be parsed from the bounded header sample.",
    );
  }
}
