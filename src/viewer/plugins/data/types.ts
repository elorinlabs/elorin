export interface DataColumn {
  name: string;
  type: string;
  nullable?: boolean;
  metadata?: Record<string, unknown>;
}
export interface DataNode {
  id: string;
  name: string;
  kind: string;
  columns?: DataColumn[];
  rows?: number;
  shape?: number[];
  metadata: Record<string, unknown>;
  expandable?: boolean;
}
export interface DataCell {
  raw: string;
  display: string;
  type: string;
  size?: number;
  details?: unknown;
  truncated?: boolean;
}
export interface DataPage {
  start: number;
  columns: number[];
  values: DataCell[][];
  hasMore: boolean;
  cursor?: string;
  rows?: number;
}
export interface DataFilter {
  column: number;
  op: "contains" | "equals" | "greater" | "less" | "null";
  value: string;
}
export interface DataRequest {
  node: string;
  start: number;
  count: number;
  columns: number[];
  fixed?: number[];
  filter?: DataFilter;
  cursor?: string;
}
export interface DataProvider {
  capabilities?: { hierarchy: boolean; table: boolean; array: boolean; metadata: boolean; randomAccess: boolean; slice: boolean; image: boolean; pointCloud: boolean; visualization: 'loaded-sample' | false };
  nodes(): Promise<DataNode[]>;
  children?(node: string): Promise<DataNode[]>;
  describe(node: string): Promise<DataNode>;
  read(request: DataRequest): Promise<DataPage>;
  count?(node: string): Promise<number>;
  close(): void;
}
