import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ViewerRenderProps } from '../../core/types';
import { visibleRange } from '../../shared/virtual-grid';
import { writeClipboard } from '../../../document/clipboard';
import { BinaryModel, BLOCK_BYTES, MAX_SELECTION, ascii, hex, parseOffset, searchPattern } from './binary-model';
import { inspectBytes } from './byte-inspector';
import { useBinaryActivity } from './activity';
import './hex.css';
const ROW_HEIGHT = 24, SEGMENT_ROWS = 8192;
interface HexRowProps { at: bigint; top: number; count: number; columns: number; width: number; bytes: Uint8Array; lo: bigint; hi: bigint; select(offset: bigint, extend: boolean): void }
const HexRow = memo(function HexRow({ at, top, count, columns, width, bytes, lo, hi, select }: HexRowProps) {
  const cells = Array.from({ length: count }, (_, col) => ({ offset: at + BigInt(col), byte: col < bytes.length ? bytes[col] : undefined }));
  const render = (text: boolean) => cells.map(({ offset, byte }) => <span role={text ? undefined : 'gridcell'} aria-selected={offset >= lo && offset <= hi} data-offset={offset.toString()} key={offset.toString()} className={offset >= lo && offset <= hi ? 'selected' : ''} onPointerDown={e => { e.preventDefault(); select(offset, e.shiftKey); }} onPointerEnter={e => { if (e.buttons & 1) select(offset, true); }}>{byte === undefined ? text ? ' ' : '··' : text ? ascii(byte) : byte.toString(16).padStart(2, '0').toUpperCase()}</span>);
  return <div role="row" className="hex-row" style={{ top, gridTemplateColumns: `${width + 2}ch ${columns * 3}ch ${columns}ch` }}><span className="hex-offset">{at.toString(16).toUpperCase().padStart(width, '0')}</span><span className="hex-bytes">{render(false)}</span><span className="hex-ascii">{render(true)}</span></div>;
}, (a, b) => {
  if (a.at !== b.at || a.top !== b.top || a.count !== b.count || a.columns !== b.columns || a.width !== b.width || a.select !== b.select || a.bytes.length !== b.bytes.length) return false;
  const bounds = (p: HexRowProps) => { const end = p.at + BigInt(p.count); return p.hi < p.at || p.lo >= end ? [0n, 0n] : [p.lo <= p.at ? p.at : p.lo, p.hi >= end ? end : p.hi + 1n]; };
  const selectedA = bounds(a), selectedB = bounds(b);
  if (selectedA[0] !== selectedB[0] || selectedA[1] !== selectedB[1]) return false;
  for (let i = 0; i < a.count; i++) if (a.bytes[i] !== b.bytes[i]) return false;
  return true;
});
function message(error: unknown) { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error); }
export function ByteInspector({ model, context }: ViewerRenderProps<BinaryModel>) {
  useLocale();
  const selected = useSyncExternalStore(model.subscribe, model.selection);
  const [little, setLittle] = useState(true), [bytes, setBytes] = useState(new Uint8Array()), [error, setError] = useState('');
  const active = useBinaryActivity(context.active);
  useEffect(() => { const abort = new AbortController(); setBytes(new Uint8Array()); setError(''); const length = Number(model.size - selected < 16n ? model.size - selected : 16n); if (active) void model.read(selected, length, abort.signal).then(setBytes, e => { if (!abort.signal.aborted) setError(message(e)); }); return () => abort.abort(); }, [model, selected, active]);
  const values = inspectBytes(bytes, little);
  return <section className="hex-inspector" aria-label={tr("Byte Inspector")}><h3>{tr("Byte Inspector")}</h3><p>{tr("Offset 0x")}{selected.toString(16).toUpperCase()}</p><label>{tr("Byte order")}{' '}<select value={little ? 'little' : 'big'} onChange={e => setLittle(e.target.value === 'little')}><option value="little">{tr("Little Endian")}</option><option value="big">{tr("Big Endian")}</option></select></label>{error && <p role="alert">{tr(error)}</p>}<dl>{Object.entries(values).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><p>{tr("UInt64 / Int64 are exact integers. UTF-8 uses a strict, bounded 16-byte preview.")}</p></section>;
}
export function HexViewer({ model, context, session, updateSession, activeCapability }: ViewerRenderProps<BinaryModel>) {
  useLocale();
  const selected = useSyncExternalStore(model.subscribe, model.selection);
  const initialRows = [8, 16, 32].includes(Number(session.metadata.hexRows)) ? Number(session.metadata.hexRows) : 16;
  const [rows, setRows] = useState(initialRows), [base, setBase] = useState(0n), [top, setTop] = useState(0), [height, setHeight] = useState(400);
  const [buffer, setBuffer] = useState({ at: 0n, bytes: new Uint8Array() }), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [jump, setJump] = useState(''), [anchor, setAnchor] = useState(0n), [budget, setBudget] = useState(model.budget);
  const [query, setQuery] = useState(''), [mode, setMode] = useState<'hex' | 'text'>('hex'), [searching, setSearching] = useState(false);
  const search = useRef<AbortController | undefined>(undefined), viewport = useRef<HTMLDivElement>(null), heading = useRef<HTMLDivElement>(null), frame = useRef<number | undefined>(undefined);
  const active = useBinaryActivity(context.active);
  const count = (model.size + BigInt(rows - 1)) / BigInt(rows), localCount = Number(count - base < BigInt(SEGMENT_ROWS) ? count - base : BigInt(SEGMENT_ROWS));
  const windowRows = visibleRange(top, Math.min(height, 2048), ROW_HEIGHT, Math.max(0, localCount), 6);
  const start = (base + BigInt(windowRows.start)) * BigInt(rows), length = Math.min(65536, (windowRows.end - windowRows.start) * rows);
  const block = BigInt(BLOCK_BYTES), readStart = start / block * block;
  const readEnd = ((start + BigInt(length) + block - 1n) / block * block);
  const readLength = Number((readEnd < model.size ? readEnd : model.size) - readStart);
  const offsetWidth = Math.max(8, (model.size > 0n ? model.size - 1n : 0n).toString(16).length);
  function cancelSearch() { search.current?.abort(); model.cancelSearch(); search.current = undefined; setSearching(false); }
  useEffect(() => { if (!active) { cancelSearch(); model.clearCache(); setBuffer({ at: 0n, bytes: new Uint8Array() }); } return () => { search.current?.abort(); model.cancelSearch(); if (frame.current !== undefined) cancelAnimationFrame(frame.current); }; }, [model, active]);
  useLayoutEffect(() => { const el = viewport.current; if (!el) return; const resize = () => setHeight(el.clientHeight || 400); resize(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined; observer?.observe(el); return () => observer?.disconnect(); }, []);
  useEffect(() => { const abort = new AbortController(); if (!active) return; setError(''); void model.read(readStart, readLength, abort.signal).then(bytes => { if (!abort.signal.aborted) setBuffer({ at: readStart, bytes }); }, e => { if (!abort.signal.aborted) { setBuffer({ at: readStart, bytes: new Uint8Array() }); setError(message(e)); } }); return () => abort.abort(); }, [model, readStart, readLength, active, budget]);
  function navigate(offset: bigint, extend = false) {
    cancelSearch(); if (!model.size) return;
    offset = offset < 0n ? 0n : offset >= model.size ? model.size - 1n : offset;
    if (!extend) setAnchor(offset); model.select(offset);
    updateSession({ metadata: { ...session.metadata, hexOffset: offset.toString(), hexRows: rows } });
    const row = offset / BigInt(rows), local = row - base;
    if (local < BigInt(windowRows.start) || local >= BigInt(windowRows.end)) {
      const nextBase = row > 256n ? row - 256n : 0n; setBase(nextBase);
      const nextTop = Number(row - nextBase) * ROW_HEIGHT; setTop(nextTop); if (viewport.current) viewport.current.scrollTop = nextTop;
    }
  }
  useEffect(() => { const saved = session.metadata.hexOffset; if (typeof saved === 'string') { try { navigate(parseOffset(saved)); } catch { /* An invalid/stale saved address leaves the first row visible. */ } } }, [model]);
  async function copy(kind: 'hex' | 'text' | 'offset') {
    try { const lo = anchor < selected ? anchor : selected, hi = anchor > selected ? anchor : selected; if (kind === 'offset') { await writeClipboard(`0x${selected.toString(16).toUpperCase()}`); return; } const length = hi - lo + 1n; if (length > BigInt(MAX_SELECTION)) throw Error('Copy selection is limited to 64 KiB.'); const bytes = await model.read(lo, Number(length)); await writeClipboard(kind === 'hex' ? hex(bytes) : Array.from(bytes, ascii).join('')); setStatus('Copied.'); } catch (e) { setError(message(e)); }
  }
  async function find(previous: boolean) {
    cancelSearch(); const abort = new AbortController(); search.current = abort; setError('');
    try { const pattern = searchPattern(query, mode); setSearching(true); setStatus('Searching UTF-8/raw bytes…'); const begin = previous ? selected : searching ? selected : selected + (status.startsWith('Match') ? 1n : 0n); const found = await model.search(pattern, begin > model.size ? model.size : begin, previous, abort.signal, cursor => { if (!abort.signal.aborted) setStatus(`Searching at ${cursor.toString()} / ${model.size.toString()} bytes`); }); if (abort.signal.aborted) return; if (found === undefined) setStatus(previous ? 'Beginning reached; no earlier match.' : 'End reached; no further match.'); else { navigate(found); setStatus(`Match at 0x${found.toString(16).toUpperCase()}`); } } catch (e) { if (!abort.signal.aborted) setError(message(e)); } finally { if (search.current === abort) { search.current = undefined; setSearching(false); } }
  }
  const lo = anchor < selected ? anchor : selected, hi = anchor > selected ? anchor : selected;
  const selectByte = useCallback((offset: bigint, extend: boolean) => { viewport.current?.focus(); if (!extend) setAnchor(offset); model.select(offset); }, [model]);
  return <section className="hex-viewer" aria-label={tr("Hex Viewer")}><div className="hex-controls"><span>{tr("Read only ·")}{' '}{model.size.toString()} {' '}{tr("bytes")}</span><button disabled={!context.services.file.openExternal} onClick={() => { void context.services.file.openExternal?.().catch(e => setError(message(e))); }}>{tr("Open externally")}</button><button disabled={!context.services.file.reveal} onClick={() => { void context.services.file.reveal?.().catch(e => setError(message(e))); }}>{tr("Reveal in folder")}</button><label>{tr("Bytes per row")}{' '}<select value={rows} onChange={e => { const next = Number(e.target.value); setRows(next); setBase(selected / BigInt(next)); setTop(0); if (viewport.current) viewport.current.scrollTop = 0; updateSession({ metadata: { ...session.metadata, hexRows: next } }); }}><option>8</option><option>16</option><option>32</option></select></label><label>{tr("Cache budget")}{' '}<select value={budget} onChange={e => { const n = Number(e.target.value); model.setBudget(n); setBudget(n); }}><option value={65536}>64 KiB</option><option value={262144}>256 KiB</option><option value={1048576}>1 MiB</option><option value={4194304}>4 MiB</option></select></label><form onSubmit={e => { e.preventDefault(); try { const offset = parseOffset(jump); if (offset >= model.size && model.size !== 0n || model.size === 0n && offset !== 0n) throw Error('Offset is beyond the file.'); navigate(offset); setError(''); } catch (e) { setError(message(e)); } }}><label>{tr("Go to offset")}{' '}<input value={jump} onChange={e => setJump(e.target.value)} maxLength={22} placeholder={tr("Decimal or 0xHEX")} /></label><button disabled={!active}>{tr("Go")}</button></form><button disabled={!model.size || !active} onClick={() => void copy('hex')}>{tr("Copy Hex")}</button><button disabled={!model.size || !active} onClick={() => void copy('text')}>{tr("Copy text")}</button><button disabled={!model.size} onClick={() => void copy('offset')}>{tr("Copy Offset")}</button></div>
    {activeCapability === 'search' && <div className="hex-search"><label>{tr("Search mode")}{' '}<select value={mode} onChange={e => { cancelSearch(); setMode(e.target.value as 'hex' | 'text'); }}><option value="hex">{tr("Hex bytes")}</option><option value="text">{tr("Text · UTF-8 bytes")}</option></select></label><input aria-label={tr("Binary search pattern")} value={query} maxLength={12288} onChange={e => { cancelSearch(); setStatus(''); setQuery(e.target.value); }} /><button disabled={!active || !model.canSearch || searching} onClick={() => void find(false)}>{tr("Find next")}</button><button disabled={!active || !model.canSearch || searching} onClick={() => void find(true)}>{tr("Find previous")}</button><button disabled={!searching} onClick={() => { cancelSearch(); setStatus('Search cancelled.'); }}>{tr("Cancel search")}</button><small>{model.canSearch ? tr("UTF-8 byte matching; no Unicode normalization. Each scan step is bounded.") : tr("Search requires the Rust desktop backend.")}</small></div>}
    {error && <p role="alert">{tr(error)}</p>}{!active && <p role="status">{tr("Binary tasks paused.")}</p>}
    <div ref={heading} className="hex-heading" style={{ gridTemplateColumns: `${offsetWidth + 2}ch ${rows * 3}ch ${rows}ch` }}><span>{tr("OFFSET")}</span><span>{tr("HEX BYTES")}</span><span>ASCII</span></div>
    <div ref={viewport} className="hex-viewport" tabIndex={0} role="grid" aria-label={tr("Binary bytes")} onScroll={e => { const el = e.currentTarget; if (heading.current) heading.current.scrollLeft = el.scrollLeft; if (frame.current !== undefined) cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => { if (!active) return; const row = Math.floor(el.scrollTop / ROW_HEIGHT); if (row > SEGMENT_ROWS - 128 && base + BigInt(SEGMENT_ROWS) < count) { setBase(base + 4096n); el.scrollTop -= 4096 * ROW_HEIGHT; } else if (row < 32 && base > 0n) { const back = base < 4096n ? base : 4096n; setBase(base - back); el.scrollTop += Number(back) * ROW_HEIGHT; } setTop(el.scrollTop); }); }} onKeyDown={e => { let target: bigint | undefined; const page = BigInt(Math.max(1, Math.floor(height / ROW_HEIGHT)) * rows); if (e.key === 'ArrowRight') target = selected + 1n; if (e.key === 'ArrowLeft') target = selected - 1n; if (e.key === 'ArrowDown') target = selected + BigInt(rows); if (e.key === 'ArrowUp') target = selected - BigInt(rows); if (e.key === 'PageDown') target = selected + page; if (e.key === 'PageUp') target = selected - page; if (e.key === 'Home') target = e.ctrlKey ? 0n : selected / BigInt(rows) * BigInt(rows); if (e.key === 'End') target = e.ctrlKey ? model.size - 1n : selected / BigInt(rows) * BigInt(rows) + BigInt(rows - 1); if (target !== undefined) { e.preventDefault(); navigate(target, e.shiftKey); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); void copy('hex'); } }}>
      {!model.size ? <p>{tr("Empty file · no bytes to inspect.")}</p> : <div style={{ height: localCount * ROW_HEIGHT, position: 'relative' }}>{active && Array.from({ length: Math.max(0, windowRows.end - windowRows.start) }, (_, i) => { const localRow = windowRows.start + i, at = (base + BigInt(localRow)) * BigInt(rows); const n = Number(model.size - at < BigInt(rows) ? model.size - at : BigInt(rows)), delta = at - buffer.at, bytes = delta >= 0n && delta < BigInt(buffer.bytes.length) ? buffer.bytes.subarray(Number(delta), Number(delta) + n) : new Uint8Array(); return <HexRow key={at.toString()} at={at} top={localRow * ROW_HEIGHT} count={n} columns={rows} width={offsetWidth} bytes={bytes} lo={lo} hi={hi} select={selectByte} />; })}</div>}
    </div><footer role="status">{tr(status) || tr("Selected 0x{v0} · Cache {v1} / {v2} bytes", { v0: selected.toString(16).toUpperCase(), v1: formatNumber(model.cacheBytes), v2: formatNumber(model.budget) })} {' '}{tr("· Segmented scrollbar; Go supports the full 64-bit file range.")}</footer></section>;
}
