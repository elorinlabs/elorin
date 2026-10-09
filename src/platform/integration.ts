import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
export interface PlatformCapabilities { native: boolean; platform: string; associations: boolean; portable: boolean; agent: boolean; startup: boolean }
let writes = Promise.resolve();
export const platformIntegration = {
  native: () => isTauri(),
  async capabilities(): Promise<PlatformCapabilities> { return isTauri() ? invoke('platform_capabilities') : { native: false, platform: 'browser', associations: false, portable: true, agent: false, startup: false }; },
  async read<T>(key: 'workspace' | 'recent' | 'settings'): Promise<T | null> { if (isTauri()) return invoke('productivity_read', { key }); try { return JSON.parse(localStorage.getItem(`elorin.${key}`) ?? 'null'); } catch { return null; } },
  write(key: 'workspace' | 'recent' | 'settings', value: unknown) { const content = JSON.parse(JSON.stringify(value)); writes = writes.catch(() => {}).then(async () => { if (isTauri()) await invoke('productivity_write', { key, value: content }); else localStorage.setItem(`elorin.${key}`, JSON.stringify(content)); }); return writes; },
  flush: () => writes,
  updateSettings(update: (current: Record<string, unknown>) => Record<string, unknown>) {
    writes = writes.catch(() => {}).then(async () => {
      const current = await platformIntegration.read<Record<string, unknown>>('settings') ?? {};
      const value = update(current);
      if (isTauri()) await invoke('productivity_write', { key: 'settings', value });
      else localStorage.setItem('elorin.settings', JSON.stringify(value));
    });
    return writes;
  },
  authorizeReference: (path: string) => invoke<void>('productivity_open', { path }),
  takeLaunch: () => invoke<string[]>('launch_take'),
  listenLaunch: (callback: () => void) => listen('elorin://launch-ready', callback),
  reveal: (path: string) => invoke<void>('reveal_file', { path }),
  externalOpen: (path: string) => invoke<void>('open_file_external', { path }),
  defaultApps: () => invoke<void>('default_apps'),
  associationHealth: (repair=false) => invoke<{portable:boolean;entries:{extension:string;category:string;recommended:boolean;state:string;default?:string}[]}>('association_health',{repair}),
};
