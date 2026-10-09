import { t as tr, useUiLanguage as useLocale } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CommandRegistry, type Command } from './registry';
export function Palette({ title, commands, close, onError }: { title: string; commands: Command[]; close(): void; onError(message: string): void }) {
  useLocale();
  const [query, setQuery] = useState(''), [selected, select] = useState(0); const root = useRef<HTMLDivElement>(null);
  const matches = new CommandRegistry(commands).search(query).slice(0, 100);
  useEffect(() => { const previous = document.activeElement as HTMLElement; root.current?.querySelector('input')?.focus(); return () => { if (previous?.isConnected) previous.focus(); }; }, []);
  const execute = async (command?: Command) => { if (!command || command.enabled === false) return; close(); try { await command.execute(); } catch (error) { onError(String(error)); } };
  return createPortal(<div className="productivity-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={root} className="productivity-palette" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(1, matches.length)) % Math.max(1, matches.length)); } if (e.key === 'Enter') { e.preventDefault(); void execute(matches[selected]); } if (e.key === 'Tab') { e.preventDefault(); root.current?.querySelector('input')?.focus(); } }}><input aria-label={title} value={query} onChange={e => { setQuery(e.target.value); select(0); }} placeholder={title} aria-controls="productivity-options" aria-activedescendant={matches[selected] ? `command-${selected}` : undefined} role="combobox" aria-expanded="true" /><div id="productivity-options" role="listbox">{matches.map((c, i) => <button id={`command-${i}`} tabIndex={-1} role="option" aria-selected={selected === i} key={c.id} disabled={c.enabled === false} onClick={() => void execute(c)}><span>{c.title}<small>{c.category ?? tr(c.scope ?? '')}</small></span><kbd>{c.shortcut}</kbd></button>)}{!matches.length && <p>{tr("No matches")}</p>}</div><button onClick={close}>{tr("Close")}</button></div></div>, document.body);
}

