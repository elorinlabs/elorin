/// <reference lib="webworker" />
import { parquetMetadataAsync, parquetScan } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { RecordBatchReader, Message, Type } from "apache-arrow";
import { Footer } from 'apache-arrow/ipc/metadata/file';
import initSqlJs from "sql.js";
import { DATA_LIMITS as L } from "./config";
import { boundedValue, dataCell, exactDecimal } from "./precision";
import { NetcdfReader } from "./netcdf-reader";
import { NpyReader } from './npy-reader';
let npy: NpyReader | undefined;
import { gridSlice } from './slice';
const sliceGates = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
async function checkSlice(shape: number[], r: DataRequest, width: number) {
  const sliceGate = ++serial;
  const request = gridSlice(shape, r, width, `slice:${sliceGate}`);
  await new Promise<void>((resolve, reject) => {
    sliceGates.set(sliceGate, { resolve, reject });
    self.postMessage({ sliceGate, shape: shape.map(String), request });
  });
}
import type { DataNode, DataRequest, DataPage, DataCell } from "./types";
const pending = new Map<
  number,
  { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }
>();
let serial = 0,
  size = 0,
  format = "",
  nodes: DataNode[] = [];
let db: any,
  parquet: any,
  scan: any,
  arrow: any,
  netcdf: NetcdfReader | undefined,
  h5: any,
  h5file: any,
  readSync: ((at: number, n: number) => Uint8Array) | undefined;
