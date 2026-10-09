import { DATA_LIMITS as L } from "./config";
import { dataCell } from "./precision";
import type { DataNode, DataRequest, DataPage } from "./types";
type Read = (at: number, n: number) => Promise<Uint8Array>;
const sizes = [0, 1, 1, 2, 4, 4, 8];
const names = [
  "unknown",
  "int8",
  "char",
  "int16",
  "int32",
  "float32",
  "float64",
];
export function decodeCdf(bytes: Uint8Array, type: number) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  switch (type) {
    case 1:
      return v.getInt8(0);
    case 2:
      return new TextDecoder().decode(bytes);
    case 3:
      return v.getInt16(0, false);
    case 4:
      return v.getInt32(0, false);
    case 5:
      return v.getFloat32(0, false);
    case 6:
      return v.getFloat64(0, false);
    default:
      throw Error("Unsupported NetCDF dtype");
  }
}
export class NetcdfReader {
  private nodes: DataNode[] = [];
  private vars = new Map<
    string,
    {
      type: number;
      begin: number;
      record: boolean;
      shape: number[];
      attrs: Record<string, unknown>;
      vsize: number;
    }
  >();
  private stride = 0;
  constructor(
    private read: Read,
    private size: number,
  ) {}
  async open() {
    const b = await this.read(0, Math.min(this.size, L.metadataBytes)),
      v = new DataView(b.buffer, b.byteOffset, b.length);
    let at = 4;
    if (b[0] !== 67 || b[1] !== 68 || b[2] !== 70)
      throw Error("Malformed NetCDF signature");
    const version = b[3];
    if (version !== 1 && version !== 2)
      throw Error("Unsupported format: NetCDF CDF-5");
    const u32 = () => {
      if (at + 4 > b.length)
        throw Error("Safety limit reached or truncated NetCDF metadata");
      const n = v.getUint32(at, false);
      at += 4;
      return n;
    };
    const str = () => {
      const n = u32();
      if (n > L.previewChars || at + n > b.length)
        throw Error("Safety limit reached: NetCDF name");
      const s = new TextDecoder().decode(b.subarray(at, at + n));
      at += Math.ceil(n / 4) * 4;
      return s;
    };
    const list = (tag: number, fn: () => void) => {
      const t = u32(),
        n = u32();
      if (t === 0 && n === 0) return;
      if (t !== tag || n > L.nodes)
        throw Error("Malformed or oversized NetCDF list");
      for (let i = 0; i < n; i++) fn();
    };
    const attrs = () => {
      const out: Record<string, unknown> = {};
      list(12, () => {
        const name = str(),
          type = u32(),
          n = u32(),
          len = n * sizes[type];
        if (!sizes[type] || len > L.metadataBytes || at + len > b.length)
          throw Error("Safety limit reached: NetCDF attribute");
        if (type === 2)
          out[name] = new TextDecoder().decode(
            b.subarray(at, at + Math.min(n, L.previewChars)),
          );
        else {
          const values = [];
          for (let i = 0; i < Math.min(n, 32); i++)
            values.push(
              decodeCdf(
                b.subarray(at + i * sizes[type], at + (i + 1) * sizes[type]),
                type,
              ),
            );
          out[name] = n === 1 ? values[0] : values;
        }
        at += Math.ceil(len / 4) * 4;
      });
      return out;
    };
    const records = u32();
    if (records === 0xffffffff)
      throw Error("Unsupported NetCDF streaming record count");
    const dims: { name: string; size: number; unlimited: boolean }[] = [];
    list(10, () => {
      const name = str(),
        n = u32();
      dims.push({ name, size: n || records, unlimited: n === 0 });
    });
    const global = attrs();
    this.nodes.push({
      id: "@dimensions",
      name: "Dimensions",
      kind: "metadata",
      metadata: { dimensions: dims, globalAttributes: global },
    });
    list(11, () => {
      const name = str(),
        rank = u32();
      if (rank > L.dimensions) throw Error("Safety limit reached: dimensions");
      const ids = [];
      for (let i = 0; i < rank; i++) ids.push(u32());
      if (ids.some((i) => !dims[i])) throw Error("Invalid NetCDF dimension");
      const a = attrs(),
        type = u32(),
        vsize = u32();
      let begin = u32();
      if (version === 2) begin = begin * 4294967296 + u32();
      if (!Number.isSafeInteger(begin) || !sizes[type])
        throw Error("Unsupported NetCDF variable");
      const shape = ids.map((i) => dims[i].size),
        record = rank > 0 && dims[ids[0]].unlimited;
      this.vars.set(name, { type, begin, record, shape, attrs: a, vsize });
      if (record) this.stride += vsize;
      this.nodes.push({
        id: name,
        name,
        kind: "variable",
        shape,
        rows: shape.at(-2) ?? shape[0] ?? 1,
        metadata: {
          dtype: names[type],
          dimensions: ids.map((i) => dims[i].name),
          coordinate: rank === 1 && dims[ids[0]].name === name,
          attributes: a,
          globalAttributes: global,
          rawValues: true,
          scaleOffset:
            "Raw value retained; display applies scale_factor/add_offset",
          version,
        },
      });
    });
    // The sole record variable is stored without per-record padding.
    const recordVars = [...this.vars.values()].filter((v) => v.record);
    if (recordVars.length === 1) {
      const x = recordVars[0];
      this.stride = x.shape.slice(1).reduce((a, b) => a * b, 1) * sizes[x.type];
    }
    return this.nodes;
  }
  describe(id: string) {
    const n = this.nodes.find((n) => n.id === id);
    if (!n) throw Error("Unknown variable");
    return n;
  }
  async page(r: DataRequest): Promise<DataPage> {
    const variable = this.vars.get(r.node);
    if (!variable) throw Error("Select a variable");
    const { shape, type, begin, record, attrs } = variable;
    const fixed = r.fixed ?? [],
      rank = shape.length,
      rows = rank >= 2 ? shape[rank - 2] : (shape[0] ?? 1),
      cols = rank >= 2 ? shape[rank - 1] : 1;
    if (
      fixed.length > Math.max(0, rank - 2) ||
      fixed.some((n, i) => !Number.isInteger(n) || n < 0 || n >= shape[i])
    )
      throw Error("Invalid slice index");
    const firstColumn = Math.min(...r.columns),
      lastColumn = Math.max(...r.columns);
    const values = [];
    for (let row = r.start; row < Math.min(rows, r.start + r.count); row++) {
      const rowCoord =
        rank >= 2
          ? [
              ...Array.from({ length: rank - 2 }, (_, i) => fixed[i] ?? 0),
              row,
              firstColumn,
            ]
          : rank === 1
            ? [row]
            : [];
      const rowFlat = rowCoord.reduce((n, c, i) => n * shape[i] + c, 0);
      const rowOffset = record
        ? begin +
          rowCoord[0] * this.stride +
          rowCoord.slice(1).reduce((n, c, i) => n * shape[i + 1] + c, 0) *
            sizes[type]
        : begin + rowFlat * sizes[type];
      const rowBytes = await this.read(
        rowOffset,
        (rank >= 2 ? lastColumn - firstColumn + 1 : 1) * sizes[type],
      );
      const result = [];
      for (const column of r.columns) {
        if (column < 0 || column >= cols) throw Error("Invalid slice column");
        const coord =
          rank >= 2
            ? [
                ...Array.from({ length: rank - 2 }, (_, i) => fixed[i] ?? 0),
                row,
                column,
              ]
            : rank === 1
              ? [row]
              : [];
        const flat = coord.reduce((n, c, i) => n * shape[i] + c, 0);
        let offset = begin + flat * sizes[type];
        if (record) {
          const within = coord
            .slice(1)
            .reduce((n, c, i) => n * shape[i + 1] + c, 0);
          offset = begin + coord[0] * this.stride + within * sizes[type];
        }
        if (!Number.isSafeInteger(offset) || offset + sizes[type] > this.size)
          throw Error("Corrupted NetCDF data range");
        const within = rank >= 2 ? (column - firstColumn) * sizes[type] : 0;
        const raw = decodeCdf(
            rowBytes.subarray(within, within + sizes[type]),
            type,
          ),
          cell = dataCell(raw, names[type]);
        const missing = raw === attrs._FillValue || raw === attrs.missing_value;
        if (missing) {
          cell.display = "Missing";
          cell.details = {
            raw,
            fillValue: attrs._FillValue,
            missingValue: attrs.missing_value,
          };
        } else if (
          typeof raw === "number" &&
          (attrs.scale_factor !== undefined || attrs.add_offset !== undefined)
        ) {
          const scaled =
            raw * Number(attrs.scale_factor ?? 1) +
            Number(attrs.add_offset ?? 0);
          cell.display = dataCell(scaled).display;
          cell.details = {
            raw,
            scaled,
            scaleFactor: attrs.scale_factor,
            addOffset: attrs.add_offset,
          };
        }
        result.push(cell);
      }
      values.push(result);
    }
    return {
      start: r.start,
      columns: r.columns,
      values,
      hasMore: r.start + values.length < rows,
      rows,
    };
  }
}
