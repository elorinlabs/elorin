import { DATA_LIMITS as L } from "./config";
import type { DataCell } from "./types";
export function exactDecimal(value: bigint | Uint8Array, scale: number) {
  let n: bigint;
  if (typeof value === "bigint") n = value;
  else {
    n = 0n;
    for (const b of value) n = (n << 8n) | BigInt(b);
    if (value.length && value[0] & 128) n -= 1n << BigInt(value.length * 8);
  }
  if (!Number.isInteger(scale) || Math.abs(scale) > 1000)
    throw Error("Safety limit reached: decimal scale");
  const sign = n < 0n ? "-" : "",
    digits = (n < 0n ? -n : n).toString();
  if (scale <= 0) return sign + digits + "0".repeat(-scale);
  const padded = digits.padStart(scale + 1, "0");
  return sign + padded.slice(0, -scale) + "." + padded.slice(-scale);
}
export function boundedValue(value: unknown, depth = 0): unknown {
  if (typeof value === "function" || typeof value === "symbol")
    return "[non-data value]";
  if (depth > 3) return "[depth limit]";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number")
    return Object.is(value, -0)
      ? "-0.0"
      : Number.isFinite(value)
        ? value
        : String(value);
  if (typeof value === "string") return value.slice(0, L.previewChars);
  if (ArrayBuffer.isView(value))
    return Array.from(
      {
        length: Math.min(
          32,
          (value as unknown as ArrayLike<unknown>).length ?? 0,
        ),
      },
      (_, i) =>
        boundedValue((value as unknown as ArrayLike<unknown>)[i], depth + 1),
    );
  if (Array.isArray(value))
    return value.slice(0, 32).map((v) => boundedValue(v, depth + 1));
  if (value instanceof Map)
    return Array.from(value.entries())
      .slice(0, 32)
      .map(([k, v]) => [
        boundedValue(k, depth + 1),
        boundedValue(v, depth + 1),
      ]);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 32)
        .map(([k, v]) => [k, boundedValue(v, depth + 1)]),
    );
  return value;
}
export function dataCell(value: unknown, type = "unknown"): DataCell {
  if (value && typeof value === "object" && "r" in value && "i" in value) {
    const c = value as { r: unknown; i: unknown };
    const real = dataCell(c.r).raw,
      imaginary = dataCell(c.i).raw;
    return {
      raw: JSON.stringify({ real, imaginary }),
      display: `${real} ${imaginary.startsWith("-") ? "−" : "+"} ${imaginary.replace(/^-/, "")}i`,
      type: "complex",
      details: { real, imaginary },
    };
  }
  if (value == null) return { raw: "", display: "NULL", type: "null" };
  if (value instanceof Uint8Array)
    return {
      raw: Array.from(value.subarray(0, L.blobBytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      display: `Binary · ${value.byteLength.toLocaleString()} bytes`,
      type: "binary",
      size: value.byteLength,
      truncated: value.byteLength > L.blobBytes,
    };
  const details = typeof value === "object" ? boundedValue(value) : undefined;
  let raw = details === undefined ? String(value) : JSON.stringify(details);
  if (typeof value === "number")
    raw = Object.is(value, -0)
      ? "-0.0"
      : Number.isNaN(value)
        ? "NaN"
        : value === Infinity
          ? "+∞"
          : value === -Infinity
            ? "−∞"
            : String(value);
  const truncated = raw.length > L.previewChars;
  raw = raw.slice(0, L.previewChars);
  return {
    raw,
    display: details
      ? Array.isArray(value)
        ? "[…]"
        : value instanceof Map
          ? `Map(${value.size})`
          : "{…}"
      : raw,
    type,
    size:
      typeof value === "string"
        ? new TextEncoder().encode(value).length
        : undefined,
    details,
    truncated,
  };
}
export function blobMagic(hex: string) {
  const h = hex.toLowerCase();
  if (h.startsWith("89504e470d0a1a0a")) return "PNG";
  if (h.startsWith("255044462d")) return "PDF";
  if (h.startsWith("504b0304")) return "ZIP";
  if (h.startsWith("ffd8ff")) return "JPEG";
  if (h.startsWith("7b") || h.startsWith("5b"))
    return "Possible JSON; not parsed";
  return "Unknown binary";
}
