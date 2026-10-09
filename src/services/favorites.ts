import { platformIntegration } from '../platform/integration';
import type { RecentFile } from './recentFiles';
let queue: Promise<void> = Promise.resolve();
export const favoritesService = {
  async list(): Promise<RecentFile[]> {
    const settings = await platformIntegration.read<Record<string, unknown>>('settings');
    const list = settings?.favorites;
    return Array.isArray(list) ? list.filter((v): v is RecentFile => !!v && typeof v.path === 'string' && typeof v.name === 'string' && Number.isFinite(v.lastOpened)).slice(0, 100) : [];
  },
  toggle(file: RecentFile) {
    queue = queue.catch(() => {}).then(async () => {
      await platformIntegration.updateSettings(settings => {
        const list = Array.isArray(settings.favorites) ? settings.favorites as RecentFile[] : [];
        return { ...settings, favorites: list.some(f => f.path === file.path) ? list.filter(f => f.path !== file.path) : [file, ...list].slice(0, 100) };
      });
      window.dispatchEvent(new Event('elorin-favorites-change'));
    });
    return queue;
  },
};
