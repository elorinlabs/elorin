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
import { physicalIdentity } from '../workspace/workspace';
let mutations: Promise<void> = Promise.resolve();
const mutate = (run: () => Promise<void>) => mutations = mutations.catch(() => {}).then(run).then(() => { window.dispatchEvent(new Event('elorin-recent-change')); });
import { platformIntegration } from '../platform/integration';
export const recentFilesService: RecentFilesService & { add(file: { path: string | null; name: string; extension: string | null }): Promise<void>; clear(): Promise<void> } = {
  async list() {
    const data = await platformIntegration.read<RecentFile[]>('recent');
    return Array.isArray(data) ? data.filter(f => typeof f.path === 'string' && typeof f.name === 'string' && Number.isFinite(f.lastOpened)).slice(0, 100) : [];
  },
  add(file) { return mutate(async () => { if (!file.path) return; const previous = await this.list(); await platformIntegration.write('recent', [{ id: file.path, path: file.path, name: file.name, extension: file.extension ?? '', lastOpened: Date.now() }, ...previous.filter(f => physicalIdentity(f.path) !== physicalIdentity(file.path!))].slice(0, 100)); }); },
  clear() { return mutate(() => platformIntegration.write('recent', [])); },
};
