import type { FileDescriptor } from '../types/files';
import type { FileSource } from '../services/fileSource';
import { documentIdentity, documentSessions } from '../document/session';
import { viewerSessionStore } from '../viewer/core/session';
export interface TabSession { id?: string; file: FileDescriptor; source: FileSource; parentSource?: FileSource; status?: 'restoring' | 'unavailable'; lastFocusedAt?: number }
export const tabId = (tab: TabSession) => tab.id ?? documentIdentity(tab.source);
export const physicalIdentity = (path: string) => {
  if (!/^[a-z]:[\\/]|^\\\\/i.test(path)) return path;
  return path.replaceAll('/', '\\').replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\/,'').toLowerCase();
};
export interface StoredTab { id: string; path: string; file: FileDescriptor; viewState: unknown; lastFocusedAt: number }
export interface WorkspaceManifest { version: 1; id: string; tabs: StoredTab[]; activeTabId?: string; sidebarCollapsed: boolean }
export function workspaceManifest(tabs: TabSession[], active: number, collapsed: boolean): WorkspaceManifest {
  return { version: 1, id: 'default', sidebarCollapsed: collapsed, activeTabId: tabs[active] && tabId(tabs[active]), tabs: tabs.filter(t => t.file.path && !t.file.virtual).slice(0, 128).map(t => ({ id: tabId(t), path: t.file.path!, file: t.file, viewState: viewerSessionStore.serialize(t.source), lastFocusedAt: t.lastFocusedAt ?? 0 })) };
}
export function validManifest(value: unknown): value is WorkspaceManifest {
  const m = value as WorkspaceManifest;
  return !!m && m.version === 1 && Array.isArray(m.tabs) && m.tabs.length <= 128 && m.tabs.every(t => typeof t.id === 'string' && typeof t.path === 'string' && t.path.length < 32768 && !!t.file && typeof t.file.name === 'string' && Number.isFinite(t.file.size));
}
export function closableTabs(tabs: TabSession[], index: number, scope: 'one' | 'others' | 'right') { return tabs.filter((_, i) => scope === 'one' ? i === index : scope === 'others' ? i !== index : i > index); }
export function dirtyTab(tab: TabSession) { return documentSessions.get(tab.source)?.dirty ?? false; }
