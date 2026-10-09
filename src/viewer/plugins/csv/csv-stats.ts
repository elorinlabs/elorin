import { CSV_CONFIG } from "./csv-config";
import type { CsvStats, CsvType } from "./csv-types";
export function inferValue(value: string): CsvType {
  if (value === "") return "Empty";
  if (/^true$|^false$/i.test(value)) return "Boolean";
  if (/^[+-]?0\d/.test(value)) return "String";
  if (/^[+-]?\d+$/.test(value)) return "Integer";
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return "Number";
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  )
    return "Date";
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
    return "DateTime";
  return "String";
}
export function safeNumber(value: string): number | undefined {
  const type = inferValue(value);
  if (type !== "Integer" && type !== "Number") return;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return;
  // Aggregates are approximate doubles; do not admit high-significance decimal tokens.
  if (
    value
      .replace(/^[+-]/, "")
      .split(/[eE]/)[0]
      .replace(/[^0-9]/g, "")
      .replace(/^0+/, "").length > 15
  )
    return;
  return n;
}
export function typedValue(value: string) {
  const t = inferValue(value);
  return t === "Empty"
    ? null
    : t === "Boolean"
      ? value.toLowerCase() === "true"
      : (safeNumber(value) ?? value);
}
export function columnType(stats: CsvStats): {
  type: CsvType;
  confidence: number;
} {
  const filled = stats.count - stats.missing;
  if (!filled) return { type: "Empty", confidence: 1 };
  const numbers = (stats.types.Integer ?? 0) + (stats.types.Number ?? 0);
  if (numbers / filled >= 0.7)
    return {
      type: stats.types.Number ? "Number" : "Integer",
      confidence: numbers / filled,
    };
  const entries = Object.entries(stats.types)
    .filter(([t]) => t !== "Empty")
    .sort((a, b) => b[1]! - a[1]!);
  const [type, count] = entries[0] ?? ["String", 0];
  return {
    type: count! / filled >= 0.7 ? (type as CsvType) : "String",
    confidence: count! / filled,
  };
}
export function sampleStats(rows: string[][], columns: number): CsvStats[] {
  return Array.from({ length: columns }, (_, col) => {
    const s: CsvStats = {
      count: rows.length,
      missing: 0,
      unique: 0,
      uniqueLimited: false,
      numeric: 0,
      unsafe: 0,
      longest: 0,
      averageLength: 0,
      trueCount: 0,
      falseCount: 0,
      types: {},
    };
    const unique = new Set<string>();
    let sum = 0,
      len = 0;
    for (const row of rows) {
      const v = row[col] ?? "",
        t = inferValue(v);
      s.types[t] = (s.types[t] ?? 0) + 1;
      if (!v) {
        s.missing++;
        continue;
      }
      len += v.length;
      s.shortest = Math.min(s.shortest ?? Infinity, v.length);
      s.longest = Math.max(s.longest, v.length);
      if (unique.size < CSV_CONFIG.sampleRows && v.length <= 1024)
        unique.add(v);
      else s.uniqueLimited = true;
      if (t === "Boolean")
        v.toLowerCase() === "true" ? s.trueCount++ : s.falseCount++;
      if (t === "Date" || t === "DateTime") {
        if (!s.earliest || Date.parse(v) < Date.parse(s.earliest))
          s.earliest = v;
        if (!s.latest || Date.parse(v) > Date.parse(s.latest)) s.latest = v;
      }
      if (t === "Number" || t === "Integer") {
        const n = safeNumber(v);
        if (n === undefined) s.unsafe++;
        else {
          s.numeric++;
          sum += n;
          s.min = Math.min(s.min ?? Infinity, n);
          s.max = Math.max(s.max ?? -Infinity, n);
        }
      }
    }
    s.unique = unique.size;
    s.averageLength = len / (s.count - s.missing || 1);
    if (s.numeric) s.mean = sum / s.numeric;
    return s;
  });
}
