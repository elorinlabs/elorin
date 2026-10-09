import type { FileSource } from '../services/fileSource';
import { t as tr } from "../i18n";
import { invoke, isTauri } from '@tauri-apps/api/core';
import { DocumentSession, documentSessions } from './session';
import { documentChoice } from './dialog';
import { saveDocument } from './save-service';
let queue = Promise.resolve();
export const flushRecovery = () => queue;
export function snapshot(session: DocumentSession) {
  if (!isTauri()) return Promise.resolve();
  const content = session.dirty ? JSON.stringify({ version: 1, id: session.id, kind: session.kind, text: session.currentState, path: session.path, fingerprint: session.fingerprint, encoding: session.encoding, lineEndings: session.lineEndings, bom: session.bom, columns: session.csvColumns, header: session.csvHeader, csvDraft: session.csvDraft, time: Date.now() }) : null;
  queue = queue.catch(() => {}).then(() => invoke<void>('document_recovery', { id: session.id, content })).then(() => { session.recoveryState = content ? 'available' : 'none'; });
  return queue;
}
export async function discardDocuments(sources: object[], onSaved?: (source: FileSource, path: string) => Promise<void>) {
  const sessions = sources.map(source => ({source, session: documentSessions.get(source)}));
  const dirty = sessions.map(item => item.session).filter(s => s?.dirty);
  if (dirty.length) {
    const choice = await documentChoice(tr("Unsaved documents: {v0}.", { v0: dirty.map(s => s?.sourceDescriptor?.name ?? 'Untitled').join(', ') }), ['Save', "Don't Save", 'Cancel']);
    if (choice !== 'Save' && choice !== "Don't Save") return false;
    if (choice === 'Save') { try { for (const s of dirty) { if (s) { const result = await saveDocument(s, s.sourceDescriptor?.name ?? 'Untitled.txt'); if (s.dirty) return false; if (result && onSaved && s.source) await onSaved(s.source, result.path); } } } catch { return false; } }
  }
  for (const {source, session} of sessions) { if (session && isTauri()) { queue = queue.catch(() => {}).then(() => invoke<void>('document_recovery', { id: session.id, content: null })); } if (session?.source) documentSessions.delete(session.source); documentSessions.delete(source); } return true;
}
