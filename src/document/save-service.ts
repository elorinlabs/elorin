import { t as tr } from "../i18n";
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { DocumentSession } from './session';
import { snapshot } from './recovery';
import { confirmDocument } from './dialog';
const activeSaves = new WeakMap<DocumentSession, Promise<{ path: string; fingerprint: string } | null>>();
export function saveDocument(session: DocumentSession, name: string, as = false) {
  const active = activeSaves.get(session); if (active) return active;
  const operation = performSave(session, name, as).finally(() => activeSaves.delete(session)); activeSaves.set(session, operation); return operation;
}
async function performSave(session: DocumentSession, name: string, as: boolean) {
  session.commitPendingEdit?.();
  if (session.csvDraft) throw Error('Commit the CSV cell before saving. Its content exceeds the safe editing limit.');
  if (session.validationState && !await confirmDocument(tr("JSON is invalid. Save anyway?"))) { session.saveState = 'Unsaved'; return null; }
  if (session.lineEndings === 'Mixed' && session.dirty && !await confirmDocument(tr("Mixed line endings may be normalized to LF. Continue?"))) { session.saveState = 'Unsaved'; return null; }
  const text = session.currentState, revision = session.revision, bytes = session.serialize();
  session.saveState = 'Saving…';
  try {
    if (!isTauri()) {
      const url = URL.createObjectURL(new Blob([bytes])); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); session.saveState = 'Exported copy'; return null;
    }
    const result = await invoke<{ path: string; fingerprint: string } | null>('document_save', { path: as ? null : session.path, expected: as ? null : session.fingerprint, bytes: Array.from(bytes), name });
    if (result) { session.saved(text, result.fingerprint, result.path); session.savedRevision = revision; session.externalChangeState = 'unchanged'; await snapshot(session); }
    else session.saveState = 'Unsaved';
    return result;
  } catch (error) { const e = error as { code?: string }; session.saveState = e.code === 'conflict' ? 'Conflict' : 'Save failed'; if (e.code === 'conflict') session.externalChangeState = 'modified'; throw error; }
}
