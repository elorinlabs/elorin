import { useSyncExternalStore } from "react";
import { CSV_CONFIG } from "./csv-config";
import { detectHeader } from "./csv-parser";
import { columnType, sampleStats, inferValue } from "./csv-stats";
import type { CsvColumn, CsvDialect, CsvStats } from "./csv-types";
/** Chunked row source interface: future indexed/disk stores need not own every row. */
export interface CsvRowSource {
  readonly count: number;
  get(index: number): readonly string[] | undefined;
}
export class ChunkedRows implements CsvRowSource {
  count = 0;
  private chunks: { start: number; rows: string[][] }[] = [];
  append(rows: string[][]) {
    if (rows.length) {
      this.chunks.push({ start: this.count, rows });
      this.count += rows.length;
    }
  }
  get(index: number) {
    let lo = 0,
      hi = this.chunks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1,
        c = this.chunks[mid];
      if (index < c.start) hi = mid - 1;
      else if (index >= c.start + c.rows.length) lo = mid + 1;
      else return c.rows[index - c.start];
    }
  }
}
export class TabularDocumentModel {
  readonly capabilities = { hierarchy: false, table: true, array: false, metadata: true, randomAccess: false, slice: false, image: false, pointCloud: false, visualization: false } as const;
  rowSource = new ChunkedRows();
  dialect: CsvDialect = {
    delimiter: ",",
    quote: '"',
    newline: "\n",
    detectedHeader: false,
    headerConfidence: 0,
    fallback: false,
  };
  columns: CsvColumn[] = [];
  stats: CsvStats[] = [];
  diagnostics: string[] = [];
  preview = "";
  sourceTruncated = false;
  headerOverride?: boolean;
  status: "indexing" | "complete" | "limited" | "error" = "indexing";
  processedBytes = 0;
  cells = 0;
  chars = 0;
  ragged = 0;
  expectedColumns = 0;
  version = 0;
  private sample: string[][] = [];
  private listeners = new Set<() => void>();
  constructor(
    public size: number,
    public encoding: string,
  ) {}
  get sizeClass() {
    return this.size < CSV_CONFIG.smallBytes
      ? "Small"
      : this.size < CSV_CONFIG.mediumBytes
        ? "Medium"
        : this.size < CSV_CONFIG.largeBytes
          ? "Large"
          : "Very Large";
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  publish() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  warn(message: string) {
    if (this.diagnostics.length < 100 && !this.diagnostics.includes(message))
      this.diagnostics.push(message);
  }
  append(rows: string[][]) {
    const accepted: string[][] = [];
    for (const row of rows) {
      const chars = row.reduce((n, v) => n + v.length, 0);
      if (
        this.rowSource.count + accepted.length >= CSV_CONFIG.maxRows ||
        this.cells + row.length > CSV_CONFIG.maxCells ||
        this.chars + chars > CSV_CONFIG.maxChars ||
        row.length > CSV_CONFIG.maxColumns ||
        chars > CSV_CONFIG.maxRecordChars
      ) {
        this.status = "limited";
        this.warn(
          "Large Dataset Mode · Partial dataset only: memory/row/column/record budget reached. Search, filter and statistics cover loaded rows; remaining bytes were not indexed.",
        );
        break;
      }
      if (!this.expectedColumns) this.expectedColumns = row.length;
      if (row.length !== this.expectedColumns) this.ragged++;
      this.cells += row.length;
      this.chars += chars;
      accepted.push(row);
      if (this.sample.length >= CSV_CONFIG.sampleRows + 1) row.forEach((raw, i) => {
        const column = this.columns[i], type = inferValue(raw);
        if (column?.confidence >= .7 && raw !== '' && type !== column.type && !(column.type === 'Number' && type === 'Integer'))
          this.warn(`Column ${i + 1}: later values differ from sampled ${column.type} type; original text is retained.`);
      });
      if (this.sample.length < CSV_CONFIG.sampleRows + 1) this.sample.push(row);
      if (row.length > this.columns.length)
        this.columns = Array.from(
          { length: row.length },
          (_, i) =>
            this.columns[i] ?? {
              id: `col:${i}`,
              index: i,
              name: `Column ${i + 1}`,
              width: 120,
              type: "String",
              confidence: 0,
            },
        );
    }
    const first = this.rowSource.count === 0;
    this.rowSource.append(accepted);
    if (first) {
      Object.assign(this.dialect, detectHeader(this.sample));
      const header = this.sample[0] ?? [];
      const duplicates = header.length - new Set(header).size;
      if (duplicates && this.dialect.detectedHeader)
        this.warn(
          `Duplicate column names: ${duplicates}. All columns are retained with distinct IDs.`,
        );
    }
    if (this.ragged)
      this.warn(
        "Rows contain inconsistent field counts; missing fields and additional columns are retained.",
      );
  }
  refreshStats(header: boolean) {
    this.stats = sampleStats(
      this.sample.slice(header ? 1 : 0),
      this.columns.length,
    );
    this.columns = this.columns.map((col, i) => {
      const name = header
        ? this.rowSource.get(0)?.[i] || `Column ${i + 1}`
        : `Column ${i + 1}`;
      let len = Math.min(name.length, 40);
      for (const row of this.sample.slice(header ? 1 : 0, 100))
        len = Math.max(len, Math.min(row[i]?.length ?? 0, 40));
      return {
        ...col,
        name,
        width: Math.min(360, Math.max(90, len * 7 + 30)),
        ...columnType(this.stats[i]),
      };
    });
  }
}
export function useCsvModel(model: TabularDocumentModel) {
  useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);
  return model;
}
