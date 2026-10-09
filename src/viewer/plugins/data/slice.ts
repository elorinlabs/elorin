import type { DataRequest } from './types';
export interface SliceRequest {
  datasetId: string; dimensionSelection: string[]; start: string[]; count: string[];
  stride: string[]; requestId: string; elementBytes: number;
}
export function validateSlice(shape: string[], r: SliceRequest) {
  if (shape.length > 32 || r.start.length !== shape.length || r.count.length !== shape.length || r.stride.length !== shape.length || r.dimensionSelection.length > shape.length || !Number.isSafeInteger(r.elementBytes) || r.elementBytes < 1 || r.elementBytes > 65536) throw Error('INVALID_SLICE');
  const parse = (s: string) => { if (!/^(0|[1-9][0-9]{0,19})$/.test(s) || BigInt(s) > 18446744073709551615n) throw Error('INVALID_OFFSET'); return BigInt(s); };
  let total = 1n, output = BigInt(r.elementBytes);
  shape.forEach((dim, i) => {
    const size = parse(dim), start = parse(r.start[i]), count = parse(r.count[i]), stride = parse(r.stride[i]);
    total *= size;
    if (total > 18446744073709551615n) throw Error('ResourceLimit: shape overflow');
    if (!stride || start > size || (count > 0n && (start >= size || start + (count - 1n) * stride >= size))) throw Error('INVALID_SLICE');
    if (i < r.dimensionSelection.length && (parse(r.dimensionSelection[i]) !== start || count !== 1n)) throw Error('INVALID_SLICE');
    output *= count;
    if (output > 18446744073709551615n) throw Error('ResourceLimit: slice overflow');
  });
  if (output > 1048576n) throw Error('ResourceLimit: decoded slice exceeds 1 MiB');
  return output;
}
export function gridSlice(shape: number[], page: DataRequest, elementBytes: number, requestId: string): SliceRequest {
  const rank = shape.length, fixed = page.fixed ?? [];
  if (fixed.length > Math.max(0, rank - 2)) throw Error('INVALID_SLICE: fixed rank');
  const rows = shape.at(-2) ?? shape[0] ?? 1;
  const first = page.columns.length ? Math.min(...page.columns) : 0;
  const width = page.columns.length ? Math.max(...page.columns) - first + 1 : 0;
  const start = shape.map((_, i) => i < rank - 2 ? fixed[i] ?? 0 : i === rank - 2 || rank === 1 ? page.start : first);
  const count = shape.map((_, i) => i < rank - 2 ? 1 : i === rank - 2 || rank === 1 ? Math.min(page.count, Math.max(0, rows - page.start)) : width);
  const r = { datasetId: page.node, dimensionSelection: shape.slice(0, -2).map((_, i) => String(fixed[i] ?? 0)), start: start.map(String), count: count.map(String), stride: shape.map(() => '1'), requestId, elementBytes };
  validateSlice(shape.map(String), r);
  return r;
}
