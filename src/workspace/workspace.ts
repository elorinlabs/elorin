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
  if (!value || typeof value !== 'object') return false;
  const m = value as WorkspaceManifest;
  if (m.version !== 1 || !Array.isArray(m.tabs) || m.tabs.length > 128 || typeof m.sidebarCollapsed !== 'boolean') return false;
  const ids = new Set<string>(), paths = new Set<string>();
  return m.tabs.every(t => {
    if (!t || typeof t.id !== 'string' || !t.id || typeof t.path !== 'string' || !t.path || t.path.length >= 32768 || t.path.includes('\0') || !t.file || typeof t.file.name !== 'string' || !Number.isFinite(t.file.size) || t.file.size < 0 || t.file.virtual) return false;
    const path = physicalIdentity(t.path);
    if (ids.has(t.id) || paths.has(path)) return false;
    ids.add(t.id); paths.add(path); return true;
  });
}

export function closableTabs(tabs: TabSession[], index: number, scope: 'one' | 'others' | 'right') { if (index < 0 || index >= tabs.length) return []; return tabs.filter((_, i) => scope === 'one' ? i === index : scope === 'others' ? i !== index : i > index); }
export function dirtyTab(tab: TabSession) { return documentSessions.get(tab.source)?.dirty ?? false; }
