import { t as tr, useUiLanguage as useLocale } from "../i18n";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { X, Search, FileText, Braces, Table2, Folder, ChevronDown, Check, Clipboard, FileSearch, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../design-system/Brand';
import { readClipboard } from './clipboard';
import { detectClipboard, type DocumentKind } from './session';
import { documentFormats, documentFileName, validateDocumentName, type CreateLocation, type NewDocumentRequest } from './create-options';
import './new-file.css';

const workspace: CreateLocation = { id: 'workspace', get label() { return tr("Current Workspace"); } };
function FormatIcon({ kind, size = 32 }: { kind: DocumentKind; size?: number }) {
  useLocale();
  return kind === 'markdown' ? <span className="new-format-markdown" style={{ fontSize: size * .62 }}>M↓</span> : kind === 'json' ? <Braces size={size}/> : kind === 'csv' ? <Table2 size={size}/> : <FileText size={size}/>;
}
function message(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error); }
export function NewFileDialog({ onClose, onCreate, existingNames = [] }: { onClose: () => void; onCreate: (request: NewDocumentRequest) => Promise<unknown>; existingNames?: string[] }) {
  useLocale();
  const id = useId(), root = useRef<HTMLElement>(null), nameInput = useRef<HTMLInputElement>(null), locationArea = useRef<HTMLDivElement>(null);
  const alive = useRef(true), submission = useRef(false);
  const [name, setName] = useState(()=>tr('Untitled')), [kind, setKind] = useState<DocumentKind>('text');
  const [category, setCategory] = useState('All'), [query, setQuery] = useState('');
  const [locations, setLocations] = useState<CreateLocation[]>([workspace]), [location, setLocation] = useState(workspace), [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [collision, setCollision] = useState(''), [error, setError] = useState(''), [content, setContent] = useState<string>();
  const format = documentFormats.find(f => f.kind === kind)!;
  const visible = documentFormats.filter(f => (category === 'All' || f.category === category) && `${f.label} ${f.extension}`.toLowerCase().includes(query.trim().toLowerCase()));
  const validSelection = visible.some(f => f.kind === kind), nameError = validateDocumentName(name) ?? collision;
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    nameInput.current?.focus(); nameInput.current?.select();
    if (isTauri()) void invoke<CreateLocation[]>('document_create_locations').then(value => { if (alive.current) setLocations([workspace, ...value.map(item=>({...item,systemLabel:true}))]); }, e => { if (alive.current) setError(message(e)); });
    const keepFocus = (event: FocusEvent) => { if (root.current && !root.current.contains(event.target as Node) && !document.querySelector('[role=alertdialog]')) nameInput.current?.focus(); };
    const outsidePicker = (event: PointerEvent) => { if (!locationArea.current?.contains(event.target as Node)) setPicker(false); };
    document.addEventListener('focusin', keepFocus); document.addEventListener('pointerdown', outsidePicker);
    return () => { alive.current = false; document.removeEventListener('focusin', keepFocus); document.removeEventListener('pointerdown', outsidePicker); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (visible.length && !validSelection) setKind(visible[0].kind); }, [category, query, validSelection]);
  const namesKey = existingNames.join('\n');
  useEffect(() => {
    let cancelled = false; setCollision(''); setChecking(false);
    if (validateDocumentName(name)) return;
    const filename = documentFileName(name, kind);
    if (location.id === 'workspace') { if (existingNames.some(n => n.toLowerCase() === filename.toLowerCase())) setCollision('A file with this name is already open in this workspace.'); return; }
    setChecking(true);
    const timer = setTimeout(() => { void invoke<boolean>('document_name_available', { location: location.id, name: filename }).then(available => { if (!cancelled) { setCollision(available ? '' : 'A file with this name already exists in this location.'); setChecking(false); } }, e => { if (!cancelled) { setCollision(message(e)); setChecking(false); } }); }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [name, kind, location.id, namesKey]);
  const disabled = busy || checking || !!nameError || !validSelection;
  async function create() {
    if (disabled || submission.current) return;
    submission.current = true; setBusy(true); setError(''); setPicker(false);
    try { await onCreate({ kind, name: name.trim(), location: location.id, content }); if (alive.current) onClose(); }
    catch (e) { if (alive.current) { if ((e as { code?: string })?.code === 'exists') setCollision(message(e)); else setError(message(e)); } }
    finally { submission.current = false; if (alive.current) setBusy(false); }
  }
  async function clipboard() {
    if (busy || submission.current) return;
    setBusy(true); setError('');
    try { const text = await readClipboard(); if (!text) throw Error('Clipboard is empty.'); if (alive.current) { setContent(text); setKind(detectClipboard(text)); setCategory('All'); setQuery(''); } }
    catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  return createPortal(<div className="new-file-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section ref={root} className="new-file-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); if (picker) { setPicker(false); locationArea.current?.querySelector('button')?.focus(); } else if (!busy) onClose(); }
      if (picker && ['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { const items = [...(locationArea.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])]; const index = items.indexOf(document.activeElement as HTMLButtonElement); e.preventDefault(); items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus(); }
      if (e.key === 'Tab') { const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(el => el.getAttribute('aria-hidden') !== 'true'); const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
      <header className="new-file-heading"><BrandLogo height={48}/><button className="new-file-close" type="button" aria-label={tr("Close New File")} disabled={busy} onClick={onClose}><X size={24}/></button><h1 id={`${id}-title`}>{tr("New File")}</h1><p id={`${id}-description`}>{tr("Create a new file in your workspace.")}</p></header>
      <form onSubmit={e => { e.preventDefault(); void create(); }}>
        <label className="new-file-label" htmlFor={`${id}-name`}>{tr("File name")}</label>
        <div className="new-name-field" data-invalid={!!nameError}><input ref={nameInput} id={`${id}-name`} value={name} disabled={busy} aria-invalid={!!nameError} aria-describedby={nameError ? `${id}-name-error` : undefined} maxLength={180} onChange={e => { setName(e.target.value); setError(''); }}/>{nameError && <AlertCircle size={17}/>}</div>
        {nameError && <p id={`${id}-name-error`} className="new-file-error" role="alert">{tr(nameError)}</p>}
        <label className="new-file-label" id={`${id}-location-label`}>{tr("Save location")}</label>
        <div className="new-location" ref={locationArea}><button type="button" className="new-location-button" aria-labelledby={`${id}-location-label ${id}-location-value`} aria-haspopup="menu" aria-expanded={picker} disabled={busy} onClick={() => setPicker(v => !v)}><Folder size={22}/><span id={`${id}-location-value`}>{location.id === 'workspace' || location.systemLabel ? tr(location.label) : location.label}</span><ChevronDown size={18}/></button>
          {picker && <div className="new-location-menu" role="menu" aria-label={tr("Save locations")}>{locations.map(item => <button type="button" role="menuitemradio" aria-checked={item.id === location.id} key={item.id} title={item.path} onClick={() => { setLocation(item); setPicker(false); setError(''); }}><span className="new-location-check">{item.id === location.id && <Check size={15}/>}</span><Folder size={17}/>{item.id === 'workspace' || item.systemLabel ? tr(item.label) : item.label}</button>)}<button type="button" role="menuitem" disabled={!isTauri()} onClick={() => { setPicker(false); setBusy(true); void invoke<CreateLocation | null>('document_pick_location', {title:tr('Save location for new files')}).then(item => { if (alive.current && item) { setLocations(v => [...v.filter(i => i.id !== item.id), item]); setLocation(item); } }, e => { if (alive.current) setError(message(e)); }).finally(() => { if (alive.current) setBusy(false); }); }}><span className="new-location-check"/><Folder size={17}/>{tr("Choose Folder…")}</button></div>}
        </div>
        <div className="new-format-heading"><span className="new-file-label">{tr("File format")}</span><div className="new-format-search"><Search size={18}/><input aria-label={tr("Search formats")} placeholder={tr("Search formats…")} value={query} disabled={busy} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" aria-label={tr("Clear format search")} onClick={() => setQuery('')}><X size={15}/></button>}</div></div>
        <div className="new-format-categories" aria-label={tr("Format categories")}>{['All','Text','Data'].map(c => <button type="button" disabled={busy} aria-pressed={c === category} key={c} onClick={() => setCategory(c)}>{tr(c)}</button>)}</div>
        {visible.length ? <><div className="new-format-grid" role="group" aria-label={tr("File formats")}>{visible.map(f => <button type="button" disabled={busy} className={`new-format-card format-${f.kind}`} aria-pressed={kind === f.kind} key={f.kind} onClick={() => { setKind(f.kind); setError(''); }}><FormatIcon kind={f.kind}/><strong>{f.label}</strong><span>.{f.extension}</span></button>)}</div><div className="new-format-detail"><span className={`new-format-detail-icon format-${kind}`}><FormatIcon kind={kind} size={26}/></span><div><strong>{format.label}</strong><p>{format.description}</p></div>{kind === 'csv' || kind === 'json' ? <pre aria-label={tr("{v0} example", { v0: format.label })}>{format.preview}</pre> : <span className="new-format-extension">.{format.extension}</span>}</div></> : <div className="new-format-empty"><FileSearch size={38}/><strong>{tr("No file formats found")}</strong><p>{tr("Elorin can create Plain Text, Markdown, JSON and CSV files. Try a different search term.")}</p></div>}
        <p className="new-file-location-hint">{location.id === 'workspace' ? tr("Creates an unsaved workspace tab. Use Save to choose a folder later.") : location.path}{content !== undefined && <span> {' '}{tr("· Clipboard content included")}</span>}</p>
        {error && <p className="new-file-error" role="alert">{tr(error)}</p>}
        <footer className="new-file-footer"><button type="button" className="new-file-clipboard" disabled={busy} onClick={() => void clipboard()}><Clipboard size={16}/>{tr("From Clipboard")}</button><button type="button" className="new-file-cancel" disabled={busy} onClick={onClose}>{tr("Cancel")}</button><button type="submit" className="new-file-create" disabled={disabled}>{busy ? tr("Creating…") : tr("Create")}</button></footer>
      </form>
    </section>
  </div>, document.body);
}