let arrowBlocks: { start: number; rows: number }[] = [];
const arrowCache = new Map<number, any>();
function read(at: number, n: number): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(at) ||
    !Number.isSafeInteger(n) ||
    at < 0 ||
    n < 0 ||
    at + n > size ||
    n > L.chunkBytes
  )
    throw Error("Safety limit reached or invalid data range");
  return new Promise((resolve, reject) => {
    const range = ++serial;
    pending.set(range, { resolve, reject });
    self.postMessage({ range, offset: at, length: n });
  });
}
const rawParsers = {
  timestampFromMilliseconds: (n: bigint) => n,
  timestampFromMicroseconds: (n: bigint) => n,
  timestampFromNanoseconds: (n: bigint) => n,
  jsonFromBytes: (b: Uint8Array) => new TextDecoder().decode(b),
};
const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
function sqlRows(sql: string, args: any[] = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(args);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.get(null, { useBigInt: true }));
      if (result.length > L.nodes)
        throw Error("Safety limit reached: metadata rows");
    }
    return result;
  } finally {
    stmt.free();
  }
}
function sqliteColumns(name: string) {
  return sqlRows(
    'SELECT name,type,"notnull",pk,hidden FROM pragma_table_xinfo(?)',
    [name],
  ).map(([name, type, notnull, pk, hidden]: any[]) => ({
    name,
    type,
    nullable: !notnull,
    metadata: { primaryKeyOrder: String(pk), generated: String(hidden) },
  }));
}
async function open(args: any) {
  size = args.size;
  format = args.format;
  if (!Number.isSafeInteger(size) || size < 0)
    throw Error("Invalid source size");
  if (format === "sqlite") {
    if (size > L.browserSqliteBytes)
      throw Error("Materialization required: Browser SQLite exceeds 64 MiB");
    const SQL = await initSqlJs({
      locateFile: () =>
        new URL("/vendor/data/sql-wasm.wasm", self.location.href).href,
    });
    const b = new Uint8Array(size);
    for (let at = 0; at < size; at += L.chunkBytes)
      b.set(await read(at, Math.min(L.chunkBytes, size - at)), at);
    if (new TextDecoder().decode(b.subarray(0, 16)) !== "SQLite format 3\0")
      throw Error("Encrypted or unsupported SQLite database");
    db = new SQL.Database(b);
    db.run(
      "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8192;",
    );
    nodes = sqlRows(
      "SELECT name,type,tbl_name,sql FROM sqlite_schema ORDER BY type,name LIMIT 10001",
    )
      .filter((r: any[]) => !r[0].startsWith("sqlite_"))
      .map(([name, kind, table, sql]: any[]) => ({
        id: name,
        name,
        kind,
        columns: sqliteColumns(name),
        metadata: {
          sql: String(sql ?? "").slice(0, L.previewChars),
          table,
          readOnly: true,
          snapshot: "Base database only; WAL sidecars are not read",
          withoutRowid: /WITHOUT\s+ROWID/i.test(sql ?? ""),
          strict: /STRICT\s*;?$/i.test(sql ?? ""),
          foreignKeys: sqlRows("SELECT * FROM pragma_foreign_key_list(?)", [
            name,
          ]).map((r: any[]) => ({ table: r[2], from: r[3], to: r[4] })),
          indexes: sqlRows(
            'SELECT name,"unique",partial FROM pragma_index_list(?) LIMIT 256',
            [table],
          ).map(([name, unique, partial]: any[]) => ({
            name,
            unique: unique !== 0n,
            partial: partial !== 0n,
            columns: sqlRows(
              "SELECT name FROM pragma_index_info(?) LIMIT 256",
              [name],
            ).map((r: any[]) => r[0]),
          })),
        },
      }));
  } else if (format === "parquet") {
    const tail = await read(size - 8, 8);
    if (new TextDecoder().decode(tail.subarray(4)) !== "PAR1")
      throw Error("Malformed or encrypted Parquet footer");
    const footer = new DataView(tail.buffer).getUint32(0, true);
    if (footer > L.metadataBytes || footer + 8 > size)
      throw Error("Safety limit reached: Parquet footer");
    const file = {
      byteLength: size,
      slice: async (start: number, end = size) =>
        (await read(start, end - start)).buffer as ArrayBuffer,
    };
    parquet = await parquetMetadataAsync(file, {
      parsers: rawParsers,
      initialFetchSize: Math.min(size, 65536),
      geoparquet: false,
    });
    if (
      parquet.schema.length > L.nodes ||
      parquet.row_groups.length > L.nodes ||
      parquet.num_rows > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw Error("Safety limit reached: Parquet structure");
    let depth = 0;
    const columns = [];
    for (let i = 1; i < parquet.schema.length;) {
      const e = parquet.schema[i],
        at = i;
      let children = e.num_children ?? 0;
      i++;
      while (children > 0 && i < parquet.schema.length) {
        children += (parquet.schema[i].num_children ?? 0) - 1;
        i++;
      }
      columns.push({
        name: e.name,
        type: e.logical_type?.type ?? e.converted_type ?? e.type ?? "STRUCT",
        nullable: e.repetition_type !== "REQUIRED",
        metadata: {
          schema: boundedValue(parquet.schema.slice(at, i)),
          statistics:
            e.converted_type === "DECIMAL" || e.logical_type?.type === "DECIMAL"
              ? "Decimal metadata statistics omitted to avoid rounded library conversion"
              : boundedValue(
                  parquet.row_groups.slice(0, 64).flatMap((g: any) =>
                    g.columns
                      .filter(
                        (c: any) => c.meta_data?.path_in_schema?.[0] === e.name,
                      )
                      .map((c: any) => ({
                        codec: c.meta_data.codec,
                        encodings: c.meta_data.encodings,
                        statistics: c.meta_data.statistics,
                      })),
                  ),
                ),
        },
      });
      depth++;
    }
    nodes = [
      {
        id: "data",
        name: "Rows",
        kind: "table",
        rows: Number(parquet.num_rows),
        columns,
        metadata: {
          rows: parquet.num_rows.toString(),
          rowGroups: parquet.row_groups.length,
          createdBy: parquet.created_by,
          schema: boundedValue(parquet.schema),
          keyValueMetadata: boundedValue(parquet.key_value_metadata),
          codecs: [
            ...new Set(
              parquet.row_groups.flatMap((g: any) =>
                g.columns.map((c: any) => c.meta_data?.codec),
              ),
            ),
          ],
          rowGroupMetadata: boundedValue(
            parquet.row_groups.slice(0, 32).map((g: any) => ({
              rows: g.num_rows,
              compressed: g.total_compressed_size,
              uncompressed: g.total_byte_size,
            })),
          ),
        },
      },
    ];
    const rawMetadata = structuredClone(parquet);
    for (const e of rawMetadata.schema) {
      if (
        e.converted_type === "DECIMAL" ||
        e.logical_type?.type === "DECIMAL"
      ) {
        delete e.converted_type;
        delete e.logical_type;
      }
    }
    scan = await parquetScan({
      file,
      metadata: rawMetadata,
      compressors,
      utf8: false,
      parsers: rawParsers,
      geoparquet: false,
      useOffsetIndex: true,
    });
  } else if (format === "arrow" || format === "feather") {
    const header = await read(0, Math.min(8, size));
    const stream = new TextDecoder().decode(header.subarray(0, 6)) !== 'ARROW1';
    if (stream) {
      if (new TextDecoder().decode(header.subarray(0, 4)) === 'FEA1') throw Error('UnsupportedFormat: Feather v1');
      if (size > L.metadataBytes) throw Error('ResourceLimit: Arrow IPC stream bounded cache is limited to 8 MiB; IPC file supports ranged access');
      const bytes = await read(0, size);
      let at = 0;
      while (at < bytes.length) {
        if (bytes.length - at < 4) throw Error('Corrupted: truncated IPC stream prefix');
        const view = new DataView(bytes.buffer, bytes.byteOffset + at);
        const continuation = view.getInt32(0, true) === -1;
        const prefix = continuation ? 8 : 4;
        if (view.byteLength < prefix) throw Error('Corrupted: truncated IPC metadata length');
        const length = view.getInt32(prefix - 4, true);
        at += prefix;
        if (length === 0) { if (at !== bytes.length) throw Error('Corrupted: trailing IPC stream bytes'); break; }
        if (length < 0 || length > L.metadataBytes || at + length > bytes.length) throw Error('Corrupted: invalid IPC metadata');
        const message = Message.decode(bytes.subarray(at, at + length));
        if (message.compression) throw Error('MissingCodec: compressed Arrow IPC stream');
        const body = Number(message.bodyLength);
        if (!Number.isSafeInteger(body) || body < 0 || body > L.arrowBatchBytes || at + length + body > bytes.length) throw Error('ResourceLimit: invalid IPC stream body');
        at += length + body;
      }
      const reader = await RecordBatchReader.from(bytes);
      await reader.open({ autoDestroy: false });
      const batches: any[] = [];
      let start = 0;
      for await (const batch of reader) {
        if (batches.length >= L.nodes || !Number.isSafeInteger(start + batch.numRows)) throw Error('ResourceLimit: Arrow stream batches');
        arrowBlocks.push({ start, rows: batch.numRows }); start += batch.numRows; batches.push(batch);
      }
      arrow = { schema: reader.schema, numRecordBatches: batches.length, numDictionaries: 0, footer: { getRecordBatch: () => ({ bodyLength: size }) }, readRecordBatch: async (i: number) => batches[i] };
    } else {
    const tail = await read(size - 10, 10),
      footer = new DataView(tail.buffer).getInt32(0, true);
    if (new TextDecoder().decode(tail.subarray(4)) !== 'ARROW1') throw Error('Corrupted: missing Arrow file footer signature');
    if (footer < 0 || footer > L.metadataBytes || footer + 10 > size)
      throw Error("Safety limit reached: Arrow footer");
    const decodedFooter = Footer.decode(await read(size - 10 - footer, footer));
    if (decodedFooter.numRecordBatches > L.nodes || decodedFooter.numDictionaries > L.nodes) throw Error('ResourceLimit: Arrow footer blocks');
    let dictionaries = 0, largestBatch = 0;
    for (const [dictionary, blocks] of [[true, decodedFooter.dictionaryBatches()], [false, decodedFooter.recordBatches()]] as const) {
      for (const block of blocks) {
        if (!block) continue;
        if (![block.offset, block.metaDataLength, block.bodyLength].every(n => Number.isSafeInteger(n) && n >= 0) || block.offset + block.metaDataLength + block.bodyLength > size - 10 - footer) throw Error('Corrupted: Arrow block outside file');
        if (dictionary) dictionaries += block.bodyLength; else largestBatch = Math.max(largestBatch, block.bodyLength);
        if (dictionaries + largestBatch > L.arrowBatchBytes) throw Error('ResourceLimit: Arrow dictionaries and batch exceed 32 MiB');
      }
    }
    const handle: any = {
      fd: 1,
      stat: async () => ({ size }),
      close: async () => {},
      read: async (
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number,
      ) => {
        const b = await read(position, length);
        buffer.set(b, offset);
        return { buffer, bytesRead: b.length };
      },
    };
    arrow = await RecordBatchReader.from(handle);
    await arrow.open({ autoDestroy: false });
    if (arrow.numRecordBatches > L.nodes || arrow.numDictionaries > L.nodes)
      throw Error("Safety limit reached: Arrow batches");
    let start = 0;
    for (let i = 0; i < arrow.numRecordBatches; i++) {
      const block = arrow.footer.getRecordBatch(i);
      if (block.metaDataLength > L.metadataBytes)
        throw Error("Safety limit reached: Arrow batch metadata");
      const b = await read(block.offset, block.metaDataLength),
        v = new DataView(b.buffer),
        skip = v.getInt32(0, true) === -1 ? 8 : 4;
      const msg = Message.decode(b.subarray(skip));
      if (msg.compression)
        throw Error(
          "Unsupported compression: Arrow IPC compressed record batch",
        );
      if (!msg.isRecordBatch())
        throw Error("Malformed Arrow record batch metadata");
      const rows = msg.header().length;
      if (
        !Number.isSafeInteger(rows) ||
        rows < 0 ||
        start + rows > Number.MAX_SAFE_INTEGER
      )
        throw Error("Invalid Arrow row count");
      arrowBlocks.push({ start, rows });
      start += rows;
    }
    }
    const start = arrowBlocks.reduce((n, b) => n + b.rows, 0);
    nodes = [
      {
        id: "data",
        name: "Record batches",
        kind: "table",
        rows: start,
        columns: arrow.schema.fields.map((f: any) => ({
          name: f.name,
          type: f.type.toString(),
          nullable: f.nullable,
          metadata: {
            fieldMetadata: boundedValue(f.metadata),
            children: f.type.children?.map((c: any) => ({
              name: c.name,
              type: c.type.toString(),
            })),
          },
        })),
        metadata: {
          batches: arrow.numRecordBatches,
          dictionaries: arrow.numDictionaries,
          schemaMetadata: boundedValue(arrow.schema.metadata),
          container: stream ? 'IPC stream · bounded 8 MiB cache' : 'IPC file · ranged batches',
        },
      },
    ];
  } else if (format === "hdf5") {
    h5 = await import(
      /* @vite-ignore */ new URL("/vendor/data/hdf5_hl.js", self.location.href)
        .href
    );
    const { FS } = await h5.ready;
    if (args.blob) {
      const fr = new FileReaderSync();
      readSync = (at, n) =>
        new Uint8Array(fr.readAsArrayBuffer(args.blob.slice(at, at + n)));
    } else {
      const url = String(args.url ?? "");
      if (
        !/^https?:\/\/prism-science\.localhost\//.test(url) &&
        !/^prism-science:/.test(url)
      )
        throw Error("Unsafe scientific resource URL");
      readSync = (at, n) => {
        const out = new Uint8Array(n);
        for (let offset = 0; offset < n; offset += 1024 * 1024) {
          const len = Math.min(1024 * 1024, n - offset),
            xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.setRequestHeader(
            "Range",
            `bytes=${at + offset}-${at + offset + len - 1}`,
          );
          xhr.send();
          const b = new Uint8Array(xhr.response ?? new ArrayBuffer(0));
          if (xhr.status !== 206 || b.length !== len)
            throw Error("Scientific range read failed");
          out.set(b, offset);
        }
        return out;
      };
    }
    FS.createDataFile("/", "input.data", new Uint8Array(0), true, false);
    const node = FS.lookupPath("/input.data").node;
    node.node_ops = {
      ...node.node_ops,
      getattr: () => ({
        dev: 1,
        ino: 1,
        mode: 33060,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size,
        atime: new Date(0),
        mtime: new Date(0),
        ctime: new Date(0),
        blksize: 4096,
        blocks: Math.ceil(size / 4096),
      }),
    };
    node.stream_ops = {
      ...node.stream_ops,
      read: (
        _: any,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number,
      ) => {
        if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(length) || length < 0 || position > size) throw Error('INVALID_OFFSET: HDF5 source read');
        const n = Math.min(length, Math.max(0, size - position));
        if (n > L.chunkBytes)
          throw Error("Safety limit reached: HDF5 source read");
        buffer.set(readSync!(position, n), offset);
        return n;
      },
      write: () => {
        throw Error("Read-only scientific source");
      },
    };
    h5file = new h5.File("/input.data", "r");
    if (h5file.file_id < 0n) throw Error("Malformed or corrupted HDF5 file");
    nodes = [
      {
        id: "@file",
        name: "File attributes",
        kind: "metadata",
        metadata: { attributes: attrs(h5file), readOnly: true },
      },
      ...(await hdfChildren("/")),
    ];
  } else if (format === 'npy') {
    npy=new NpyReader(read,size);nodes=await npy.open();
  } else if (format === "netcdf") {
    netcdf = new NetcdfReader(read, size);
    nodes = await netcdf.open();
  } else if (format === "mat")
    throw Error(
      "Limited Preview: MAT v5 backend is unavailable; MAT v7.3 uses the HDF5 reader. No MATLAB code is executed.",
    );
  else throw Error("Unsupported data format");
  return nodes;
}
function attrs(entity: any) {
  const result: Record<string, unknown> = {};
  let remaining = BigInt(L.metadataBytes);
  const attributes = entity.attrs ?? {};
  for (const [name, attribute] of Object.entries(attributes).slice(0, 128)) {
    const a = attribute as any;
    if(a.metadata?.vlen){result[name]="Variable-length attribute preview unavailable under the allocation safety policy";continue;}
    const count = a.metadata?.total_size ?? 1, width = a.metadata?.size ?? 1;
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(width) || width < 0 || BigInt(count) * BigInt(width) > remaining) {
      result[name] = "Attribute preview exceeds budget";
      continue;
    }
    remaining -= BigInt(count) * BigInt(width);
    result[name] = boundedValue(a.value);
  }
  return result;
}
async function hdfChildren(path: string) {
  if (path.split("/").length > L.dimensions)
    throw Error("Safety limit reached: group depth / link cycle");
  const group = h5file.get(path);
  if (!(group instanceof h5.Group)) return [];
  const keys = group.keys();
  if (keys.length > L.nodes) throw Error("Safety limit reached: group members");
  return keys.map((name: string) => {
    const id = (path === "/" ? "" : path) + "/" + name;
    const entity = group.get(name);
    if (entity instanceof h5.ExternalLink)
      return {
        id,
        name,
        kind: "external-link",
        metadata: {
          target: entity.obj_path,
          filename: entity.filename,
          blocked: true,
        },
      };
    if (entity instanceof h5.BrokenSoftLink)
      return {
        id,
        name,
        kind: "soft-link",
        metadata: {
          target: entity.target,
          preview: "Link is not automatically followed",
        },
      };
    if (entity instanceof h5.Group)
      return {
        id,
        name,
        kind: "group",
        expandable: true,
        metadata: { path: id },
      };
    if (entity instanceof h5.Dataset) return hdfDescribe(id, entity);
    return { id, name, kind: "unsupported", metadata: { path: id } };
  });
}
function hdfDescribe(id: string, entity = h5file.get(id)): DataNode {
  if (entity instanceof h5.ExternalLink)
    return {
      id,
      name: id,
      kind: "external-link",
      metadata: {
        blocked: true,
        filename: entity.filename,
        target: entity.obj_path,
      },
    };
  if (entity instanceof h5.BrokenSoftLink)
    return {
      id,
      name: id,
      kind: "soft-link",
      metadata: { target: entity.target, blocked: true },
    };
  if (!(entity instanceof h5.Dataset))
    return {
      id,
      name: id,
      kind: "group",
      metadata: { attributes: attrs(entity) },
      expandable: true,
    };
  const shape = entity.shape ?? [],
    meta = entity.metadata;
  if (
    shape.length > L.dimensions ||
    shape.some((n: number) => !Number.isSafeInteger(n) || n < 0)
  )
    throw Error("Safety limit reached: dataset shape");
  if (shape.reduce((n: bigint, v: number) => n * BigInt(v), 1n) > 18446744073709551615n) throw Error('ResourceLimit: dataset shape overflow');
  return {
    id,
    name: id.split("/").at(-1)!,
    kind: "dataset",
    shape,
    rows: shape.at(-2) ?? shape[0] ?? 1,
    metadata: {
      path: id,
      dtype: entity.dtype,
      datatype: boundedValue(meta),
      filters: entity.filters,
      attributes: attrs(entity),
      dimensionLabels: entity.get_dimension_labels(),
      attachedScales: shape.map((_: number, i: number) =>
        entity.get_attached_scales(i),
      ),
      readOnly: true,
    },
  };
}
async function page(r: DataRequest): Promise<DataPage> {
  if (
    !Number.isSafeInteger(r.start) ||
    r.start < 0 ||
    !Number.isSafeInteger(r.count) ||
    r.count < 1 ||
    r.count > L.pageRows ||
    r.columns.length > L.pageColumns ||
    r.columns.some((i) => !Number.isInteger(i) || i < 0)
  )
    throw Error("Safety limit reached: page");
  if (r.node.startsWith('data/')) {
    const group = columnarChildren().find(n => n.id === r.node);
    if (!group || r.start > group.rows!) throw Error('INVALID_OFFSET: row group');
    if (r.start === group.rows) return { start: r.start, columns: r.columns, values: [], hasMore: false, rows: group.rows };
    const result = await page({ ...r, node: 'data', start: Number(group.metadata.rowStart) + r.start, count: Math.min(r.count, group.rows! - r.start) });
    return { ...result, start: r.start, rows: group.rows, hasMore: r.start + result.values.length < group.rows! };
  }
  if (format === "sqlite") return sqlitePage(r);
  if(format==='npy'){await checkSlice(npy!.node.shape??[],r,npy!.width);return npy!.page(r);}
  if (format === "netcdf") { const d = netcdf!.describe(r.node); await checkSlice(d.shape ?? [], r, 8); return netcdf!.page(r); }
  if (format === "hdf5") { const entity = h5file.get(r.node); const d = hdfDescribe(r.node, entity); await checkSlice(d.shape ?? [], r, entity.metadata?.size ?? 8); return hdfPage(r); }
  const node = nodes[0];
  if (r.columns.some((i) => i >= (node.columns?.length ?? 0)))
    throw Error("Invalid column");
  const count = Math.min(r.count, Math.max(0, node.rows! - r.start)),
    series: any[] = [];
  if (format === "parquet") {
    for (const col of r.columns) {
      const name = node.columns![col].name;
      const nestedSchema=(node.columns![col].metadata?.schema??[]) as any[];
      if(nestedSchema.length>1&&nestedSchema.some(e=>e.converted_type==="DECIMAL"||e.logical_type?.type==="DECIMAL")){series.push(Array.from({length:count},()=>({raw:"",display:"Nested Decimal · preview unavailable",type:"unsupported logical preview",details:{reason:"Nested Decimal conversion is not implemented; original schema and scale remain inspectable"}})));continue;}
      let groupStart = 0;
      for (const g of parquet.row_groups) {
        const groupEnd = groupStart + Number(g.num_rows);
        const intersects = groupEnd > r.start && groupStart < r.start + count;
        groupStart = groupEnd;
        if (!intersects) continue;
        const chunk = g.columns.find(
          (c: any) => c.meta_data.path_in_schema[0] === name,
        );
        if (
          chunk &&
          Number(chunk.meta_data.total_uncompressed_size) > L.chunkBytes
        )
          throw Error(
            "ResourceLimit: selected Parquet column chunk exceeds 32 MiB decoded budget",
          );
      }
      const values: any[] = [];
      for (const range of scan.ranges) {
        const rowStart = Math.max(r.start, range.rowStart),
          rowEnd = Math.min(r.start + count, range.rowEnd);
        if (rowStart < rowEnd)
          values.push(
            ...(await scan.readColumn({ column: name, rowStart, rowEnd })),
          );
      }
      const e = parquet.schema.find((e: any) => e.name === name);
      series.push(
        Array.from({ length: count }, (_, i) => {
          let value = values[i];
          if (
            value != null &&
            (e?.converted_type === "DECIMAL" ||
              e?.logical_type?.type === "DECIMAL")
          )
            value = exactDecimal(
              typeof value === "number" ? BigInt(value) : value,
              e.scale ?? e.logical_type?.scale ?? 0,
            );
          return dataCell(value, node.columns![col].type);
        }),
      );
    }
  } else {
    for (const col of r.columns) {
      const cells: DataCell[] = [];
      for (let row = r.start; row < r.start + count;) {
        const index = arrowBlocks.findIndex(
          (b) => row >= b.start && row < b.start + b.rows,
        );
        if (index < 0) break;
        let batch = arrowCache.get(index);
        if (!batch) {
          arrowCache.clear();
          const block = arrow.footer.getRecordBatch(index);
          if (block.bodyLength > L.arrowBatchBytes)
            throw Error(
              "Safety limit reached: Arrow record batch exceeds 32 MiB",
            );
          batch = await arrow.readRecordBatch(index);
          arrowCache.set(index, batch);
          while (arrowCache.size > 2)
            arrowCache.delete(arrowCache.keys().next().value!);
        }
        const vector = batch.getChildAt(col);
        const within = row - arrowBlocks[index].start,
          end = Math.min(batch.numRows, within + r.start + count - row);
        for (let i = within; i < end; i++) cells.push(arrowCell(vector, i));
        row += end - within;
      }
      series.push(cells);
    }
  }
  const values = Array.from({ length: count }, (_, i) =>
    series.map((s) => s[i]),
  );
  return {
    start: r.start,
    columns: r.columns,
    values,
    hasMore: r.start + count < node.rows!,
    rows: node.rows,
  };
}
function columnarChildren(): DataNode[] {
  let start = 0;
  const groups = format === 'parquet' ? parquet.row_groups.map((g: any) => ({ rows: Number(g.num_rows), compressed: String(g.total_compressed_size ?? ''), uncompressed: String(g.total_byte_size ?? ''), codecs: [...new Set(g.columns.map((c: any) => c.meta_data?.codec))] })) : arrowBlocks;
  return groups.map((g: any, i: number) => {
    const rowStart = start; start += g.rows;
    return { id: `data/${i}`, name: `${format === 'parquet' ? 'Row group' : 'Record batch'} ${i + 1}`, kind: 'table', rows: g.rows, metadata: { ...g, rowStart } };
  });
}
function arrowCell(vector: any, index: number): DataCell {
  if (!vector.isValid(index)) return dataCell(null);
  const type = vector.type;
  if (type.typeId === Type.Dictionary) {
    let at = index;
    for (const data of vector.data) {
      if (at < data.length) {
        const cell = arrowCell(
          data.dictionary,
          Number(data.values[at + data.offset]),
        );
        return {
          ...cell,
          type: type.toString(),
          details: {
            dictionaryIndex: String(data.values[at + data.offset]),
            value: cell.details ?? cell.raw,
          },
        };
      }
      at -= data.length;
    }
  }
  if (type.typeId === Type.Struct) {
    return dataCell(
      Object.fromEntries(
        type.children.map((field: any, i: number) => {
          const cell = arrowCell(vector.getChildAt(i), index);
          return [
            field.name,
            { raw: cell.raw, type: cell.type, value: cell.details },
          ];
        }),
      ),
      type.toString(),
    );
  }
  if ([Type.List, Type.FixedSizeList, Type.LargeList].includes(type.typeId)) {
    const list = vector.get(index);
    return dataCell(
      Array.from({ length: Math.min(32, list.length) }, (_, i) => {
        const cell = arrowCell(list, i);
        return { raw: cell.raw, type: cell.type, value: cell.details };
      }),
      type.toString(),
    );
  }
  if (type.typeId === Type.Timestamp) {
    let at = index;
    for (const data of vector.data) {
      if (at < data.length)
        return dataCell(data.values[at + data.offset], type.toString());
      at -= data.length;
    }
  }
  if (type.typeId === Type.Decimal) {
    let at = index;
    for (const data of vector.data) {
      if (at < data.length) {
        const stride = type.bitWidth / 32,
          start = (at + data.offset) * stride,
          words = data.values.subarray(start, start + stride);
        let n = 0n;
        for (let i = words.length - 1; i >= 0; i--)
          n = (n << 32n) | BigInt(words[i] >>> 0);
        if (words.at(-1) & 0x80000000) n -= 1n << BigInt(type.bitWidth);
        return dataCell(exactDecimal(n, type.scale), type.toString());
      }
      at -= data.length;
    }
  }
  let value = vector.get(index);
  if (
    value &&
    typeof value.get === "function" &&
    typeof value.length === "number"
  )
    value = Array.from({ length: Math.min(32, value.length) }, (_, i) =>
      boundedValue(value.get(i)),
    );
  else if (value && typeof value.toJSON === "function") value = value.toJSON();
  return dataCell(value, type.toString());
}
function sqlitePage(r: DataRequest): DataPage {
  const n = nodes.find((n) => n.id === r.node);
  if (!n || !["table", "view"].includes(n.kind))
    throw Error("Select a table or view");
  const columns = n.columns!;
  const key =
    n.kind === "table" && !n.metadata.withoutRowid
      ? ["rowid", "_rowid_", "oid"].find(
          (k) => !columns.some((c) => c.name.toLowerCase() === k),
        )
      : undefined;
  const args: any[] = [],
    where: string[] = [];
  if (r.filter) {
    const f = r.filter,
      c = quote(columns[f.column]?.name ?? "");
    if (!columns[f.column] || f.value.length > L.previewChars)
      throw Error("Invalid filter");
    if (f.op === "null") where.push(`${c} IS NULL`);
    else {
      where.push(
        f.op === "contains"
          ? `typeof(${c})='text' AND instr(${c},?)>0`
          : `${c} ${f.op === "equals" ? "=" : f.op === "greater" ? ">" : "<"} ?`,
      );
      args.push(
        f.op !== "contains" && /^-?\d+$/.test(f.value)
          ? BigInt(f.value)
          : f.op !== "contains" && /^[-+]?\d+\.\d+$/.test(f.value)
            ? Number(f.value)
            : f.value,
      );
    }
  }
  if (key && r.cursor) {
    where.push(`${quote(key)} > CAST(? AS INTEGER)`);
    args.push(r.cursor);
  }
  const projections = r.columns.map((i) => {
    if (!columns[i]) throw Error("Invalid column");
    const c = quote(columns[i].name);
    return `typeof(${c}),length(CAST(${c} AS BLOB)),CASE WHEN typeof(${c})='blob' THEN hex(substr(${c},1,64)) WHEN typeof(${c})='text' THEN substr(${c},1,8192) WHEN typeof(${c})='real' THEN ${c} ELSE CAST(${c} AS TEXT) END`;
  });
  const sql = `SELECT ${key ? quote(key) : "NULL"},${projections.join(",")} FROM ${quote(r.node)} ${where.length ? "WHERE " + where.join(" AND ") : ""} ${key ? "ORDER BY " + quote(key) : ""} LIMIT ? OFFSET ?`;
  args.push(r.count + 1, key && r.cursor ? 0 : r.start);
  const rows = sqlRows(sql, args),
    hasMore = rows.length > r.count;
  rows.length = Math.min(rows.length, r.count);
  return {
    start: r.start,
    columns: r.columns,
    hasMore,
    cursor: rows.at(-1)?.[0]?.toString(),
    values: rows.map((row: any[]) =>
      r.columns.map((_, j) => {
        const at = 1 + j * 3,
          t = row[at],
          size = Number(row[at + 1] ?? 0),
          raw = String(row[at + 2] ?? "");
        return {
          raw,
          display:
            t === "null"
              ? "NULL"
              : t === "blob"
                ? `BLOB · ${size.toLocaleString()} bytes`
                : raw,
          type: t,
          size,
          truncated: size > (t === "blob" ? L.blobBytes : L.previewChars),
        };
      }),
    ),
  };
}
function hdfPage(r: DataRequest): DataPage {
  const entity = h5file.get(r.node);
  if (!(entity instanceof h5.Dataset)) throw Error("Select a dataset");
  const d = hdfDescribe(r.node, entity),
    shape = d.shape!,
    rank = shape.length,
    rows = d.rows!,
    colCount = rank >= 2 ? shape.at(-1)! : 1;
  if (!r.columns.length || d.rows === 0)
    return {
      start: r.start,
      columns: r.columns,
      values: [],
      hasMore: false,
      rows: d.rows,
    };
  if (entity.filters.some((f: any) => ![1, 2, 3].includes(f.id)))
    throw Error(
      "Dataset uses unsupported HDF5 filter. External plugins are disabled.",
    );
  const meta = entity.metadata;
  if (meta.virtual_sources?.length)
    throw Error("External / virtual dataset sources are blocked");
  if (
    meta.chunks && meta.chunks.reduce((n: bigint, v: number) => {
      if (!Number.isSafeInteger(v) || v < 0) throw Error('Corrupted: HDF5 chunk shape');
      return n * BigInt(v);
    }, BigInt(meta.size ?? 8)) > BigInt(L.chunkBytes)
  )
    throw Error("Safety limit reached: decoded HDF5 chunk");
  if (meta.vlen || meta.compound_type?.members?.some((m: any) => m.vlen))
    throw Error("Safety limit reached: variable-length dataset preview");
  if (r.columns.some((c) => c >= colCount))
    throw Error("Invalid dataset column");
  const fixed = r.fixed ?? [];
  if (fixed.length > Math.max(0, rank - 2) || fixed.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n >= shape[i]))
    throw Error("Invalid slice index");
  const count = Math.min(r.count, Math.max(0, rows - r.start)),
    first = Math.min(...r.columns),
    last = Math.max(...r.columns) + 1;
  if (BigInt(count) * BigInt(last - first) * BigInt(meta.size ?? 8) > BigInt(L.pageBytes))
    throw Error("Safety limit reached: hyperslab");
  const ranges = shape.map((n: number, i: number) =>
    i < rank - 2
      ? [fixed[i] ?? 0, (fixed[i] ?? 0) + 1]
      : i === rank - 2
        ? [r.start, r.start + count]
        : rank === 1
          ? [r.start, r.start + count]
          : [first, last],
  );
  const data = rank ? entity.slice(ranges) : [entity.value];
  if(rank && data instanceof Uint8Array && meta.size>1 && [0,1].includes(meta.type))throw Error("Unsupported scientific dtype preview: raw storage bytes cannot be displayed as numeric values");
  const a = attrs(entity),
    width = rank >= 2 ? last - first : 1;
  const scalar = (name: string) =>
    Array.isArray(a[name]) && a[name].length === 1 ? a[name][0] : a[name];
  const fill = scalar("_FillValue"),
    missing = scalar("missing_value");
  let fieldNames: string[] | undefined;
  if (meta.type === 6 && meta.compound_type)
    fieldNames = meta.compound_type.members?.map((m: any) => m.name);
  const values = Array.from({ length: count }, (_, row) =>
    r.columns.map((col) => {
      const value = data?.[row * width + (rank >= 2 ? col - first : 0)];
      let cell = dataCell(
        fieldNames && Array.isArray(value)
          ? Object.fromEntries(fieldNames.map((n, i) => [n, value[i]]))
          : value,
        String(entity.dtype),
      );
      const isMissing =
        value === fill ||
        value === missing ||
        (typeof value === "bigint" &&
          (String(value) === String(fill) ||
            String(value) === String(missing))) ||
        (typeof value === "number" &&
          Number.isNaN(value) &&
          [fill, missing].some((v) => v === "NaN"));
      if (isMissing)
        cell = {
          ...cell,
          display: "Missing",
          details: {
            raw: cell.raw,
            fillValue: a._FillValue,
            missingValue: a.missing_value,
          },
        };
      if (
        typeof value === "number" &&
        !isMissing &&
        (a.scale_factor !== undefined || a.add_offset !== undefined)
      ) {
        const scaled =
          value * Number(a.scale_factor ?? 1) + Number(a.add_offset ?? 0);
        cell.display = dataCell(scaled).display;
        cell.details = {
          raw: cell.raw,
          scaled: dataCell(scaled).raw,
          scaleFactor: a.scale_factor,
          addOffset: a.add_offset,
        };
      }
      if (
        typeof value === "bigint" &&
        (a.scale_factor !== undefined || a.add_offset !== undefined)
      )
        cell.details = {
          raw: cell.raw,
          scaleFactor: a.scale_factor,
          addOffset: a.add_offset,
          warning: "Scaled preview omitted to preserve INT64 precision",
        };
      return cell;
    }),
  );
  return {
    start: r.start,
    columns: r.columns,
    values,
    hasMore: r.start + count < rows,
    rows,
  };
}
let chain = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data.sliceGate !== undefined) {
    const gate = sliceGates.get(data.sliceGate);
    if (gate) { sliceGates.delete(data.sliceGate); data.error ? gate.reject(Error(data.error)) : gate.resolve(); }
    return;
  }
  if (data.range !== undefined) {
    const p = pending.get(data.range);
    if (p) {
      pending.delete(data.range);
      data.error
        ? p.reject(Error(data.error))
        : p.resolve(new Uint8Array(data.buffer));
    }
    return;
  }
  chain = chain.then(async () => {
    try {
      const { operation, args, id } = data;
      let value: any;
      switch (operation) {
        case "open":
          value = await open(args);
          break;
        case "nodes":
          if (['parquet', 'arrow', 'feather'].includes(format) && nodes[0]) nodes[0].expandable = true;
          value = nodes;
          break;
        case "children":
          value = format === "hdf5" ? await hdfChildren(args.node) : args.node === 'data' && ['parquet', 'arrow', 'feather'].includes(format) ? columnarChildren() : [];
          break;
        case "describe":
          value =
            format === "hdf5"
              ? args.node === "@file"
                ? nodes.find((n) => n.id === "@file")
                : hdfDescribe(args.node)
              : netcdf
                ? netcdf.describe(args.node)
                : args.node.startsWith('data/') && ['parquet', 'arrow', 'feather'].includes(format) ? columnarChildren().find(n => n.id === args.node) : nodes.find((n) => n.id === args.node);
          if (value && args.node.startsWith('data/')) value.columns = nodes[0].columns;
          break;
        case "page":
          value = await page(args);
          break;
        case "count":
          value =
            format === "sqlite"
              ? Number(
                  sqlRows(`SELECT count(*) FROM ${quote(args.node)}`)[0][0],
                )
              : nodes.find((n) => n.id === args.node)?.rows;
          break;
        default:
          throw Error("Unsupported data operation");
      }
      if (operation === "page") {
        let budget = L.pageBytes;
        for (const row of value.values)
          for (const cell of row) {
            const cap = Math.max(
              0,
              Math.min(L.previewChars, Math.floor(budget / 4)),
            );
            if (cell.raw.length > cap || cell.display.length > cap) {
              cell.raw = cell.raw.slice(0, cap);
              cell.display = cell.display.slice(0, cap);
              cell.truncated = true;
            }
            budget -= 2 * (cell.raw.length + cell.display.length) + 256;
            if (budget < 0) cell.details = undefined;
          }
      }
      const encodedBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
      if (encodedBytes > (operation === 'page' ? L.pageBytes : L.metadataBytes)) throw Error('ResourceLimit: serialized scientific response');
      self.postMessage({ id, value });
    } catch (e) {
      self.postMessage({
        id: data.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
};
