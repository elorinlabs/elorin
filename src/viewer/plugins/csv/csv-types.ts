export type CsvType =
  "String" | "Integer" | "Number" | "Boolean" | "Date" | "DateTime" | "Empty";
export interface CsvDialect {
  delimiter: string;
  quote: string;
  newline: string;
  detectedHeader: boolean;
  headerConfidence: number;
  fallback: boolean;
}
export interface CsvColumn {
  id: string;
  index: number;
  name: string;
  width: number;
  type: CsvType;
  confidence: number;
}
export interface CsvStats {
  count: number;
  missing: number;
  unique: number;
  uniqueLimited: boolean;
  numeric: number;
  unsafe: number;
  min?: number;
  max?: number;
  mean?: number;
  shortest?: number;
  longest: number;
  averageLength: number;
  trueCount: number;
  falseCount: number;
  earliest?: string;
  latest?: string;
  types: Partial<Record<CsvType, number>>;
}
export type CsvSelection =
  | { kind: "none" }
  | {
      kind: "cell";
      row: number;
      column: number;
      columnId: string;
      rawValue: string;
      parsedValue: string | number | boolean | null;
    }
  | { kind: "row"; row: number }
  | { kind: "column"; column: number };
export type CsvFilterOp =
  "contains" | "equals" | "empty" | "not-empty" | ">" | ">=" | "<" | "<=" | "=";
export interface CsvFilter {
  column: number;
  op: CsvFilterOp;
  value: string;
}
export interface CsvSort {
  column: number;
  direction: "asc" | "desc";
}
export interface CsvMatch {
  row: number;
  column: number;
}
