export interface RecentFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  lastOpened: number;
}
export interface RecentFilesService {
  list(): Promise<RecentFile[]>;
  clear?(): Promise<void>;
}
import { platformIntegration } from '../platform/integration';
export const recentFilesService: RecentFilesService & { add(file: { path: string | null; name: string; extension: string | null }): Promise<void>; clear(): Promise<void> } = {
  async list() {
    const data = await platformIntegration.read<RecentFile[]>('recent');
    return Array.isArray(data) ? data.filter(f => typeof f.path === 'string' && typeof f.name === 'string' && Number.isFinite(f.lastOpened)).slice(0, 100) : [];
  },
  async add(file) { if (!file.path) return; const previous = await this.list(); await platformIntegration.write('recent', [{ id: file.path, path: file.path, name: file.name, extension: file.extension ?? '', lastOpened: Date.now() }, ...previous.filter(f => f.path !== file.path)].slice(0, 100)); },
  async clear() { await platformIntegration.write('recent', []); window.dispatchEvent(new Event('elorin-recent-change')); },
};
