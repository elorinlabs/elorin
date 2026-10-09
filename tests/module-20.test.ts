import { describe, it, expect } from 'vitest';
import { gridSlice, validateSlice } from '../src/viewer/plugins/data/slice';
import { CacheBudget, pageMemory } from '../src/viewer/plugins/data/cache-budget';
import { columnSample } from '../src/viewer/plugins/data/sample';
import { dataCell } from '../src/viewer/plugins/data/precision';
import { DataModel } from '../src/viewer/plugins/data/data-model';
import type { ViewerContext } from '../src/viewer/core/types';
import { TabularDocumentModel } from '../src/viewer/plugins/csv/csv-model';
import { scientificError } from '../src/viewer/plugins/data/errors';
import { detectFileSource } from '../src/services/detection/browserDetector';
import type { FileSource } from '../src/services/fileSource';
import { readFileSync } from 'node:fs';
const request = (shape = [3, 4, 10]) => gridSlice(shape, { node: '/temperature', start: 1, count: 2, columns: [1, 3], fixed: shape.length > 2 ? [2] : [] }, 4, 'r1');
describe('Module 20 scientific boundaries', () => {
  it('Module 17 detects an IPC stream schema despite misleading extension', async () => {
    const bytes = readFileSync('test-fixtures/data/module20/stream.arrow');
    const source = { getSize: async () => bytes.length, readRange: async (at: number, n: number) => new Uint8Array(bytes.subarray(at, at + n)) } as unknown as FileSource;
    const descriptor = await detectFileSource('misleading.pdf', source);
    expect(descriptor.detectedType).toBe('arrow'); expect(descriptor.detectionSource).toContain('magic');
  });
  it('CSV later incompatible values remain raw with diagnostic', () => {
    const model = new TabularDocumentModel(100000, 'UTF-8');
    model.append(Array.from({ length: 5001 }, (_, i) => [String(i)])); model.refreshStats(false);
    model.append([['raw 科研🌈']]); expect(model.rowSource.get(5001)?.[0]).toBe('raw 科研🌈');
    expect(model.diagnostics.join(' ')).toContain('later values differ');
  });
  it.each([['MissingCodec', Error('unsupported HDF5 filter')], ['PermissionDenied', { code: 'ACCESS_DENIED', message: 'restricted' }], ['ResourceLimit', Error('Safety limit reached')], ['Cancelled', Error('Cancelled')], ['SourceUnavailable', { code: 'SOURCE_CHANGED', message: 'changed' }], ['Corrupted', Error('truncated header')]])('classifies %s without hiding the original failure', (code, error) => { expect(scientificError(error)).toMatch(new RegExp(`^${code}:`)); });
  it('validates high-dimensional fixed selection and contiguous column span', () => {
    const r = request(); expect(r.start).toEqual(['2', '1', '1']); expect(r.count).toEqual(['1', '2', '3']);
    expect(validateSlice(['3', '4', '10'], r)).toBe(24n);
  });
  it.each(['-1', '1.5', '1e3', '18446744073709551616', ' 1', '0'.repeat(1000)])('rejects invalid dimension %s', dim => {
    expect(() => validateSlice([dim, '4', '10'], request())).toThrow();
  });
  it('preserves offsets above Number precision', () => {
    const r = { datasetId: 'x', dimensionSelection: [], start: ['9007199254740993'], count: ['1'], stride: ['1'], requestId: 'x', elementBytes: 8 };
    expect(validateSlice(['9007199254741000'], r)).toBe(8n);
  });
  it.each([['18446744073709551615', '2'], ['1000000000000', '1000000000000']])('rejects shape overflow %s', (...shape) => {
    expect(() => validateSlice(shape, { datasetId: 'x', dimensionSelection: [], start: ['0', '0'], count: ['1', '1'], stride: ['1', '1'], requestId: 'r', elementBytes: 8 })).toThrow(/overflow/);
  });
  it('rejects too many fixed axes, zero strides, oversized output and out of bounds', () => {
    expect(() => gridSlice([4, 10], { node: 'x', start: 0, count: 1, columns: [0], fixed: [0] }, 8, 'x')).toThrow();
    for (const change of [{ stride: ['1', '0', '1'] }, { start: ['2', '4', '1'] }, { count: ['1', '2', '10'] }, { elementBytes: 65536 }]) {
      const r = { ...request(), ...change }; if ('elementBytes' in change) r.count = ['1', '4', '10'];
      expect(() => validateSlice(['3', '4', '10'], r)).toThrow();
    }
  });
  it('handles scalar and zero-sized arrays without fabricated values', () => {
    const base = { datasetId: 'x', dimensionSelection: [], start: [], count: [], stride: [], requestId: 'x', elementBytes: 8 };
    expect(validateSlice([], base)).toBe(8n);
    expect(validateSlice(['0'], { ...base, start: ['0'], count: ['0'], stride: ['1'] })).toBe(0n);
  });
  it('evicts across owners, enforces hard limit and releases accounting', () => {
    const budget = new CacheBudget(100); const a = {}, b = {}; let evicted = false;
    budget.add(a, 60, () => { evicted = true; }); budget.add(b, 60, () => {});
    expect(evicted).toBe(true); expect(budget.bytes).toBe(60);
    expect(() => budget.add({}, 101, () => {})).toThrow(); budget.remove(b); expect(budget.bytes).toBe(0);
  });
  it('bounds sampled visualization, omits special and imprecise integers', () => {
    const p = { start: 100, columns: [0], values: [1, 2, 9223372036854775807n, null, NaN].map(v => [dataCell(v, typeof v === 'bigint' ? 'int64' : 'float64')]), hasMore: false };
    expect(columnSample([p], 0).points).toEqual([[100, 1], [101, 2]]);
    expect(columnSample([p], 0).skipped).toBe(3);
    expect(columnSample([p], 0, 1).points.length).toBe(1); expect(pageMemory(p)).toBeGreaterThan(1000);
  });
  it('pause terminates provider, clears pages and discards late results', async () => {
    let cleanup = () => {}, closed = 0, resolve!: (v: any) => void;
    const model = new DataModel({ onCleanup: (f: () => void) => { cleanup = f; }, signal: new AbortController().signal } as unknown as ViewerContext, 'scientific');
    model.selected = { id: 'x', name: 'x', kind: 'dataset', metadata: {} };
    model.provider = { close: () => { closed++; }, nodes: async () => [], describe: async () => model.selected!, read: async () => new Promise(r => { resolve = r; }) };
    const work = model.request(0, [0]); model.setActive(false);
    resolve({ start: 0, columns: [0], values: [[dataCell(9)]], hasMore: false }); await work;
    expect(closed).toBe(1); expect(model.cache.size).toBe(0); cleanup();
  });
});
