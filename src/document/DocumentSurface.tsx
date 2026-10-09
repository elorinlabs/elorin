import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../i18n";
import { readClipboard, writeClipboard } from './clipboard';
import {editableKind} from './editing';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FileDescriptor } from '../types/files';
import type { FileSource } from '../services/fileSource';
import { DocumentSession, documentSessions, EDIT_LIMIT } from './session';
import type { ReactNode } from 'react';
import { snapshot } from './recovery';
const CsvEditor = lazy(() => import('./CsvEditor').then(module => ({ default: module.CsvEditor })));
import { textareaAdapter } from './TextEditorAdapter';
import { EditorSearch } from './EditorSearch';
import { BrowserFileSource } from '../services/fileSource';
import { ViewerHost } from '../viewer/components/ViewerHost';
import type { ViewerServices } from '../viewer/core/types';
import type { ContextMenuAction } from '../viewer/core/actions';
import { saveDocument } from './save-service';
import { viewerSessionStore } from '../viewer/core/session';
import { detectTextProfile } from '../viewer/plugins/text/text-profile';
import { confirmDocument, promptDocument } from './dialog';
import { fileWatchService } from '../platform/file-watch';
import { viewerCommands } from '../commands/viewer-bridge';
export function DocumentSurface({ file, source, children, services, onSaved, active=true }: { file: FileDescriptor; source: FileSource; children: ReactNode; services?: ViewerServices; onSaved?: (path: string) => Promise<void>; active?: boolean }) {
  useLocale();
  const [session, setSession] = useState(documentSessions.get(source));
  const [, refresh] = useState(0);
  const [editing, setEditing] = useState(!!session);
  const [message, setMessage] = useState('');
  const [previewText, setPreviewText] = useState(session?.currentState ?? '');
  useEffect(() => { if (!session || (session.kind === 'json'||session.kind==='jsonl') && session.validationState) return; const timer = setTimeout(() => setPreviewText(session.currentState), editing ? 180 : 0); return () => clearTimeout(timer); }, [session?.currentState, editing]);
  const [searchMode, setSearchMode] = useState<'find' | 'replace'>();
  const [split, setSplit] = useState(false);
  const preference = viewerSessionStore.get(source, 'core.text-fallback');
  const profile = detectTextProfile(file, session?.currentState.slice(0, 4096) ?? '');
  const [wrap, setWrap] = useState(typeof preference.metadata.wrap === 'boolean' ? preference.metadata.wrap : profile.profile === 'Plain');
  const [numbers, setNumbers] = useState(typeof preference.metadata.textNumbers === 'boolean' ? preference.metadata.textNumbers : profile.profile !== 'Plain');
  const gutter = useRef<HTMLPreElement>(null);
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const saving = useRef(false);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[source]);
  useEffect(() => { if (!session) return; const timer = setTimeout(() => { void snapshot(session).catch(error => setMessage(tr("Recovery snapshot failed: {v0}", { v0: String(error) }))); }, 1000); return () => clearTimeout(timer); }, [session, session?.revision]);
  const update = () => { refresh(n => n + 1); window.dispatchEvent(new Event('elorin-document-change')); };
  const adapter = () => input.current && session ? textareaAdapter(input.current, session, update) : undefined;
  useEffect(() => { const navigate=(event:Event)=>{const {source:target,hit}=(event as CustomEvent).detail;if(target!==source)return;setEditing(true);setTimeout(()=>adapter()?.find(hit.offset??0,(hit.offset??0)+hit.length),0);};window.addEventListener('elorin-navigate-search',navigate);return()=>window.removeEventListener('elorin-navigate-search',navigate); });
  const kind=editableKind(file);
  const supported = kind!==undefined;
  const eligible = supported && file.size <= EDIT_LIMIT;
  const previewSource = useMemo(() => { if (!session) return null; const preview: FileSource = new BrowserFileSource(new File([previewText], file.name)); preview.resolveRelated = source.resolveRelated; viewerSessionStore.transfer(source, preview); return preview; }, [previewText, file.name, source, session]);
  useEffect(() => () => { if (session && documentSessions.get(source) === session) void snapshot(session).catch(() => {}); }, [session, source]);
  useEffect(() => {
    if (!session?.path || !isTauri()) return;
    let stopped = false;
    const check = async () => { try { const fingerprint = await invoke<string>('document_fingerprint', { path: session.path }); if (!stopped && !saving.current && fingerprint !== session.fingerprint) { session.externalChangeState = 'modified'; setMessage(tr("Source changed externally. Save As keeps your edits safe.")); update(); } } catch { if (!stopped && !saving.current) { session.externalChangeState = 'unavailable'; update(); } } };
    const stopWatch = fileWatchService.subscribe(session.path, () => void check());
    window.addEventListener('focus', check);
    return () => { stopped = true; stopWatch(); window.removeEventListener('focus', check); };
  }, [session, session?.path]);
  async function enter() {
    try {
      if(!eligible||!kind)throw Error('This format has no safe editing path.');
      if (session) { setEditing(true); return; }
      const before = isTauri() && file.path && !file.virtual ? await invoke<string>('document_fingerprint', { path: file.path }) : null;
      if(await source.getSize()>EDIT_LIMIT)throw Error('This document exceeds the safe editing limit.');
      const bytes = await source.readAll();
      if(bytes.length>EDIT_LIMIT)throw Error('This document exceeds the safe editing limit.');
      if (before && before !== await invoke<string>('document_fingerprint', { path: file.path })) throw Error('File changed while entering edit mode. Reopen it.');
      if (file.encoding && !/^utf-?8(?:\s*bom)?$/i.test(file.encoding)) throw Error('Editing this encoding is not yet supported safely.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const next = new DocumentSession(text, kind, file.virtual ? null : file.path, before, bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191);
      if (next.kind === 'csv') { const {parseEditableCsv} = await import('./csv'); parseEditableCsv(text, file.detectedType === 'tsv'); }
      next.source = source; next.sourceDescriptor = file;
      if (!alive.current) return;
      documentSessions.set(source, next); setSession(next); setEditing(true);
    } catch (error) { setMessage(uiError(error)); }
  }
  async function reload(overwrite = false) {
    if (!session?.path || !isTauri()) return;
    if (!await confirmDocument(overwrite ? tr("Overwrite the external version with your current edits?") : tr("Reload the external version and discard current edits?"))) return;
    try {
      const fingerprint = await invoke<string>('document_reload', { path: session.path });
      if (overwrite) { session.fingerprint = fingerprint; await save(); return; }
      const bytes = await source.readAll(); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      session.reset(text, fingerprint); await snapshot(session); await onSaved?.(session.path); setMessage(tr("Reloaded")); update();
    } catch (error) { setMessage(uiError(error)); }
  }
  async function save(as = false) {
    if (!session || saving.current) return;
    saving.current = true; session.saveState = 'Saving…'; update();
    try {
      const result = await saveDocument(session, file.name, as);
      if (result) await onSaved?.(result.path);
    } catch (error) { const e = error as { code?: string; message?: string }; session.saveState = e.code === 'conflict' ? 'Conflict' : 'Save failed'; session.externalChangeState = e.code === 'conflict' ? 'modified' : session.externalChangeState; setMessage(e.message ?? String(error)); }
    finally { saving.current = false; update(); }
  }
  const latestActions = useRef({enter,save});latestActions.current={enter,save};
  useEffect(()=>viewerCommands.register(source,[...(eligible?[{id:'enter-edit',get label() { return tr("Enter Edit"); },action:()=>latestActions.current.enter()}]:[]),...(session?[{id:'save',get label() { return tr("Save"); },shortcut:'Ctrl+S',action:()=>latestActions.current.save()},{id:'save-as',get label() { return tr("Save As"); },shortcut:'Ctrl+Shift+S',action:()=>latestActions.current.save(true)}]:[])],'document'),[source,eligible,session]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!active || !(event.ctrlKey || event.metaKey) || event.isComposing || !session) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(event.shiftKey); }
      if (editing && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? session.redo() : session.undo(); update(); }
      if (editing && event.key.toLowerCase() === 'y') { event.preventDefault(); session.redo(); update(); }
      if (editing && session.kind !== 'csv' && ['f','h'].includes(event.key.toLowerCase())) { event.preventDefault(); setSearchMode(event.key.toLowerCase() === 'f' ? 'find' : 'replace'); }
      if (editing && event.key.toLowerCase() === 'g') { event.preventDefault(); void promptDocument(tr("Go to line"), '1').then(raw => { const line = Number(raw); if (Number.isInteger(line) && line > 0) { const value = adapter()?.getValue() ?? ''; const offset = value.split('\n').slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0); adapter()?.find(Math.min(offset, value.length), Math.min(offset, value.length)); } }); }
    };
    const unload = (event: BeforeUnloadEvent) => { if (session?.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('keydown', key); if (!isTauri()) window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); };
  });
  useEffect(() => {
    const collect = (event: Event) => { if (!session || !editing) return; event.stopPropagation(); const actions = (event as CustomEvent<ContextMenuAction[]>).detail;
      const action = (id: string, label: string, run: () => void | Promise<void>) => actions.push({ id, label, action: run });
      action('undo','Undo', () => { session.undo(); update(); }); action('redo','Redo', () => { session.redo(); update(); });
      action('cut','Cut', async () => { const editor = adapter(); if (!editor) return; const {start,end} = editor.getSelection(); await writeClipboard(editor.getValue().slice(start,end)); editor.replaceSelection(''); });
      action('paste','Paste', async () => { try { adapter()?.replaceSelection(await readClipboard()); } catch (error) { setMessage(uiError(error)); } });
      action('select-all','Select All', () => { const editor = adapter(); editor?.find(0, editor.getValue().length); });
      action('find','Find', () => setSearchMode('find')); action('replace','Replace', () => setSearchMode('replace')); action('save','Save', () => save()); action('save-as','Save As', () => save(true));
    };
    const element = root.current; element?.addEventListener('prism-context-actions', collect); return () => element?.removeEventListener('prism-context-actions', collect);
  });
  return <section className={`document-surface ${editing ? 'viewer-host' : ''}`} ref={root}>
    {(eligible || session) && <div className="document-toolbar"><span>{file.name}{session?.dirty ? ' •' : ''}</span><button onClick={() => void enter()}>{tr("Edit")}</button>{session && <><button onClick={() => void save()}>{tr("Save")}</button><button onClick={() => void save(true)}>{tr("Save As")}</button><button onClick={() => { session.undo(); update(); }}>{tr("Undo")}</button><button onClick={() => { session.redo(); update(); }}>{tr("Redo")}</button><span role="status">{session.saveState}</span></>}</div>}
    {message && <p role="alert">{tr(message)}</p>}
    {session?.externalChangeState !== 'unchanged' && session && <div className="document-toolbar"><span>{tr("External source changed or unavailable")}</span><button onClick={() => window.dispatchEvent(new CustomEvent('elorin-compare-external',{detail:{source}}))}>{tr("Compare external version")}</button><button onClick={() => void reload()}>{tr("Reload")}</button><button onClick={() => void reload(true)}>{tr("Overwrite external version")}</button><button onClick={() => void save(true)}>{tr("Save As")}</button><button onClick={() => void save()}>{tr("Retry Save")}</button></div>}
    {supported && !eligible && <p role="status">{tr("View only: this file exceeds the safe 2 MiB editing limit.")}</p>}
    {session && <div className="document-toolbar"><button onClick={() => setEditing(v => !v)}>{editing ? tr("View") : tr("Return to editing")}</button>{session.kind === 'markdown' && <button onClick={() => setSplit(v => !v)}>{tr("Split preview")}</button>}<button onClick={() => { setWrap(v => { preference.metadata.wrap = !v; return !v; }); }}>{tr("Wrap:")}{' '}{wrap ? tr("On") : tr("Off")}</button><button onClick={() => { setNumbers(v => { preference.metadata.textNumbers = !v; return !v; }); }}>{tr("Line numbers:")}{' '}{numbers ? tr("On") : tr("Off")}</button>{editing && session.kind !== 'csv' && <button onClick={() => setSearchMode('find')}>{tr("Find / Replace")}</button>}<span>{session.encoding}{session.bom ? tr("BOM") : ''} · {session.lineEndings} · {editing ? tr("Editing") : tr("Preview")}</span></div>}
    {searchMode && session && <EditorSearch adapter={adapter} revision={session.revision} replaceMode={searchMode === 'replace'} close={() => setSearchMode(undefined)} />}
    {session?.validationState && <p role="status">{tr("Line")}{' '}{session.validationState.line}{tr(", Column")}{' '}{session.validationState.column}: {session.validationState.message}</p>}
    <div className="document-edit-layout">{editing && session ? session.kind === 'csv' ? <Suspense fallback={<p role="status">{tr("Loading CSV editor…")}</p>}><CsvEditor session={session} tab={file.detectedType === 'tsv'} update={update} /></Suspense> : <><div className="document-text-layout">{numbers && <pre ref={gutter} aria-hidden="true" className="document-line-numbers">{Array.from({length: session.currentState.split(/\r\n|\r|\n/).length}, (_, i) => i + 1).join('\n')}</pre>}<textarea ref={input} wrap={wrap && !numbers ? 'soft' : 'off'} className="document-editor" aria-label={tr("Document source editor")} spellCheck={false} onScroll={e => { if (gutter.current) gutter.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`; preference.scrollTop = e.currentTarget.scrollTop; }} onCompositionStart={() => session.beginTransaction()} onCompositionEnd={() => { session.endTransaction(); update(); }} value={session.currentState} onChange={e => { try { adapter()?.setValue(e.target.value); } catch (error) { setMessage(uiError(error)); } }} onPaste={e => { if (e.clipboardData.getData('text/plain').length + session.currentState.length > EDIT_LIMIT) { e.preventDefault(); setMessage(tr("Paste exceeds the safe editing limit.")); } }} /></div>{split && previewSource && <ViewerHost active={active} file={{...file, size: session.serialize().length}} source={previewSource} services={services} />}</> : session && previewSource ? <ViewerHost active={active} file={{...file, size: session.serialize().length}} source={previewSource} services={services} /> : children}</div>
  </section>;
}
