import { Inflate } from "fflate";
export const OFFICE_BUDGET = {
  file: 64 * 1024 * 1024,
  entries: 2048,
  total: 128 * 1024 * 1024,
  entry: 32 * 1024 * 1024,
  xml: 8 * 1024 * 1024,
  nodes: 100000,
  depth: 64,
  blocks: 20000,
  images: 64,
  imageBytes: 32 * 1024 * 1024,
};
/** Central directory validation precedes bounded, incremental raw inflation. No paths are written to disk. */
export function unpackOffice(
  bytes: Uint8Array,
  budget = OFFICE_BUDGET,
): Map<string, Uint8Array> {
  if (bytes.length > budget.file)
    throw Error("Document exceeds the 64 MB package budget.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n: number) => v.getUint16(n, true),
    u32 = (n: number) => v.getUint32(n, true);
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--)
    if (u32(n) === 0x06054b50 && n + 22 + u16(n + 20) === bytes.length) {
      end = n;
      break;
    }
  if (end < 0) throw Error("Damaged document package.");
  const count = u16(end + 10),
    directory = u32(end + 16),
    directorySize = u32(end + 12);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count > budget.entries ||
    directory + directorySize > end
  )
    throw Error("Unsupported or oversized document package.");
  let cursor = directory,
    total = 0;
  const entries = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directory + directorySize || u32(cursor) !== 0x02014b50)
      throw Error("Damaged package directory.");
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      crc = u32(cursor + 16),
      compressed = u32(cursor + 20),
      size = u32(cursor + 24),
      nameLength = u16(cursor + 28),
      next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32),
      offset = u32(cursor + 42);
    if (next > directory + directorySize || nameLength > 2048)
      throw Error("Damaged entry.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.includes(":") ||
      name.split("/").includes("..") ||
      entries.has(name)
    )
      throw Error("Unsafe or duplicate package entry.");
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      size > budget.entry ||
      size > Math.max(1048576, compressed * 1000) ||
      (total += size) > budget.total
    )
      throw Error("Encrypted or oversized package entry.");
    if (offset + 30 > directory || u32(offset) !== 0x04034b50)
      throw Error("Damaged entry header.");
    const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
    if (start + compressed > directory || u16(offset + 8) !== method)
      throw Error("Invalid package range.");
    const parts: Uint8Array[] = [];
    let actual = 0;
    const accept = (part: Uint8Array) => {
      actual += part.length;
      if (actual > size || actual > budget.entry)
        throw Error("Decompression budget exceeded.");
      parts.push(part);
    };
    if (method === 0) accept(bytes.slice(start, start + compressed));
    else {
      const inflate = new Inflate((part) => accept(part));
      for (let at = 0; at < compressed; at += 1024)
        inflate.push(
          bytes.subarray(start + at, start + Math.min(compressed, at + 1024)),
          at + 1024 >= compressed,
        );
      if (!compressed) inflate.push(new Uint8Array(), true);
    }
    if (actual !== size) throw Error("Incorrect package entry size.");
    const data = new Uint8Array(actual);
    let at = 0;
    for (const part of parts) {
      data.set(part, at);
      at += part.length;
    }
    if (crc32(data) !== crc) throw Error("Package checksum mismatch.");
    entries.set(name, data);
    cursor = next;
  }
  if (cursor !== directory + directorySize)
    throw Error("Invalid package directory length.");
  return entries;
}
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function safeXml(bytes: Uint8Array): Document {
  if (bytes.length > OFFICE_BUDGET.xml)
    throw Error("XML exceeds the document budget.");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw Error("Document XML declarations are blocked.");
  let tokens = 0,
    depth = 0;
  for (const match of source.matchAll(/<\/?[A-Za-z_][^<>]*>/g)) {
    if (++tokens > OFFICE_BUDGET.nodes * 2)
      throw Error("Document XML is too complex.");
    if (match[0].startsWith("</")) depth--;
    else if (!match[0].endsWith("/>")) depth++;
    if (depth > OFFICE_BUDGET.depth)
      throw Error("Document XML nesting exceeds the budget.");
  }
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("Invalid document XML.");
  let count = 0;
  const visit = (node: Element, depth: number) => {
    if (++count > OFFICE_BUDGET.nodes || depth > OFFICE_BUDGET.depth)
      throw Error("Document XML is too complex.");
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(doc.documentElement, 0);
  return doc;
}
