import Papa from "papaparse";
import { CSV_CONFIG } from "./csv-config";
import type { CsvRowSource } from "./csv-model";
import { inferValue } from "./csv-stats";
import type { CsvFilter, CsvMatch, CsvSort, CsvType } from "./csv-types";
function abort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}
const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));
/** Compare decimal tokens without a floating-point conversion; bound hostile exponents/tokens. */
export function numericCompare(a: string, b: string): number | undefined {
  const normalize = (s: string) => {
    if (s.length > 256 || !["Integer", "Number"].includes(inferValue(s)))
      return;
    const m = /^([+-]?)(\d*\.?\d*)(?:e([+-]?\d+))?$/i.exec(s)!;
    const exp = Number(m[3] ?? 0);
    if (!Number.isSafeInteger(exp) || Math.abs(exp) > 1e6) return;
    const point = m[2].indexOf("."),
      raw = m[2].replace(".", ""),
      digits = raw.replace(/^0+/, "");
    return {
      sign: digits ? (m[1] === "-" ? -1 : 1) : 0,
      digits,
      power:
        (point < 0 ? raw.length : point) - (raw.length - digits.length) + exp,
    };
  };
  const x = normalize(a),
    y = normalize(b);
  if (!x || !y) return;
  if (x.sign !== y.sign) return x.sign - y.sign;
  if (!x.sign) return 0;
  const length = Math.max(x.digits.length, y.digits.length);
  return (
    x.sign *
    (x.power !== y.power
      ? Math.sign(x.power - y.power)
      : x.digits
          .padEnd(length, "0")
          .localeCompare(y.digits.padEnd(length, "0")))
  );
}
export function matchesFilter(value: string, f: CsvFilter) {
  switch (f.op) {
    case "empty":
      return value === "";
    case "not-empty":
      return value !== "";
    case "contains":
      return value.toLowerCase().includes(f.value.toLowerCase());
    case "equals":
      return value === f.value;
    default: {
      const c = numericCompare(value, f.value);
      if (c === undefined) return false;
      return f.op === ">"
        ? c > 0
        : f.op === ">="
          ? c >= 0
          : f.op === "<"
            ? c < 0
            : f.op === "<="
              ? c <= 0
              : c === 0;
    }
  }
}
export async function searchRows(
  source: CsvRowSource,
  start: number,
  query: string,
  column: number | undefined,
  signal: AbortSignal,
) {
  const results: CsvMatch[] = [];
  let limited = false;
  const q = query.toLowerCase();
  if (!q) return { results, limited };
  const end = source.count;
  for (let row = start; row < end; row++) {
    abort(signal);
    const values = source.get(row) ?? [];
    for (
      let col = column ?? 0;
      col < (column === undefined ? values.length : column + 1);
      col++
    ) {
      if ((values[col] ?? "").slice(0, 32768).toLowerCase().includes(q)) {
        if (results.length === CSV_CONFIG.searchResults) {
          limited = true;
          return { results, limited };
        }
        results.push({ row, column: col });
      }
    }
    if (row % CSV_CONFIG.queryBatch === 0) await yieldTask();
  }
  return { results, limited };
}
export async function projectRows(
  source: CsvRowSource,
  start: number,
  filter: CsvFilter | undefined,
  sort: CsvSort | undefined,
  type: CsvType,
  signal: AbortSignal,
) {
  const rows: number[] = [];
  const end = source.count;
  for (let row = start; row < end; row++) {
    abort(signal);
    if (
      !filter ||
      matchesFilter(source.get(row)?.[filter.column] ?? "", filter)
    )
      rows.push(row);
    if (row % CSV_CONFIG.queryBatch === 0) await yieldTask();
  }
  if (sort) {
    if (rows.length > CSV_CONFIG.sortRows)
      throw new Error(
        "Sorting is limited to 50,000 loaded rows. Filter further or clear sort.",
      );
    const compare = (a: number, b: number) => {
      const x = source.get(a)?.[sort.column] ?? "",
        y = source.get(b)?.[sort.column] ?? "";
      let c: number;
      if (type === "Integer" || type === "Number")
        c = numericCompare(x, y) ?? x.localeCompare(y);
      else if (type === "Date" || type === "DateTime") {
        const d = Date.parse(x) - Date.parse(y);
        c = Number.isFinite(d) ? d : x.localeCompare(y);
      } else c = x.localeCompare(y);
      return (sort.direction === "asc" ? c : -c) || a - b;
    };
    // Cooperative stable merge sort; never one blocking native sort over a large dataset.
    let target = new Array<number>(rows.length);
    for (let width = 1; width < rows.length; width *= 2) {
      for (let lo = 0; lo < rows.length; lo += width * 2) {
        let a = lo,
          b = Math.min(lo + width, rows.length),
          ae = b,
          be = Math.min(lo + 2 * width, rows.length),
          out = lo;
        while (a < ae || b < be)
          target[out++] =
            b >= be || (a < ae && compare(rows[a], rows[b]) <= 0)
              ? rows[a++]
              : rows[b++];
        if (lo % 1024 === 0) {
          abort(signal);
          await yieldTask();
        }
      }
      for (let i = 0; i < rows.length; i++) rows[i] = target[i];
    }
  }
  return rows;
}
export function copyRow(
  row: readonly string[],
  delimiter: string,
  newline: string,
) {
  return Papa.unparse([Array.from(row)], { delimiter, newline, header: false });
}
