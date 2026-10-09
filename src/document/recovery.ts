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
export async function discardDocuments(sources: object[]) {
  const dirty = sources.map(s => documentSessions.get(s)).filter(s => s?.dirty);
  if (dirty.length) {
    const choice = await documentChoice(tr("Unsaved documents: {v0}.", { v0: dirty.map(s => s?.sourceDescriptor?.name ?? 'Untitled').join(', ') }), ['Save', "Don't Save", 'Cancel']);
    if (!choice) return false;
    if (choice === 'Save') { try { for (const s of dirty) { if (s) { await saveDocument(s, s.sourceDescriptor?.name ?? 'Untitled.txt'); if (s.dirty) return false; } } } catch { return false; } }
  }
  for (const source of sources) { const session = documentSessions.get(source); if (session && isTauri()) { queue = queue.catch(() => {}).then(() => invoke<void>('document_recovery', { id: session.id, content: null })); } documentSessions.delete(source); } return true;
}
