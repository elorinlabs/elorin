export type JsonNodeType =
  "object" | "array" | "string" | "number" | "boolean" | "null";
export interface JsonNode {
  /** Pointer plus source offset distinguishes duplicate members without losing their data. */
  id: string;
  pointer: string;
  key: string;
  type: JsonNodeType;
  parent: number;
  position: number;
  depth: number;
  offset: number;
  length: number;
  value?: string | boolean | null;
  children?: number[];
  objectItems?: number;
  primitiveItems?: number;
}
export interface JsonDiagnostic {
  kind: "error" | "warning";
  message: string;
  offset?: number;
  line?: number;
  column?: number;
}
export interface JsonStatistics {
  nodes: number;
  object: number;
  array: number;
  string: number;
  number: number;
  boolean: number;
  null: number;
  maxDepth: number;
  duplicateKeys: number;
  precisionRisks: number;
}
export interface JsonDocumentModel {
  source: string;
  status: "ready" | "invalid" | "empty" | "limited" | "jsonl";
  nodes: JsonNode[];
  /** Duplicate canonical pointers resolve to the last occurrence; all rows remain inspectable. */
  pointers: Map<string, number>;
  stats: JsonStatistics;
  diagnostics: JsonDiagnostic[];
  truncated: boolean;
}
