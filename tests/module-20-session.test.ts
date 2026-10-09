import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mock.invoke, convertFileSrc: (id: string, protocol: string) => `http://${protocol}.localhost/${id}` }));
import { ScientificSession } from '../src/viewer/plugins/data/scientific-session';
import type { ViewerContext } from '../src/viewer/core/types';
import { scientificProvider } from '../src/viewer/plugins/data/scientific-provider';
afterEach(() => vi.unstubAllGlobals());
function context(mode = 'tauri') {
  return { file: { mode }, source: { nativeResource: { path: 'authorized' }, getSize: async () => 4, readRange: async () => new Uint8Array([1]) }, signal: new AbortController().signal, onCleanup: () => {} } as unknown as ViewerContext;
}
beforeEach(() => { mock.invoke.mockReset(); mock.invoke.mockImplementation(async (command: string) => command === 'scientific_open' ? { id: 'unique', size: '4', remote: false } : command === 'scientific_read' ? new Uint8Array([1, 2]).buffer : undefined); });
it('routes pinned reads using decimal offsets and releases only its own session', async () => {
  const session = new ScientificSession(context());
  expect(await session.read(1, 2)).toEqual(new Uint8Array([1, 2]));
  expect(mock.invoke).toHaveBeenCalledWith('scientific_read', { id: 'unique', offset: '1', length: 2 });
  expect(await session.url()).toBe('http://prism-science.localhost/unique');
  await session.begin('r'); await session.finish('r'); session.close();
  expect(mock.invoke).toHaveBeenCalledWith('scientific_close', { id: 'unique' });
  await expect(session.read(0, 1)).rejects.toThrow('Cancelled');
});
it('closes a late native open after viewer cleanup', async () => {
  let resolve!: (v: unknown) => void;
  mock.invoke.mockImplementation(command => command === 'scientific_open' ? new Promise(r => { resolve = r; }) : Promise.resolve());
  const session = new ScientificSession(context()); const open = session.open(); session.close(); resolve({ id: 'late', size: '4', remote: false });
  await expect(open).rejects.toThrow('Cancelled'); expect(mock.invoke).toHaveBeenCalledWith('scientific_close', { id: 'late' });
});
it('discards a completed read after close', async () => {
  const session = new ScientificSession(context()); await session.open(); let resolve!: (v: ArrayBuffer) => void;
  mock.invoke.mockImplementation(command => command === 'scientific_read' ? new Promise(r => { resolve = r; }) : Promise.resolve());
  const read = session.read(0, 2); await Promise.resolve(); await Promise.resolve(); session.close(); resolve(new Uint8Array([1, 2]).buffer);
  await expect(read).rejects.toThrow('Cancelled');
});
it('rejects unsafe numeric offsets and oversized requests before transport', async () => {
  const session = new ScientificSession(context());
  for (const [offset, length] of [[-1, 1], [Number.MAX_SAFE_INTEGER + 1, 0], [Number.MAX_SAFE_INTEGER, 1], [0, 1048577]]) await expect(session.read(offset, length)).rejects.toThrow('INVALID_OFFSET');
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('browser sources use the existing FileSource without inventing native access', async () => {
  const session = new ScientificSession(context('browser')); expect(await session.read(0, 1)).toEqual(new Uint8Array([1])); expect(mock.invoke).not.toHaveBeenCalled(); session.close();
});
it('releases the parser when obtaining source size fails', async () => {
  let terminated = 0;
  vi.stubGlobal('Worker', class { terminate() { terminated++; } });
  const ctx = context(); ctx.source.getSize = async () => { throw Error('SOURCE_CLOSED'); };
  await expect(scientificProvider(ctx)).rejects.toThrow('SOURCE_CLOSED'); expect(terminated).toBe(1);
});
