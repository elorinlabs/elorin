import { BrowserFileSource, TauriFileSource } from '../services/fileSource';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { documentFileName, validateDocumentName } from './create-options';
import { fileLoader } from '../services/fileLoader';
import { DocumentSession, documentSessions, EDIT_LIMIT, type DocumentKind } from './session';
export async function createDocument(kind: DocumentKind, content = kind === 'json' ? '{}' : '', options?: { name: string; location: string }) {
  if (new TextEncoder().encode(content).length > EDIT_LIMIT) throw Error('Content exceeds the safe 2 MiB editing limit.');
  const name = options?.name ?? 'Untitled';
  const error = validateDocumentName(name); if (error) throw Error(error);
  const filename = documentFileName(name, kind);
  if (options && options.location !== 'workspace') {
    if (!isTauri()) throw Error('Choose Current Workspace in the browser. Folder creation is available in the desktop app.');
    const result = await invoke<{ path: string; fingerprint: string }>('document_create', { location: options.location, name: filename, bytes: Array.from(new TextEncoder().encode(content)) });
    const file = await fileLoader.loadPath(result.path), source = new TauriFileSource(result.path);
    const session = new DocumentSession(content, kind, result.path, result.fingerprint); session.saveState = 'Saved'; session.source = source; session.sourceDescriptor = file; documentSessions.set(source, session);
    return { file, source };
  }
  const browserFile = new File([content], filename, { type: 'text/plain' });
  const file = await fileLoader.loadBrowserFile(browserFile);
  const source = new BrowserFileSource(browserFile);
  const session = new DocumentSession(content, kind); session.source = source; session.sourceDescriptor = file; documentSessions.set(source, session);
  return { file, source };
}
