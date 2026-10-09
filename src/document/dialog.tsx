import { t as tr, useUiLanguage as useLocale } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
type Request = { message: string; choices: string[]; input?: string; resolve: (result: string | null) => void };
export function documentChoice(message: string, choices: string[], input?: string): Promise<string | null> {
  return new Promise(resolve => window.dispatchEvent(new CustomEvent<Request>('elorin-document-dialog', { detail: { message, choices, input, resolve } })));
}
export async function confirmDocument(message: string) { return await documentChoice(message, ['Continue', 'Cancel']) === 'Continue'; }
export function promptDocument(message: string, initial: string) { return documentChoice(message, ['Confirm', 'Cancel'], initial); }
export function DocumentDialog() {
  useLocale();
  const [request, setRequest] = useState<Request>(); const [value, setValue] = useState('');
  const pending = useRef<Request[]>([]), active = useRef<Request | undefined>(undefined); const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const receive = (event: Event) => { const next = (event as CustomEvent<Request>).detail; if (active.current) { pending.current.push(next); return; } previousFocus.current = document.activeElement as HTMLElement; active.current = next; setValue(next.input ?? ''); setRequest(next); };
    window.addEventListener('elorin-document-dialog', receive);
    return () => { window.removeEventListener('elorin-document-dialog', receive); active.current?.resolve(null); pending.current.splice(0).forEach(r => r.resolve(null)); active.current = undefined; };
  }, []);
  function finish(choice: string) { if (!request) return; request.resolve(choice === 'Cancel' ? null : request.input !== undefined ? value : choice); const next = pending.current.shift(); active.current = next; setValue(next?.input ?? ''); setRequest(next); if (!next) previousFocus.current?.focus(); }
  if (!request) return null;
  return createPortal(<div className="document-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-label={tr("Document confirmation")} className="document-dialog" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') finish('Cancel'); if (e.key === 'Tab') { const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input')); const index = focusable.indexOf(document.activeElement as HTMLElement); e.preventDefault(); focusable[(index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus(); } }}><p>{tr(request.message)}</p>{request.input !== undefined && <input autoFocus aria-label={tr("Document dialog input")} value={value} onChange={e => setValue(e.target.value)} />}<div>{request.choices.map((choice, index) => <button autoFocus={request.input === undefined && index === request.choices.length - 1} key={choice} onClick={() => finish(choice)}>{tr(choice)}</button>)}</div></section></div>, document.body);
}
