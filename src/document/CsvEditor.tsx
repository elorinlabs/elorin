import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../i18n";
import { useEffect, useMemo, useState } from 'react';
import { GridSurface } from '../viewer/shared/GridSurface';
import type { CsvSelection } from '../viewer/plugins/csv/csv-types';
import { parseEditableCsv, serializeCsv } from './csv';
import type { DocumentSession } from './session';
import '../viewer/plugins/csv/csv.css';
import { promptDocument } from './dialog';
export function CsvEditor({ session, tab, update }: { session: DocumentSession; tab: boolean; update: () => void }) {
  useLocale();
  const initial = useMemo(() => parseEditableCsv(session.originalSnapshot, tab), [session, tab]);
  const parsed = useMemo(() => parseEditableCsv(session.currentState, tab), [session.currentState, tab]);
  session.csvHeader ??= initial.header; const header = session.csvHeader; const setHeader = (value: boolean) => { session.csvHeader = value; update(); };
  session.csvColumns ??= initial.rows.reduce((n, r) => Math.max(n, r.length), 0); const columns = session.csvColumns;
  const [selection, select] = useState<CsvSelection>({ kind: 'none' });
  const [edit, renderEdit] = useState(session.csvDraft);
  const setEdit = (value: typeof edit) => { session.csvDraft = value; renderEdit(value); update(); };
  const [message, setMessage] = useState('');
  const [scroll, saveScroll] = useState({ top: 0, left: 0 });
  const [navigation,navigate]=useState(0);
  useEffect(()=>{const go=(event:Event)=>{const{source,hit}=(event as CustomEvent).detail;if(source!==session.source||hit.row===undefined)return;select({kind:'cell',row:hit.row,column:hit.column,columnId:`col:${hit.column}`,rawValue:parsed.rows[hit.row]?.[hit.column]??'',parsedValue:parsed.rows[hit.row]?.[hit.column]??''});navigate(n=>n+1);};window.addEventListener('elorin-navigate-search',go);return()=>window.removeEventListener('elorin-navigate-search',go);},[session,parsed]);
  const count = parsed.rows.reduce((n, r) => Math.max(n, r.length), columns);
  function commit(rows: string[][], nextColumns = count) { try { session.modify(serializeCsv(rows, initial.dialect.delimiter, initial.dialect.newline, /[\r\n]$/.test(session.originalSnapshot)), { columns: nextColumns, header }); update(); return true; } catch (error) { setMessage(uiError(error)); return false; } }
  function change(action: (rows: string[][]) => void, nextColumns = count) { const rows = parsed.rows.map(r => [...r]); action(rows); return commit(rows, nextColumns); }
  function start(row?: number, column?: number) { if (row === undefined || column === undefined) { if (selection.kind !== 'cell') return; row = selection.row; column = selection.column; } setEdit({ row, column, value: parsed.rows[row]?.[column] ?? '' }); }
  const row = 'row' in selection ? selection.row : -1, column = 'column' in selection ? selection.column : -1;
  const submit = () => { if (!edit) return; if (change(rows => { rows[edit.row] ??= []; rows[edit.row][edit.column] = edit.value; })) setEdit(undefined); };
  session.commitPendingEdit = submit;
  return <div className="csv-editor"><div className="document-toolbar">
    <label><input type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} />{tr("Header")}</label>
    <button onClick={() => change(rows => { if (rows.length >= 100000) { setMessage(tr("Row limit reached.")); return; } rows.push(Array(count || 1).fill('')); })}>{tr("Add Row")}</button>
    <button disabled={row < (header ? 1 : 0)} onClick={() => change(rows => rows.splice(row, 1))}>{tr("Delete Row")}</button>
    <button disabled={count >= 256} onClick={async () => { const name = header ? await promptDocument(tr("Column name"), `Column ${count + 1}`) : ''; if (name === null) return; change(rows => { if (!rows.length && header) rows.push([]); rows.forEach((r, i) => { while (r.length < count) r.push(''); r.push(header && i === 0 ? name : ''); }); }, count + 1); }}>{tr("Add Column")}</button>
    <button disabled={column < 0} onClick={() => { change(rows => rows.forEach(r => { if (column < r.length) r.splice(column, 1); }), Math.max(0, count - 1)); }}>{tr("Delete Column")}</button>
    <button disabled={column < 0 || !header} onClick={() => start(0, column)}>{tr("Edit Header")}</button>
  </div>{message && <p role="alert">{tr(message)}</p>}
  {edit && <div className="document-toolbar"><textarea autoFocus aria-label={tr("Edit CSV cell")} value={edit.value} onChange={e => setEdit({ ...edit, value: e.target.value })} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(undefined); } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} /><button onClick={submit}>{tr("Commit")}</button><button onClick={() => setEdit(undefined)}>{tr("Cancel")}</button></div>}
  <GridSurface model={{ columns: Array.from({ length: count }, (_, i) => ({ id: `col:${i}`, name: header ? parsed.rows[0]?.[i] ?? '' : `Column ${i + 1}`, width: 180 })), rowSource: { count: parsed.rows.length, get: row => parsed.rows[row] } }} header={header} selection={selection} select={select} widths={{}} resize={() => {}} scroll={scroll} saveScroll={(top, left) => saveScroll({ top, left })} navigation={navigation} inspect={() => start()} onEditCell={(row, column) => start(row, column)} />
  </div>;
}

