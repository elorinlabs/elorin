import type { ViewerSessionState } from "./types";
/** Memory only, owned by the mounted host; per source and plugin. */
export class ViewerSessionStore {
  private states = new WeakMap<object, Map<string, ViewerSessionState>>();
  get(source: object, viewerId: string): ViewerSessionState {
    let plugins = this.states.get(source);
    if (!plugins) {
      plugins = new Map();
      this.states.set(source, plugins);
    }
    let state = plugins.get(viewerId);
    if (!state) {
      state = { metadata: {} };
      plugins.set(viewerId, state);
    }
    return state;
  }
  update(source: object, viewerId: string, patch: Partial<ViewerSessionState>) {
    Object.assign(this.get(source, viewerId), patch);
    window.dispatchEvent(new Event('elorin-view-state'));
  }
  serialize(source: object): unknown {
    try { const raw = JSON.stringify([...this.states.get(source)?.entries() ?? []], (_key, value) => value instanceof Set ? { __elorinSet: [...value] } : value instanceof Map ? { __elorinMap: [...value] } : value); return raw.length <= 65536 ? JSON.parse(raw) : []; } catch { return []; }
  }
  restore(source: object, value: unknown) {
    try { const raw = JSON.stringify(value); if (raw.length > 65536) return; const parsed = JSON.parse(raw, (_key, v) => v && Array.isArray(v.__elorinSet) ? new Set(v.__elorinSet) : v && Array.isArray(v.__elorinMap) ? new Map(v.__elorinMap) : v); if (Array.isArray(parsed)) this.states.set(source, new Map(parsed.filter(e => Array.isArray(e) && typeof e[0] === 'string' && e[1]?.metadata))); } catch { /* Fresh viewer state if malformed. */ }
  }
  transfer(from: object, to: object) { const states = this.states.get(from); if (states) this.states.set(to, states); }
}
/** Source identity scopes view preferences across tab surface mounts. */
export const viewerSessionStore = new ViewerSessionStore();
