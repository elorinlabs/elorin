import { ascii, hex } from './binary-model';
export function inspectBytes(bytes: Uint8Array, littleEndian: boolean): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: Record<string, string> = {};
  const fields: [string, number, () => number | bigint][] = [
    ['UInt8', 1, () => view.getUint8(0)], ['Int8', 1, () => view.getInt8(0)],
    ['UInt16', 2, () => view.getUint16(0, littleEndian)], ['Int16', 2, () => view.getInt16(0, littleEndian)],
    ['UInt32', 4, () => view.getUint32(0, littleEndian)], ['Int32', 4, () => view.getInt32(0, littleEndian)],
    ['UInt64', 8, () => view.getBigUint64(0, littleEndian)], ['Int64', 8, () => view.getBigInt64(0, littleEndian)],
    ['Float32', 4, () => view.getFloat32(0, littleEndian)], ['Float64', 8, () => view.getFloat64(0, littleEndian)],
  ];
  for (const [name, size, read] of fields) { const value = bytes.length >= size ? read() : undefined; output[name] = value === undefined ? 'Unavailable' : Object.is(value, -0) ? '-0' : String(value); }
  output.ASCII = Array.from(bytes.subarray(0, 16), ascii).join('');
  try { output['UTF-8 preview'] = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, 16)); }
  catch { output['UTF-8 preview'] = 'Invalid or incomplete UTF-8'; }
  output['Binary bits'] = bytes.length ? bytes[0].toString(2).padStart(8, '0') : 'Unavailable';
  output['Hex value'] = bytes.length ? hex(bytes.subarray(0, 8)) : 'Unavailable';
  output['Decimal value'] = bytes.length ? String(bytes[0]) : 'Unavailable'; return output;
}
