import type { DataPage } from './types';
/** Loaded column only; never reads the source or converts imprecise integer values. */
export function columnSample(pages: Iterable<DataPage>, column: number, limit = 4096) {
  const points = new Map<number, number>();
  let examined = 0, skipped = 0;
  outer: for (const page of pages) {
    const index = page.columns.indexOf(column);
    if (index < 0) continue;
    for (let i = 0; i < page.values.length; i++) {
      if (examined++ >= Math.min(limit, 10000)) break outer;
      const c = page.values[i][index];
      if (!/int|float|double|real|number|numeric/i.test(c.type) || c.truncated || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(c.raw)) { skipped++; continue; }
      const value = Number(c.raw);
      if (!Number.isFinite(value) || (/^[+-]?\d+$/.test(c.raw) && !Number.isSafeInteger(value)) || /decimal|timestamp|date|time/i.test(c.type)) { skipped++; continue; }
      points.set(page.start + i, value);
    }
  }
  const values = [...points].sort((a, b) => a[0] - b[0]);
  return { points: values, skipped, examined: Math.min(examined, Math.min(limit, 10000)), min: values.length ? Math.min(...values.map(p => p[1])) : undefined, max: values.length ? Math.max(...values.map(p => p[1])) : undefined };
}
