import type {
  DetectedFileType,
  FileDescriptor,
  DetectionSource,
} from "../../types/files";
import { enhanceDescriptor } from '../../formats';
import {
  SAMPLE_LIMIT,
  TAIL_LIMIT,
  DIRECTORY_LIMIT,
  ENTRY_LIMIT,
  extensionOf,
  extensionMap,
  basenameHints,
  binaryTypes,
  mimeMap,
  typeFromMime,
} from "./rules";
function starts(b: Uint8Array, signature: number[] | string, at = 0): boolean {
  const sig =
    typeof signature === "string"
      ? Array.from(signature, (c) => c.charCodeAt(0))
      : signature;
  return b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
}
/** IPC stream schema message, including its FlatBuffer type discriminator; not just 0xffffffff. */
function arrowStream(b: Uint8Array) {
  if (b.length < 24) return false;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getInt32(0, true) !== -1) return false;
  const length = v.getInt32(4, true), root = 8 + v.getUint32(8, true);
  if (length < 16 || length > 8 * 1024 * 1024 || root < 12 || root + 4 > b.length) return false;
  const table = root - v.getInt32(root, true);
  if (table < 8 || table + 8 > b.length || v.getUint16(table, true) < 8) return false;
  const field = v.getUint16(table + 6, true);
  return field > 0 && root + field < b.length && b[root + field] === 1;
}
function ascii(b: Uint8Array): string {
  return String.fromCharCode(...b);
}
export function magicType(b: Uint8Array): DetectedFileType | null {
  if (b.length >= 6 && b[0] === 77 && b[1] === 77) return "3ds";
  if (starts(b, "glTF")) return "glb";
  if (starts(b, "Kaydara FBX Binary")) return "fbx";
  if (starts(b, "AC10")) return "dwg";
  if (starts(b, "PXR-USDC")) return "usdc";
  if (
    b.length >= 84 &&
    84 +
      new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true) *
        50 ===
      b.length
  )
    return "stl";
  if (b[0] === 31 && b[1] === 139) return "gz";
  if (starts(b, "7z") && b[2] === 188 && b[3] === 175) return "sevenzip";
  if (starts(b, "Rar!")) return "rar";
  if (starts(b, "BZh")) return "bz2";
  if (b[0] === 253 && starts(b, "7zXZ", 1)) return "xz";
  if (b[0] === 40 && b[1] === 181 && b[2] === 47 && b[3] === 253) return "zst";
  if (b.length >= 512 && starts(b, "ustar", 257)) return "tar";
  if (
    starts(b, "ID3") ||
    (b.length > 2 && b[0] === 255 && (b[1] & 0xe6) === 0xe2)
  )
    return "mp3";
  if (starts(b, "fLaC")) return "flac";
  if (starts(b, "OggS"))
    return new TextDecoder().decode(b.subarray(0, 4096)).includes("OpusHead")
      ? "opus"
      : "ogg";
  if (starts(b, "RIFF") && starts(b, "WAVE", 8)) return "wav";
  if (starts(b, "RIFF") && starts(b, "AVI ", 8)) return "avi";
  if (starts(b, "FORM") && (starts(b, "AIFF", 8) || starts(b, "AIFC", 8)))
    return "aiff";
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3]))
    return new TextDecoder().decode(b.subarray(0, 4096)).includes("webm")
      ? "webm"
      : "mkv";
  if (starts(b, [0, 0, 1, 0xba]) || starts(b, [0, 0, 1, 0xb3])) return "mpeg";
  if (b.length > 2 && b[0] === 255 && (b[1] & 0xf6) === 0xf0) return "aac";
  if (
    starts(b, [208, 207, 17, 224, 161, 177, 26, 225]) &&
    new TextDecoder("utf-16le").decode(b).includes("__substg1.0")
  )
    return "msg";
  if (starts(b, "{\\rtf")) return "rtf";
  if (
    starts(b, [208, 207, 17, 224, 161, 177, 26, 225]) &&
    new TextDecoder("utf-16le").decode(b).includes("WordDocument")
  )
    return "doc";
  if (starts(b, "BM") && b.length >= 14) return "bmp";
  if (starts(b, [0, 0, 1, 0]) && b.length >= 6) return "ico";
  if (starts(b, [73, 73, 42, 0]) || starts(b, [77, 77, 0, 42])) return "tiff";
  if (starts(b, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (starts(b, [255, 216, 255])) return "jpeg";
  if (starts(b, "%PDF-")) return "pdf";
  if (starts(b, "GIF87a") || starts(b, "GIF89a")) return "gif";
  if (starts(b, "RIFF") && starts(b, "WEBP", 8)) return "webp";
  if (
    starts(b, "PK\x03\x04") ||
    starts(b, "PK\x05\x06") ||
    starts(b, "PK\x07\x08")
  )
    return "zip";
  if (starts(b, "PAR1")) return "parquet";
  if (starts(b, "ARROW1") || arrowStream(b)) return "arrow";
  if (b[0] === 67 && b[1] === 68 && b[2] === 70) return "netcdf";
  if (
    [0, 512, 1024, 2048, 4096, 8192, 16384, 32768].some(
      (at) => b[at] === 137 && starts(b.subarray(at + 1), "HDF"),
    )
  )
    return "hdf5";
  if (starts(b, "MATLAB 5.0 MAT-file")) return "mat";
  if (starts(b, "SQLite format 3\0")) return "sqlite";
  if (b.length >= 16 && starts(b, "ftyp", 4)) {
    for (let i = 8; i + 4 <= Math.min(64, b.length); i += 4) {
      if (starts(b, "avif", i) || starts(b, "avis", i)) return "avif";
    }
    for (let i = 8; i + 4 <= Math.min(64, b.length); i += 4) {
      if (["heic", "heix", "hevc", "hevx"].some((brand) => starts(b, brand, i)))
        return "heic";
    }
    for (let i = 8; i + 4 <= Math.min(64, b.length); i += 4) {
      if (["mif1", "msf1"].some((brand) => starts(b, brand, i))) return "heif";
    }
  }
  if (b.length >= 12 && starts(b, "ftyp", 4)) {
    const brand = ascii(b.subarray(8, 12));
    if (["M4A ", "M4B ", "M4P "].includes(brand)) return "m4a";
    if (brand === "qt  ") return "mov";
    if (
      [
        "isom",
        "iso2",
        "iso4",
        "iso5",
        "iso6",
        "mp41",
        "mp42",
        "avc1",
        "M4V ",
        "dash",
      ].includes(brand)
    )
      return "mp4";
  }
  return null;
}
export function decodeText(
  b: Uint8Array,
  complete: boolean,
): { text: string | null; encoding: string | null; uncertain: boolean } {
  let encoding = "UTF-8",
    offset = 0,
    codec = "utf-8";
  if (starts(b, [239, 187, 191])) {
    encoding = "UTF-8 BOM";
    offset = 3;
  } else if (starts(b, [255, 254])) {
    encoding = "UTF-16 LE";
    codec = "utf-16le";
    offset = 2;
  } else if (starts(b, [254, 255])) {
    encoding = "UTF-16 BE";
    codec = "utf-16be";
    offset = 2;
  }
  try {
    const decoder = new TextDecoder(codec, { fatal: true });
    const text = decoder.decode(b.subarray(offset), { stream: !complete });
    const chars = Array.from(text);
    const controls = chars.filter((c) => {
      const n = c.charCodeAt(0);
      return (
        (n < 32 || n === 127 || (n >= 128 && n <= 159)) &&
        !["\n", "\r", "\t", "\f"].includes(c)
      );
    }).length;
    if (
      text.includes("\0") ||
      (chars.length > 0 && controls / chars.length > 0.02)
    )
      return { text: null, encoding: null, uncertain: false };
    return { text, encoding, uncertain: false };
  } catch {
    return { text: null, encoding: null, uncertain: !b.includes(0) };
  }
}
export function contentType(
  text: string,
  complete: boolean,
): DetectedFileType | null {
  if (
    /^(?:From|To|Subject|Date|MIME-Version|Content-Type|Message-ID):[^\r\n]*/im.test(
      text,
    ) &&
    /\r?\n\r?\n/.test(text)
  )
    return "eml";
  if (/^\s*ISO-10303-21;/.test(text)) return "step";
  if (/^ply\r?\nformat (ascii|binary_)/.test(text)) return "ply";
  if (/^\s*solid\b/.test(text) && /facet\s+normal/.test(text)) return "stl";
  if (/^\s*0\s*[\r\n]+SECTION/.test(text)) return "dxf";
  if (/^#usda/.test(text)) return "usda";
  if (!complete) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const value = JSON.parse(trimmed);
      return value.asset?.version === "2.0" && Array.isArray(value.scenes)
        ? "gltf"
        : "json";
    } catch {
      /* incomplete/invalid JSON does not qualify */
    }
  }
  if (trimmed.startsWith("<") && !/<!DOCTYPE/i.test(trimmed)) {
    const doc = new DOMParser().parseFromString(trimmed, "application/xml");
    if (!doc.querySelector("parsererror") && doc.documentElement)
      return doc.documentElement.localName === "svg"
        ? "svg"
        : doc.documentElement.localName === "COLLADA"
          ? "dae"
          : "xml";
  }
  return null;
}
function consistentDelimited(text: string, delimiter: string): boolean {
  let quoted = false,
    fields = 1;
  const rows: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) fields++;
    else if (c === "\n" && !quoted) {
      rows.push(fields);
      fields = 1;
    }
  }
  if (quoted) return false;
  if (fields > 1) rows.push(fields);
  return rows.length >= 2 && rows[0] > 1 && rows.every((n) => n === rows[0]);
}
export function resolveSample(
  name: string,
  b: Uint8Array,
  size: number,
  mime = "",
): FileDescriptor {
  const extension = extensionOf(name),
    hint = extension ? extensionMap[extension] : undefined,
    complete = b.length === size;
  const baseMagic =
    b.length >= 84 &&
    84 +
      new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true) *
        50 ===
      size
      ? "stl"
      : magicType(b);
  const ole = starts(b, [208, 207, 17, 224, 161, 177, 26, 225]);
  const oleText = ole ? new TextDecoder("utf-16le").decode(b) : "";
  const magic =
      ole && /Workbook|Book/.test(oleText)
        ? "xls"
        : ole && oleText.includes("PowerPoint Document")
          ? "ppt"
          : ole &&
              ["xls", "ppt", "xlsx", "xlsm", "pptx", "pptm"].includes(
                hint ?? "",
              )
            ? hint!
            : baseMagic,
    decoded = decodeText(b, complete);
  const warnings: FileDescriptor["warnings"] = [];
  let type: DetectedFileType = "unknown",
    confidence = 0;
  let sources: DetectionSource[] = [];
  if (magic) {
    type = magic;
    confidence = 1;
    sources = ["magic"];
    if (
      (magic === "png" && (b.length < 33 || !starts(b, "IHDR", 12))) ||
      (magic === "jpeg" && b.length < 4) ||
      (magic === "gif" && b.length < 13) ||
      (magic === "pdf" && b.length < 8) ||
      (magic === "webp" && b.length < 20) ||
      (magic === "sqlite" && b.length < 100)
    )
      warnings.push({ code: "CORRUPTED_SIGNATURE" });
  } else if (decoded.text !== null) {
    type = "text";
    confidence = 0.65;
    sources = ["content"];
    const content = contentType(decoded.text, complete);
    if (content) {
      type = content;
      confidence = 0.95;
    } else {
      const mimeHint = typeFromMime(mime);
      if (mimeHint && !binaryTypes.has(mimeHint)) {
        type = mimeHint;
        confidence = 0.6;
        sources = ["mime", "content"];
      } else if (hint && !binaryTypes.has(hint)) {
        type = hint;
        confidence = 0.78;
        sources = ["extension", "content"];
      }
      if (["json", "xml", "svg"].includes(type)) {
        confidence = 0.5;
        warnings.push({
          code: complete ? "CONTENT_UNVERIFIED" : "SAMPLE_TRUNCATED",
        });
      }
      if (
        (type === "csv" || type === "tsv") &&
        !consistentDelimited(decoded.text, type === "csv" ? "," : "\t")
      ) {
        confidence = 0.5;
        warnings.push({ code: "CONTENT_UNVERIFIED" });
      }
    }
  } else {
    if (
      hint &&
      [
        "stl",
        "obj",
        "ply",
        "glb",
        "step",
        "stp",
        "iges",
        "igs",
        "jt",
        "dwg",
        "fbx",
        "usdc",
        "3ds",
        "skp",
        "3dm",
        "sldprt",
        "sldasm",
        "catpart",
        "catproduct",
        "c4d",
        "blend",
        "max",
      ].includes(hint)
    ) {
      type = hint;
      confidence = 0.6;
      sources = ["extension"];
    } else warnings.push({ code: "UNKNOWN_FORMAT" });
    if (decoded.uncertain) warnings.push({ code: "ENCODING_UNCERTAIN" });
  }
  if (hint === type && !sources.includes("extension"))
    sources.push("extension");
  else if (hint && hint !== type)
    warnings.push({
      code: "EXTENSION_MISMATCH",
      expected: hint,
      detected: type,
    });
  const binary = (Boolean(magic) && magic !== "rtf") || decoded.text === null;
  let languageHint: string | null = basenameHints[name.toLowerCase()] ?? null;
  if (!languageHint && decoded.text?.startsWith("#!")) {
    const words = decoded.text.split("\n")[0].slice(2).trim().split(/\s+/);
    const interpreter = words[0]?.endsWith("/env")
      ? words.slice(1).find((w) => !w.startsWith("-"))
      : words[0];
    const basename = interpreter?.split("/").pop();
    languageHint = basename
      ? ((
          {
            python: "python",
            python3: "python",
            node: "javascript",
            nodejs: "javascript",
            bash: "shell",
            sh: "shell",
            zsh: "shell",
          } as Record<string, string>
        )[basename] ?? null)
      : null;
  }
  return {
    path: null,
    name,
    extension,
    size,
    mimeType: mimeMap[type] ?? null,
    detectedType: type,
    confidence,
    detectionSource: sources,
    modifiedAt: null,
    createdAt: null,
    isBinary: binary,
    isText: !binary,
    encoding: binary ? null : decoded.encoding,
    languageHint,
    warnings,
    bytesRead: b.length,
    sampleBytes: b.length,
    mode: "browser",
  };
}
export interface SliceReader {
  size: number;
  read(start: number, length: number): Promise<Uint8Array>;
}
export async function inspectZip(
  reader: SliceReader,
  result: FileDescriptor,
): Promise<void> {
  // A limited/corrupt container cannot prove that an XLSX extension is false.
  if (
    result.extension &&
    ["xlsx", "docx", "odt"].includes(extensionMap[result.extension] ?? "")
  )
    result.warnings = result.warnings.filter(
      (w) => w.code !== "EXTENSION_MISMATCH",
    );
  const tailLength = Math.min(reader.size, TAIL_LIMIT);
  const tail = await reader.read(reader.size - tailLength, tailLength);
  result.bytesRead += tail.length;
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let pos = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      starts(tail, "PK\x05\x06", i) &&
      i + 22 + view.getUint16(i + 20, true) === tail.length
    ) {
      pos = i;
      break;
    }
  }
  if (pos < 0) {
    result.warnings.push({ code: "CORRUPTED_SIGNATURE" });
    return;
  }
  const count = view.getUint16(pos + 10, true),
    length = view.getUint32(pos + 12, true),
    offset = view.getUint32(pos + 16, true);
  if (
    count === 65535 ||
    length === 0xffffffff ||
    offset === 0xffffffff ||
    count > ENTRY_LIMIT ||
    length > DIRECTORY_LIMIT ||
    view.getUint16(pos + 4, true) !== 0 ||
    view.getUint16(pos + 6, true) !== 0
  ) {
    result.warnings.push({ code: "ARCHIVE_INSPECTION_LIMIT" });
    return;
  }
  if (
    offset + length > reader.size - tailLength + pos ||
    view.getUint16(pos + 8, true) !== count
  ) {
    result.warnings.push({ code: "CORRUPTED_SIGNATURE" });
    return;
  }
  const directory = await reader.read(offset, length);
  result.bytesRead += directory.length;
  let cursor = 0,
    contentTypes = false,
    workbook = false,
    word = false,
    odt = false,
    presentation = false,
    macros = false,
    ods = false,
    odp = false,
    epub = false,
    usd = false;
  const v = new DataView(
    directory.buffer,
    directory.byteOffset,
    directory.byteLength,
  );
  for (let i = 0; i < count; i++) {
    if (
      directory.length - cursor < 46 ||
      !starts(directory, "PK\x01\x02", cursor)
    ) {
      result.warnings.push({ code: "CORRUPTED_SIGNATURE" });
      return;
    }
    const nameLength = v.getUint16(cursor + 28, true),
      extra = v.getUint16(cursor + 30, true),
      comment = v.getUint16(cursor + 32, true);
    const end = cursor + 46 + nameLength + extra + comment;
    if (end > directory.length) {
      result.warnings.push({ code: "CORRUPTED_SIGNATURE" });
      return;
    }
    const name = ascii(
      directory.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    usd ||= /\.(usd|usda|usdc)$/i.test(name);
    contentTypes ||= name === "[Content_Types].xml";
    workbook ||= name.startsWith("xl/");
    word ||= name === "word/document.xml";
    presentation ||= name === "ppt/presentation.xml";
    macros ||= /vbaProject\.bin$/i.test(name);
    if (
      name === "mimetype" &&
      v.getUint16(cursor + 10, true) === 0 &&
      v.getUint32(cursor + 24, true) <= 64
    ) {
      const offset = v.getUint32(cursor + 42, true);
      if (offset + 69 <= reader.size) {
        const header = await reader.read(offset, 30);
        result.bytesRead += header.length;
        if (header.length === 30 && starts(header, "PK\x03\x04")) {
          const hv = new DataView(
              header.buffer,
              header.byteOffset,
              header.byteLength,
            ),
            start =
              offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
          if (start + 39 <= reader.size) {
            const mime = await reader.read(
              start,
              v.getUint32(cursor + 24, true),
            );
            result.bytesRead += mime.length;
            epub = ascii(mime) === "application/epub+zip";
            odt = ascii(mime) === "application/vnd.oasis.opendocument.text";
            ods =
              ascii(mime) === "application/vnd.oasis.opendocument.spreadsheet";
            odp =
              ascii(mime) === "application/vnd.oasis.opendocument.presentation";
          }
        }
      }
    }
    cursor = end;
  }
  if (cursor !== directory.length) {
    result.warnings.push({ code: "CORRUPTED_SIGNATURE" });
    return;
  }
  if (epub) {
    result.detectedType = "epub";
    result.mimeType = mimeMap.epub!;
    result.detectionSource.push("content");
  } else if (result.extension === "usdz" && usd) {
    result.detectedType = "usdz";
    result.mimeType = "model/vnd.usdz+zip";
    result.detectionSource.push("content");
  } else if (contentTypes && workbook) {
    result.detectedType = macros ? "xlsm" : "xlsx";
    result.mimeType = mimeMap[result.detectedType]!;
    result.detectionSource.push("content");
  } else if (contentTypes && presentation) {
    result.detectedType = macros
      ? "pptm"
      : result.extension === "ppsx"
        ? "ppsx"
        : result.extension === "potx"
          ? "potx"
          : "pptx";
    result.mimeType = mimeMap[result.detectedType]!;
    result.detectionSource.push("content");
  } else if (ods || odp) {
    result.detectedType = ods ? "ods" : "odp";
    result.mimeType = mimeMap[result.detectedType]!;
    result.detectionSource.push("content");
  } else if (contentTypes && word) {
    result.detectedType = "docx";
    result.mimeType = mimeMap.docx!;
    result.detectionSource.push("content");
  } else if (odt) {
    result.detectedType = "odt";
    result.mimeType = mimeMap.odt!;
    result.detectionSource.push("content");
  }
  result.warnings = result.warnings.filter(
    (w) => w.code !== "EXTENSION_MISMATCH",
  );
  result.detectionSource = result.detectionSource.filter(
    (s) => s !== "extension",
  );
  const expected = result.extension
    ? extensionMap[result.extension]
    : undefined;
  if (expected && expected !== result.detectedType)
    result.warnings.push({
      code: "EXTENSION_MISMATCH",
      expected,
      detected: result.detectedType,
    });
  else if (expected) result.detectionSource.push("extension");
}
export async function detectBrowserFile(file: File): Promise<FileDescriptor> {
  const reader: SliceReader = {
    size: file.size,
    async read(start, length) {
      return new Uint8Array(
        await file.slice(start, start + length).arrayBuffer(),
      );
    },
  };
  const sample = await reader.read(0, Math.min(file.size, SAMPLE_LIMIT));
  const result = resolveSample(file.name, sample, file.size, file.type);
  result.modifiedAt = file.lastModified;
  if (result.detectedType === "zip") await inspectZip(reader, result);
  return enhanceDescriptor(result, sample);
}

export async function detectFileSource(
  name: string,
  source: import("../fileSource").FileSource,
  mime = "",
): Promise<FileDescriptor> {
  const size = await source.getSize();
  const reader: SliceReader = {
    size,
    read: (offset, length) => source.readRange(offset, length),
  };
  const sample=await reader.read(0, Math.min(size, SAMPLE_LIMIT));
  const result = resolveSample(name,sample,size,mime);
  if (result.detectedType === "zip") await inspectZip(reader, result);
  return enhanceDescriptor(result,sample);
}
